// Helper: get or create a leave_balances row for employee/month
const getOrCreateLeaveBalance = async (connection, employeeId, year, month) => {
  const [rows] = await connection.execute(
    'SELECT * FROM leave_balances WHERE employee_id = ? AND year = ? AND month = ?',
    [employeeId, year, month]
  );
  if (rows.length > 0) return rows[0];

  await connection.execute(
    'INSERT INTO leave_balances (employee_id, year, month) VALUES (?, ?, ?)',
    [employeeId, year, month]
  );
  const [rowsAfterInsert] = await connection.execute(
    'SELECT * FROM leave_balances WHERE employee_id = ? AND year = ? AND month = ?',
    [employeeId, year, month]
  );
  return rowsAfterInsert[0];
};

// Helper: allocate uninformed leave days into future months as deductions
const allocateUninformedToFutureMonths = async (connection, employeeId, baseDateStr, daysToAllocate) => {
  let remaining = daysToAllocate;
  if (!remaining || remaining <= 0) return;

  const base = new Date(baseDateStr);
  if (Number.isNaN(base.getTime())) return;

  let year = base.getFullYear();
  let month = base.getMonth() + 2;

  while (remaining > 0 && year < base.getFullYear() + 5) {
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const balance = await getOrCreateLeaveBalance(connection, employeeId, year, month);
    const quota = balance.paid_quota || 2;
    const alreadyDeducted = balance.next_month_deduction || 0;
    const capacity = Math.max(0, quota - alreadyDeducted);
    if (capacity > 0) {
      const allocate = Math.min(remaining, capacity);
      await connection.execute(
        'UPDATE leave_balances SET next_month_deduction = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [alreadyDeducted + allocate, balance.id]
      );
      remaining -= allocate;
    }
    month += 1;
  }
};

// Helper: recompute cascading uninformed deductions for an employee
const recalculateUninformedDeductionsForEmployee = async (connection, employeeId) => {
  if (!employeeId) return;

  await connection.execute(
    'UPDATE leave_balances SET next_month_deduction = 0 WHERE employee_id = ?',
    [employeeId]
  );

  const [uninformedRows] = await connection.execute(
    `
      SELECT start_date, days_requested
      FROM leave_requests
      WHERE employee_id = ?
        AND is_uninformed = 1
        AND status = 'approved'
      ORDER BY start_date ASC
    `,
    [employeeId]
  );

  for (const row of uninformedRows) {
    const days = Number(row.days_requested) || 0;
    if (!days) continue;
    await allocateUninformedToFutureMonths(connection, employeeId, row.start_date, days);
  }
};

module.exports = {
  getOrCreateLeaveBalance,
  allocateUninformedToFutureMonths,
  recalculateUninformedDeductionsForEmployee
};
