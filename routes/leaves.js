// LEAVE MANAGEMENT ROUTES - Extract from server-backup.js lines: 12070-14162
// Mount at: /api/leaves (+ /api/leave-types)
const router = require('express').Router();
const { mysqlPool } = require('../config/database');
const { getYearMonthFromDate } = require('../helpers/dates');
const { getOrCreateLeaveBalance, allocateUninformedToFutureMonths, recalculateUninformedDeductionsForEmployee, runSyncAbsentForDate } = require('../helpers/leaveBalance');
// TODO: Copy handlers
// Leave Management API Routes

// Get active leave types (from leave_types table) for apply form dropdown
router.get('/leave-types', async (req, res) => {
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      const [rows] = await connection.execute(
        `SELECT id, name, description, max_days_per_year, max_consecutive_days, requires_approval, is_paid, color, status
         FROM leave_types
         WHERE status = 'Active' OR status IS NULL
         ORDER BY name`
      );
      res.json(rows);
    } catch (err) {
      console.error('Error fetching leave types:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Apply for leave
  router.post('/apply', async (req, res) => {
    const {
      employee_id,
      department_id,
      leave_type_id,
      reason,
      start_date,
      end_date,
      start_segment,
      end_segment,
      days_requested,
      confirm_exceed,
      leave_type,
      emergency_type,
      is_important_date_override,
      requested_swap_with_leave_id,
      policy_reason_detail,
      expected_return_date
    } = req.body || {};
  
    if (!employee_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'employee_id, start_date and end_date are required' });
    }
  
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
  
      // Resolve department: employees table has department (name), not department_id; resolve from departments table
      let deptId = department_id || null;
      let employeeName = '';
      const [empRows] = await connection.execute(
        'SELECT id, name, department, designation FROM employees WHERE id = ?',
        [employee_id]
      );
      if (empRows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      employeeName = empRows[0].name || '';
      if (!deptId && empRows[0].department) {
        const [dRows] = await connection.execute('SELECT id FROM departments WHERE name = ? LIMIT 1', [empRows[0].department]);
        deptId = dRows.length ? dRows[0].id : null;
      }
  
      // Blocked: holiday applies to all; important applies when department_id IS NULL (all) OR = applicant's department
      const [blockedRows] = await connection.execute(
        `SELECT id FROM leave_requests WHERE employee_id = 0
         AND start_date <= ? AND end_date >= ?
         AND (
           (reason LIKE 'HOLIDAY%' AND department_id IS NULL)
           OR (reason LIKE 'IMPORTANT_EVENT%' AND (department_id IS NULL OR department_id = ?))
         ) LIMIT 1`,
        [end_date, start_date, deptId]
      );
      const isDateBlocked = blockedRows.length > 0;
      // Event dates: full block – no leave application allowed (no emergency override)
      if (isDateBlocked) {
        return res.status(200).json({
          success: false,
          date_blocked: true,
          message: 'Leave cannot be applied on this date due to an event.'
        });
      }
  
      // Already booked (another employee has approved/pending leave on this date)
      const [bookedRows] = await connection.execute(
        `SELECT id FROM leave_requests WHERE employee_id != 0 AND employee_id != ?
         AND status IN ('pending','approved') AND start_date <= ? AND end_date >= ? LIMIT 1`,
        [employee_id, end_date, start_date]
      );
      const existingLeaveId = bookedRows.length > 0 ? bookedRows[0].id : null;
      // Emergency reason is required for booked dates only when applying for a Paid leave (swap flow).
      // Regular (unpaid) leaves on booked dates go through the policy/acknowledge form without emergency.
      const isPaidFromBody = (leave_type || 'paid') === 'paid';
      if (existingLeaveId && isPaidFromBody && !emergency_type) {
        return res.status(200).json({
          success: false,
          date_booked: true,
          existing_leave_id: existingLeaveId,
          message: 'This date is already booked. Select an emergency reason to request leave.'
        });
      }
      // Regular or paid on booked date: send to booker to swap. Paid also requires emergency reason (checked above).
      const swapLeaveId = existingLeaveId
        ? (requested_swap_with_leave_id || existingLeaveId)
        : (requested_swap_with_leave_id || null);
  
      // Department conflict check: overlapping dates in same department, pending/approved
      if (deptId) {
        const conflictQuery = `
          SELECT lr.id, lr.employee_id, e.name AS employee_name, lr.start_date, lr.end_date
          FROM leave_requests lr
          JOIN employees e ON e.id = lr.employee_id
          WHERE lr.department_id = ?
            AND lr.status IN ('pending','approved')
            AND lr.start_date <= ?
            AND lr.end_date >= ?
          LIMIT 1
        `;
        // Only enforce conflict when both the applicant and the existing leave holder
        // are Operators in the same department and their dates overlap.
        const applicantDesignation = String(empRows[0].designation || '').toLowerCase();
        if (applicantDesignation === 'operator') {
          const conflictQuery = `
            SELECT lr.id, lr.employee_id, e.name AS employee_name, lr.start_date, lr.end_date, e.designation
            FROM leave_requests lr
            JOIN employees e ON e.id = lr.employee_id
            WHERE lr.department_id = ?
              AND lr.status IN ('pending','approved')
              AND lr.start_date <= ?
              AND lr.end_date >= ?
              AND LOWER(e.designation) = 'operator'
            LIMIT 1
          `;
          const [conflicts] = await connection.execute(conflictQuery, [deptId, end_date, start_date]);
          if (conflicts.length > 0) {
            const c = conflicts[0];
            return res.status(200).json({
              success: false,
              conflict: true,
              existing_employee_name: c.employee_name || '',
              existing_start_date: c.start_date,
              existing_end_date: c.end_date,
              message: 'Another operator from this department is already on leave for these dates'
            });
          }
        }
      }
  
      // Enforce monthly paid leave quota (default 2 per month),
      // taking into account any cascading uninformed leave deductions.
      const { year, month } = getYearMonthFromDate(start_date);
      const balance = await getOrCreateLeaveBalance(connection, employee_id, year, month);
      const quota = balance.paid_quota || 2;
      const used = balance.paid_used || 0;
      const deduction = balance.next_month_deduction || 0;
      const effectiveQuota = Math.max(0, quota - deduction);
      const requested = typeof days_requested === 'number' && !Number.isNaN(days_requested)
        ? days_requested
        : 1;
  
      // Resolve leave type: from leave_types table if leave_type_id provided, else from legacy leave_type string ('paid' | 'other')
      let isPaid = 0;
      let requiresApproval = 1;
      let resolvedLeaveTypeId = null;
  
      if (leave_type_id != null && leave_type_id !== '' && Number.isFinite(Number(leave_type_id))) {
        const [typeRows] = await connection.execute(
          'SELECT id, is_paid, requires_approval, max_consecutive_days FROM leave_types WHERE id = ? AND (status = \'Active\' OR status IS NULL) LIMIT 1',
          [Number(leave_type_id)]
        );
        if (typeRows.length > 0) {
          const t = typeRows[0];
          isPaid = t.is_paid === 1 || t.is_paid === true ? 1 : 0;
          requiresApproval = t.requires_approval === 1 || t.requires_approval === true ? 1 : 0;
          resolvedLeaveTypeId = t.id;
          const maxConsecutive = t.max_consecutive_days != null ? Number(t.max_consecutive_days) : null;
          if (maxConsecutive != null && !Number.isNaN(maxConsecutive) && requested > maxConsecutive) {
            return res.status(400).json({
              error: `This leave type allows at most ${maxConsecutive} consecutive day(s). Please shorten your range.`
            });
          }
        }
      }
  
      if (resolvedLeaveTypeId == null) {
        const isPaidLeaveTypeLegacy = (leave_type || 'paid') === 'paid';
        isPaid = isPaidLeaveTypeLegacy ? 1 : 0;
        requiresApproval = isPaidLeaveTypeLegacy ? 0 : 1;
      }
      const isPaidLeaveType = isPaid === 1;
  
      const remainingPaid = Math.max(0, effectiveQuota - used);
  
      // If they ask for more paid days than they have remaining, do not allow a paid leave.
      if (isPaidLeaveType && requested > remainingPaid) {
        return res.status(200).json({
          success: false,
          paid_not_available: true,
          message: `You only have ${remainingPaid} paid leave day(s) remaining. Please select another leave type or reduce the requested range.`
        });
      }
  
      const importantOverride = is_important_date_override ? 1 : 0;
  
      // Rulebook: Date Available + Paid = auto-approved; Date Available + Regular = pending (admin); Date booked = pending
      let initialStatus;
      if (existingLeaveId) {
        initialStatus = 'pending';
      } else if (isPaid === 1) {
        initialStatus = 'approved';  // Date available + paid: auto-approved (rulebook only)
      } else {
        initialStatus = 'pending';  // Date available + regular: need approval from admin
      }
  
      const insertQuery = `
        INSERT INTO leave_requests (
          employee_id,
          department_id,
          status,
          reason,
          start_date,
          end_date,
          start_segment,
          end_segment,
          days_requested,
          is_paid,
          is_uninformed,
          emergency_type,
          requested_swap_with_leave_id,
          is_important_date_override,
          policy_reason_detail,
          expected_return_date,
          leave_type_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `;
  
      const [result] = await connection.execute(insertQuery, [
        employee_id,
        deptId,
        initialStatus,
        reason || '',
        start_date,
        end_date,
        start_segment || 'full_day',
        end_segment || 'full_day',
        requested,
        isPaid,
        emergency_type || null,
        swapLeaveId,
        importantOverride,
        policy_reason_detail || null,
        expected_return_date || null,
        resolvedLeaveTypeId
      ]);
  
      if (initialStatus === 'approved' && isPaid) {
        const { year, month } = getYearMonthFromDate(start_date);
        const balance = await getOrCreateLeaveBalance(connection, employee_id, year, month);
        const used = balance.paid_used || 0;
        const deduction = balance.next_month_deduction || 0;
        const effectiveQuota = Math.max(0, (balance.paid_quota || 2) - deduction);
        const willExceedPaid = used + requested > effectiveQuota;
        const newUsed = willExceedPaid ? used : used + requested;
        await connection.execute(
          'UPDATE leave_balances SET paid_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newUsed, balance.id]
        );
      }
  
      res.status(201).json({
        success: true,
        id: result.insertId,
        employee_id,
        employee_name: employeeName,
        department_id: deptId,
        status: initialStatus,
        reason,
        start_date,
        end_date,
        start_segment: start_segment || 'full_day',
        end_segment: end_segment || 'full_day',
        days_requested: requested,
        is_paid: isPaid,
        emergency_type: emergency_type || null,
        requested_swap_with_leave_id: swapLeaveId,
        is_important_date_override: importantOverride === 1
      });
    } catch (err) {
      console.error('Error applying for leave:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Date availability for a single date or range (red/green): blocked or booked in range.
  // Optional exclude_leave_id: when editing a leave, exclude that leave from "booked" so the booker's own leave doesn't count.
  router.get('/date-availability', async (req, res) => {
    const { date, end_date, employee_id, exclude_leave_id } = req.query;
    const startDate = date || req.query.start_date;
    if (!startDate) return res.status(400).json({ error: 'date or start_date is required (YYYY-MM-DD)' });
    const endDate = end_date || req.query.end_date || startDate;
    const excludeId = exclude_leave_id != null && exclude_leave_id !== '' && Number.isFinite(Number(exclude_leave_id)) ? Number(exclude_leave_id) : null;
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      let deptId = null;
      if (employee_id) {
        const [empRows] = await connection.execute(
          'SELECT department FROM employees WHERE id = ? LIMIT 1',
          [employee_id]
        );
        if (empRows.length > 0 && empRows[0].department) {
          const [dRows] = await connection.execute('SELECT id FROM departments WHERE name = ? LIMIT 1', [empRows[0].department]);
          deptId = dRows.length ? dRows[0].id : null;
        }
      }
      // Range overlap: blocked/booking overlaps [startDate, endDate] when block.start_date <= endDate AND block.end_date >= startDate
      const [blocked] = await connection.execute(
        `SELECT id FROM leave_requests WHERE employee_id = 0
         AND start_date <= ? AND end_date >= ?
         AND (
           (reason LIKE 'HOLIDAY%' AND department_id IS NULL)
           OR (reason LIKE 'IMPORTANT_EVENT%' AND (department_id IS NULL OR department_id = ?))
         ) LIMIT 1`,
        [endDate, startDate, deptId]
      );
      let bookedQuery = `SELECT lr.id, lr.employee_id, e.name AS employee_name FROM leave_requests lr
         JOIN employees e ON e.id = lr.employee_id
         WHERE lr.employee_id != 0 AND lr.status IN ('pending','approved')
         AND lr.start_date <= ? AND lr.end_date >= ?`;
      const bookedParams = [endDate, startDate];
      if (excludeId != null) {
        bookedQuery += ' AND lr.id != ?';
        bookedParams.push(excludeId);
      }
      const [booked] = await connection.execute(bookedQuery, bookedParams);
      const bookedUnique = booked.reduce((acc, r) => {
        if (!acc.some((x) => x.leave_id === r.id)) acc.push({ leave_id: r.id, employee_id: r.employee_id, employee_name: r.employee_name });
        return acc;
      }, []);
      res.json({
        date: startDate,
        end_date: endDate !== startDate ? endDate : undefined,
        blocked: blocked.length > 0,
        available: blocked.length === 0 && booked.length === 0,
        bookedBy: bookedUnique,
        bookedByCount: bookedUnique.length
      });
    } catch (err) {
      console.error('Error checking date availability:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Calendar data: leaves in range + blocked dates (all roles with calendar access). Blocked dates include department_id for important (per-department).
  router.get('/calendar', async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end are required (YYYY-MM-DD)' });
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      const [employees] = await connection.execute(
        `SELECT e.id, e.name, e.department, e.designation,
          (SELECT id FROM departments d WHERE d.name = e.department LIMIT 1) AS department_id
         FROM employees e
         WHERE e.status = 'Active'
         ORDER BY e.name`
      );
      // Only show approved leaves on calendar; pending leaves are not yet decided so show nothing for those days
      const [leaves] = await connection.execute(
        `SELECT lr.id, lr.employee_id, e.name AS employee_name, lr.start_date, lr.end_date, lr.status,
          lr.is_uninformed, lr.start_segment, lr.end_segment, lr.reason, lr.emergency_type,
          lr.acknowledged_by, lr.acknowledged_at
         FROM leave_requests lr
         JOIN employees e ON e.id = lr.employee_id
         WHERE lr.employee_id != 0
           AND lr.status = 'approved'
           AND lr.start_date <= ? AND lr.end_date >= ?`,
        [end, start]
      );
      const [blockedRows] = await connection.execute(
        `SELECT start_date AS date, reason, department_id,
          (SELECT name FROM departments d WHERE d.id = lr.department_id LIMIT 1) AS department_name
         FROM leave_requests lr
         WHERE employee_id = 0 AND (reason LIKE 'IMPORTANT_EVENT%' OR reason LIKE 'HOLIDAY%') AND start_date <= ? AND end_date >= ?`,
        [end, start]
      );
      const fmtDate = (d) => (d && typeof d.toISOString === 'function' ? d.toISOString().slice(0, 10) : (d && typeof d === 'string' ? d.slice(0, 10) : d));
      const importantDates = [];
      const holidayDates = [];
      for (const r of blockedRows) {
        const label = r.reason && r.reason !== 'IMPORTANT_EVENT' && r.reason !== 'HOLIDAY'
          ? String(r.reason).replace(/^(IMPORTANT_EVENT|HOLIDAY):?/, '') : null;
        const dateStr = fmtDate(r.date);
        if (String(r.reason || '').startsWith('IMPORTANT_EVENT')) {
          importantDates.push({
            date: dateStr,
            label,
            department_id: r.department_id,
            department_name: r.department_name || null
          });
        } else {
          holidayDates.push({ date: dateStr, label });
        }
      }
      res.json({
        employees: employees.map((r) => ({
          id: r.id,
          name: r.name,
          department: r.department,
          department_id: r.department_id,
          designation: r.designation || null
        })),
        leaves: leaves.map((r) => ({
          id: r.id,
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          start_date: fmtDate(r.start_date) || r.start_date,
          end_date: fmtDate(r.end_date) || r.end_date,
          status: r.status,
          is_uninformed: !!r.is_uninformed,
          start_segment: r.start_segment,
          end_segment: r.end_segment,
          reason: r.reason,
          emergency_type: r.emergency_type,
          acknowledged_by: r.acknowledged_by,
          acknowledged_at: r.acknowledged_at
        })),
        blockedDates: blockedRows.map((r) => ({
          date: fmtDate(r.date),
          type: String(r.reason || '').startsWith('IMPORTANT_EVENT') ? 'important' : 'holiday',
          label: r.reason && r.reason !== 'IMPORTANT_EVENT' && r.reason !== 'HOLIDAY'
            ? String(r.reason).replace(/^(IMPORTANT_EVENT|HOLIDAY):?/, '') : null,
          department_id: r.department_id,
          department_name: r.department_name || null
        })),
        importantDates,
        holidayDates
      });
    } catch (err) {
      console.error('Error fetching calendar:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Mark date(s) as important (per department) or holiday (admin only). Accept date or dates[]. For important, department_id (single) or department_ids (array); null/empty = all departments.
  router.post('/blocked-dates', async (req, res) => {
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    if (userRole !== 'admin') return res.status(403).json({ error: 'Only admins can mark dates.' });
    const { date, dates, type, label, department_id, department_ids } = req.body || {};
    const typeVal = (type || 'important').toLowerCase() === 'holiday' ? 'holiday' : 'important';
    const reasonPrefix = typeVal === 'important' ? 'IMPORTANT_EVENT' : 'HOLIDAY';
    const deptIds = Array.isArray(department_ids) && department_ids.length > 0
      ? department_ids.map((id) => Number(id)).filter(Number.isFinite)
      : (department_id != null && department_id !== '' ? [Number(department_id)] : [null]);
    const dateList = Array.isArray(dates) && dates.length > 0
      ? dates.filter((d) => d && String(d).match(/^\d{4}-\d{2}-\d{2}$/))
      : (date && String(date).match(/^\d{4}-\d{2}-\d{2}$/) ? [date] : []);
    if (dateList.length === 0) return res.status(400).json({ error: 'date or dates (array) is required (YYYY-MM-DD)' });
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      let inserted = 0;
      for (const deptId of deptIds) {
        for (const d of dateList) {
          const [existing] = await connection.execute(
            typeVal === 'holiday'
              ? `SELECT id FROM leave_requests WHERE employee_id = 0 AND reason LIKE 'HOLIDAY%' AND department_id IS NULL AND start_date = ? AND end_date = ?`
              : `SELECT id FROM leave_requests WHERE employee_id = 0 AND reason LIKE 'IMPORTANT_EVENT%' AND start_date = ? AND end_date = ?
                 AND ((? IS NULL AND department_id IS NULL) OR department_id = ?)`,
            typeVal === 'holiday' ? [d, d] : [d, d, deptId, deptId]
          );
          if (existing.length > 0) continue;
          const reason = label ? `${reasonPrefix}:${label}` : reasonPrefix;
          const insertDeptId = typeVal === 'holiday' ? null : deptId;
          await connection.execute(
            `INSERT INTO leave_requests (employee_id, department_id, status, reason, start_date, end_date, start_segment, end_segment, days_requested, is_paid, is_uninformed)
             VALUES (0, ?, 'approved', ?, ?, ?, 'full_day', 'full_day', 0, 0, 0)`,
            [insertDeptId, reason, d, d]
          );
          inserted++;
        }
      }
      res.status(201).json({ success: true, dates: dateList, type: typeVal, inserted, label: label || null });
    } catch (err) {
      console.error('Error marking blocked date(s):', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Unmark important or holiday date (admin only).
  // Query params:
  //   type = important | holiday  (optional, default: both)
  //   department_id (only used for type=important; limits unmarking to that department)
  //   label (optional): when provided, only remove the block whose reason matches (exact or prefix)
  router.delete('/blocked-dates/:date', async (req, res) => {
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    if (userRole !== 'admin') return res.status(403).json({ error: 'Only admins can unmark dates.' });
    const { date } = req.params;
    const typeFilter = (req.query.type || '').toLowerCase();
    const labelParam = (req.query.label || req.query.reason || '').toString().trim();
    let deptFilter = null;
    if (
      typeof req.query.department_id !== 'undefined' &&
      req.query.department_id !== '' &&
      req.query.department_id !== 'null' &&
      req.query.department_id !== 'undefined'
    ) {
      const n = Number(req.query.department_id);
      if (Number.isFinite(n)) deptFilter = n;
    }
    if (!date) return res.status(400).json({ error: 'date is required' });
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      let condition = `employee_id = 0 AND start_date = ? AND end_date = ?`;
      const params = [date, date];
  
      if (typeFilter === 'holiday') {
        condition += ` AND reason LIKE 'HOLIDAY%'`;
      } else if (typeFilter === 'important') {
        condition += ` AND reason LIKE 'IMPORTANT_EVENT%'`;
      } else {
        condition += ` AND (reason LIKE 'IMPORTANT_EVENT%' OR reason LIKE 'HOLIDAY%')`;
      }
  
      // When label/reason is provided, only remove the block matching that label
      if (labelParam) {
        condition += ` AND (reason = ? OR reason LIKE ?)`;
        params.push(labelParam, `${labelParam}%`);
      }
  
      // For important types, optionally restrict to a specific department
      if (typeFilter === 'important' && deptFilter !== null) {
        condition += ` AND department_id = ?`;
        params.push(deptFilter);
      }
  
      const [result] = await connection.execute(
        `DELETE FROM leave_requests WHERE ${condition}`,
        params
      );
      res.json({ success: true, date, deleted: result.affectedRows > 0 });
    } catch (err) {
      console.error('Error unmarking blocked date:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Department restricted days: which day(s) of week leave is not allowed per department (admin only).
  // day_of_week: 0=Sunday, 1=Monday, ... 6=Saturday (JS getDay()).
  router.get('/department-restricted-days', async (req, res) => {
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    const { department_id } = req.query;
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      let query = `
        SELECT drd.id, drd.department_id, drd.day_of_week, d.name AS department_name
        FROM department_restricted_days drd
        LEFT JOIN departments d ON d.id = drd.department_id
      `;
      const params = [];
      if (department_id !== undefined && department_id !== '' && department_id !== 'null') {
        const n = Number(department_id);
        if (Number.isFinite(n)) {
          query += ' WHERE drd.department_id = ?';
          params.push(n);
        }
      }
      query += ' ORDER BY drd.department_id, drd.day_of_week';
      const [rows] = await connection.execute(query, params);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching department restricted days:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  router.post('/department-restricted-days', async (req, res) => {
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    if (userRole !== 'admin') return res.status(403).json({ error: 'Only admins can set department restricted days.' });
    const { department_ids, day_of_week } = req.body || {};
    const day = Number(day_of_week);
    if (!Number.isFinite(day) || day < 0 || day > 6) {
      return res.status(400).json({ error: 'day_of_week is required and must be 0-6 (0=Sunday, 1=Monday, ... 6=Saturday).' });
    }
    const ids = Array.isArray(department_ids) ? department_ids.map((id) => Number(id)).filter(Number.isFinite) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'department_ids must be a non-empty array of department ids.' });
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      let inserted = 0;
      for (const deptId of ids) {
        try {
          await connection.execute(
            'INSERT INTO department_restricted_days (department_id, day_of_week) VALUES (?, ?)',
            [deptId, day]
          );
          inserted++;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') continue;
          throw err;
        }
      }
      res.status(201).json({ success: true, day_of_week: day, inserted, department_ids: ids });
    } catch (err) {
      console.error('Error adding department restricted days:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  router.delete('/department-restricted-days', async (req, res) => {
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    if (userRole !== 'admin') return res.status(403).json({ error: 'Only admins can remove department restricted days.' });
    const { department_id, department_ids, day_of_week } = req.query;
    const day = day_of_week !== undefined && day_of_week !== '' ? Number(day_of_week) : null;
    const singleId = department_id !== undefined && department_id !== '' ? Number(department_id) : null;
    const multipleIds = department_ids
      ? (typeof department_ids === 'string' ? department_ids.split(',').map((s) => s.trim()) : [department_ids])
          .map((id) => Number(id))
          .filter(Number.isFinite)
      : [];
    const ids = singleId != null ? [singleId] : multipleIds;
    if (ids.length === 0 || day === null || !Number.isFinite(day) || day < 0 || day > 6) {
      return res.status(400).json({ error: 'department_id (or department_ids) and day_of_week (0-6) are required.' });
    }
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      let deleted = 0;
      for (const deptId of ids) {
        const [result] = await connection.execute(
          'DELETE FROM department_restricted_days WHERE department_id = ? AND day_of_week = ?',
          [deptId, day]
        );
        deleted += result.affectedRows;
      }
      res.json({ success: true, day_of_week: day, deleted, department_ids: ids });
    } catch (err) {
      console.error('Error removing department restricted days:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });

  // Sync absent: create uninformed leave for employees who logged < minHours on date (admin can also trigger manually)
router.post('/sync-absent', async (req, res) => {
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    if (userRole !== 'admin') return res.status(403).json({ error: 'Only admins can run sync-absent.' });
    const { date, minHours = 4 } = req.body || req.query || {};
    const targetDate = date || new Date().toISOString().split('T')[0];
    try {
      const result = await runSyncAbsentForDate(targetDate, minHours);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('Error syncing absent:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });
  
  // Pending actions: swap requests (for booker) and acknowledge requests (for admin)
  router.get('/pending-actions', async (req, res) => {
    const { employee_id } = req.query;
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    const isAdmin = userRole === 'admin';
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
    const currentUserId = Number(employee_id);
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
  
      // Swap requests: leaves I own that are referenced by another pending leave's requested_swap_with_leave_id (not yet responded)
      const [swapRows] = await connection.execute(
        `SELECT req.id AS requesting_leave_id, req.start_date, req.end_date, req.emergency_type, req.reason,
                my.id AS my_leave_id, my.start_date AS my_start, my.end_date AS my_end
         FROM leave_requests req
         JOIN leave_requests my ON my.id = req.requested_swap_with_leave_id
         WHERE req.requested_swap_with_leave_id IS NOT NULL AND req.status = 'pending'
           AND req.swap_responded_at IS NULL AND my.employee_id = ?`,
        [currentUserId]
      );
      const swapRequests = swapRows.map((r) => ({
        type: 'swap',
        requesting_leave_id: r.requesting_leave_id,
        my_leave_id: r.my_leave_id,
        start_date: r.start_date,
        end_date: r.end_date,
        emergency_type: r.emergency_type || r.reason,
        reason: r.reason || r.emergency_type || '',
        my_start_date: r.my_start,
        my_end_date: r.my_end
      }));
  
      // Accepted swaps waiting for booker to move their leave (so we can show "you did not change date" if they close edit without changing)
      const [acceptedSwapRows] = await connection.execute(
        `SELECT req.id AS requesting_leave_id, my.id AS my_leave_id
         FROM leave_requests req
         JOIN leave_requests my ON my.id = req.requested_swap_with_leave_id
         WHERE req.requested_swap_with_leave_id IS NOT NULL AND req.status = 'pending'
           AND req.swap_responded_at IS NOT NULL AND req.swap_accepted = 1 AND my.employee_id = ?`,
        [currentUserId]
      );
      const acceptedSwapTargets = (acceptedSwapRows || []).map((r) => ({
        my_leave_id: r.my_leave_id,
        requesting_leave_id: r.requesting_leave_id
      }));
  
      // Rejected swap notifications for booker: a leave that asked to swap with my leave was rejected by admin
      const [rejectedSwapRows] = await connection.execute(
        `SELECT req.id AS rejected_leave_id, req.start_date, req.end_date, req.requested_swap_with_leave_id AS my_leave_id
         FROM leave_requests req
         JOIN leave_requests my ON my.id = req.requested_swap_with_leave_id
         WHERE req.status = 'rejected' AND my.employee_id = ?
         ORDER BY req.decision_at DESC LIMIT 20`,
        [currentUserId]
      );
      const fmtDate = (d) => (d && typeof d.toISOString === 'function' ? d.toISOString().slice(0, 10) : (d && typeof d === 'string' ? d.slice(0, 10) : (d ? String(d).slice(0, 10) : '')));
      const rejected_swap_notifications = (rejectedSwapRows || []).map((r) => ({
        rejected_leave_id: r.rejected_leave_id,
        my_leave_id: r.my_leave_id,
        start_date: fmtDate(r.start_date),
        end_date: fmtDate(r.end_date)
      }));
  
      // Rejected leave notifications for employee (requester): my leaves that were rejected (so they see a notification)
      const [rejectedLeaveRows] = await connection.execute(
        `SELECT id, start_date, end_date, decision_at FROM leave_requests
         WHERE employee_id = ? AND status = 'rejected' AND decision_at IS NOT NULL
         ORDER BY decision_at DESC LIMIT 10`,
        [currentUserId]
      );
      const rejected_leave_notifications = (rejectedLeaveRows || []).map((r) => ({
        leave_id: r.id,
        start_date: fmtDate(r.start_date),
        end_date: fmtDate(r.end_date)
      }));
  
      let acknowledgeRequests = [];
      if (isAdmin) {
        const [ackRows] = await connection.execute(
          `SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date, lr.emergency_type, lr.reason,
                  lr.is_important_date_override, lr.requested_swap_with_leave_id, lr.swap_responded_at, lr.swap_accepted,
                  lr.policy_reason_detail, lr.expected_return_date, lr.created_at,
                  e.name AS employee_name
           FROM leave_requests lr
           JOIN employees e ON e.id = lr.employee_id
           WHERE lr.status = 'pending' AND lr.employee_id != 0
             AND (
               (lr.is_important_date_override = 1)
               OR (lr.requested_swap_with_leave_id IS NOT NULL AND lr.swap_responded_at IS NOT NULL)
               OR (lr.requested_swap_with_leave_id IS NOT NULL AND lr.swap_responded_at IS NULL AND lr.created_at < DATE_SUB(NOW(), INTERVAL 1 DAY))
               OR (
                 (lr.requested_swap_with_leave_id IS NULL OR lr.swap_responded_at IS NOT NULL)
                 AND (lr.policy_reason_detail IS NOT NULL OR lr.expected_return_date IS NOT NULL)
               )
             )
           ORDER BY lr.created_at DESC LIMIT 50`
        );
        // For swap-related leaves, compute whether the booker has moved their leave (no overlap = swapped)
        const ackWithBookerSwapped = await Promise.all(ackRows.map(async (r) => {
          let booker_has_swapped = null;
          if (r.requested_swap_with_leave_id) {
            const [bookerLeave] = await connection.execute(
              'SELECT start_date, end_date FROM leave_requests WHERE id = ?',
              [r.requested_swap_with_leave_id]
            );
            if (bookerLeave.length > 0) {
              const b = bookerLeave[0];
              const reqStart = r.start_date ? new Date(r.start_date) : null;
              const reqEnd = r.end_date ? new Date(r.end_date) : null;
              const bStart = b.start_date ? new Date(b.start_date) : null;
              const bEnd = b.end_date ? new Date(b.end_date) : null;
              const overlap = reqStart && reqEnd && bStart && bEnd && bStart <= reqEnd && bEnd >= reqStart;
              booker_has_swapped = !overlap;
            }
          }
          const fmt = (d) => (d && typeof d.toISOString === 'function' ? d.toISOString().slice(0, 10) : (d && typeof d === 'string' ? d.slice(0, 10) : (d ? String(d).slice(0, 10) : '')));
          const created = r.created_at ? new Date(r.created_at) : null;
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const booker_did_not_respond = !!(r.requested_swap_with_leave_id && !r.swap_responded_at && created && created < oneDayAgo);
          return {
            type: 'acknowledge',
            leave_id: r.id,
            employee_id: r.employee_id,
            employee_name: r.employee_name,
            start_date: fmt(r.start_date),
            end_date: fmt(r.end_date),
            emergency_type: r.emergency_type || r.reason,
            is_important_date_override: !!r.is_important_date_override,
            requested_swap_with_leave_id: r.requested_swap_with_leave_id || null,
            booker_has_swapped,
            booker_did_not_respond
          };
        }));
        acknowledgeRequests = ackWithBookerSwapped;
      }
  
      res.json({ swapRequests, acknowledgeRequests, acceptedSwapTargets, rejected_swap_notifications, rejected_leave_notifications });
    } catch (err) {
      console.error('Error fetching pending actions:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Swap requests section: list of swap-related records for the user (as booker and as requester). Exclude rejected/cancelled (hidden).
  router.get('/swap-requests', async (req, res) => {
    const { employee_id } = req.query;
    if (!employee_id) return res.status(400).json({ error: 'employee_id required' });
    const currentUserId = Number(employee_id);
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      const fmt = (d) => (d && typeof d.toISOString === 'function' ? d.toISOString().slice(0, 10) : (d && typeof d === 'string' ? d.slice(0, 10) : (d ? String(d).slice(0, 10) : '')));
  
      // As booker: leaves that requested to swap with my leave. Only pending or approved (hide rejected/cancelled).
      const [bookerRows] = await connection.execute(
        `SELECT req.id AS requesting_leave_id, req.status AS req_status, req.start_date AS req_start, req.end_date AS req_end,
                req.swap_responded_at, req.swap_accepted, req.created_at AS req_created, req.approved_via_swap,
                my.id AS my_leave_id, my.start_date AS my_start, my.end_date AS my_end,
                e.name AS requester_name
         FROM leave_requests req
         JOIN leave_requests my ON my.id = req.requested_swap_with_leave_id
         JOIN employees e ON e.id = req.employee_id
         WHERE my.employee_id = ? AND req.status IN ('pending', 'approved')
         ORDER BY req.created_at DESC`,
        [currentUserId]
      );
      const oneDayMs = 24 * 60 * 60 * 1000;
      const asBooker = bookerRows.map((r) => {
        const created = r.req_created ? new Date(r.req_created) : null;
        const isOld = created && (Date.now() - created.getTime() > oneDayMs);
        let status = 'pending';
        if (r.req_status === 'approved' && (r.approved_via_swap === 1 || r.approved_via_swap === true)) status = 'swapped';
        else if (r.swap_responded_at != null) {
          if (r.swap_accepted) status = 'accepted_waiting_move';
          else status = 'rejected_by_me';
        } else if (isOld) status = 'booker_did_not_respond';
        return {
          type: 'as_booker',
          requesting_leave_id: r.requesting_leave_id,
          requester_name: r.requester_name,
          request_dates: { start: fmt(r.req_start), end: fmt(r.req_end) },
          my_leave_id: r.my_leave_id,
          my_dates: { start: fmt(r.my_start), end: fmt(r.my_end) },
          status
        };
      });
  
      // As requester: my leaves that have a swap request. Only pending or approved (hide rejected/cancelled).
      const [requesterRows] = await connection.execute(
        `SELECT lr.id AS leave_id, lr.status, lr.start_date, lr.end_date, lr.swap_responded_at, lr.swap_accepted, lr.created_at, lr.approved_via_swap,
                my.id AS booker_leave_id, e.name AS booker_name
         FROM leave_requests lr
         JOIN leave_requests my ON my.id = lr.requested_swap_with_leave_id
         JOIN employees e ON e.id = my.employee_id
         WHERE lr.employee_id = ? AND lr.requested_swap_with_leave_id IS NOT NULL AND lr.status IN ('pending', 'approved')
         ORDER BY lr.created_at DESC`,
        [currentUserId]
      );
      const asRequester = requesterRows.map((r) => {
        const created = r.created_at ? new Date(r.created_at) : null;
        const isOld = created && (Date.now() - created.getTime() > oneDayMs);
        let status = 'waiting_for_booker';
        if (r.status === 'approved' && (r.approved_via_swap === 1 || r.approved_via_swap === true)) status = 'swapped';
        else if (r.swap_responded_at != null) {
          if (r.swap_accepted) status = 'booker_accepted';
          else status = 'rejected_by_booker';
        } else if (isOld) status = 'booker_did_not_respond';
        return {
          type: 'as_requester',
          leave_id: r.leave_id,
          request_dates: { start: fmt(r.start_date), end: fmt(r.end_date) },
          booker_name: r.booker_name,
          booker_leave_id: r.booker_leave_id,
          status
        };
      });
  
      res.json({ asBooker, asRequester });
    } catch (err) {
      console.error('Error fetching swap requests:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Booker rejects swap after having accepted (e.g. closed edit without changing date); sends requester's leave to admin for acknowledgment
  router.post('/:id/reject-swap-after-accept', async (req, res) => {
    const { id } = req.params;
    const currentUserId = Number(req.body?.employee_id || req.headers['x-user-id'] || req.headers['user-id'] || 0);
    if (!currentUserId) return res.status(400).json({ error: 'employee_id is required' });
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      const [rows] = await connection.execute('SELECT id, requested_swap_with_leave_id FROM leave_requests WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Leave not found' });
      const requesterLeave = rows[0];
      if (!requesterLeave.requested_swap_with_leave_id) return res.status(400).json({ error: 'This leave has no swap request' });
      const [myLeave] = await connection.execute('SELECT id, employee_id FROM leave_requests WHERE id = ?', [requesterLeave.requested_swap_with_leave_id]);
      if (myLeave.length === 0 || myLeave[0].employee_id !== currentUserId) return res.status(403).json({ error: 'You are not the booker for this swap' });
      await connection.execute(
        'UPDATE leave_requests SET requested_swap_with_leave_id = NULL, swap_responded_at = NULL, swap_accepted = 0 WHERE id = ?',
        [id]
      );
      res.json({ success: true, leave_id: id });
    } catch (err) {
      console.error('Error rejecting swap after accept:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Booker responds to swap request (accept or reject)
  router.post('/:id/respond-swap', async (req, res) => {
    const { id } = req.params;
    const { accept, employee_id: bodyEmployeeId } = req.body || {};
    const currentUserId = Number(
      req.headers['x-user-id'] || req.headers['user-id'] || bodyEmployeeId || req.query.employee_id || 0
    );
    if (!currentUserId) return res.status(400).json({ error: 'Current user (employee_id) required' });
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      const [rows] = await connection.execute('SELECT * FROM leave_requests WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Leave request not found' });
      const emergencyLeave = rows[0];
      if (!emergencyLeave.requested_swap_with_leave_id) return res.status(400).json({ error: 'This leave has no swap request' });
      if (emergencyLeave.swap_responded_at) return res.status(400).json({ error: 'Swap already responded' });
      const [myLeave] = await connection.execute('SELECT id, employee_id FROM leave_requests WHERE id = ?', [emergencyLeave.requested_swap_with_leave_id]);
      if (myLeave.length === 0 || myLeave[0].employee_id !== currentUserId) return res.status(403).json({ error: 'You are not the booker for this swap request' });
      await connection.execute(
        'UPDATE leave_requests SET swap_responded_at = NOW(), swap_accepted = ? WHERE id = ?',
        [accept ? 1 : 0, id]
      );
      if (accept) {
        // Booker accepted: they will edit their leave in UI; we could auto-approve the emergency leave once they free the date (handled elsewhere or on next apply). For now just record response.
        // Optionally auto-approve emergency leave when booker has accepted (plan says booker edits date then applicant gets "you can apply now" - so we don't auto-approve here; we approve when booker has moved their leave)
      }
      res.json({ success: true, leave_id: id, swap_accepted: !!accept });
    } catch (err) {
      console.error('Error responding to swap:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Admin acknowledges emergency leave (approve as paid/other or reject)
  router.post('/:id/acknowledge', async (req, res) => {
    const { id } = req.params;
    const { approved, decision_by } = req.body || {};
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    const adminId = Number(req.headers['x-user-id'] || req.headers['user-id'] || decision_by || 0);
    if (userRole !== 'admin') return res.status(403).json({ error: 'Only admins can acknowledge' });
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT * FROM leave_requests WHERE id = ? FOR UPDATE', [id]);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Leave request not found' });
      }
      const request = rows[0];
      if (request.status !== 'pending') {
        await connection.rollback();
        return res.status(400).json({ error: 'Only pending requests can be acknowledged' });
      }
      // Do not change the original requested leave type here.
      // If the employee applied as paid and it was within rules, is_paid is already 1.
      // Policy/unpaid and override cases have is_paid = 0.
      const isPaid = approved && request.is_paid ? 1 : 0;
      await connection.execute(
        'UPDATE leave_requests SET acknowledged_by = ?, acknowledged_at = NOW(), status = ?, decision_by = ?, decision_at = NOW(), is_paid = ? WHERE id = ?',
        [adminId, approved ? 'approved' : 'rejected', adminId, isPaid, id]
      );
      if (approved && isPaid) {
        const { year, month } = getYearMonthFromDate(request.start_date);
        const balance = await getOrCreateLeaveBalance(connection, request.employee_id, year, month);
        const used = balance.paid_used || 0;
        const deduction = balance.next_month_deduction || 0;
        const effectiveQuota = Math.max(0, (balance.paid_quota || 2) - deduction);
        const requestedDays = Number(request.days_requested) || 1;
        const willExceedPaid = used + requestedDays > effectiveQuota;
        const newUsed = willExceedPaid ? used : used + requestedDays;
        await connection.execute(
          'UPDATE leave_balances SET paid_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newUsed, balance.id]
        );
      }
      await connection.commit();
      res.json({ success: true, id: Number(id), acknowledged: true, status: approved ? 'approved' : 'rejected' });
    } catch (err) {
      if (connection) try { await connection.rollback(); } catch (_) {}
      console.error('Error acknowledging leave:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Update own leave dates (for booker who accepted swap - move their leave so emergency applicant can be approved)
  router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { start_date, end_date, start_segment, end_segment, employee_id } = req.body || {};
    const currentUserId = Number(employee_id || req.headers['x-user-id'] || req.headers['user-id'] || 0);
    if (!currentUserId) return res.status(400).json({ error: 'employee_id is required' });
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT * FROM leave_requests WHERE id = ? FOR UPDATE', [id]);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Leave not found' });
      }
      const leave = rows[0];
      if (leave.employee_id !== currentUserId) {
        await connection.rollback();
        return res.status(403).json({ error: 'You can only update your own leave' });
      }
      if (leave.status !== 'approved' && leave.status !== 'pending') {
        await connection.rollback();
        return res.status(400).json({ error: 'Only approved or pending leaves can be updated' });
      }
      // Validate new date range: must not be blocked (event) or already booked by another employee
      let deptId = leave.department_id || null;
      if (!deptId && currentUserId) {
        const [empRows] = await connection.execute('SELECT department FROM employees WHERE id = ? LIMIT 1', [currentUserId]);
        if (empRows.length > 0 && empRows[0].department) {
          const [dRows] = await connection.execute('SELECT id FROM departments WHERE name = ? LIMIT 1', [empRows[0].department]);
          deptId = dRows.length ? dRows[0].id : null;
        }
      }
      const [blockedRows] = await connection.execute(
        `SELECT id FROM leave_requests WHERE employee_id = 0
         AND start_date <= ? AND end_date >= ?
         AND (
           (reason LIKE 'HOLIDAY%' AND department_id IS NULL)
           OR (reason LIKE 'IMPORTANT_EVENT%' AND (department_id IS NULL OR department_id = ?))
         ) LIMIT 1`,
        [end_date, start_date, deptId]
      );
      if (blockedRows.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Leave cannot be moved to this date; it falls on an event (holiday or important date).',
          date_blocked: true
        });
      }
      const [bookedRows] = await connection.execute(
        `SELECT id FROM leave_requests WHERE employee_id != 0 AND id != ?
         AND status IN ('pending','approved') AND start_date <= ? AND end_date >= ? LIMIT 1`,
        [id, end_date, start_date]
      );
      if (bookedRows.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'This date range is already booked by another employee. Choose different dates.',
          date_booked: true
        });
      }
      const daysRequested = Math.max(1, Math.ceil((new Date(end_date) - new Date(start_date)) / (24 * 3600 * 1000)) + 1);
      await connection.execute(
        `UPDATE leave_requests SET start_date = ?, end_date = ?, start_segment = ?, end_segment = ?,
          days_requested = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [start_date, end_date, start_segment || leave.start_segment, end_segment || leave.end_segment, daysRequested, id]
      );
      // If this leave was the target of a swap request, check if any pending leave B has requested_swap_with_leave_id = id and no longer overlaps; if so auto-approve B
      const [pendingSwap] = await connection.execute(
        `SELECT id, employee_id, start_date, end_date, is_paid, days_requested FROM leave_requests
         WHERE requested_swap_with_leave_id = ? AND status = 'pending' AND swap_responded_at IS NOT NULL AND swap_accepted = 1`,
        [id]
      );
      for (const B of pendingSwap) {
        const overlap = B.start_date <= end_date && B.end_date >= start_date;
        if (!overlap) {
          // Clear swap link so this leave is no longer tied to the moved leave
          await connection.execute(
            `UPDATE leave_requests SET requested_swap_with_leave_id = NULL WHERE id = ?`,
            [B.id]
          );
          // Paid leave: auto-approve after successful swap. Regular: leave pending for admin acknowledgement.
          if (B.is_paid) {
            const { year, month } = getYearMonthFromDate(B.start_date);
            const balance = await getOrCreateLeaveBalance(connection, B.employee_id, year, month);
            const used = balance.paid_used || 0;
            const deduction = balance.next_month_deduction || 0;
            const effectiveQuota = Math.max(0, (balance.paid_quota || 2) - deduction);
            const reqDays = Number(B.days_requested) || 1;
            const willExceedPaid = used + reqDays > effectiveQuota;
            const newUsed = willExceedPaid ? used : used + reqDays;
            await connection.execute(
              'UPDATE leave_balances SET paid_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [newUsed, balance.id]
            );
            await connection.execute(
              `UPDATE leave_requests SET status = 'approved', decision_at = NOW(), is_paid = ?, approved_via_swap = 1 WHERE id = ?`,
              [willExceedPaid ? 0 : 1, B.id]
            );
          }
          // Regular leave remains status = 'pending' for admin to acknowledge
        }
      }
      await connection.commit();
      res.json({ success: true, id: Number(id), start_date, end_date });
    } catch (err) {
      if (connection) try { await connection.rollback(); } catch (_) {}
      console.error('Error updating leave:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Cancel own future leave (employee only: pending or approved, end_date >= today, not uninformed)
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const currentUserId = Number(req.headers['x-user-id'] || req.headers['user-id'] || req.query.employee_id || req.body?.employee_id || 0);
    if (!currentUserId) return res.status(400).json({ error: 'employee_id is required (header or body)' });
    const today = new Date().toISOString().split('T')[0];
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      const [rows] = await connection.execute(
        'SELECT id, employee_id, status, end_date, is_uninformed FROM leave_requests WHERE id = ?',
        [id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Leave not found' });
      const leave = rows[0];
      if (leave.employee_id !== currentUserId) return res.status(403).json({ error: 'You can only cancel your own leave' });
      if (leave.is_uninformed) return res.status(400).json({ error: 'Uninformed leaves cannot be cancelled here' });
      if (leave.status !== 'pending' && leave.status !== 'approved') return res.status(400).json({ error: 'Only pending or approved leaves can be cancelled' });
      if (leave.end_date < today) return res.status(400).json({ error: 'Past leaves cannot be cancelled' });
      await connection.execute('DELETE FROM leave_requests WHERE id = ?', [id]);
      res.json({ success: true, id: Number(id) });
    } catch (err) {
      console.error('Error cancelling leave:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Admin-only: hard delete a leave request from the calendar (any employee leave, not blocked dates).
  // NOTE: This is intended for correcting bad data and does NOT currently adjust paid_used or
  // uninformed balances. Use sparingly for cleanup.
  router.delete('/admin/:id', async (req, res) => {
    const { id } = req.params;
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete leaves from the calendar.' });
    }
  
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
  
      const [rows] = await connection.execute(
        'SELECT id, employee_id, status FROM leave_requests WHERE id = ?',
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Leave not found' });
      }
      const leave = rows[0];
      // Do not delete blocked dates (employee_id = 0) via this endpoint.
      if (leave.employee_id === 0) {
        return res.status(400).json({ error: 'Use blocked-dates APIs to remove holidays/important events.' });
      }
  
      await connection.execute('DELETE FROM leave_requests WHERE id = ?', [id]);
      res.json({ success: true, id: Number(id) });
    } catch (err) {
      console.error('Error deleting leave as admin:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Acknowledge history: leaves where acknowledged_by IS NOT NULL (admin only)
  router.get('/acknowledged-history', async (req, res) => {
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    if (userRole !== 'admin') return res.status(403).json({ error: 'Access denied. Only admins can view acknowledge history.' });
    const { department_id, start_date, end_date, employee_name, search } = req.query;
    const nameSearch = (employee_name || search || '').toString().trim();
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      let query = `
        SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date, lr.status, lr.emergency_type, lr.reason,
               lr.acknowledged_by, lr.acknowledged_at, lr.is_important_date_override,
               e.name AS employee_name, ack.name AS acknowledged_by_name
        FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id
        LEFT JOIN employees ack ON ack.id = lr.acknowledged_by
        WHERE lr.acknowledged_by IS NOT NULL
      `;
      const params = [];
      if (department_id) {
        query += ' AND lr.department_id = ?';
        params.push(department_id);
      }
      if (start_date) {
        query += ' AND lr.end_date >= ?';
        params.push(start_date);
      }
      if (end_date) {
        query += ' AND lr.start_date <= ?';
        params.push(end_date);
      }
      if (nameSearch) {
        query += ' AND e.name LIKE ?';
        params.push(`%${nameSearch.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
      }
      query += ' ORDER BY lr.acknowledged_at DESC LIMIT 200';
      const [rows] = await connection.execute(query, params);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching acknowledged history:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Admin only: all employees' leaves by filter (future | past | acknowledged)
  router.get('/all', async (req, res) => {
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toLowerCase();
    if (userRole !== 'admin') return res.status(403).json({ error: 'Only admins can view all leaves.' });
    const { filter, department_id, start_date, end_date, type } = req.query;
    if (!filter || !['future', 'past', 'acknowledged'].includes(filter)) {
      return res.status(400).json({ error: 'filter is required and must be future, past, or acknowledged' });
    }
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      let query = `
        SELECT lr.*, e.name AS employee_name, e.department AS department_name,
               approver.name AS decision_by_name, ack.name AS acknowledged_by_name
        FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id
        LEFT JOIN employees approver ON approver.id = lr.decision_by
        LEFT JOIN employees ack ON ack.id = lr.acknowledged_by
        WHERE lr.employee_id != 0
      `;
      const params = [];
      if (department_id) {
        query += ' AND lr.department_id = ?';
        params.push(department_id);
      }
      if (start_date) {
        query += ' AND lr.end_date >= ?';
        params.push(start_date);
      }
      if (end_date) {
        query += ' AND lr.start_date <= ?';
        params.push(end_date);
      }
      if (type === 'paid') {
        query += ' AND lr.is_paid = 1 AND (lr.is_uninformed = 0 OR lr.is_uninformed IS NULL)';
      } else if (type === 'regular') {
        query += ' AND (lr.is_uninformed = 0 OR lr.is_uninformed IS NULL)';
      } else if (type === 'uninformed') {
        query += ' AND lr.is_uninformed = 1';
      }
      if (filter === 'future') {
        // Future view for admin should show only approved (non-uninformed) leaves.
        // Pending leaves that need acknowledgment are surfaced via /api/leaves/pending-actions instead.
        query += " AND lr.end_date >= CURDATE() AND lr.status = 'approved' AND (lr.is_uninformed = 0 OR lr.is_uninformed IS NULL)";
      } else if (filter === 'past') {
        query += " AND (lr.end_date < CURDATE() OR lr.status = 'rejected')";
      } else {
        query += ' AND lr.acknowledged_by IS NOT NULL';
      }
      query += ' ORDER BY lr.start_date DESC, lr.created_at DESC LIMIT 500';
      const [rows] = await connection.execute(query, params);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching all leaves:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // Get current user's leaves grouped by status
  router.get('/my', async (req, res) => {
    const { employee_id } = req.query;
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
  
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
  
      const query = `
        SELECT 
          lr.*,
          e.name AS employee_name,
          approver.name AS decision_by_name,
          ack.name AS acknowledged_by_name
        FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id
        LEFT JOIN employees approver ON approver.id = lr.decision_by
        LEFT JOIN employees ack ON ack.id = lr.acknowledged_by
        WHERE lr.employee_id = ?
        ORDER BY lr.created_at DESC
        LIMIT 200
      `;
      const [rows] = await connection.execute(query, [employee_id]);
  
      const fmtDate = (d) => (d && typeof d.toISOString === 'function' ? d.toISOString().slice(0, 10) : (d && typeof d === 'string' ? d.slice(0, 10) : (d ? String(d).slice(0, 10) : '')));
      const normalizeRow = (r) => ({
        ...r,
        start_date: r.start_date != null ? fmtDate(r.start_date) : r.start_date,
        end_date: r.end_date != null ? fmtDate(r.end_date) : r.end_date
      });
  
      const pending = [];
      const approved = [];
      const rejected = [];
      const acknowledged = [];
      rows.forEach((row) => {
        const r = normalizeRow(row);
        if (row.acknowledged_by != null) {
          acknowledged.push(r);
        }
        if (row.status === 'pending') {
          // A leave needs explicit admin acknowledgment when:
          // - It is an important-date override, OR
          // - It is a swap request that the booker has rejected / not fulfilled, OR
          // - It is a policy/unpaid leave where the policy form was filled
          //   (policy_reason_detail or expected_return_date set).
          const needsAck = !!(
            row.is_important_date_override === 1 ||
            (row.requested_swap_with_leave_id != null && row.swap_responded_at != null && row.swap_accepted === 0) ||
            row.policy_reason_detail != null ||
            row.expected_return_date != null
          );
          pending.push({ ...r, needs_acknowledgment: needsAck });
        } else if (row.status === 'approved') {
          // Include all approved leaves except uninformed (absentees). Use !== 1 so 0, null, "0" all count as normal.
          if (row.is_uninformed !== 1) {
            approved.push(r);
          }
        } else if (row.status === 'rejected') {
          rejected.push(r);
        }
      });
  
      res.json({
        pending,
        recent_approved: approved,
        recent_rejected: rejected,
        acknowledged
      });
    } catch (err) {
      console.error('Error fetching my leaves:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Department leaves for managers/admins
  router.get('/department', async (req, res) => {
    const { department_id } = req.query;
  
    // Normalize department filter
    let deptFilter = department_id;
    if (
      deptFilter === undefined ||
      deptFilter === null ||
      deptFilter === '' ||
      deptFilter === 'undefined' ||
      deptFilter === 'null'
    ) {
      deptFilter = null;
    }
  
    const userRoleHeader = req.headers['user-role'] || req.headers['x-user-role'] || null;
    const userRole = userRoleHeader ? String(userRoleHeader).toLowerCase() : 'employee';
    const isAdmin = userRole === 'admin';
    const isManager = userRole.includes('manager');
  
    // If a role header is explicitly provided and user is not admin/manager, block access.
    // If no header is present, preserve legacy behavior and allow the query.
    if (userRoleHeader && !isAdmin && !isManager) {
      return res.status(403).json({ error: 'Access denied. Only managers and admins can view department leaves.' });
    }
  
    // For managers, a valid department filter is required
    if (!isAdmin && isManager && !deptFilter) {
      return res.status(400).json({ error: 'department_id is required for manager views' });
    }
  
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
  
      let query = `
        SELECT 
          lr.*,
          e.name AS employee_name,
          d.name AS department_name,
          approver.name AS decision_by_name
        FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id
        LEFT JOIN departments d ON d.id = lr.department_id
        LEFT JOIN employees approver ON approver.id = lr.decision_by
      `;
      const params = [];
  
      // For managers, always filter by their department.
      // For admins, allow an optional department filter; if not provided, show all.
      if (!isAdmin || deptFilter !== null) {
        query += ' WHERE lr.department_id = ?';
        params.push(deptFilter);
      }
  
      query += ' ORDER BY lr.created_at DESC LIMIT 300';
  
      const [rows] = await connection.execute(query, params);
  
      const fmtDate = (d) => (d && typeof d.toISOString === 'function' ? d.toISOString().slice(0, 10) : (d && typeof d === 'string' ? d.slice(0, 10) : (d ? String(d).slice(0, 10) : '')));
      const normalizeRow = (r) => ({
        ...r,
        start_date: r.start_date != null ? fmtDate(r.start_date) : r.start_date,
        end_date: r.end_date != null ? fmtDate(r.end_date) : r.end_date
      });
  
      const pending = [];
      const approved = [];
      const rejected = [];
      rows.forEach((row) => {
        const r = normalizeRow(row);
        if (row.status === 'pending') {
          pending.push(r);
        } else if (row.status === 'approved') {
          // Include all approved except uninformed (absentees). Use !== 1 so 0, null, "0" all count as normal.
          if (row.is_uninformed !== 1) {
            approved.push(r);
          }
        } else if (row.status === 'rejected') {
          rejected.push(r);
        }
      });
  
      res.json({
        pending,
        recent_approved: approved,
        recent_rejected: rejected
      });
    } catch (err) {
      console.error('Error fetching department leaves:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Approve or reject a leave request
  router.post('/:id/decision', async (req, res) => {
    const { id } = req.params;
    const { status, decision_reason, decision_by } = req.body || {};
  
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }
  
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      await connection.beginTransaction();
  
      const [rows] = await connection.execute(
        'SELECT * FROM leave_requests WHERE id = ? FOR UPDATE',
        [id]
      );
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Leave request not found' });
      }
  
      const request = rows[0];
      if (request.status !== 'pending') {
        await connection.rollback();
        return res.status(400).json({ error: 'Only pending requests can be updated' });
      }
  
      // On approval, enforce department conflict and update leave_balances
      let updatedIsPaid = request.is_paid;
      if (status === 'approved') {
        if (request.department_id) {
          // Only enforce conflict when both the current request and the other leave holders
          // are Operators in the same department and their dates overlap.
          const [empRows] = await connection.execute(
            'SELECT designation FROM employees WHERE id = ?',
            [request.employee_id]
          );
          const applicantDesignation = empRows.length
            ? String(empRows[0].designation || '').toLowerCase()
            : '';
  
          if (applicantDesignation === 'operator') {
            const conflictQuery = `
              SELECT lr.id
              FROM leave_requests lr
              JOIN employees e ON e.id = lr.employee_id
              WHERE lr.department_id = ?
                AND lr.status IN ('pending','approved')
                AND lr.id <> ?
                AND lr.start_date <= ?
                AND lr.end_date >= ?
                AND LOWER(e.designation) = 'operator'
              LIMIT 1
            `;
            const [conflicts] = await connection.execute(conflictQuery, [
              request.department_id,
              id,
              request.end_date,
              request.start_date
            ]);
            if (conflicts.length > 0) {
              await connection.rollback();
              return res.status(409).json({
                error:
                  'Department conflict: another operator is already approved or pending for this period'
              });
            }
          }
        }
  
        const { year, month } = getYearMonthFromDate(request.start_date);
        const balance = await getOrCreateLeaveBalance(connection, request.employee_id, year, month);
        const quota = balance.paid_quota || 2;
        const used = balance.paid_used || 0;
        const deduction = balance.next_month_deduction || 0;
        const effectiveQuota = Math.max(0, quota - deduction);
        const requestedDays = Number(request.days_requested) || 1;
  
        if (request.is_uninformed) {
          // Uninformed leaves are always unpaid but still counted for the month.
          const uninformed = balance.uninformed_leaves || 0;
          await connection.execute(
            'UPDATE leave_balances SET uninformed_leaves = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [uninformed + requestedDays, balance.id]
          );
  
          // Recalculate cascading deductions across future months for this employee.
          await recalculateUninformedDeductionsForEmployee(connection, request.employee_id);
          updatedIsPaid = 0;
        } else if (request.is_paid) {
          // Only increment paid_used when the leave was applied as paid. Regular leaves must not deduct paid quota.
          const willExceedPaid = used + requestedDays > effectiveQuota;
          const newUsed = willExceedPaid ? used : used + requestedDays;
          await connection.execute(
            'UPDATE leave_balances SET paid_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newUsed, balance.id]
          );
          updatedIsPaid = willExceedPaid ? 0 : 1;
        } else {
          // Regular (non-paid) leave: do not touch paid_used; leave type stays unpaid.
          updatedIsPaid = 0;
        }
      }
  
      const decisionQuery = `
        UPDATE leave_requests
        SET status = ?, decision_reason = ?, decision_by = ?, decision_at = NOW(), is_paid = ?
        WHERE id = ?
      `;
      await connection.execute(decisionQuery, [
        status,
        decision_reason || null,
        decision_by || null,
        updatedIsPaid,
        id
      ]);
  
      await connection.commit();
  
      res.json({ success: true, id: Number(id), status, is_paid: updatedIsPaid });
    } catch (err) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          console.error('Error rolling back leave decision transaction:', rollbackErr);
        }
      }
      console.error('Error updating leave decision:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Mark uninformed leave (admin/manager)
  router.post('/mark-uninformed', async (req, res) => {
    const {
      employee_id,
      date,
      start_date,
      end_date,
      start_segment,
      end_segment,
      days,
      days_requested,
      reason,
      decision_by
    } = req.body || {};
  
    const userRoleHeader = req.headers['user-role'] || req.headers['x-user-role'] || 'employee';
    const userRole = String(userRoleHeader || '').toLowerCase();
    const isAdmin = userRole === 'admin';
    const isManager = userRole.includes('manager');
  
    if (!isAdmin && !isManager) {
      return res.status(403).json({ error: 'Access denied. Only managers and admins can mark uninformed leaves.' });
    }
  
    const effectiveStartDate = start_date || date;
    const effectiveEndDate = end_date || start_date || date;
  
    if (!employee_id || !effectiveStartDate || !effectiveEndDate) {
      return res.status(400).json({ error: 'employee_id and a valid start/end date are required' });
    }
  
    const requestedDays =
      (typeof days_requested === 'number' && !Number.isNaN(days_requested))
        ? days_requested
        : (typeof days === 'number' && !Number.isNaN(days) ? days : 1);
  
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      await connection.beginTransaction();
  
      // Employees table has department (name), not department_id; resolve from departments table
      const [empRows] = await connection.execute(
        'SELECT id, name, department FROM employees WHERE id = ?',
        [employee_id]
      );
      if (empRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Employee not found' });
      }
      const emp = empRows[0];
      let empDeptId = null;
      if (emp.department) {
        const [dRows] = await connection.execute('SELECT id FROM departments WHERE name = ? LIMIT 1', [emp.department]);
        empDeptId = dRows.length ? dRows[0].id : null;
      }
  
      const { year, month } = getYearMonthFromDate(effectiveStartDate);
      const balance = await getOrCreateLeaveBalance(connection, employee_id, year, month);
      const uninformed = balance.uninformed_leaves || 0;
  
      const insertQuery = `
        INSERT INTO leave_requests (
          employee_id,
          department_id,
          status,
          reason,
          start_date,
          end_date,
          start_segment,
          end_segment,
          days_requested,
          is_paid,
          is_uninformed
        ) VALUES (?, ?, 'approved', ?, ?, ?, ?, ?, ?, 0, 1)
      `;
  
      const [result] = await connection.execute(insertQuery, [
        employee_id,
        empDeptId,
        reason || 'Uninformed leave',
        effectiveStartDate,
        effectiveEndDate,
        start_segment || 'full_day',
        end_segment || 'full_day',
        requestedDays
      ]);
  
      // Record who marked the uninformed leave and when
      if (decision_by) {
        await connection.execute(
          'UPDATE leave_requests SET decision_by = ?, decision_at = NOW(), decision_reason = ? WHERE id = ?',
          [decision_by, reason || 'Uninformed leave', result.insertId]
        );
      }
  
      await connection.execute(
        'UPDATE leave_balances SET uninformed_leaves = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [uninformed + requestedDays, balance.id]
      );
  
      // Recalculate cascading deductions across future months for this employee.
      await recalculateUninformedDeductionsForEmployee(connection, employee_id);
  
      await connection.commit();
  
      res.status(201).json({
        success: true,
        id: result.insertId,
        employee_id,
        employee_name: emp.name,
        start_date: effectiveStartDate,
        end_date: effectiveEndDate,
        days: requestedDays
      });
    } catch (err) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          console.error('Error rolling back mark-uninformed transaction:', rollbackErr);
        }
      }
      console.error('Error marking uninformed leave:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Delete an uninformed leave (admin/manager, or employee deleting their own)
  router.delete('/uninformed/:id', async (req, res) => {
    const { id } = req.params;
    const currentUserId = Number(req.headers['x-user-id'] || req.headers['user-id'] || 0);
  
    const userRoleHeader = req.headers['user-role'] || req.headers['x-user-role'] || 'employee';
    const userRole = String(userRoleHeader || '').toLowerCase();
    const isAdmin = userRole === 'admin';
    const isManager = userRole.includes('manager');
  
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      await connection.beginTransaction();
  
      const [rows] = await connection.execute(
        'SELECT id, employee_id, start_date, days_requested, is_uninformed FROM leave_requests WHERE id = ? FOR UPDATE',
        [id]
      );
      if (rows.length === 0 || !rows[0].is_uninformed) {
        await connection.rollback();
        return res.status(404).json({ error: 'Uninformed leave not found' });
      }
      const row = rows[0];
      const isOwnLeave = currentUserId && row.employee_id === currentUserId;
      if (!isAdmin && !isManager && !isOwnLeave) {
        await connection.rollback();
        return res.status(403).json({ error: 'Access denied. Only managers, admins, or the leave owner can delete this record.' });
      }
  
      const { year, month } = getYearMonthFromDate(row.start_date);
      const balance = await getOrCreateLeaveBalance(connection, row.employee_id, year, month);
      const currentUninformed = balance.uninformed_leaves || 0;
      const toRemove = Number(row.days_requested) || 0;
      const updatedUninformed = Math.max(0, currentUninformed - toRemove);
  
      await connection.execute(
        'UPDATE leave_balances SET uninformed_leaves = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [updatedUninformed, balance.id]
      );
  
      await connection.execute('DELETE FROM leave_requests WHERE id = ?', [id]);
  
      // Recalculate cascading deductions based on remaining uninformed leaves
      await recalculateUninformedDeductionsForEmployee(connection, row.employee_id);
  
      await connection.commit();
  
      res.json({ success: true, id: Number(id) });
    } catch (err) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          console.error('Error rolling back uninformed delete transaction:', rollbackErr);
        }
      }
      console.error('Error deleting uninformed leave:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Leave policy for display
  router.get('/policy', async (req, res) => {
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
  
      const [rows] = await connection.execute('SELECT policy_key, policy_value, description FROM leave_policies');
      const policy = {
        monthly_paid_quota: 2,
        uninformed_penalty_text: 'Each uninformed leave day reduces paid leave quotas in future months until all such days have been deducted. No leaves this month are paid out in cash.',
        cashout_allowed: false
      };
  
      rows.forEach((row) => {
        if (row.policy_key === 'monthly_paid_quota') {
          try {
            const val = row.policy_value ? JSON.parse(row.policy_value) : null;
            if (val && typeof val.quota === 'number') {
              policy.monthly_paid_quota = val.quota;
            }
          } catch (e) {
            // ignore parse error, keep default
          }
        }
        if (row.policy_key === 'uninformed_penalty_rule') {
          try {
            const val = row.policy_value ? JSON.parse(row.policy_value) : null;
            if (val && typeof val.text === 'string') {
              policy.uninformed_penalty_text = val.text;
            }
          } catch (e) {
            // ignore parse error
          }
        }
      });
  
      res.json(policy);
    } catch (err) {
      console.error('Error fetching leave policy:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Per-employee leave report
  router.get('/report', async (req, res) => {
    const { employee_id, year, month } = req.query;
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
  
    const now = new Date();
    const useYear = year ? parseInt(year, 10) : now.getFullYear();
    const useMonth = month ? parseInt(month, 10) : now.getMonth() + 1;
  
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
  
      const balance = await getOrCreateLeaveBalance(connection, employee_id, useYear, useMonth);
      const quota = balance.paid_quota || 2;
      const used = balance.paid_used || 0;
      const deductionThisMonth = balance.next_month_deduction || 0;
      const effectiveQuota = Math.max(0, quota - deductionThisMonth);
      const remaining = Math.max(0, effectiveQuota - used);
  
      const startDate = `${useYear}-${String(useMonth).padStart(2, '0')}-01`;
      const endDate = `${useYear}-${String(useMonth).padStart(2, '0')}-31`;
  
      const [uninformedRows] = await connection.execute(
        `
          SELECT 
            lr.id,
            lr.start_date,
            lr.end_date,
            lr.days_requested,
            lr.reason,
            lr.decision_at,
            e.name AS recorded_by_name
          FROM leave_requests lr
          LEFT JOIN employees e ON e.id = lr.decision_by
          WHERE lr.employee_id = ?
            AND lr.is_uninformed = 1
            AND lr.start_date >= ?
            AND lr.start_date <= ?
          ORDER BY lr.start_date DESC
        `,
        [employee_id, startDate, endDate]
      );
  
      const [futureBalances] = await connection.execute(
        `
          SELECT year, month, next_month_deduction
          FROM leave_balances
          WHERE employee_id = ?
            AND (year > ? OR (year = ? AND month > ?))
            AND next_month_deduction > 0
          ORDER BY year, month
        `,
        [employee_id, useYear, useYear, useMonth]
      );
  
      const totalFutureDeduction = futureBalances.reduce(
        (sum, row) => sum + (Number(row.next_month_deduction) || 0),
        0
      );
  
      const [leavesCountRows] = await connection.execute(
        `SELECT COUNT(*) AS cnt FROM leave_requests lr
         WHERE lr.employee_id = ? AND lr.status = 'approved' AND lr.start_date >= ? AND lr.start_date <= ?
           AND (lr.is_uninformed = 0 OR lr.is_uninformed IS NULL)`,
        [employee_id, startDate, endDate]
      );
      const leaves_taken_this_month = Number(leavesCountRows[0]?.cnt || 0);
  
      // Paid leave deductions this month: approved paid leaves (not uninformed, not cancelled) that utilized quota
      const [paidDeductionRows] = await connection.execute(
        `SELECT lr.id, lr.start_date, lr.end_date, lr.days_requested, lr.reason, lr.emergency_type
         FROM leave_requests lr
         WHERE lr.employee_id = ? AND lr.status = 'approved' AND lr.is_paid = 1
           AND (lr.is_uninformed = 0 OR lr.is_uninformed IS NULL)
           AND lr.start_date <= ? AND lr.end_date >= ?
         ORDER BY lr.start_date ASC`,
        [employee_id, endDate, startDate]
      );
      const fmtReportDate = (d) => (d && typeof d.toISOString === 'function' ? d.toISOString().slice(0, 10) : (d && typeof d === 'string' ? d.slice(0, 10) : (d ? String(d).slice(0, 10) : '')));
      const paid_leave_deductions = (paidDeductionRows || []).map((r) => ({
        id: r.id,
        start_date: fmtReportDate(r.start_date),
        end_date: fmtReportDate(r.end_date),
        days_requested: r.days_requested,
        reason: r.reason || '',
        emergency_type: r.emergency_type || null
      }));
  
      const uninformedCount = Math.max(Number(balance.uninformed_leaves) || 0, uninformedRows.length);
  
      res.json({
        employee_id: Number(employee_id),
        year: useYear,
        month: useMonth,
        paid_quota: quota,
        paid_used: used,
        remaining_paid: remaining,
        uninformed_count: uninformedCount,
        next_month_deduction: deductionThisMonth,
        effective_quota: effectiveQuota,
        uninformed_details: uninformedRows,
        future_deductions: futureBalances,
        total_future_deduction: totalFutureDeduction,
        leaves_taken_this_month,
        paid_leave_deductions
      });
    } catch (err) {
      console.error('Error fetching leave report:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });

module.exports = router;