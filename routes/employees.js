// EMPLOYEES ROUTES - Extract from server-backup.js lines: 3042-4439
// Mount at: /api/employees
const router = require('express').Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { mysqlPool } = require('../config/database');
const { sanitizeForMySQL } = require('../helpers/sanitize');
const { getHealthSettings } = require('../helpers/healthSettings');
const upload = multer({ storage: multer.memoryStorage() });
// TODO: Copy handlers
// Get all employees
router.get('/', async (req, res) => {
    // Check if all employees are requested (for task assignment)
    const getAll = req.query.all === 'true';
    const includeInactive = req.query.includeInactive === 'true';
    const { department, designation } = req.query;
    
    let query, countQuery, params;
    let whereClause = '';
    let whereParams = [];
    
    // Build WHERE clause for filters
    if (department) {
      whereClause += ' WHERE department = ?';
      whereParams.push(department);
    }
    
    if (designation) {
      if (whereClause) {
        whereClause += ' AND LOWER(designation) LIKE ?';
      } else {
        whereClause += ' WHERE LOWER(designation) LIKE ?';
      }
      whereParams.push(`%${designation.toLowerCase()}%`);
    }
    
    const statusFilter = includeInactive ? '' : (whereClause ? ' AND status = "Active"' : ' WHERE status = "Active"');
    
    if (getAll) {
      // Return all employees (optionally including inactive for e.g. Errors dropdown)
      if (whereClause) {
        query = `SELECT * FROM employees${whereClause}${statusFilter} ORDER BY name ASC`;
        countQuery = `SELECT COUNT(*) as total FROM employees${whereClause}${statusFilter}`;
      } else {
        query = includeInactive ? 'SELECT * FROM employees ORDER BY name ASC' : 'SELECT * FROM employees WHERE status = "Active" ORDER BY name ASC';
        countQuery = includeInactive ? 'SELECT COUNT(*) as total FROM employees' : 'SELECT COUNT(*) as total FROM employees WHERE status = "Active"';
      }
      params = whereParams;
    } else {
      // Pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      
      // NOTE: LIMIT and OFFSET cannot use placeholders in MySQL prepared statements
      // Insert values directly into query (safe because we've validated them as integers)
      const safeLimit = parseInt(limit, 10);
      const safeOffset = parseInt(offset, 10);
      query = `SELECT * FROM employees${whereClause} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
      countQuery = `SELECT COUNT(*) as total FROM employees${whereClause}`;
      params = [...whereParams]; // Don't include limit/offset in params
    }
                let connection;
                
                try {
                  // Get a connection from the pool
                  connection = await mysqlPool.getConnection();
                  
                  // Check connection health
                  await connection.ping();
                  
                  // Execute both queries in parallel
                  const [results, countResult] = await Promise.all([
                    connection.execute(query, params),
                    connection.execute(countQuery, whereParams)
                  ]);
                  
                  const total = countResult[0][0].total;
                  
                  if (getAll) {
                    // Return all employees without pagination
                    res.json({
                      data: results[0],
                      pagination: {
                        page: 1,
                        limit: total,
                        total,
                        totalPages: 1,
                        hasNext: false,
                        hasPrev: false
                      }
                    });
                  } else {
                    // Pagination parameters
                    const page = parseInt(req.query.page) || 1;
                    const limit = parseInt(req.query.limit) || 50;
                    const totalPages = Math.ceil(total / limit);
                    res.json({
                      data: results[0],
                      pagination: {
                        page,
                        limit,
                        total,
                        totalPages,
                        hasNext: page < totalPages,
                        hasPrev: page > 1
                      }
                    });
                  }
                  
                } catch (err) {
        console.error('Error fetching employees:', err);
                  
                  // Check if it's a connection error
                  if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                    console.error('MySQL connection lost, attempting to reconnect...');
                    res.status(503).json({ error: 'Database connection lost, please try again' });
                  } else {
        res.status(500).json({ error: 'Database error' });
                  }
                } finally {
                  // Always release the connection back to the pool
                  if (connection) {
                    connection.release();
                  }
                }
  });
  
  // Get employee statistics
  router.get('/stats', async (req, res) => {
    const queries = {
      total: 'SELECT COUNT(*) as count FROM employees',
      managers: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(designation) LIKE "%manager%"',
      teamLeaders: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(designation) LIKE "%team%" AND LOWER(designation) LIKE "%leader%"',
      operators: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(designation) LIKE "%operator%"',
      staff: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(designation) LIKE "%staff%"',
      admin: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(user_role) = "admin" OR LOWER(designation) LIKE "%admin%"',
      officeEmployees: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(work_from) = "office"',
      remoteEmployees: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(work_from) = "remote"',
      fullTimeEmployees: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(employment_type) = "full-time"',
      partTimeEmployees: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(employment_type) = "part-time"',
      internEmployees: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(employment_type) = "intern"'
    };
  
    let connection;
    try {
      // Get a connection from the pool
      connection = await mysqlPool.getConnection();
      
      // Check connection health
      await connection.ping();
  
    const stats = {};
      
      // Execute all queries in parallel for better performance
      const promises = Object.keys(queries).map(async (key) => {
        try {
          const [results] = await connection.execute(queries[key]);
          stats[key] = results[0].count;
        } catch (err) {
          console.error(`Error fetching ${key} stats:`, err);
          stats[key] = 0;
        }
      });
  
      // Wait for all queries to complete
      await Promise.all(promises);
      
          res.json(stats);
      
    } catch (err) {
      console.error('Error in employee statistics:', err);
      
      // Check if it's a connection error
      if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
        console.error('MySQL connection lost, attempting to reconnect...');
        res.status(503).json({ error: 'Database connection lost, please try again' });
      } else {
        res.status(500).json({ error: 'Database error' });
      }
    } finally {
      // Always release the connection back to the pool
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Debug endpoint to see employee data
  router.get('/debug', async (req, res) => {
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
  
      const query = 'SELECT id, name, designation, work_from, employment_type FROM employees LIMIT 10';
      const [results] = await connection.execute(query);
      res.json(results);
    } catch (err) {
      console.error('Error fetching debug data:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
  // Get employee health score
  router.get('/:id/health', async (req, res) => {
    const employeeId = req.params.id;
    const today = new Date();
    
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      
      // Get health settings from database
      const healthSettings = await getHealthSettings(connection);
      
      // Calculate two health cycles using dynamic settings:
      // 1. HR Cycle: Last N months from 1st of month to last date of Nth month
      // 2. Task Management Cycle: Last N months from X days earlier from today
      
      // HR Cycle: From 1st of month to last date of Nth month
      const hrCycleStart = new Date();
      hrCycleStart.setDate(1); // First day of current month
      hrCycleStart.setMonth(hrCycleStart.getMonth() - healthSettings.hr_cycle_months); // Go back N months
      
      const hrCycleEnd = new Date(); // Include current month
      
      // Data Cycle: Broader range for errors, appreciations, and general data
      // This includes current month data that might not be in the HR cycle
      const dataCycleStart = new Date();
      dataCycleStart.setMonth(dataCycleStart.getMonth() - healthSettings.data_cycle_months); // Go back N months
      
      const dataCycleEnd = new Date(); // Up to today
      dataCycleEnd.setDate(dataCycleEnd.getDate() + 1); // Include today's data
      
      // Task Management Cycle: From X days earlier from today, going back N months
      const taskCycleStart = new Date();
      taskCycleStart.setDate(taskCycleStart.getDate() - healthSettings.task_cycle_offset_days); // X days earlier from today
      taskCycleStart.setMonth(taskCycleStart.getMonth() - healthSettings.task_cycle_months); // Go back N months
      
      const taskCycleEnd = new Date();
      taskCycleEnd.setDate(taskCycleEnd.getDate() - healthSettings.task_cycle_offset_days); // X days earlier from today
  
      // Handle admin user case
      let employee;
      if (employeeId === 'admin') {
        // Create a mock employee object for admin user
        employee = {
          id: 'admin',
          name: 'Admin User',
          email: 'admin@daataadirect.co.uk',
          working_hours: 8, // Default working hours
          user_role: 'admin'
        };
      } else {
        // Get employee data from database
        const employeeQuery = 'SELECT * FROM employees WHERE id = ?';
        const [employeeRows] = await connection.execute(employeeQuery, [employeeId]);
        
        if (employeeRows.length === 0) {
          return res.status(404).json({ error: 'Employee not found' });
        }
        
        employee = employeeRows[0];
      }
      
      // Get the employee_id string for attendance/errors/appreciations queries
      // Note: attendance table stores employee_id as the integer ID converted to string
      // errors and appreciations tables store employee_id as integer
      // For admin user, use a special identifier that won't match any real employee
      const employeeIdString = employeeId === 'admin' ? 'admin' : employeeId.toString(); // Use integer ID as string for attendance
      const employeeIdInt = employeeId === 'admin' ? -1 : employeeId; // Use -1 for admin, integer ID for others
      
      console.log('Employee ID from URL:', employeeId);
      console.log('Employee ID as string:', employeeIdString);
      console.log('Employee ID as int:', employeeIdInt);
        
      // Debug: Check if tables have any data
      console.log('Checking table contents for debugging...');
      console.log('HR Cycle dates (Working Hours):', { start: hrCycleStart.toISOString(), end: hrCycleEnd.toISOString() });
      console.log('Data Cycle dates (Errors/Appreciations):', { start: dataCycleStart.toISOString(), end: dataCycleEnd.toISOString() });
      console.log('Employee ID from URL:', employeeId);
      console.log('Employee ID type:', typeof employeeId);
      
      // Check if this employee ID exists in the database
      const [empRows] = await connection.execute('SELECT id, employee_id, name FROM employees WHERE id = ?', [employeeId]);
      if (empRows.length > 0) {
        console.log('Found employee:', empRows[0]);
      } else {
        console.log('No employee found with id:', employeeId);
        // Try to find by employee_id field
        const [emp2Rows] = await connection.execute('SELECT id, employee_id, name FROM employees WHERE employee_id = ?', [employeeId]);
        if (emp2Rows.length > 0) {
          console.log('Found employee by employee_id field:', emp2Rows[0]);
        } else {
          console.log('No employee found with employee_id:', employeeId);
        }
      }
        
      console.log('Employee found:', { id: employee.id, name: employee.name });
      
      let healthScore = 0;
      const calculations = {
        tasks: { completed: 0, total: 0, score: 0 },
        hours: { provided: 0, required: 0, score: 0 },
        errors: { high: 0, medium: 0, low: 0, score: 0 },
        appreciations: { count: 0, score: 0 },
        attendance: { absences: 0, score: 0 },
        warningLetters: { high: 0, medium: 0, low: 0, score: 0 }
      };
      
      // Handle admin user - return default health data without database queries
      if (employeeId === 'admin') {
        const adminHealthData = {
          employee: employee,
          healthScore: 0,
          calculations: calculations,
          healthSettings: healthSettings,
          cycles: {
            hr: { start: hrCycleStart, end: hrCycleEnd },
            data: { start: dataCycleStart, end: dataCycleEnd },
            task: { start: taskCycleStart, end: taskCycleEnd }
          },
          message: 'Admin user - no health data available'
        };
        
        return res.json(adminHealthData);
      }
      
      // Calculate expected working hours per day
      const expectedHoursPerDay = parseFloat(employee.working_hours) || healthSettings.expected_hours_per_day;
      
      await Promise.all([
        // 1. Calculate task completion score (using DWM report data)
        new Promise(async (resolve) => {
          const assignedToPattern = `%${employee.name}%`;
          const startDateStr = taskCycleStart.toISOString().split('T')[0];
          const endDateStr = taskCycleEnd.toISOString().split('T')[0];
          
          console.log('Fetching DWM report data for:', employee.name);
          console.log('Task cycle dates:', startDateStr, 'to', endDateStr);
          
          // Get DWM completion data AND total tasks for each day
          const dwmQuery = `
            WITH RECURSIVE dates AS (
              SELECT DATE(?) as day
              UNION ALL
              SELECT DATE_ADD(day, INTERVAL 1 DAY)
              FROM dates
              WHERE day <= DATE(?)
            )
            SELECT 
              d.day,
              COALESCE(SUM(CASE WHEN lower(t.labels) LIKE '%daily%' THEN 1 ELSE 0 END), 0) as daily_total,
              COALESCE(SUM(CASE WHEN (
                t.title LIKE '%(Monday)%' AND DAYOFWEEK(d.day) = 2 OR
                t.title LIKE '%(Tuesday)%' AND DAYOFWEEK(d.day) = 3 OR
                t.title LIKE '%(Wednesday)%' AND DAYOFWEEK(d.day) = 4 OR
                t.title LIKE '%(Thursday)%' AND DAYOFWEEK(d.day) = 5 OR
                t.title LIKE '%(Friday)%' AND DAYOFWEEK(d.day) = 6 OR
                t.title LIKE '%(Saturday)%' AND DAYOFWEEK(d.day) = 7 OR
                t.title LIKE '%(Sunday)%' AND DAYOFWEEK(d.day) = 1
              ) THEN 1 ELSE 0 END), 0) as weekly_total,
              COALESCE(SUM(CASE WHEN (
                t.title LIKE '%(5 of month)%' AND DAY(d.day) = 5 OR
                t.title LIKE '%(10 of month)%' AND DAY(d.day) = 10 OR
                t.title LIKE '%(15 of month)%' AND DAY(d.day) = 15 OR
                t.title LIKE '%(20 of month)%' AND DAY(d.day) = 20 OR
                t.title LIKE '%(25 of month)%' AND DAY(d.day) = 25 OR
                t.title LIKE '%(30 of month)%' AND DAY(d.day) = 30
              ) THEN 1 ELSE 0 END), 0) as monthly_total,
              COALESCE(SUM(CASE WHEN lower(t.labels) LIKE '%daily%' AND th.new_value = 'Completed' THEN 1 ELSE 0 END), 0) as daily_completed,
              COALESCE(SUM(CASE WHEN (
                t.title LIKE '%(Monday)%' AND DAYOFWEEK(d.day) = 2 OR
                t.title LIKE '%(Tuesday)%' AND DAYOFWEEK(d.day) = 3 OR
                t.title LIKE '%(Wednesday)%' AND DAYOFWEEK(d.day) = 4 OR
                t.title LIKE '%(Thursday)%' AND DAYOFWEEK(d.day) = 5 OR
                t.title LIKE '%(Friday)%' AND DAYOFWEEK(d.day) = 6 OR
                t.title LIKE '%(Saturday)%' AND DAYOFWEEK(d.day) = 7 OR
                t.title LIKE '%(Sunday)%' AND DAYOFWEEK(d.day) = 1
              ) AND th.new_value = 'Completed' THEN 1 ELSE 0 END), 0) as weekly_completed,
              COALESCE(SUM(CASE WHEN (
                t.title LIKE '%(5 of month)%' AND DAY(d.day) = 5 AND th.new_value = 'Completed' OR
                t.title LIKE '%(10 of month)%' AND DAY(d.day) = 10 AND th.new_value = 'Completed' OR
                t.title LIKE '%(15 of month)%' AND DAY(d.day) = 15 AND th.new_value = 'Completed' OR
                t.title LIKE '%(20 of month)%' AND DAY(d.day) = 20 AND th.new_value = 'Completed' OR
                t.title LIKE '%(25 of month)%' AND DAY(d.day) = 25 AND th.new_value = 'Completed' OR
                t.title LIKE '%(30 of month)%' AND DAY(d.day) = 30 AND th.new_value = 'Completed'
              ) THEN 1 ELSE 0 END), 0) as monthly_completed
            FROM dates d
            LEFT JOIN tasks t ON t.assigned_to LIKE ?
            LEFT JOIN task_history th ON DATE(th.created_at) = d.day AND th.action = 'Status changed' AND th.task_id = t.id
            GROUP BY d.day
            ORDER BY d.day ASC
          `;
          
          try {
            const [dwmData] = await connection.execute(dwmQuery, [startDateStr, endDateStr, assignedToPattern]);
            
            console.log(`Found DWM data for ${dwmData.length} days`);
            
            // Calculate total days in the cycle (should be 93 days from May 9 to Aug 9)
            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);
            const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            
            console.log(`Total days in cycle: ${totalDays} (from ${startDateStr} to ${endDateStr})`);
            
            // Count days where ALL required task types are completed
            let daysCompleted = 0;
            
            dwmData.forEach(dayRow => {
              const day = dayRow.day;
              const dailyTotal = dayRow.daily_total || 0;
              const weeklyTotal = dayRow.weekly_total || 0;
              const monthlyTotal = dayRow.monthly_total || 0;
              const dailyCompleted = dayRow.daily_completed || 0;
              const weeklyCompleted = dayRow.weekly_completed || 0;
              const monthlyCompleted = dayRow.monthly_completed || 0;
              
              // Day is completed if ALL required task types are completed
              let dayCompleted = true;
              
              // Check daily tasks - if any exist, they must ALL be completed
              if (dailyTotal > 0 && dailyCompleted < dailyTotal) {
                dayCompleted = false;
              }
              
              // Check weekly tasks - if any exist, they must ALL be completed
              if (weeklyTotal > 0 && weeklyCompleted < weeklyTotal) {
                dayCompleted = false;
              }
              
              // Check monthly tasks - if any exist, they must ALL be completed
              if (monthlyTotal > 0 && monthlyCompleted < monthlyTotal) {
                dayCompleted = false;
              }
              
              // Additional check: if there are no tasks for this day, don't count it
              if (dailyTotal === 0 && weeklyTotal === 0 && monthlyTotal === 0) {
                dayCompleted = false;
              }
              
              if (dayCompleted) {
                daysCompleted++;
                console.log(`✅ Day ${day} completed: Daily ${dailyCompleted}/${dailyTotal}, Weekly ${weeklyCompleted}/${weeklyTotal}, Monthly ${monthlyCompleted}/${monthlyTotal}`);
              } else {
                console.log(`❌ Day ${day} NOT completed: Daily ${dailyCompleted}/${dailyTotal}, Weekly ${weeklyCompleted}/${weeklyTotal}, Monthly ${monthlyCompleted}/${monthlyTotal}`);
              }
            });
            
            const score = daysCompleted * healthSettings.task_points_per_day;
            console.log(`Task completion: ${daysCompleted}/${totalDays} days, Score: ${score}`);
            
            calculations.tasks = {
              completed: daysCompleted,
              total: totalDays,
              score: score
            };
            
            resolve();
          } catch (err) {
            console.error('Error fetching DWM data:', err);
            console.error('Error details:', err.message);
            console.error('Error stack:', err.stack);
            
            // Set default values when there's an error
            calculations.tasks = {
              completed: 0,
              total: 0,
              score: 0
            };
            
            resolve();
          }
        }),
        
        // 2. Calculate working hours score (HR Cycle)
        new Promise(async (resolve) => {
          // Calculate actual working hours from duration_seconds or clock_in/clock_out times
          const hoursQuery = `
            SELECT 
              DATE_FORMAT(date, '%Y-%m') as month,
              SUM(CASE 
                WHEN duration_seconds > 0 THEN duration_seconds / 3600.0
                WHEN clock_in IS NOT NULL AND clock_out IS NOT NULL 
                THEN (UNIX_TIMESTAMP(clock_out) - UNIX_TIMESTAMP(clock_in)) / 3600.0
                ELSE 0 
              END) as monthly_hours
            FROM attendance 
            WHERE employee_id = ? 
            AND DATE(date) >= ? 
            AND DATE(date) <= ?
            GROUP BY DATE_FORMAT(date, '%Y-%m')
            ORDER BY month
          `;
          
          const startDateStr = hrCycleStart.toISOString().split('T')[0];
          const endDateStr = hrCycleEnd.toISOString().split('T')[0];
          
          console.log('Fetching attendance for employee:', employeeIdString, 'from', startDateStr, 'to', endDateStr);
          
          try {
            console.log('Executing hours query with params:', [employeeIdString, startDateStr, endDateStr]);
            const [attendance] = await connection.execute(hoursQuery, [employeeIdString, startDateStr, endDateStr]);
            
            console.log('Found attendance records:', attendance.length);
            console.log('Attendance data:', attendance);
            
            // If no attendance data found, use empty array (no fake data)
            if (attendance.length === 0) {
              console.log('❌ No attendance data found for employee:', employeeIdString);
              console.log('This means the SQL query returned no results');
            } else {
              console.log('✅ Found attendance data for employee:', employeeIdString);
            }
            
            let hoursScore = 0;
            let totalProvidedHours = 0;
            let totalRequiredHours = 0;
            let monthlyBreakdown = [];
            
            // Calculate for each month in the HR cycle (N-month period)
            console.log(`Starting monthly calculation loop for ${healthSettings.hr_cycle_months} months...`);
            for (let i = 0; i < healthSettings.hr_cycle_months; i++) {
              // Create a fresh date object for each month to avoid mutation issues
              const monthStart = new Date(hrCycleStart.getFullYear(), hrCycleStart.getMonth() + i, 1);
              monthStart.setHours(0, 0, 0, 0); // Set to start of day (midnight)
              
              const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
              monthEnd.setHours(23, 59, 59, 999); // Set to end of day
              
              console.log(`Month ${i + 1}: ${monthStart.toLocaleDateString()} to ${monthEnd.toLocaleDateString()}`);
              
              // Count working days in the month based on settings
              let workingDays = 0;
              for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay();
                if (dayOfWeek >= 1 && dayOfWeek <= healthSettings.working_days_per_week) { // Monday to Saturday (or configured days)
                  workingDays++;
                }
              }
              
              const requiredHoursForMonth = workingDays * expectedHoursPerDay;
              totalRequiredHours += requiredHoursForMonth;
              
              // Get the provided hours for this month from the monthly attendance data
              const monthKey = `${monthStart.getFullYear()}-${(monthStart.getMonth() + 1).toString().padStart(2, '0')}`; // YYYY-MM format
              const monthData = attendance.find(a => a.month === monthKey);
              const providedHoursForMonth = monthData ? parseFloat(monthData.monthly_hours) : 0;
              totalProvidedHours += providedHoursForMonth;
              
              // Calculate points for this month - configurable points if completed
              let monthPoints = 0;
              if (providedHoursForMonth >= requiredHoursForMonth) {
                monthPoints = healthSettings.hours_points_per_month; // Configurable points per month when full hours provided
                hoursScore += monthPoints;
              } else {
                monthPoints = 0; // 0 points when insufficient hours
              }
              
              // Add monthly breakdown
              const monthlyData = {
                month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                required: requiredHoursForMonth,
                provided: providedHoursForMonth,
                points: monthPoints
              };
              monthlyBreakdown.push(monthlyData);
              console.log(`Added monthly data:`, monthlyData);
              
              console.log(`Month ${monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}: Required ${requiredHoursForMonth.toFixed(2)}h, Provided ${providedHoursForMonth.toFixed(2)}h, Working days: ${workingDays}, Points: ${monthPoints}`);
              console.log('Monthly breakdown data:', { month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), required: requiredHoursForMonth, provided: providedHoursForMonth, points: monthPoints });
            }
            
            calculations.hours = {
              provided: totalProvidedHours,
              required: totalRequiredHours,
              score: hoursScore,
              monthlyBreakdown: monthlyBreakdown
            };
            
            console.log('Final hours calculations:', calculations.hours);
            resolve();
          } catch (err) {
            console.error('Error fetching attendance:', err);
            console.error('Error details:', err.message);
            console.error('Error stack:', err.stack);
            
            // Set default values when there's an error
            calculations.hours = {
              provided: 0,
              required: 0,
              score: 0,
              monthlyBreakdown: []
            };
            
            resolve();
          }
        }),
        
        // 3. Calculate error deductions
        new Promise(async (resolve) => {
          const errorQuery = `
            SELECT severity, COUNT(*) as count
            FROM errors 
            WHERE employee_id = ? 
            AND created_at >= ? 
            AND created_at <= ?
            GROUP BY severity
          `;
          
          const startDateStr = dataCycleStart.toISOString();
          const endDateStr = dataCycleEnd.toISOString();
          
          console.log('Fetching errors for employee:', employeeIdString, 'from', startDateStr, 'to', endDateStr);
          
          try {
            const [errors] = await connection.execute(errorQuery, [employeeIdInt, startDateStr, endDateStr]);
            
            console.log('Found errors:', errors);
            console.log('Error query params:', { employeeId: employeeIdInt, startDateStr, endDateStr });
            
            let errorDeduction = 0;
            let highErrors = 0, mediumErrors = 0, lowErrors = 0;
            
            if (errors && errors.length > 0) {
              errors.forEach(error => {
                console.log('Processing error:', error);
                if (error.severity === 'High') {
                  highErrors = error.count;
                  errorDeduction += error.count * healthSettings.error_high_deduction;
                } else if (error.severity === 'Medium') {
                  mediumErrors = error.count;
                  errorDeduction += error.count * healthSettings.error_medium_deduction;
                } else if (error.severity === 'Low') {
                  lowErrors = error.count;
                  errorDeduction += error.count * healthSettings.error_low_deduction;
                }
              });
            } else {
              console.log('No errors found for employee:', employeeId);
            }
            
            console.log('Error calculation result:', { highErrors, mediumErrors, lowErrors, errorDeduction });
            
            calculations.errors = {
              high: highErrors,
              medium: mediumErrors,
              low: lowErrors,
              score: -errorDeduction
            };
            
            resolve();
          } catch (err) {
            console.error('Error fetching errors:', err);
            console.error('Error details:', err.message);
            console.error('Error stack:', err.stack);
            
            // Set default values when there's an error
            calculations.errors = {
              high: 0,
              medium: 0,
              low: 0,
              score: 0
            };
            
            resolve();
          }
        }),
        
        // 4. Calculate appreciation bonus
        new Promise(async (resolve) => {
          const appreciationQuery = `
            SELECT COUNT(*) as count
            FROM appreciations 
            WHERE employee_id = ? 
            AND created_at >= ? 
            AND created_at <= ?
          `;
          
          const startDateStr = dataCycleStart.toISOString();
          const endDateStr = dataCycleEnd.toISOString();
          
          try {
            const [result] = await connection.execute(appreciationQuery, [employeeIdInt, startDateStr, endDateStr]);
            
            console.log('Appreciation query result:', result);
            console.log('Appreciation query params:', { employeeId: employeeIdInt, startDateStr, endDateStr });
            
            const appreciationCount = result && result.length > 0 ? result[0].count : 0;
            const appreciationScore = appreciationCount * healthSettings.appreciation_bonus;
            
            console.log('Appreciation calculation:', { count: appreciationCount, score: appreciationScore });
            
            calculations.appreciations = {
              count: appreciationCount,
              score: appreciationScore
            };
            
            resolve();
          } catch (err) {
            console.error('Error fetching appreciations:', err);
            console.error('Appreciation error details:', err.message);
            console.error('Error stack:', err.stack);
            
            // Set default values when there's an error
            calculations.appreciations = {
              count: 0,
              score: 0
            };
            
            resolve();
          }
        }),
        
        // 5. Calculate attendance deductions
        new Promise(async (resolve) => {
          const absenceQuery = `
            SELECT 
              DATE_FORMAT(date, '%Y-%m') as month,
              COUNT(*) as days_present
            FROM attendance 
            WHERE employee_id = ? 
            AND date >= ? 
            AND date <= ?
            GROUP BY DATE_FORMAT(date, '%Y-%m')
          `;
          
          const startDateStr = hrCycleStart.toISOString().split('T')[0];
          const endDateStr = hrCycleEnd.toISOString().split('T')[0];
          
          try {
            const [attendance] = await connection.execute(absenceQuery, [employeeIdString, startDateStr, endDateStr]);
            
            console.log('Attendance query result:', attendance);
            console.log('Attendance query params:', { employeeId: employeeIdString, startDateStr, endDateStr });
            
            let attendanceDeduction = 0;
            let totalAbsences = 0;
            
            // Calculate for each month
            for (let i = 0; i < healthSettings.hr_cycle_months; i++) {
              const monthStart = new Date(hrCycleStart);
              monthStart.setMonth(monthStart.getMonth() + i);
              const monthKey = monthStart.toISOString().substring(0, 7); // YYYY-MM format
              
              // Count working days in the month
              const monthEnd = new Date(monthStart);
              monthEnd.setMonth(monthEnd.getMonth() + 1);
              monthEnd.setDate(0);
              
              let workingDays = 0;
              for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay();
                if (dayOfWeek >= 1 && dayOfWeek <= healthSettings.working_days_per_week) { // Monday to Saturday (or configured days)
                  workingDays++;
                }
              }
              
              const monthAttendance = attendance.find(a => a.month === monthKey);
              const daysPresent = monthAttendance ? monthAttendance.days_present : 0;
              const absences = workingDays - daysPresent;
              
              totalAbsences += absences;
              
              // If more than configured absences in a month, deduct configured points
              if (absences > healthSettings.max_absences_per_month) {
                attendanceDeduction += healthSettings.attendance_deduction;
              }
            }
            
            calculations.attendance = {
              absences: totalAbsences,
              score: -attendanceDeduction
            };
            
            resolve();
          } catch (err) {
            console.error('Error fetching warning letters:', err);
            console.error('Warning letters error details:', err.message);
            console.error('Error stack:', err.stack);
            
            // Set default values when there's an error
            calculations.warningLetters = {
              high: 0,
              medium: 0,
              low: 0,
              score: 0
            };
            
            resolve();
          }
        })
      ]).then(() => {
        // Calculate total health score
        healthScore = calculations.tasks.score + 
                      calculations.hours.score + 
                      calculations.errors.score + 
                      calculations.appreciations.score + 
                      calculations.attendance.score +
                      calculations.warningLetters.score;
        
        // Determine rating using dynamic thresholds
        let rating, ratingColor;
        if (healthScore >= healthSettings.top_rated_threshold) {
          rating = 'TOP RATED EMPLOYEE';
          ratingColor = 'green';
        } else if (healthScore >= healthSettings.average_threshold) {
          rating = 'AVERAGE EMPLOYEE';
          ratingColor = 'orange';
        } else {
          rating = 'BELOW STANDARD EMPLOYEE';
          ratingColor = 'red';
        }
        
        res.json({
          employeeId: employeeId,
          employeeName: employee.name,
          healthScore: healthScore,
          rating: rating,
          ratingColor: ratingColor,
          calculations: calculations,
          period: {
            start: hrCycleStart.toISOString().split('T')[0],
            end: hrCycleEnd.toISOString().split('T')[0]
          },
          cycles: {
            hr: {
              start: hrCycleStart.toISOString().split('T')[0],
              end: hrCycleEnd.toISOString().split('T')[0],
              description: 'HR Cycle: Working Hours, Errors, Appreciations, Attendance'
            },
            task: {
              start: taskCycleStart.toISOString().split('T')[0],
              end: taskCycleEnd.toISOString().split('T')[0],
              description: 'Task Management Cycle: Task Completion'
            }
          }
        });
      }).catch((err) => {
        console.error('Error in Promise.all:', err);
        res.status(500).json({ error: 'Database error' });
      });
    } catch (err) {
      console.error('Error calculating health score:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Get employee by ID
  router.get('/:id', async (req, res) => {
    const query = 'SELECT * FROM employees WHERE id = ?';
    let connection;
    
    try {
      // Get a connection from the pool
      connection = await mysqlPool.getConnection();
      
      // Check connection health
      await connection.ping();
      
      const [results] = await connection.execute(query, [req.params.id]);
      
      if (results.length === 0) {
        res.status(404).json({ error: 'Employee not found' });
        return;
      }
      res.json(results[0]);
      
    } catch (err) {
      console.error('Error fetching employee:', err);
      
      // Check if it's a connection error
      if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
        console.error('MySQL connection lost, attempting to reconnect...');
        res.status(503).json({ error: 'Database connection lost, please try again' });
      } else {
        res.status(500).json({ error: 'Database error' });
      }
    } finally {
      // Always release the connection back to the pool
      if (connection) {
        connection.release();
      }
    }
  });
  // Create new employee
  router.post('/', async (req, res) => {
    const employeeData = req.body;
  
    // Basic validation
    if (!employeeData.name || !employeeData.email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    const query = `
      INSERT INTO employees (
        employee_id, salutation, name, email, password, designation, 
        department, work_from, country, mobile, gender, joining_date, 
        date_of_birth, reporting_to, language, user_role, address, 
        about, photo, login_allowed, email_notifications, hourly_rate, 
        slack_member_id, skills, probation_end_date, notice_period_start_date, 
        notice_period_end_date, employment_type, marital_status, business_address,
        status, working_hours, job_title, emergency_contact_number, emergency_contact_relation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      sanitizeForMySQL(employeeData.employee_id),
      sanitizeForMySQL(employeeData.salutation),
      sanitizeForMySQL(employeeData.name),
      sanitizeForMySQL(employeeData.email),
      sanitizeForMySQL(employeeData.password),
      sanitizeForMySQL(employeeData.designation),
      sanitizeForMySQL(employeeData.department),
      sanitizeForMySQL(employeeData.work_from),
      sanitizeForMySQL(employeeData.country),
      sanitizeForMySQL(employeeData.mobile),
      sanitizeForMySQL(employeeData.gender),
      sanitizeForMySQL(employeeData.joining_date),
      sanitizeForMySQL(employeeData.date_of_birth),
      sanitizeForMySQL(employeeData.reporting_to),
      sanitizeForMySQL(employeeData.language),
      sanitizeForMySQL(employeeData.user_role),
      sanitizeForMySQL(employeeData.address),
      sanitizeForMySQL(employeeData.about),
      sanitizeForMySQL(employeeData.photo),
      employeeData.login_allowed ? 1 : 0,
      employeeData.email_notifications ? 1 : 0,
      sanitizeForMySQL(employeeData.hourly_rate),
      sanitizeForMySQL(employeeData.slack_member_id),
      sanitizeForMySQL(employeeData.skills),
      sanitizeForMySQL(employeeData.probation_end_date),
      sanitizeForMySQL(employeeData.notice_period_start_date),
      sanitizeForMySQL(employeeData.notice_period_end_date),
      sanitizeForMySQL(employeeData.employment_type),
      sanitizeForMySQL(employeeData.marital_status),
      sanitizeForMySQL(employeeData.business_address),
      sanitizeForMySQL(employeeData.status) || 'Active',
      employeeData.working_hours || 8,
      sanitizeForMySQL(employeeData.job_title),
      sanitizeForMySQL(employeeData.emergency_contact_number),
      sanitizeForMySQL(employeeData.emergency_contact_relation)
    ];
    
    let connection;
    try {
      // Get a connection from the pool
      connection = await mysqlPool.getConnection();
      
      // Check connection health
      await connection.ping();
      
      const [result] = await connection.execute(query, values);
      
      res.status(201).json({ 
        id: result.insertId,
        message: 'Employee created successfully' 
      });
      
    } catch (err) {
        console.error('Error creating employee:', err);
      
      // Check for unique constraint violations
      if (err.code === 'ER_DUP_ENTRY') {
        if (err.message.includes('employees.email')) {
          return res.status(400).json({ error: 'Email already exists' });
        }
        if (err.message.includes('employees.employee_id')) {
          return res.status(400).json({ error: 'Employee ID already exists' });
        }
        return res.status(400).json({ error: 'Duplicate entry found' });
      }
      
      // Check if it's a connection error
      if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
        console.error('MySQL connection lost, attempting to reconnect...');
        res.status(503).json({ error: 'Database connection lost, please try again' });
      } else {
        res.status(500).json({ error: err.message || 'Database error' });
      }
    } finally {
      // Always release the connection back to the pool
      if (connection) {
        connection.release();
      }
    }
  });
  // Update employee
  router.put('/:id', async (req, res) => {
    const employeeData = req.body;
  
    // Basic validation
    if (!employeeData.name || !employeeData.email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    const query = `
      UPDATE employees SET 
        employee_id = ?, salutation = ?, name = ?, email = ?, password = ?, 
        designation = ?, department = ?, work_from = ?, country = ?, mobile = ?, 
        gender = ?, joining_date = ?, date_of_birth = ?, reporting_to = ?, 
        language = ?, user_role = ?, address = ?, about = ?, photo = ?, login_allowed = ?, 
        email_notifications = ?, hourly_rate = ?, slack_member_id = ?, skills = ?, 
        probation_end_date = ?, notice_period_start_date = ?, notice_period_end_date = ?, 
        employment_type = ?, marital_status = ?, business_address = ?,
        status = ?, working_hours = ?, job_title = ?, emergency_contact_number = ?, emergency_contact_relation = ?
      WHERE id = ?
    `;
    
    const values = [
      sanitizeForMySQL(employeeData.employee_id),
      sanitizeForMySQL(employeeData.salutation),
      sanitizeForMySQL(employeeData.name),
      sanitizeForMySQL(employeeData.email),
      sanitizeForMySQL(employeeData.password),
      sanitizeForMySQL(employeeData.designation),
      sanitizeForMySQL(employeeData.department),
      sanitizeForMySQL(employeeData.work_from),
      sanitizeForMySQL(employeeData.country),
      sanitizeForMySQL(employeeData.mobile),
      sanitizeForMySQL(employeeData.gender),
      sanitizeForMySQL(employeeData.joining_date),
      sanitizeForMySQL(employeeData.date_of_birth),
      sanitizeForMySQL(employeeData.reporting_to),
      sanitizeForMySQL(employeeData.language),
      sanitizeForMySQL(employeeData.user_role),
      sanitizeForMySQL(employeeData.address),
      sanitizeForMySQL(employeeData.about),
      sanitizeForMySQL(employeeData.photo),
      employeeData.login_allowed ? 1 : 0,
      employeeData.email_notifications ? 1 : 0,
      sanitizeForMySQL(employeeData.hourly_rate),
      sanitizeForMySQL(employeeData.slack_member_id),
      sanitizeForMySQL(employeeData.skills),
      sanitizeForMySQL(employeeData.probation_end_date),
      sanitizeForMySQL(employeeData.notice_period_start_date),
      sanitizeForMySQL(employeeData.notice_period_end_date),
      sanitizeForMySQL(employeeData.employment_type),
      sanitizeForMySQL(employeeData.marital_status),
      sanitizeForMySQL(employeeData.business_address),
      sanitizeForMySQL(employeeData.status) || 'Active',
      employeeData.working_hours || 8,
      sanitizeForMySQL(employeeData.job_title),
      sanitizeForMySQL(employeeData.emergency_contact_number),
      sanitizeForMySQL(employeeData.emergency_contact_relation),
      req.params.id
    ];
    let connection;
    try {
      // Get a connection from the pool
      connection = await mysqlPool.getConnection();
      
      // Check connection health
      await connection.ping();
      
      const [result] = await connection.execute(query, values);
      
      if (result.affectedRows === 0) {
        res.status(404).json({ error: 'Employee not found' });
        return;
      }
      
      res.json({ message: 'Employee updated successfully' });
      
    } catch (err) {
        console.error('Error updating employee:', err);
      
      // Check for unique constraint violations
      if (err.code === 'ER_DUP_ENTRY') {
        if (err.message.includes('employees.email')) {
          return res.status(400).json({ error: 'Email already exists' });
        }
        if (err.message.includes('employees.employee_id')) {
          return res.status(400).json({ error: 'Employee ID already exists' });
        }
        return res.status(400).json({ error: 'Duplicate entry found' });
      }
      
      // Check if it's a connection error
      if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
        console.error('MySQL connection lost, attempting to reconnect...');
        res.status(503).json({ error: 'Database connection lost, please try again' });
      } else {
        res.status(500).json({ error: err.message || 'Database error' });
      }
    } finally {
      // Always release the connection back to the pool
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Delete employee
  router.delete('/:id', async (req, res) => {
    const query = 'DELETE FROM employees WHERE id = ?';
    let connection;
    
    try {
      // Get a connection from the pool
      connection = await mysqlPool.getConnection();
      
      // Check connection health
      await connection.ping();
      
      const [result] = await connection.execute(query, [req.params.id]);
      
      if (result.affectedRows === 0) {
        res.status(404).json({ error: 'Employee not found' });
        return;
      }
      
      res.json({ message: 'Employee deleted successfully' });
      
    } catch (err) {
      console.error('Error deleting employee:', err);
      
      // Check if it's a connection error
      if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
        console.error('MySQL connection lost, attempting to reconnect...');
        res.status(503).json({ error: 'Database connection lost, please try again' });
      } else {
        res.status(500).json({ error: 'Database error' });
      }
    } finally {
      // Always release the connection back to the pool
      if (connection) {
        connection.release();
      }
    }
  });
  
  // Import employees from Excel file
  router.post('/import', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
  
    try {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);
  
      if (data.length === 0) {
        return res.status(400).json({ error: 'No data found in file' });
      }
  
      console.log(`Processing ${data.length} rows from Excel file`);
      console.log('Sample data from first row:', data[0]);
  
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
  
      // Process data synchronously to ensure proper counting
      const processData = async () => {
        for (let index = 0; index < data.length; index++) {
          const row = data[index];
          
          try {
            const employeeData = {
              employee_id: row['Employee ID'] || row['employee_id'] || row['Employee ID*'] || '',
              salutation: row['Salutation'] || row['salutation'] || '',
              name: row['Name'] || row['name'] || row['Name*'] || '',
              email: row['Email'] || row['email'] || row['Email*'] || '',
              password: row['Password'] || row['password'] || '',
              designation: row['Designation'] || row['designation'] || '',
              department: row['Department'] || row['department'] || '',
              work_from: row['Work From'] || row['work_from'] || '',
              country: row['Country'] || row['country'] || '',
              mobile: row['Mobile'] || row['mobile'] || '',
              gender: row['Gender'] || row['gender'] || '',
              joining_date: row['Joining Date'] || row['joining_date'] || '',
              date_of_birth: row['Date of Birth'] || row['date_of_birth'] || '',
              reporting_to: row['Reporting To'] || row['reporting_to'] || '',
              language: row['Language'] || row['language'] || '',
              user_role: row['User Role'] || row['user_role'] || '',
              address: row['Address'] || row['address'] || '',
              about: row['About'] || row['about'] || '',
              login_allowed: row['Login Allowed'] || row['login_allowed'] || true,
              email_notifications: row['Email Notifications'] || row['email_notifications'] || true,
              hourly_rate: row['Hourly Rate'] || row['hourly_rate'] || row['Hourly Rate*'] || '',
              slack_member_id: row['Slack Member ID'] || row['slack_member_id'] || '',
              skills: row['Skills'] || row['skills'] || '',
              probation_end_date: row['Probation End Date'] || row['probation_end_date'] || '',
              notice_period_start_date: row['Notice Period Start Date'] || row['notice_period_start_date'] || '',
              notice_period_end_date: row['Notice Period End Date'] || row['notice_period_end_date'] || '',
              employment_type: row['Employment Type'] || row['employment_type'] || '',
              marital_status: row['Marital Status'] || row['marital_status'] || '',
              business_address: row['Business Address'] || row['business_address'] || '',
              working_hours: row['Working Hours'] || row['working_hours'] || '',
              job_title: row['Job Title'] || row['job_title'] || '',
              emergency_contact_number: row['Emergency Contact Number'] || row['emergency_contact_number'] || '',
              emergency_contact_relation: row['Emergency Contact Relation'] || row['emergency_contact_relation'] || '',
              status: row['Status'] || row['status'] || 'Active'
            };
  
            // Skip empty rows (if name and email are both empty)
            if (!employeeData.name || !employeeData.email) {
              console.log(`Skipping row ${index + 1}: Missing name or email`, employeeData);
              continue;
            }
  
            const query = `
              INSERT INTO employees (
                employee_id, salutation, name, email, password, designation, 
                department, work_from, country, mobile, gender, joining_date, 
                date_of_birth, reporting_to, language, user_role, address, 
                about, login_allowed, email_notifications, hourly_rate, 
                slack_member_id, skills, probation_end_date, notice_period_start_date, 
                notice_period_end_date, employment_type, marital_status, business_address,
                working_hours, job_title, emergency_contact_number, emergency_contact_relation, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
  
            const values = [
              employeeData.employee_id, employeeData.salutation, employeeData.name,
              employeeData.email, employeeData.password, employeeData.designation,
              employeeData.department, employeeData.work_from, employeeData.country,
              employeeData.mobile, employeeData.gender, sanitizeForMySQL(employeeData.joining_date),
              sanitizeForMySQL(employeeData.date_of_birth), employeeData.reporting_to, employeeData.language,
              employeeData.user_role, employeeData.address, employeeData.about,
              employeeData.login_allowed, employeeData.email_notifications, employeeData.hourly_rate,
              employeeData.slack_member_id, employeeData.skills, sanitizeForMySQL(employeeData.probation_end_date),
              sanitizeForMySQL(employeeData.notice_period_start_date), sanitizeForMySQL(employeeData.notice_period_end_date),
              employeeData.employment_type, employeeData.marital_status, employeeData.business_address,
              employeeData.working_hours, employeeData.job_title, employeeData.emergency_contact_number,
              employeeData.emergency_contact_relation, employeeData.status
            ];
            // Use MySQL connection for import
            try {
              console.log(`Processing row ${index + 1}: ${employeeData.name} (${employeeData.email})`);
              
              const connection = await mysqlPool.getConnection();
              await connection.ping();
              
              const [result] = await connection.execute(query, values);
              console.log(`Row ${index + 1} inserted successfully, ID: ${result.insertId}`);
              successCount++;
              
              connection.release();
            } catch (err) {
                  errorCount++;
                  errors.push(`Row ${index + 1} (${employeeData.name || 'Unknown'}): ${err.message}`);
                  console.log(`Import error for row ${index + 1}:`, err.message);
                  console.log('Data being imported:', employeeData);
              console.log('MySQL Error Code:', err.code);
                }
  
          } catch (error) {
            errorCount++;
            errors.push(`Row ${index + 1}: ${error.message}`);
            console.log(`Processing error for row ${index + 1}:`, error.message);
          }
        }
      };
  
      await processData();
  
      res.json({
        message: `Import completed. ${successCount} employees imported successfully. ${errorCount} errors.`,
        successCount,
        errorCount,
        errors: errors.length > 0 ? errors : undefined
      });
  
    } catch (error) {
      console.error('Error processing file:', error);
      res.status(500).json({ error: 'Error processing file' });
    }
  });
  
  // Get warning letters for a specific employee
  router.get('/:id/warning-letters', async (req, res) => {
      const employeeId = req.params.id;
      let connection;
      
      try {
        connection = await mysqlPool.getConnection();
        await connection.ping();
        
        const query = `
          SELECT * FROM warning_letters 
          WHERE employee_id = ? 
          ORDER BY issued_date DESC
        `;
        
        const [warningLetters] = await connection.execute(query, [employeeId]);
        res.json(warningLetters);
      } catch (err) {
        console.error('Error fetching employee warning letters:', err);
        res.status(500).json({ error: 'Database error' });
      } finally {
        if (connection) {
          connection.release();
        }
      }
    });
module.exports = router;