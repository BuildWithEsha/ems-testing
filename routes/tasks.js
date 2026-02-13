// TASKS ROUTES - Extract from server-backup.js lines: 5239-7650
// Mount at: /api/tasks
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { mysqlPool } = require('../config/database');
const { sanitizeForMySQL, toAssignedToString } = require('../helpers/sanitize');
const { logTaskHistory } = require('../helpers/taskHistory');
const { getPermissionsFromHeaders } = require('../middleware/permissions');
const upload = multer({ storage: multer.memoryStorage() });
// TODO: Copy handlers - this is the largest route file (~2400 lines)
 // Task API Routes
 // Get all tasks (optimized)
 router.get('/', async (req, res) => {
    const { user_id, role, employee_name, department, employee, page = 1, limit = 50, all, search, status, priority, complexity, impact, effortEstimateLabel, unit, target, labels, assignedTo } = req.query;
    
    // Check if all tasks are requested (for timer management)
    const getAll = all === 'true';
    
    // Get user permissions from headers FIRST
    const userPermissions = req.headers['user-permissions'] ? JSON.parse(req.headers['user-permissions']) : [];
    const userRole = req.headers['user-role'] || role || 'employee';
    const userName = req.headers['user-name'] || employee_name || '';
    
    // Force pagination for all users (including admin) - only skip when explicitly requesting all
    const isAdmin = (userRole === 'admin' || userRole === 'Admin');
    const skipPagination = getAll; // Remove isAdmin - force pagination for everyone
    
    // Pagination parameters - allow higher limit for admin users but still paginate
    const pageNum = parseInt(page);
    const limitNum = skipPagination ? null : (isAdmin ? Math.min(parseInt(limit) || 500, 500) : Math.min(parseInt(limit), 100));
    const offset = skipPagination ? null : (pageNum - 1) * limitNum;
    
    // Debug logging
    console.log('🔍 Backend Debug - Tasks API Request:', {
      headers: req.headers,
      userPermissions: userPermissions,
      userRole: userRole,
      userName: userName,
      queryParams: req.query,
      pagination: { page: pageNum, limit: limitNum, offset },
      searchParams: { search, status, priority, complexity, impact, effortEstimateLabel, unit, target, labels, assignedTo }
    });
                
    // Optimized query with better indexing strategy - include all necessary fields
    let query = 'SELECT id, title, status, priority, department, assigned_to, created_at, updated_at, due_date, timer_started_at, logged_seconds, labels, complexity, impact, effort_estimate_label, unit, target, time_estimate_hours, time_estimate_minutes, checklist, checklist_completed, file_links, video_links FROM tasks WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM tasks WHERE 1=1';
    const params = [];
    const countParams = [];
                
    // Check permissions to determine what tasks user can see
    const hasViewOwnTasks = userPermissions.includes('view_own_tasks');
    const hasViewAllTasks = userPermissions.includes('view_tasks') || userPermissions.includes('all');
    const hasViewTasksContent = userPermissions.includes('view_tasks_content');
    const hasDwmView = userPermissions.includes('dwm_view');
                
    // Check if user is admin or has view_all_tasks permission
    const isAdminUser = userRole === 'admin';
    const hasViewAllTasksPermission = userPermissions.includes('view_tasks') || userPermissions.includes('all');
    
    // If user only has view_own_tasks permission, filter by assigned_to
    if (hasViewOwnTasks && !hasViewAllTasksPermission && !isAdminUser && userName) {
      // If user also has dwm_view permission, include incomplete DWM tasks assigned to them
      if (hasDwmView) {
        // Include own tasks OR incomplete DWM tasks assigned to the user (daily/weekly/monthly)
        query += ' AND (assigned_to LIKE ? OR (assigned_to LIKE ? AND status != \'Completed\' AND (LOWER(IFNULL(labels,\'\')) LIKE \'%daily%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%weekly%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%monthly%\')))';
        countQuery += ' AND (assigned_to LIKE ? OR (assigned_to LIKE ? AND status != \'Completed\' AND (LOWER(IFNULL(labels,\'\')) LIKE \'%daily%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%weekly%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%monthly%\')))';
        params.push(`%${userName}%`, `%${userName}%`);
        countParams.push(`%${userName}%`, `%${userName}%`);
        console.log(`🔒 Filtering tasks for user ${userName} - showing own tasks + own incomplete DWM tasks`);
      } else {
        query += ' AND assigned_to LIKE ?';
        countQuery += ' AND assigned_to LIKE ?';
        params.push(`%${userName}%`);
        countParams.push(`%${userName}%`);
        console.log(`🔒 Filtering tasks for user ${userName} - only showing own tasks`);
      }
    } else if (hasViewAllTasksPermission || isAdminUser) {
      console.log(`🔓 User has view all tasks permission or is admin - showing all tasks`);
    } else if (hasViewTasksContent && !hasViewOwnTasks && !hasViewAllTasksPermission && !isAdminUser) {
      // User has view_tasks_content but no other task permissions - this shouldn't happen
      // but if it does, show no tasks for security
      console.log(`⚠️  User has only view_tasks_content permission without view_own_tasks - showing no tasks for security`);
      query += ' AND 1=0'; // Show no tasks
      countQuery += ' AND 1=0';
    } else {
      console.log(`⚠️  User has no task viewing permissions - showing no tasks`);
      query += ' AND 1=0'; // Show no tasks
      countQuery += ' AND 1=0';
    }
    // Add search functionality
    if (search) {
      query += ' AND (title LIKE ? OR description LIKE ? OR assigned_to LIKE ?)';
      countQuery += ' AND (title LIKE ? OR description LIKE ? OR assigned_to LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm);
    }
  
    // Add filter functionality
    if (department) {
      query += ' AND department = ?';
      countQuery += ' AND department = ?';
      params.push(department);
      countParams.push(department);
    }
    if (employee) {
      query += ' AND assigned_to LIKE ?';
      countQuery += ' AND assigned_to LIKE ?';
      params.push(`%${employee}%`);
      countParams.push(`%${employee}%`);
    }
    if (status) {
      const statusParts = String(status).split(',').map(s => s.trim()).filter(Boolean);
      if (statusParts.length === 1) {
        query += ' AND status = ?';
        countQuery += ' AND status = ?';
        params.push(statusParts[0]);
        countParams.push(statusParts[0]);
      } else if (statusParts.length > 1) {
        const placeholders = statusParts.map(() => '?').join(', ');
        query += ` AND status IN (${placeholders})`;
        countQuery += ` AND status IN (${placeholders})`;
        params.push(...statusParts);
        countParams.push(...statusParts);
      }
    }
    if (priority) {
      query += ' AND priority = ?';
      countQuery += ' AND priority = ?';
      params.push(priority);
      countParams.push(priority);
    }
    if (complexity) {
      query += ' AND complexity = ?';
      countQuery += ' AND complexity = ?';
      params.push(complexity);
      countParams.push(complexity);
    }
    if (impact) {
      query += ' AND impact = ?';
      countQuery += ' AND impact = ?';
      params.push(impact);
      countParams.push(impact);
    }
    if (effortEstimateLabel) {
      query += ' AND effort_estimate_label = ?';
      countQuery += ' AND effort_estimate_label = ?';
      params.push(effortEstimateLabel);
      countParams.push(effortEstimateLabel);
    }
    if (unit) {
      query += ' AND unit = ?';
      countQuery += ' AND unit = ?';
      params.push(unit);
      countParams.push(unit);
    }
    if (target) {
      query += ' AND target = ?';
      countQuery += ' AND target = ?';
      params.push(target);
      countParams.push(target);
    }
    if (labels) {
      // Support multiple labels passed as a comma-separated list by matching ANY of them
      const labelParts = String(labels)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
  
      if (labelParts.length === 1) {
        query += ' AND labels LIKE ?';
        countQuery += ' AND labels LIKE ?';
        params.push(`%${labelParts[0]}%`);
        countParams.push(`%${labelParts[0]}%`);
      } else if (labelParts.length > 1) {
        const likeConditions = labelParts.map(() => 'labels LIKE ?').join(' OR ');
        query += ` AND (${likeConditions})`;
        countQuery += ` AND (${likeConditions})`;
        for (const part of labelParts) {
          params.push(`%${part}%`);
          countParams.push(`%${part}%`);
        }
      }
    }
    if (assignedTo) {
      query += ' AND assigned_to LIKE ?';
      countQuery += ' AND assigned_to LIKE ?';
      params.push(`%${assignedTo}%`);
      countParams.push(`%${assignedTo}%`);
    }
                
    // Use indexed column for ordering
    query += ' ORDER BY created_at DESC';
    
    // Only add LIMIT and OFFSET if pagination is not skipped
    // NOTE: LIMIT and OFFSET cannot use placeholders in MySQL prepared statements
    if (!skipPagination) {
      // Ensure limitNum and offset are integers and sanitize them
      const safeLimit = parseInt(limitNum, 10);
      const safeOffset = parseInt(offset, 10);
      // Insert values directly into query (safe because we've validated them as integers)
      query += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;
      // Don't push limitNum and offset to params array
    }
    // Debug logging - show final query and params
    console.log('🔍 Backend Debug - Final Query:', query);
    console.log('🔍 Backend Debug - Query Params:', params);
    console.log('🔍 Backend Debug - Count Query:', countQuery);
    console.log('🔍 Backend Debug - Count Params:', countParams);
                
                try {
                  // Execute both queries in parallel for better performance
                  const [results, countResult] = await Promise.all([
                    mysqlPool.execute(query, params),
                    mysqlPool.execute(countQuery, countParams)
                  ]);
                  
                  const total = countResult[0][0].total;
                  
                  // Format timer_started_at to ISO format for JavaScript Date parsing (matching backup format)
                  // Also filter checklist_completed by date (reset if not today)
                  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
                  const formattedTasks = results[0].map(task => {
                    let updatedTask = { ...task };
                    
                    // Format timer_started_at
                    if (task.timer_started_at) {
                      // Convert DATETIME format to ISO format without Z (parse as local time to match stored Pakistan time)
                      let timerValue;
                      if (task.timer_started_at instanceof Date) {
                        // Convert Date to ISO string and remove Z to parse as local time
                        const isoStr = task.timer_started_at.toISOString();
                        timerValue = isoStr.replace(/\.\d{3}Z$/, '');
                      } else {
                        const timerStr = String(task.timer_started_at);
                        // If already in ISO format (has T), remove Z if present to parse as local time
                        if (timerStr.includes('T')) {
                          // Remove Z and milliseconds to parse as local time (matching stored Pakistan time)
                          timerValue = timerStr.replace(/\.\d{3}Z?$/, '').replace(/Z$/, '');
                        } else {
                          // Convert "YYYY-MM-DD HH:mm:ss" to "YYYY-MM-DDTHH:mm:ss" (no Z - parse as local time to match stored Pakistan time)
                          timerValue = timerStr.replace(' ', 'T');
                        }
                      }
                      updatedTask.timer_started_at = timerValue;
                    }
                    
                    // Filter checklist_completed by date (reset if date doesn't match today)
                    if (task.checklist_completed) {
                      try {
                        const parsed = JSON.parse(task.checklist_completed);
                        // Old format (array) → reset (no date means incomplete)
                        if (Array.isArray(parsed)) {
                          updatedTask.checklist_completed = JSON.stringify({ indices: [], date: today });
                        }
                        // New format: check if date matches today
                        else if (parsed.date && parsed.date === today) {
                          // Date matches today → keep as is
                          updatedTask.checklist_completed = task.checklist_completed;
                        }
                        else {
                          // Date doesn't match today → reset
                          updatedTask.checklist_completed = JSON.stringify({ indices: [], date: today });
                        }
                      } catch (e) {
                        // Invalid JSON → reset
                        updatedTask.checklist_completed = JSON.stringify({ indices: [], date: today });
                      }
                    } else {
                      // No checklist_completed → initialize with today's date
                      updatedTask.checklist_completed = JSON.stringify({ indices: [], date: today });
                    }
                    
                    return updatedTask;
                  });
                  
                  if (skipPagination) {
                    // Return all tasks without pagination (for admin users or when all=true)
                    console.log(`🔍 Backend Debug - Query returned ${formattedTasks.length} tasks (pagination skipped)`);
                    res.json({
                      data: formattedTasks,
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
                    // Normal pagination
                    const totalPages = Math.ceil(total / limitNum);
                    console.log(`🔍 Backend Debug - Query returned ${formattedTasks.length} tasks out of ${total} total`);
                    res.json({
                      data: formattedTasks,
                      pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        totalPages,
                        hasNext: pageNum < totalPages,
                        hasPrev: pageNum > 1
                      }
                    });
                  }
                } catch (err) {
                    console.error('Error fetching tasks:', err);
                    res.status(500).json({ error: 'Database error' });
                  }
              });
  
              // Get task IDs for which the employee has logged time on the given date (workload completion check)
              router.get('/workload-completion', async (req, res) => {
                const { employee_name, date } = req.query;
                if (!employee_name || !date) {
                  return res.status(400).json({ error: 'employee_name and date (YYYY-MM-DD) are required' });
                }
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  const [rows] = await connection.execute(
                    `SELECT DISTINCT task_id FROM task_timesheet 
                     WHERE employee_name = ? AND DATE(start_time) = ?`,
                    [employee_name.trim(), date]
                  );
                  res.json({ completed_task_ids: rows.map(r => r.task_id) });
                } catch (err) {
                  console.error('Error fetching workload completion:', err);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) connection.release();
                }
              });
  
              // Get task summary (counts only - optimized for dashboard)
              router.get('/summary', async (req, res) => {
                const { user_id, role, employee_name, department, employee, search, status, priority, complexity, impact, effortEstimateLabel, unit, target, labels, assignedTo } = req.query;
                
                // Get user permissions from headers
                const userPermissions = req.headers['user-permissions'] ? JSON.parse(req.headers['user-permissions']) : [];
                const userRole = req.headers['user-role'] || role || 'employee';
                const userName = req.headers['user-name'] || employee_name || '';
                
                // Build WHERE clause (same logic as /api/tasks but only return counts)
                let query = `
                  SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
                    SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN due_date < CURDATE() AND status != 'Completed' THEN 1 ELSE 0 END) as overdue
                  FROM tasks 
                  WHERE 1=1
                `;
                const params = [];
                
                // Check permissions to determine what tasks user can see (same logic as /api/tasks)
                const hasViewOwnTasks = userPermissions.includes('view_own_tasks');
                const hasViewAllTasks = userPermissions.includes('view_tasks') || userPermissions.includes('all');
                const hasViewTasksContent = userPermissions.includes('view_tasks_content');
                const hasDwmView = userPermissions.includes('dwm_view');
                
                const isAdminUser = userRole === 'admin';
                const hasViewAllTasksPermission = userPermissions.includes('view_tasks') || userPermissions.includes('all');
                
                // If user only has view_own_tasks permission, filter by assigned_to
                if (hasViewOwnTasks && !hasViewAllTasksPermission && !isAdminUser && userName) {
                  if (hasDwmView) {
                    query += ' AND (assigned_to LIKE ? OR (assigned_to LIKE ? AND status != \'Completed\' AND (LOWER(IFNULL(labels,\'\')) LIKE \'%daily%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%weekly%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%monthly%\')))';
                    params.push(`%${userName}%`, `%${userName}%`);
                  } else {
                    query += ' AND assigned_to LIKE ?';
                    params.push(`%${userName}%`);
                  }
                } else if (hasViewAllTasksPermission || isAdminUser) {
                  // User can see all tasks
                } else if (hasViewTasksContent && !hasViewOwnTasks && !hasViewAllTasksPermission && !isAdminUser) {
                  query += ' AND 1=0'; // Show no tasks
                } else {
                  query += ' AND 1=0'; // Show no tasks
                }
                
                // Add search functionality
                if (search) {
                  query += ' AND (title LIKE ? OR description LIKE ? OR assigned_to LIKE ?)';
                  const searchTerm = `%${search}%`;
                  params.push(searchTerm, searchTerm, searchTerm);
                }
                
                // Add filter functionality (same as /api/tasks)
                if (department) {
                  query += ' AND department = ?';
                  params.push(department);
                }
                if (employee) {
                  query += ' AND assigned_to LIKE ?';
                  params.push(`%${employee}%`);
                }
                if (status) {
                  const statusParts = String(status).split(',').map(s => s.trim()).filter(Boolean);
                  if (statusParts.length === 1) {
                    query += ' AND status = ?';
                    params.push(statusParts[0]);
                  } else if (statusParts.length > 1) {
                    const placeholders = statusParts.map(() => '?').join(', ');
                    query += ` AND status IN (${placeholders})`;
                    params.push(...statusParts);
                  }
                }
                if (priority) {
                  query += ' AND priority = ?';
                  params.push(priority);
                }
                if (complexity) {
                  query += ' AND complexity = ?';
                  params.push(complexity);
                }
                if (impact) {
                  query += ' AND impact = ?';
                  params.push(impact);
                }
                if (effortEstimateLabel) {
                  query += ' AND effort_estimate_label = ?';
                  params.push(effortEstimateLabel);
                }
                if (unit) {
                  query += ' AND unit = ?';
                  params.push(unit);
                }
                if (target) {
                  query += ' AND target = ?';
                  params.push(target);
                }
                if (labels) {
                  const labelParts = String(labels)
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean);
                  
                  if (labelParts.length === 1) {
                    query += ' AND labels LIKE ?';
                    params.push(`%${labelParts[0]}%`);
                  } else if (labelParts.length > 1) {
                    const likeConditions = labelParts.map(() => 'labels LIKE ?').join(' OR ');
                    query += ` AND (${likeConditions})`;
                    for (const part of labelParts) {
                      params.push(`%${part}%`);
                    }
                  }
                }
                if (assignedTo) {
                  query += ' AND assigned_to LIKE ?';
                  params.push(`%${assignedTo}%`);
                }
                
                try {
                  const [results] = await mysqlPool.execute(query, params);
                  res.json({
                    total: results[0].total || 0,
                    completed: results[0].completed || 0,
                    in_progress: results[0].in_progress || 0,
                    pending: results[0].pending || 0,
                    overdue: results[0].overdue || 0
                  });
                } catch (err) {
                  console.error('Error fetching task summary:', err);
                  res.status(500).json({ error: 'Database error' });
                }
              });
              // Export tasks to CSV/Excel (must be before /api/tasks/:id route)
              router.get('/export', async (req, res) => {
                const { format = 'csv' } = req.query;
                console.log('=== TASK EXPORT REQUEST RECEIVED ===');
                console.log('Format:', format);
                
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  console.log('Database connection established');
                  
                  // Get all tasks with basic data first
                  const query = `
                    SELECT 
                      id,
                      title,
                      description,
                      status,
                      priority,
                      complexity,
                      impact,
                      unit,
                      target,
                      effort_estimate_label,
                      time_estimate_hours,
                      time_estimate_minutes,
                      created_at,
                      updated_at,
                      due_date,
                      start_date,
                      assigned_to,
                      department,
                      labels,
                      checklist,
                      workflow_guide,
                      timer_started_at,
                      logged_seconds,
                      score
                    FROM tasks
                    ORDER BY created_at DESC
                  `;
                  
                  const [tasks] = await connection.execute(query);
                  console.log(`Found ${tasks.length} tasks to export`);
                  
                  if (tasks.length === 0) {
                    return res.status(404).json({ error: 'No tasks found to export' });
                  }
                  
                  if (format === 'excel') {
                    // Create Excel file
                    const workbook = xlsx.utils.book_new();
                    const worksheet = xlsx.utils.json_to_sheet(tasks.map(task => ({
                      'Task ID': task.id,
                      'Title': task.title,
                      'Description': task.description,
                      'Status': task.status,
                      'Priority': task.priority,
                      'Complexity': task.complexity,
                      'Impact': task.impact,
                      'Unit': task.unit,
                      'Target': task.target,
                      'Effort Estimate': task.effort_estimate_label,
                      'Time Estimate (Hours)': task.time_estimate_hours,
                      'Time Estimate (Minutes)': task.time_estimate_minutes,
                      'Created At': task.created_at,
                      'Updated At': task.updated_at,
                      'Due Date': task.due_date,
                      'Start Date': task.start_date,
                      'Assigned To': task.assigned_to,
                      'Department': task.department,
                      'Labels': task.labels,
                      'Checklist': task.checklist,
                      'Workflow Guide': task.workflow_guide,
                      'Timer Started At': task.timer_started_at,
                      'Logged Seconds': task.logged_seconds,
                      'Score': task.score
                    })));
                    
                    xlsx.utils.book_append_sheet(workbook, worksheet, 'Tasks');
                    
                    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                    
                    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                    res.setHeader('Content-Disposition', `attachment; filename=tasks-export-${new Date().toISOString().split('T')[0]}.xlsx`);
                    res.send(buffer);
                  } else {
                    // Create CSV file
                    const csvHeaders = [
                      'Task ID', 'Title', 'Description', 'Status', 'Priority', 'Complexity', 'Impact',
                      'Unit', 'Target', 'Effort Estimate', 'Time Estimate (Hours)', 'Time Estimate (Minutes)',
                      'Created At', 'Updated At', 'Due Date', 'Start Date', 'Assigned To', 'Department',
                      'Labels', 'Checklist', 'Workflow Guide', 'Timer Started At', 'Logged Seconds', 'Score'
                    ];
                    
                    const csvRows = tasks.map(task => [
                      task.id,
                      `"${(task.title || '').replace(/"/g, '""')}"`,
                      `"${(task.description || '').replace(/"/g, '""')}"`,
                      task.status || '',
                      task.priority || '',
                      task.complexity || '',
                      task.impact || '',
                      task.unit || '',
                      task.target || '',
                      task.effort_estimate_label || '',
                      task.time_estimate_hours || '',
                      task.time_estimate_minutes || '',
                      task.created_at || '',
                      task.updated_at || '',
                      task.due_date || '',
                      task.start_date || '',
                      `"${(task.assigned_to || '').replace(/"/g, '""')}"`,
                      task.department || '',
                      `"${(task.labels || '').replace(/"/g, '""')}"`,
                      `"${(task.checklist || '').replace(/"/g, '""')}"`,
                      `"${(task.workflow_guide || '').replace(/"/g, '""')}"`,
                      task.timer_started_at || '',
                      task.logged_seconds || '',
                      task.score || ''
                    ]);
                    
                    const csvContent = [csvHeaders, ...csvRows].map(row => row.join(',')).join('\n');
                    
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', `attachment; filename=tasks-export-${new Date().toISOString().split('T')[0]}.csv`);
                    res.send(csvContent);
                  }
                  
                } catch (error) {
                  console.error('Error exporting tasks:', error);
                  console.error('Error details:', error.message, error.stack);
                  if (!res.headersSent) {
                    res.status(500).json({ error: `Error exporting tasks: ${error.message}` });
                  }
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
  
              // Get task by ID
              router.get('/:id', async (req, res) => {
                const query = 'SELECT * FROM tasks WHERE id = ?';
                try {
                  const [results] = await mysqlPool.execute(query, [req.params.id]);
                  
                  if (results.length === 0) {
                    res.status(404).json({ error: 'Task not found' });
                    return;
                  }
                  
                  // Filter checklist_completed by date (reset if not today)
                  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
                  const task = results[0];
                  
                  if (task.checklist_completed) {
                    try {
                      const parsed = JSON.parse(task.checklist_completed);
                      // Old format (array) → reset (no date means incomplete)
                      if (Array.isArray(parsed)) {
                        task.checklist_completed = JSON.stringify({ indices: [], date: today });
                      }
                      // New format: check if date matches today
                      else if (parsed.date && parsed.date === today) {
                        // Date matches today → keep as is
                        // task.checklist_completed stays the same
                      }
                      else {
                        // Date doesn't match today → reset
                        task.checklist_completed = JSON.stringify({ indices: [], date: today });
                      }
                    } catch (e) {
                      // Invalid JSON → reset
                      task.checklist_completed = JSON.stringify({ indices: [], date: today });
                    }
                  } else {
                    // No checklist_completed → initialize with today's date
                    task.checklist_completed = JSON.stringify({ indices: [], date: today });
                  }
                  
                  res.json(task);
                } catch (err) {
                  console.error('Error fetching task:', err);
                  res.status(500).json({ error: 'Database error' });
                }
              });
              // Create new task
              // Helper to insert a single task row using existing schema
              const insertTask = async (connection, taskData) => {
                const query = `
                  INSERT INTO tasks (
                    title, department, task_category, project, start_date, due_date, without_due_date,
                    assigned_to, status, description, responsible, accountable, consulted, informed, trained,
                    labels, milestones, priority, complexity, impact, unit, target, effort_estimate_label, time_estimate_hours, time_estimate_minutes, make_private, share, \`repeat\`, \`is_dependent\`,
                    validation_by, effort_label, checklist, workflow_guide, file_links, video_links
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                const opt = (v) => sanitizeForMySQL(v === undefined || v === null || (typeof v === 'string' && v.trim && v.trim() === '') ? null : v);
                const values = [
                  sanitizeForMySQL(taskData.title), 
                  opt(taskData.department), 
                  opt(taskData.taskCategory), 
                  opt(taskData.project),
                  opt(taskData.startDate), 
                  opt(taskData.dueDate), 
                  taskData.withoutDueDate ? 1 : 0,
                  toAssignedToString(taskData) || null, 
                  sanitizeForMySQL(taskData.status) || 'Pending', 
                  sanitizeForMySQL(taskData.description !== undefined ? taskData.description : ''),
                  sanitizeForMySQL(taskData.responsible !== undefined ? taskData.responsible : null), 
                  sanitizeForMySQL(taskData.accountable !== undefined ? taskData.accountable : null), 
                  sanitizeForMySQL(taskData.consulted !== undefined ? taskData.consulted : null), 
                  sanitizeForMySQL(taskData.informed !== undefined ? taskData.informed : null), 
                  sanitizeForMySQL(taskData.trained !== undefined ? taskData.trained : null),
                  sanitizeForMySQL(taskData.labels !== undefined ? taskData.labels : null), 
                  sanitizeForMySQL(taskData.milestones !== undefined ? taskData.milestones : null), 
                  sanitizeForMySQL(taskData.priority) || 'Medium',
                  sanitizeForMySQL(taskData.complexity !== undefined ? taskData.complexity : null), 
                  sanitizeForMySQL(taskData.impact !== undefined ? taskData.impact : null), 
                  sanitizeForMySQL(taskData.unit !== undefined ? taskData.unit : null), 
                  sanitizeForMySQL(taskData.target !== undefined ? taskData.target : null), 
                  sanitizeForMySQL(taskData.effort_estimate_label !== undefined ? taskData.effort_estimate_label : null),
                  taskData.time_estimate_hours || 0,
                  taskData.time_estimate_minutes || 0,
                  taskData.makePrivate ? 1 : 0, 
                  taskData.share ? 1 : 0, 
                  taskData.repeat ? 1 : 0, 
                  taskData.isDependent ? 1 : 0,
                  sanitizeForMySQL(taskData.validationBy !== undefined ? taskData.validationBy : null), 
                  sanitizeForMySQL(taskData.effortLabel !== undefined ? taskData.effortLabel : null), 
                  sanitizeForMySQL(taskData.checklist !== undefined ? taskData.checklist : ''), 
                  sanitizeForMySQL(taskData.workflowGuide !== undefined ? taskData.workflowGuide : ''),
                  sanitizeForMySQL(taskData.fileLinks !== undefined ? taskData.fileLinks : null),
                  sanitizeForMySQL(taskData.videoLinks !== undefined ? taskData.videoLinks : null)
                ];
                const [result] = await connection.execute(query, values);
                const newTaskId = result.insertId;
                await logTaskHistory(
                  newTaskId,
                  'Created',
                  'Task created',
                  'Admin',
                  1
                );
                return newTaskId;
              };
  
              router.post('/', async (req, res) => {
                const userRole = req.headers['user-role'] || 'employee';
                if (!userRole && !req.headers['x-user-id']) {
                  return res.status(401).json({ error: 'Authentication required to create tasks.' });
                }
                const taskData = req.body;
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  console.log('Task creation - Received data:', JSON.stringify(taskData, null, 2));
                  const newTaskId = await insertTask(connection, taskData);
                  res.status(201).json({ message: 'Task created successfully', id: newTaskId });
                } catch (err) {
                  console.error('Error creating task:', err);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
  
              // Helper: create tasks by designation (one task per matching employee)
              const createTasksByDesignation = async (baseTaskPayload, designation) => {
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
  
                  const [employees] = await connection.execute(
                    'SELECT id, name, department, designation FROM employees WHERE status = "Active" AND designation = ?',
                    [designation]
                  );
  
                  if (!employees || employees.length === 0) {
                    return { designation, employees: 0, tasksCreated: 0, createdTaskIds: [] };
                  }
  
                  const createdTaskIds = [];
                  for (const emp of employees) {
                    const taskPayload = {
                      ...baseTaskPayload,
                      // Override assigned_to via toAssignedToString by setting appropriate fields
                      assignedTo: emp.name,
                      department: baseTaskPayload.department || emp.department || null,
                    };
                    const newTaskId = await insertTask(connection, taskPayload);
                    createdTaskIds.push(newTaskId);
                  }
  
                  return {
                    designation,
                    employees: employees.length,
                    tasksCreated: createdTaskIds.length,
                    createdTaskIds,
                  };
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              };
  
              // Admin-only endpoint to create tasks by designation
              router.post('/by-designation', async (req, res) => {
                const { designation, task } = req.body || {};
                const userRole = req.headers['user-role'] || 'employee';
                const userPermissions = req.headers['user-permissions'] ? JSON.parse(req.headers['user-permissions']) : [];
  
                if (!designation || typeof designation !== 'string' || !designation.trim()) {
                  return res.status(400).json({ error: 'designation is required' });
                }
  
                const isAdminUser = userRole === 'admin' || userRole === 'Admin';
                const hasPermission =
                  isAdminUser ||
                  userPermissions.includes('all') ||
                  userPermissions.includes('create_tasks_by_designation');
  
                if (!hasPermission) {
                  return res.status(403).json({ error: 'Access denied: You do not have permission to create tasks by designation' });
                }
  
                if (!task || !task.title) {
                  return res.status(400).json({ error: 'Task payload with at least a title is required' });
                }
  
                try {
                  const result = await createTasksByDesignation(task, designation.trim());
                  res.json(result);
                } catch (err) {
                  console.error('Error creating tasks by designation:', err);
                  res.status(500).json({ error: 'Failed to create tasks by designation' });
                }
              });
  
              // Update task
              router.put('/:id', async (req, res) => {
                const taskId = req.params.id;
                const taskData = req.body;
                
                // Debug logging for unit value updates
                if (taskData.unit !== undefined) {
                  console.log(`=== UNIT VALUE UPDATE DEBUG ===`);
                  console.log(`Task ID: ${taskId}`);
                  console.log(`Received unit value: ${taskData.unit}`);
                  console.log(`Unit value type: ${typeof taskData.unit}`);
                  console.log(`Full request body:`, JSON.stringify(req.body, null, 2));
                }
  
                // Build dynamic UPDATE query - only update fields that are provided
                const updateFields = [];
                const values = [];
                
                // Check each field and only include it in the update if it's provided
                if (taskData.title !== undefined) {
                  updateFields.push('title = ?');
                  values.push(sanitizeForMySQL(taskData.title));
                }
                if (taskData.department !== undefined) {
                  updateFields.push('department = ?');
                  values.push(sanitizeForMySQL(taskData.department));
                }
                if (taskData.taskCategory !== undefined) {
                  updateFields.push('task_category = ?');
                  values.push(sanitizeForMySQL(taskData.taskCategory));
                }
                if (taskData.project !== undefined) {
                  updateFields.push('project = ?');
                  values.push(sanitizeForMySQL(taskData.project));
                }
                if (taskData.startDate !== undefined) {
                  updateFields.push('start_date = ?');
                  values.push(sanitizeForMySQL(taskData.startDate));
                }
                if (taskData.dueDate !== undefined) {
                  updateFields.push('due_date = ?');
                  values.push(sanitizeForMySQL(taskData.dueDate));
                }
                if (taskData.withoutDueDate !== undefined) {
                  updateFields.push('without_due_date = ?');
                  values.push(taskData.withoutDueDate ? 1 : 0);
                }
                if (taskData.assigned_to !== undefined || taskData.assignedTo !== undefined) {
                  updateFields.push('assigned_to = ?');
                  values.push(toAssignedToString(taskData) || null);
                }
                if (taskData.status !== undefined) {
                  updateFields.push('status = ?');
                  values.push(sanitizeForMySQL(taskData.status));
                }
                if (taskData.description !== undefined) {
                  updateFields.push('description = ?');
                  values.push(sanitizeForMySQL(taskData.description));
                }
                if (taskData.responsible !== undefined) {
                  updateFields.push('responsible = ?');
                  values.push(sanitizeForMySQL(taskData.responsible));
                }
                if (taskData.accountable !== undefined) {
                  updateFields.push('accountable = ?');
                  values.push(sanitizeForMySQL(taskData.accountable));
                }
                if (taskData.consulted !== undefined) {
                  updateFields.push('consulted = ?');
                  values.push(sanitizeForMySQL(taskData.consulted));
                }
                if (taskData.informed !== undefined) {
                  updateFields.push('informed = ?');
                  values.push(sanitizeForMySQL(taskData.informed));
                }
                if (taskData.trained !== undefined) {
                  updateFields.push('trained = ?');
                  values.push(sanitizeForMySQL(taskData.trained));
                }
                if (taskData.labels !== undefined) {
                  updateFields.push('labels = ?');
                  values.push(sanitizeForMySQL(taskData.labels));
                }
                if (taskData.milestones !== undefined) {
                  updateFields.push('milestones = ?');
                  values.push(sanitizeForMySQL(taskData.milestones));
                }
                if (taskData.priority !== undefined) {
                  updateFields.push('priority = ?');
                  values.push(sanitizeForMySQL(taskData.priority));
                }
                if (taskData.complexity !== undefined) {
                  updateFields.push('complexity = ?');
                  values.push(sanitizeForMySQL(taskData.complexity));
                }
                if (taskData.impact !== undefined) {
                  updateFields.push('impact = ?');
                  values.push(sanitizeForMySQL(taskData.impact));
                }
                if (taskData.unit !== undefined) {
                  updateFields.push('unit = ?');
                  values.push(sanitizeForMySQL(taskData.unit));
                }
                if (taskData.target !== undefined) {
                  updateFields.push('target = ?');
                  values.push(sanitizeForMySQL(taskData.target));
                }
                if (taskData.effort_estimate_label !== undefined) {
                  updateFields.push('effort_estimate_label = ?');
                  values.push(sanitizeForMySQL(taskData.effort_estimate_label));
                }
                if (taskData.time_estimate_hours !== undefined) {
                  updateFields.push('time_estimate_hours = ?');
                  values.push(taskData.time_estimate_hours || 0);
                }
                if (taskData.time_estimate_minutes !== undefined) {
                  updateFields.push('time_estimate_minutes = ?');
                  values.push(taskData.time_estimate_minutes || 0);
                }
                if (taskData.makePrivate !== undefined) {
                  updateFields.push('make_private = ?');
                  values.push(taskData.makePrivate ? 1 : 0);
                }
                if (taskData.share !== undefined) {
                  updateFields.push('share = ?');
                  values.push(taskData.share ? 1 : 0);
                }
                if (taskData.repeat !== undefined) {
                  updateFields.push('`repeat` = ?');
                  values.push(taskData.repeat ? 1 : 0);
                }
                if (taskData.isDependent !== undefined) {
                  updateFields.push('`is_dependent` = ?');
                  values.push(taskData.isDependent ? 1 : 0);
                }
                if (taskData.validationBy !== undefined) {
                  updateFields.push('validation_by = ?');
                  values.push(sanitizeForMySQL(taskData.validationBy));
                }
                if (taskData.effortLabel !== undefined) {
                  updateFields.push('effort_label = ?');
                  values.push(sanitizeForMySQL(taskData.effortLabel));
                }
                if (taskData.checklist !== undefined) {
                  updateFields.push('checklist = ?');
                  values.push(sanitizeForMySQL(taskData.checklist));
                }
                // ✅ FIX: Handle checklist_completed (array of completed item indices with date)
                if (taskData.checklist_completed !== undefined) {
                  updateFields.push('checklist_completed = ?');
                  // Store as JSON object with indices and today's date (e.g., {"indices": [0,1,2], "date": "2026-01-20"})
                  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
                  // If it's an array (from frontend), wrap it with today's date
                  const dataToStore = Array.isArray(taskData.checklist_completed)
                    ? { indices: taskData.checklist_completed, date: today }
                    : taskData.checklist_completed; // Already in new format
                  values.push(JSON.stringify(dataToStore));
                }
                if (taskData.workflowGuide !== undefined) {
                  updateFields.push('workflow_guide = ?');
                  values.push(sanitizeForMySQL(taskData.workflowGuide));
                }
                if (taskData.fileLinks !== undefined) {
                  updateFields.push('file_links = ?');
                  values.push(sanitizeForMySQL(taskData.fileLinks));
                }
                if (taskData.videoLinks !== undefined) {
                  updateFields.push('video_links = ?');
                  values.push(sanitizeForMySQL(taskData.videoLinks));
                }
  
                // Always update the updated_at timestamp
                updateFields.push('updated_at = CURRENT_TIMESTAMP');
  
                // Add taskId to values
                values.push(taskId);
  
                // Validate that at least one field is being updated (other than updated_at)
                if (updateFields.length < 2) { // Only updated_at timestamp
                  res.status(400).json({ error: 'No fields to update' });
                  return;
                }
  
                const query = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
                
                // Debug logging for unit updates
                if (taskData.unit !== undefined) {
                  console.log(`=== UNIT UPDATE QUERY DEBUG ===`);
                  console.log(`Query: ${query}`);
                  console.log(`Values:`, values);
                  console.log(`Update fields:`, updateFields);
                }
                
                try {
                  const [result] = await mysqlPool.execute(query, values);
                  
                  if (result.affectedRows === 0) {
                    res.status(404).json({ error: 'Task not found' });
                    return;
                  }
                  res.json({ message: 'Task updated successfully' });
                } catch (err) {
                  console.error('Error updating task:', err);
                  console.error('MySQL Error Code:', err.code);
                  console.error('MySQL Error Message:', err.message);
                  console.error('MySQL SQL State:', err.sqlState);
                  console.error('Query:', query);
                  console.error('Values:', values);
                  console.error('Values Types:', values.map(v => typeof v));
                  console.error('Task ID:', taskId);
                  console.error('Task Data Received:', JSON.stringify(taskData, null, 2));
                  res.status(500).json({ 
                    error: 'Database error',
                    message: err.message,
                    code: err.code,
                    sqlState: err.sqlState
                  });
                }
              });
  
  
  
              // Clear all timer data (for testing)
              router.post('/clear-timers', async (req, res) => {
                const query = `
                  UPDATE tasks SET 
                    timer_started_at = NULL,
                    logged_seconds = 0,
                    updated_at = CURRENT_TIMESTAMP
                `;
                try {
                  const [result] = await mysqlPool.execute(query);
                  res.json({ message: 'All timers cleared successfully' });
                } catch (err) {
                    console.error('Error clearing timers:', err);
                    res.status(500).json({ error: 'Database error' });
                  }
              });
  
              // Delete specific task history entry (admin only) - using POST for better compatibility
              router.post('/task-history/:id/delete', async (req, res) => {
                console.log('POST /api/task-history/:id/delete called');
                console.log('Params:', req.params);
                console.log('Body:', req.body);
                console.log('Headers:', req.headers);
                
                const historyId = req.params.id;
                const { user_role } = req.body;
                
                console.log('History ID:', historyId);
                console.log('User Role:', user_role);
                
                // Check if user is admin
                if (user_role !== 'admin') {
                  console.log('Access denied: user_role is not admin');
                  return res.status(403).json({ error: 'Only administrators can delete task history' });
                }
                
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  
                  const query = 'DELETE FROM task_history WHERE id = ?';
                  console.log('Executing query:', query, 'with params:', [historyId]);
                  
                  const [result] = await connection.execute(query, [historyId]);
                  
                  console.log('Delete operation completed. Affected rows:', result.affectedRows);
                  if (result.affectedRows === 0) {
                    res.status(404).json({ error: 'Task history entry not found' });
                    return;
                  }
                  res.json({ message: 'Task history entry deleted successfully' });
                } catch (err) {
                  console.error('Error deleting task history:', err);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
              // Delete all history for a specific task (admin only)
              router.post('/task-history/task/:taskId/delete-all', async (req, res) => {
                console.log('POST /api/task-history/task/:taskId/delete-all called');
                console.log('Params:', req.params);
                console.log('Body:', req.body);
                console.log('Headers:', req.headers);
                
                const taskId = req.params.taskId;
                const { user_role } = req.body;
                
                console.log('Task ID:', taskId);
                console.log('User Role:', user_role);
                
                // Check if user is admin
                if (user_role !== 'admin') {
                  console.log('Access denied: user_role is not admin');
                  return res.status(403).json({ error: 'Only administrators can delete task history' });
                }
                
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  
                  // First, get the count of history entries to be deleted
                  const countQuery = 'SELECT COUNT(*) as count FROM task_history WHERE task_id = ?';
                  const [countResult] = await connection.execute(countQuery, [taskId]);
                  const historyCount = countResult[0].count;
                  
                  console.log('History entries to delete:', historyCount);
                  
                  if (historyCount === 0) {
                    return res.status(404).json({ error: 'No history entries found for this task' });
                  }
                  
                  // Delete all history entries for the task
                  const deleteQuery = 'DELETE FROM task_history WHERE task_id = ?';
                  console.log('Executing query:', deleteQuery, 'with params:', [taskId]);
                  
                  const [deleteResult] = await connection.execute(deleteQuery, [taskId]);
                  
                  console.log('Delete all operation completed. Affected rows:', deleteResult.affectedRows);
                  res.json({ 
                    message: `All history entries (${historyCount}) deleted successfully`,
                    deletedCount: historyCount
                  });
                } catch (err) {
                  console.error('Error deleting all task history:', err);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
              // Start timer for task
              router.post('/:id/start-timer', async (req, res) => {
                const taskId = req.params.id;
                const { user_name, user_id } = req.body;
                
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                
                // First, check if the user already has an active timer on any task
                const checkUserActiveTimerQuery = `
                  SELECT id, title, timer_started_at 
                  FROM tasks 
                  WHERE assigned_to LIKE ? AND timer_started_at IS NOT NULL
                `;
                
                  const [activeTasks] = await connection.execute(checkUserActiveTimerQuery, [`%${user_name}%`]);
                  
                  // If user already has an active timer, return error
                  if (activeTasks.length > 0) {
                    const activeTask = activeTasks[0];
                    res.status(400).json({ 
                      error: 'You already have an active timer',
                      message: `You have an active timer on task: "${activeTask.title}". Please stop it before starting a new one.`,
                      activeTaskId: activeTask.id
                    });
                    return;
                  }
                  
                  // Get the current task to check if timer is already running
                  const getTaskQuery = 'SELECT timer_started_at, assigned_to FROM tasks WHERE id = ?';
                  const [tasks] = await connection.execute(getTaskQuery, [taskId]);
                  
                  if (tasks.length === 0) {
                      res.status(404).json({ error: 'Task not found' });
                      return;
                    }
                  
                  const task = tasks[0];
                    
                    // Check if the user is assigned to this task
                    if (!task.assigned_to || !task.assigned_to.includes(user_name)) {
                      res.status(403).json({ 
                        error: 'Access denied',
                        message: 'You are not assigned to this task'
                      });
                      return;
                    }
                    
                    // If timer is already running on this task, don't restart it
                    if (task.timer_started_at) {
                      res.status(400).json({ 
                        error: 'Timer already running',
                        message: 'This task already has an active timer'
                      });
                      return;
                    }
                    
                    // Store DATETIME format for MySQL (required by MySQL 8.4)
                    const nowISO = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).replace(' ', 'T') + '.000Z';
                    const now = nowISO.replace('T', ' ').replace('.000Z', ''); // Convert to DATETIME format for MySQL storage
                    
                    // Start the timer with current local timestamp
                    const startTimerQuery = `
                      UPDATE tasks SET 
                        timer_started_at = ?,
                        status = 'In Progress',
                        updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?
                    `;
                    
                  const [result] = await connection.execute(startTimerQuery, [now, taskId]);
                  
                  if (result.affectedRows === 0) {
                        res.status(404).json({ error: 'Task not found' });
                        return;
                      }
                      
                      // Log timer start history
                  await logTaskHistory(
                        taskId,
                        'Timer started',
                        'Timer started for task',
                        user_name || 'Admin',
                        user_id || 1
                      );
                      
                      res.json({ message: 'Timer started successfully' });
                  
                } catch (err) {
                  console.error('Error starting timer:', err);
                  if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                    console.error('MySQL connection lost, attempting to reconnect...');
                    res.status(503).json({ error: 'Database connection lost, please try again' });
                  } else {
                    res.status(500).json({ error: 'Database error' });
                  }
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
  
              // Update task status with history tracking
              router.put('/:id/status', async (req, res) => {
                const taskId = req.params.id;
                const { status, user_name, user_id, old_status } = req.body;
                
                if (!status) {
                  return res.status(400).json({ error: 'Status is required' });
                }
  
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  
                  // Update task status
                  const updateQuery = 'UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                  const [result] = await connection.execute(updateQuery, [status, taskId]);
                  
                  if (result.affectedRows === 0) {
                    return res.status(404).json({ error: 'Task not found' });
                  }
  
                  // Log status change history
                  if (old_status && old_status !== status) {
                    await logTaskHistory(
                      taskId,
                      'Status changed',
                      `Status changed from "${old_status}" to "${status}"`,
                      user_name || 'Admin',
                      user_id || 1,
                      old_status,
                      status
                    );
                  }
                  
                  res.json({ message: 'Task status updated successfully' });
                } catch (err) {
                  console.error('Error updating task status:', err);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
  
              // Get task history
              router.get('/:id/history', async (req, res) => {
                const taskId = req.params.id;
                
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  
                  const query = `
                    SELECT 
                      id,
                      action,
                      description,
                      user_name,
                      old_value,
                      new_value,
                      created_at,
                      -- Convert from UTC to Pakistan time (UTC+5)
                      DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:00'), '%Y-%m-%d %H:%i:%s') as formatted_date
                    FROM task_history 
                    WHERE task_id = ? 
                    ORDER BY created_at DESC
                  `;
                  
                  const [rows] = await connection.execute(query, [taskId]);
                  res.json(rows);
                } catch (err) {
                  console.error('Error fetching task history:', err);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
              // Delete multiple tasks (bulk delete) - MUST be before /api/tasks/:id route
              router.delete('/bulk', async (req, res) => {
                console.log('🔥 BULK DELETE ENDPOINT CALLED!');
                let connection;
                
                try {
                  const { ids } = req.body;
                  
                  // Get user permissions from headers
                  const userPermissions = req.headers['user-permissions'] ? JSON.parse(req.headers['user-permissions']) : [];
                  const userRole = req.headers['user-role'] || 'employee';
                  const userName = req.headers['user-name'] || '';
                  
                  console.log('=== BULK DELETE SERVER DEBUG ===');
                  console.log('Bulk delete request received:', req.body);
                  console.log('User permissions:', userPermissions);
                  console.log('User role:', userRole);
                  console.log('User name:', userName);
                  console.log('IDs to delete:', ids);
                  
                  // Validate input
                  if (!ids || !Array.isArray(ids) || ids.length === 0) {
                    console.log('Validation failed: IDs array is required');
                    return res.status(400).json({ error: 'IDs array is required' });
                  }
  
                  // Validate all IDs are valid numbers
                  const validIds = ids.filter(id => {
                    const numId = parseInt(id, 10);
                    return !isNaN(numId) && numId > 0;
                  });
  
                  if (validIds.length === 0) {
                    return res.status(400).json({ error: 'No valid task IDs provided' });
                  }
  
                  if (validIds.length !== ids.length) {
                    console.warn('Some invalid IDs were filtered out:', ids.filter(id => {
                      const numId = parseInt(id, 10);
                      return isNaN(numId) || numId <= 0;
                    }));
                  }
                  
                  // Check permissions (admin / global delete only; regular users cannot delete tasks)
                  const hasDeleteAllTasks =
                    userPermissions.includes('delete_tasks') ||
                    userPermissions.includes('all') ||
                    (userRole && userRole.toLowerCase() === 'admin');
                  
                  if (!hasDeleteAllTasks) {
                    console.log('Access denied: User has no delete permissions');
                    return res.status(403).json({ error: 'Access denied: You do not have permission to delete tasks. Please contact your administrator.' });
                  }
                  
                  // ========== FIX #5: Use transaction with row-level locking ==========
                  connection = await mysqlPool.getConnection();
                  await connection.beginTransaction();
  
                  // Check if tasks exist with row-level locking to prevent race conditions
                  const placeholders = validIds.map(() => '?').join(',');
                  const lockQuery = `SELECT id, title, assigned_to FROM tasks WHERE id IN (${placeholders}) FOR UPDATE`;
                  console.log('Check query (with lock):', lockQuery);
                  console.log('Check query params:', validIds);
                  
                  const [existingTasks] = await connection.execute(lockQuery, validIds);
                  console.log('Existing tasks found (locked):', existingTasks.length);
                  
                  if (existingTasks.length === 0) {
                    await connection.rollback();
                    connection.release();
                    console.log('No tasks found with the provided IDs');
                    return res.status(404).json({ error: 'No tasks found with the provided IDs' });
                  }
                  
                  // Since only admin/global delete is allowed, all existingTasks are eligible
                  const tasksToDelete = existingTasks;
                  
                  // ========== FIX #3 & #4: Get task IDs with validation ==========
                  const taskIdsToDelete = tasksToDelete.map(task => task.id).filter(id => id != null && id !== undefined);
  
                  // CRITICAL SAFETY CHECK #1: Validate taskIdsToDelete is not empty
                  if (!taskIdsToDelete || taskIdsToDelete.length === 0) {
                    await connection.rollback();
                    connection.release();
                    console.error('🚨 CRITICAL SAFETY CHECK: taskIdsToDelete is empty! Aborting delete to prevent accidental deletion of all tasks.');
                    console.error('   - Original IDs requested:', ids);
                    console.error('   - Valid IDs after validation:', validIds);
                    console.error('   - Existing tasks found:', existingTasks.length);
                    console.error('   - Tasks after permission filtering:', tasksToDelete.length);
                    return res.status(400).json({ 
                      error: 'No valid task IDs to delete. Operation aborted to prevent accidental deletion of all tasks.',
                      details: 'This error prevents a potential bug that could delete all tasks in the database.',
                      debug: {
                        requestedIds: ids,
                        validIds: validIds,
                        existingTasksCount: existingTasks.length,
                        filteredTasksCount: tasksToDelete.length,
                        taskIdsToDeleteCount: taskIdsToDelete.length
                      }
                    });
                  }
  
                  // CRITICAL SAFETY CHECK #2: Validate attachment query placeholders
                  const attachmentPlaceholders = taskIdsToDelete.map(() => '?').join(',');
                  if (!attachmentPlaceholders || attachmentPlaceholders.trim() === '') {
                    await connection.rollback();
                    connection.release();
                    console.error('🚨 CRITICAL SAFETY CHECK: attachmentPlaceholders is empty! Aborting delete.');
                    return res.status(500).json({ 
                      error: 'Invalid attachment query construction. Operation aborted to prevent accidental deletion of all tasks.' 
                    });
                  }
  
                  // Get all attachment file paths before deleting tasks
                  const [attachments] = await connection.execute(
                    `SELECT file_path FROM task_attachments WHERE task_id IN (${attachmentPlaceholders})`,
                    taskIdsToDelete
                  );
                  
                  // CRITICAL SAFETY CHECK #3: Validate DELETE query placeholders
                  const deletePlaceholders = taskIdsToDelete.map(() => '?').join(',');
                  if (!deletePlaceholders || deletePlaceholders.trim() === '') {
                    await connection.rollback();
                    connection.release();
                    console.error('🚨 CRITICAL SAFETY CHECK: deletePlaceholders is empty! Aborting delete.');
                    return res.status(500).json({ 
                      error: 'Invalid delete query construction. Operation aborted to prevent accidental deletion of all tasks.' 
                    });
                  }
  
                  const deleteQuery = `DELETE FROM tasks WHERE id IN (${deletePlaceholders})`;
                  
                  // CRITICAL SAFETY CHECK #4: Final validation before execution
                  if (taskIdsToDelete.length === 0) {
                    await connection.rollback();
                    connection.release();
                    console.error('🚨 FINAL SAFETY CHECK: taskIdsToDelete is empty right before DELETE execution!');
                    return res.status(500).json({ 
                      error: 'Safety check failed: No task IDs to delete. Operation aborted.' 
                    });
                  }
  
                  console.log('✅ Safety checks passed. Deleting', taskIdsToDelete.length, 'task(s)');
                  console.log('Delete query:', deleteQuery);
                  console.log('Delete query params:', taskIdsToDelete);
                  
                  const [deleteResult] = await connection.execute(deleteQuery, taskIdsToDelete);
  
                  // Commit transaction
                  await connection.commit();
                  connection.release();
                  
                  // Delete physical files from disk (after commit)
                  for (const attachment of attachments) {
                    const filePath = path.join(__dirname, attachment.file_path);
                    if (fs.existsSync(filePath)) {
                      try {
                        fs.unlinkSync(filePath);
                        console.log(`Deleted file: ${filePath}`);
                      } catch (fileErr) {
                        console.error(`Error deleting file ${filePath}:`, fileErr);
                      }
                    }
                  }
                  
                  console.log('Delete operation completed. Affected rows:', deleteResult.affectedRows);
                  res.json({ 
                    message: `${deleteResult.affectedRows} task(s) and all associated files deleted successfully`,
                    deletedCount: deleteResult.affectedRows 
                  });
                } catch (err) {
                  if (connection) {
                    await connection.rollback();
                    connection.release();
                  }
                  console.error('Error in bulk delete:', err);
                  res.status(500).json({ error: 'Database error: ' + err.message });
                }
              });
  
              // Delete task
              router.delete('/:id', async (req, res) => {
                const taskId = req.params.id;
                
                // ========== FIX #1: Validate taskId ==========
                if (!taskId || taskId === 'undefined' || taskId === 'null' || taskId.trim() === '') {
                  console.error('Invalid taskId provided:', taskId);
                  return res.status(400).json({ error: 'Invalid task ID provided' });
                }
  
                // Validate taskId is a number (if IDs are numeric)
                const taskIdNum = parseInt(taskId, 10);
                if (isNaN(taskIdNum) || taskIdNum <= 0) {
                  console.error('Invalid taskId format:', taskId);
                  return res.status(400).json({ error: 'Task ID must be a valid positive number' });
                }
  
                // ========== PERMISSION CHECK: Only admins / users with global delete permission can delete tasks ==========
                let userPermissions = [];
                let userRole = 'employee';
                try {
                  userPermissions = req.headers['user-permissions']
                    ? JSON.parse(req.headers['user-permissions'])
                    : [];
                } catch (e) {
                  console.warn('Failed to parse user-permissions header for task delete:', req.headers['user-permissions']);
                  userPermissions = [];
                }
                userRole = (req.headers['user-role'] || 'employee').toLowerCase();
  
                const hasDeleteAllTasks =
                  userRole === 'admin' ||
                  userPermissions.includes('all') ||
                  userPermissions.includes('delete_tasks');
  
                if (!hasDeleteAllTasks) {
                  console.log('Access denied: User has no permission to delete tasks');
                  return res.status(403).json({ error: 'Access denied: You do not have permission to delete tasks. Please contact your administrator.' });
                }
  
                let connection;
                
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  
                  // First, verify task exists before deleting
                  const [taskCheck] = await connection.execute(
                    'SELECT id, title FROM tasks WHERE id = ?',
                    [taskIdNum]
                  );
                  
                  if (taskCheck.length === 0) {
                    connection.release();
                    return res.status(404).json({ error: 'Task not found' });
                  }
                  
                  // Get all attachment file paths before deleting
                  const [attachments] = await connection.execute(
                    'SELECT file_path FROM task_attachments WHERE task_id = ?',
                    [taskIdNum]
                  );
                  
                  // Delete the task (this will cascade delete attachments due to foreign key)
                  const [result] = await connection.execute('DELETE FROM tasks WHERE id = ?', [taskIdNum]);
                  
                  if (result.affectedRows === 0) {
                    connection.release();
                    res.status(404).json({ error: 'Task not found' });
                    return;
                  }
                  
                  // Delete physical files from disk
                  for (const attachment of attachments) {
                    const filePath = path.join(__dirname, attachment.file_path);
                    if (fs.existsSync(filePath)) {
                      try {
                        fs.unlinkSync(filePath);
                        console.log(`Deleted file: ${filePath}`);
                      } catch (fileErr) {
                        console.error(`Error deleting file ${filePath}:`, fileErr);
                      }
                    }
                  }
                  
                  res.json({ message: 'Task and all associated files deleted successfully' });
                } catch (err) {
                  console.error('Error deleting task:', err);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
  
              // Stop timer for task
              router.post('/:id/stop-timer', async (req, res) => {
                const taskId = req.params.id;
                const { loggedSeconds, startTimeMs, endTimeMs, user_name, user_id, memo } = req.body;
                
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                // First get the task to get the timer start time and current logged_seconds
                const getTaskQuery = 'SELECT timer_started_at, COALESCE(logged_seconds, 0) AS logged_seconds, assigned_to FROM tasks WHERE id = ?';
                  const [tasks] = await connection.execute(getTaskQuery, [taskId]);
                  
                  if (tasks.length === 0) {
                    res.status(404).json({ error: 'Task not found' });
                    return;
                  }
                  // Idempotent: if timer already stopped (e.g. by clock-out), return 200 with current logged_seconds so frontend can sync
                  if (!tasks[0].timer_started_at) {
                    const currentLogged = Number(tasks[0].logged_seconds) || 0;
                    res.status(200).json({
                      message: 'Timer already stopped',
                      logged_seconds: currentLogged,
                      already_stopped: true
                    });
                    return;
                  }
                  
                  const task = tasks[0];
                  
                  // Resolve which employee should get credit for this time entry.
                  // Default to the user performing the action, but prefer the task's assignee
                  // so auto-stops (stale session / browser close / offline) are attributed to
                  // the actual assignee instead of the Admin fallback user.
                  const rawUserName = (user_name || '').toString().trim();
                  const rawUserId = user_id || 1;
                  let timesheetEmployeeName = rawUserName || 'Admin';
                  let timesheetEmployeeId = rawUserId;
  
                  try {
                    const assignedTo = (task.assigned_to || '').toString().trim();
                    if (assignedTo) {
                      // Use the first assignee in a comma-separated list
                      const firstAssigneeName = assignedTo.split(',')[0].trim();
                      if (firstAssigneeName) {
                        const [empMatch] = await connection.execute(
                          'SELECT id, name FROM employees WHERE name = ? LIMIT 1',
                          [firstAssigneeName]
                        );
                        if (Array.isArray(empMatch) && empMatch.length > 0) {
                          timesheetEmployeeName = (empMatch[0].name || firstAssigneeName).toString().trim();
                          timesheetEmployeeId = empMatch[0].id || timesheetEmployeeId;
                        } else {
                          // If no exact employee match, still prefer the assignee name for reporting
                          timesheetEmployeeName = firstAssigneeName;
                        }
                      }
                    }
                  } catch (assigneeErr) {
                    console.error('Stop timer: failed to resolve assignee for task', taskId, assigneeErr);
                  }
                  
                  // Determine start and end times:
                  // 1) Prefer exact timestamps sent by frontend (startTimeMs/endTimeMs - epoch ms)
                  // 2) Fallback to parsing timer_started_at with explicit PKT offset to avoid date shifts on UTC servers.
                  let startTime;
                  if (typeof startTimeMs === 'number' && !Number.isNaN(startTimeMs) && startTimeMs > 0) {
                    startTime = new Date(startTimeMs);
                  } else if (task.timer_started_at instanceof Date) {
                    startTime = task.timer_started_at;
                  } else {
                    const raw = String(task.timer_started_at || '').trim();
                    const timerStr = raw.replace(' ', 'T');
                    if (!timerStr) {
                      // Fallback: if for some reason we don't have a start time string,
                      // use current time to keep duration non-negative.
                      startTime = new Date();
                    } else if (timerStr.includes('+') || timerStr.endsWith('Z')) {
                      // Already has explicit offset / Z → safe to pass directly.
                      startTime = new Date(timerStr);
                    } else {
                      // Stored as "YYYY-MM-DDTHH:mm:ss" in local PKT without offset.
                      // Attach +05:00 so JS Date interprets it as Pakistan time,
                      // preventing an unintended +5h shift when running on UTC servers.
                      startTime = new Date(timerStr + '+05:00');
                    }
                  }
                  
                  let endTime;
                  if (typeof endTimeMs === 'number' && !Number.isNaN(endTimeMs) && endTimeMs > 0) {
                    endTime = new Date(endTimeMs);
                  } else {
                    // Get current time for end time
                    endTime = new Date();
                  }
                  
                  // Calculate actual duration in seconds (for fallback only)
                  const actualDurationSeconds = Math.floor((endTime - startTime) / 1000);
                  
                  // ✅ ALWAYS trust frontend's loggedSeconds if it exists
                  // Backend calculation is ONLY fallback when frontend value is missing
                  let finalLoggedSeconds = (loggedSeconds && loggedSeconds > 0) 
                    ? loggedSeconds  // Frontend wins - most accurate
                    : actualDurationSeconds; // Fallback only if frontend missing
                  
                  // ✅ SAFEGUARD: Ensure logged seconds is never negative
                  if (finalLoggedSeconds < 0) {
                    console.warn(`⚠️ Negative duration detected (${finalLoggedSeconds}s) for task ${taskId}, using absolute value`);
                    finalLoggedSeconds = Math.abs(finalLoggedSeconds);
                  }
                  
                  const updateQuery = `
                    UPDATE tasks SET 
                      timer_started_at = NULL,
                      logged_seconds = COALESCE(logged_seconds, 0) + ?,
                      updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `;
                  
                  const [updateResult] = await connection.execute(updateQuery, [finalLoggedSeconds, taskId]);
                  
                  if (updateResult.affectedRows === 0) {
                      res.status(404).json({ error: 'Task not found' });
                      return;
                    }
                    
                    // Fetch the updated logged_seconds to return to frontend
                    const [updatedTask] = await connection.execute('SELECT logged_seconds FROM tasks WHERE id = ?', [taskId]);
                    const updatedLoggedSeconds = updatedTask[0]?.logged_seconds || 0;
                    
                    // Save timesheet entry
                    const timesheetQuery = `
                      INSERT INTO task_timesheet (
                        task_id, employee_name, employee_id, start_time, end_time, memo, hours_logged, hours_logged_seconds
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    
                  try {
                    // Format times for MySQL DATETIME storage
                    // Use consistent formatting: store as local Pakistan time strings
                    const formatForMySQL = (date) => {
                      // Convert to Pakistan timezone string for MySQL storage
                      const pktString = date.toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' });
                      return pktString; // Returns "YYYY-MM-DD HH:mm:ss" format
                    };
                    
                    const startTimeForDB = formatForMySQL(startTime);
                    const endTimeForDB = formatForMySQL(endTime);
                    
                    // Ensure hours_logged_seconds is positive
                    const safeLoggedSeconds = Math.abs(finalLoggedSeconds);
                    
                    await connection.execute(timesheetQuery, [
                      taskId,
                      timesheetEmployeeName,
                      timesheetEmployeeId,
                      sanitizeForMySQL(startTimeForDB),
                      sanitizeForMySQL(endTimeForDB),
                      memo || '',
                      safeLoggedSeconds,
                      safeLoggedSeconds
                    ]);
                  } catch (timesheetErr) {
                    console.error('Error saving timesheet entry:', timesheetErr);
                  }
                    
                    // Log timer stop history with memo
                    const historyDescription = memo 
                      ? `Timer stopped. Logged ${Math.floor(finalLoggedSeconds / 3600)}h ${Math.floor((finalLoggedSeconds % 3600) / 60)}m. Memo: ${memo}`
                      : `Timer stopped. Logged ${Math.floor(finalLoggedSeconds / 3600)}h ${Math.floor((finalLoggedSeconds % 3600) / 60)}m`;
                    
                  await logTaskHistory(
                      taskId,
                      'Timer stopped',
                      historyDescription,
                      timesheetEmployeeName,
                      timesheetEmployeeId
                    );
                    
                    console.log('✅ Stop timer response - taskId:', taskId, 'logged_seconds:', updatedLoggedSeconds, 'finalLoggedSeconds:', finalLoggedSeconds); // Debug log
                    res.json({ 
                      message: 'Timer stopped successfully',
                      logged_seconds: updatedLoggedSeconds // Return the updated logged_seconds
                    });
                  
                } catch (err) {
                  console.error('Error stopping timer:', err);
                  if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                    console.error('MySQL connection lost, attempting to reconnect...');
                    res.status(503).json({ error: 'Database connection lost, please try again' });
                  } else {
                    res.status(500).json({ error: 'Database error' });
                  }
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
  
              // File upload for task attachments
              router.post('/:id/upload', async (req, res) => {
                const taskId = req.params.id;
                const upload = multer({
                  storage: multer.diskStorage({
                    destination: (req, file, cb) => {
                      const uploadDir = path.join(__dirname, 'uploads', 'task-attachments');
                      if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                      }
                      cb(null, uploadDir);
                    },
                    filename: (req, file, cb) => {
                      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                      cb(null, uniqueSuffix + '-' + file.originalname);
                    }
                  }),
                  limits: {
                    fileSize: 10 * 1024 * 1024 // 10MB limit
                  },
                  fileFilter: (req, file, cb) => {
                    // Allow common file types
                    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt|zip|rar/;
                    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
                    const mimetype = allowedTypes.test(file.mimetype);
                    
                    if (mimetype && extname) {
                      return cb(null, true);
                    } else {
                      cb(new Error('Invalid file type'));
                    }
                  }
                });
                
                upload.array('attachments', 10)(req, res, async (err) => {
                  if (err) {
                    console.error('File upload error:', err);
                    return res.status(400).json({ error: err.message });
                  }
                  
                  if (!req.files || req.files.length === 0) {
                    return res.status(400).json({ error: 'No files uploaded' });
                  }
                  
                  let connection;
                  try {
                    connection = await mysqlPool.getConnection();
                    await connection.ping();
                    
                    // Verify task exists
                    const [tasks] = await connection.execute('SELECT id FROM tasks WHERE id = ?', [taskId]);
                    if (tasks.length === 0) {
                      return res.status(404).json({ error: 'Task not found' });
                    }
                    
                    const uploadedFiles = [];
                    
                    for (const file of req.files) {
                      // Save file info to database
                      const insertQuery = `
                        INSERT INTO task_attachments (task_id, file_name, file_path, file_size, file_type, uploaded_by)
                        VALUES (?, ?, ?, ?, ?, ?)
                      `;
                      
                      const relativePath = path.relative(__dirname, file.path);
                      const uploadedBy = req.body.uploaded_by || 1; // Default to user ID 1 if not provided
                      
                      await connection.execute(insertQuery, [
                        taskId,
                        file.originalname,
                        relativePath,
                        file.size,
                        file.mimetype,
                        uploadedBy
                      ]);
                      
                      uploadedFiles.push({
                        id: Date.now() + Math.random(), // Temporary ID for frontend
                        name: file.originalname,
                        size: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
                        uploadedAt: new Date().toLocaleString(),
                        path: relativePath
                      });
                    }
                    
                    res.json({ 
                      message: 'Files uploaded successfully',
                      files: uploadedFiles 
                    });
                    
                  } catch (dbErr) {
                    console.error('Database error:', dbErr);
                    res.status(500).json({ error: 'Database error' });
                  } finally {
                    if (connection) {
                      connection.release();
                    }
                  }
                });
              });
              // Get task attachments
              router.get('/:id/attachments', async (req, res) => {
                const taskId = req.params.id;
                let connection;
                
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  
                  const query = `
                    SELECT id, file_name, file_path, file_size, file_type, uploaded_by, created_at
                    FROM task_attachments
                    WHERE task_id = ?
                    ORDER BY created_at DESC
                  `;
                  
                  const [attachments] = await connection.execute(query, [taskId]);
                  
                  const formattedAttachments = attachments.map(attachment => ({
                    id: attachment.id,
                    name: attachment.file_name,
                    size: `${(attachment.file_size / 1024 / 1024).toFixed(1)}MB`,
                    uploadedAt: new Date(attachment.created_at).toLocaleString(),
                    path: attachment.file_path,
                    type: attachment.file_type
                  }));
                  
                  res.json({ attachments: formattedAttachments });
                  
                } catch (err) {
                  console.error('Error fetching task attachments:', err);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
  
              // Delete task attachment
              router.delete('/:id/attachments/:attachmentId', async (req, res) => {
                const { id: taskId, attachmentId } = req.params;
                let connection;
                
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  
                  // Get attachment info first
                  const [attachments] = await connection.execute(
                    'SELECT file_path FROM task_attachments WHERE id = ? AND task_id = ?',
                    [attachmentId, taskId]
                  );
                  
                  if (attachments.length === 0) {
                    return res.status(404).json({ error: 'Attachment not found' });
                  }
                  
                  // Delete from database
                  await connection.execute(
                    'DELETE FROM task_attachments WHERE id = ? AND task_id = ?',
                    [attachmentId, taskId]
                  );
                  
                  // Delete physical file
                  const filePath = path.join(__dirname, attachments[0].file_path);
                  if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                  }
                  
                  res.json({ message: 'Attachment deleted successfully' });
                  
                } catch (err) {
                  console.error('Error deleting task attachment:', err);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
              // Download task attachment
              router.get('/:id/attachments/:attachmentId/download', async (req, res) => {
                const { id: taskId, attachmentId } = req.params;
                let connection;
                
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  
                  const [attachments] = await connection.execute(
                    'SELECT file_name, file_path FROM task_attachments WHERE id = ? AND task_id = ?',
                    [attachmentId, taskId]
                  );
                  
                  if (attachments.length === 0) {
                    return res.status(404).json({ error: 'Attachment not found' });
                  }
                  
                  const attachment = attachments[0];
                  const filePath = path.join(__dirname, attachment.file_path);
                  
                  if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ error: 'File not found on disk' });
                  }
                  
                  res.download(filePath, attachment.file_name);
                  
                } catch (err) {
                  console.error('Error downloading task attachment:', err);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
  // Import tasks from Excel file
  router.post('/import', upload.single('file'), async (req, res) => {
    console.log('=== TASK IMPORT REQUEST RECEIVED ===');
    console.log('Request headers:', req.headers);
    console.log('Request body keys:', Object.keys(req.body || {}));
    console.log('File received:', req.file ? 'YES' : 'NO');
    
    if (!req.file) {
      console.log('No file uploaded - returning 400 error');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log('File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  
    try {
      console.log('Processing file:', req.file.originalname);
      
      let data;
      const fileExtension = req.file.originalname.toLowerCase().split('.').pop();
      
      if (fileExtension === 'csv') {
        // Handle CSV files differently
        const csvContent = req.file.buffer.toString('utf8');
        const lines = csvContent.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
          return res.status(400).json({ error: 'No data found in CSV file' });
        }
        
        // Parse CSV manually to handle column count issues
        const parseCSVLine = (line) => {
          const values = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim().replace(/^"(.*)"$/, '$1')); // Remove surrounding quotes
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim().replace(/^"(.*)"$/, '$1')); // Add the last value and remove quotes
          return values;
        };
        const headers = parseCSVLine(lines[0]);
        const dataRows = lines.slice(1);
        console.log('CSV Headers:', headers);
        console.log('CSV Headers count:', headers.length);
        console.log('Total data rows:', dataRows.length);
        
        data = dataRows.map((line, rowIndex) => {
          const values = parseCSVLine(line);
          
          // Pad with empty strings if row has fewer values than headers
          while (values.length < headers.length) {
            values.push('');
          }
          
          // Truncate if row has more values than headers
          if (values.length > headers.length) {
            values.splice(headers.length);
          }
          
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] || '';
          });
          
          if (rowIndex < 3) { // Log first 3 rows for debugging
            console.log(`Row ${rowIndex + 1} values:`, values);
            console.log(`Row ${rowIndex + 1} values count:`, values.length);
            console.log(`Row ${rowIndex + 1} object:`, obj);
          }
          
          return obj;
        });
      } else {
        // Handle Excel files
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = xlsx.utils.sheet_to_json(worksheet, { 
          defval: '' // Default value for empty cells
        });
      }
  
      console.log('Data rows found:', data.length);
      console.log('First row sample:', data[0]);
      console.log('First row keys:', Object.keys(data[0] || {}));
      console.log('First row values:', Object.values(data[0] || {}));
  
      if (data.length === 0) {
        return res.status(400).json({ error: 'No data found in file' });
      }
  
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      let processedCount = 0;
  
      // Process each row
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        console.log(`Processing row ${i + 1}:`, row);
        
        // Check if row has any data
        if (!row || Object.keys(row).length === 0) {
          console.log(`Skipping empty row ${i + 1}`);
          continue;
        }
        
        const taskData = {
          title: row['title'] || row['Title'] || '',
          department: row['department'] || row['Departme'] || row['Department'] || '',
          taskCategory: row['category'] || row['Task Cate'] || row['Task Category'] || '',
          project: row['project'] || row['Project'] || '',
          startDate: row['startDate'] || row['Start Date'] || '',
          dueDate: row['dueDate'] || row['Due Date'] || '',
          withoutDueDate: row['withoutDueDate'] === 'TRUE' || row['withoutDueDate'] === 'true' || 
                        row['Without D'] === 'Yes' || row['Without Due Date'] === 'Yes' || false,
          assignedTo: row['assignedToEmail'] || row['Assigned'] || row['Assigned To'] || '',
          status: row['status'] || row['Status'] || 'Pending',
          description: row['description'] || row['Descriptic'] || row['Description'] || '',
          responsible: row['responsibleEmails'] || row['Responsib'] || row['Responsible'] || '',
          accountable: row['accountableEmails'] || row['Accountak'] || row['Accountable'] || '',
          consulted: row['consultedEmails'] || row['Consulted'] || '',
          informed: row['informedEmails'] || row['Informed'] || '',
          trained: row['trainedEmployeesEmails'] || row['Trained'] || '',
          labels: row['label'] || row['Labels'] || '',
          milestones: row['milestones'] || row['Milestone'] || row['Milestones'] || '',
          priority: row['priority'] || row['Priority'] || 'Medium',
          complexity: row['complexity'] || row['Complexit'] || row['Complexity'] || '',
          impact: row['impact'] || row['Impact'] || '',
          unit: row['unit'] || row['Unit'] || '',
          target: row['target'] || row['Target'] || '',
          effort_estimate_label: row['effortLabel'] || row['Effort Esti'] || row['Effort Estimate'] || '',
          time_estimate_hours: row['time_estimate_hours'] || row['Time Estimate Hours'] || 0,
          time_estimate_minutes: row['time_estimate_minutes'] || row['Time Estimate Minutes'] || 0,
          makePrivate: row['isPrivate'] === 'TRUE' || row['isPrivate'] === 'true' || 
                     row['Make Priv'] === 'Yes' || row['Make Private'] === 'Yes' || false,
          share: row['isShared'] === 'TRUE' || row['isShared'] === 'true' || 
                row['Share'] === 'Yes' || false,
          repeat: row['isRepeating'] === 'TRUE' || row['isRepeating'] === 'true' || 
                 row['Repeat'] === 'Yes' || false,
          isDependent: row['isDependent'] === 'TRUE' || row['isDependent'] === 'true' || 
                      row['Task is de'] === 'Yes' || row['Task is dependent'] === 'Yes' || false,
          validationBy: row['validationBy'] || row['Validatior'] || row['Validation By'] || '',
          effortLabel: row['effortLabel'] || row['Effort Lab Ch'] || row['Effort Label'] || '',
          checklist: row['checklist'] || row['Checklist'] || '',
          workflowGuide: row['workflowGuide'] || row['Workflow Guide'] || '',
          createdOn: row['createdOn'] || row['Created On'] || row['Created At'] || ''
        };
  
        // Debug logging for first few rows
        if (i < 3) {
          console.log(`\n=== ROW ${i + 1} DEBUG ===`);
          console.log('Raw row data:', row);
          console.log('Parsed taskData:', taskData);
          console.log('Title value:', taskData.title);
        }
  
        // Validate required fields
        if (!taskData.title || taskData.title.trim() === '') {
          errors.push(`Row ${i + 1}: Title is required`);
          errorCount++;
          continue;
        }
  
        // Normalize optional Created On value to MySQL DATETIME (YYYY-MM-DD HH:MM:SS)
        const normalizeDateValue = (val) => {
          if (!val) return null;
          let d = null;
          if (val instanceof Date) {
            d = val;
          } else if (typeof val === 'number' && !Number.isNaN(val)) {
            // Excel serial number to JS Date
            d = new Date(Math.round((val - 25569) * 86400 * 1000));
          } else if (typeof val === 'string') {
            const trimmed = val.trim();
            if (!trimmed) return null;
            const parsed = new Date(trimmed);
            if (!Number.isNaN(parsed.getTime())) d = parsed;
          }
          if (!d) return null;
          const pad = (n) => String(n).padStart(2, '0');
          const yyyy = d.getFullYear();
          const mm = pad(d.getMonth() + 1);
          const dd = pad(d.getDate());
          const hh = pad(d.getHours());
          const mi = pad(d.getMinutes());
          const ss = pad(d.getSeconds());
          return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
        };
  
        const createdAtValue = normalizeDateValue(taskData.createdOn);
  
        // Insert task using MySQL (conditionally include created_at if provided)
        const baseColumns = [
          'title', 'department', 'task_category', 'project', 'start_date', 'due_date', 'without_due_date',
          'assigned_to', 'status', 'description', 'responsible', 'accountable', 'consulted', 'informed', 'trained',
          'labels', 'milestones', 'priority', 'complexity', 'impact', 'unit', 'target', 'effort_estimate_label',
          'time_estimate_hours', 'time_estimate_minutes', 'make_private', 'share', '`repeat`', '`is_dependent`',
          'validation_by', 'effort_label', 'checklist', 'workflow_guide'
        ];
        const baseValues = [
          sanitizeForMySQL(taskData.title), sanitizeForMySQL(taskData.department), sanitizeForMySQL(taskData.taskCategory), sanitizeForMySQL(taskData.project),
          sanitizeForMySQL(taskData.startDate), sanitizeForMySQL(taskData.dueDate), taskData.withoutDueDate ? 1 : 0,
          toAssignedToString({ assignedTo: taskData.assignedTo }) || null, sanitizeForMySQL(taskData.status), sanitizeForMySQL(taskData.description),
          sanitizeForMySQL(taskData.responsible), sanitizeForMySQL(taskData.accountable), sanitizeForMySQL(taskData.consulted), sanitizeForMySQL(taskData.informed), sanitizeForMySQL(taskData.trained),
          sanitizeForMySQL(taskData.labels), sanitizeForMySQL(taskData.milestones), sanitizeForMySQL(taskData.priority), sanitizeForMySQL(taskData.complexity), sanitizeForMySQL(taskData.impact),
          sanitizeForMySQL(taskData.unit) || '', sanitizeForMySQL(taskData.target) || '', sanitizeForMySQL(taskData.effort_estimate_label),
          taskData.time_estimate_hours || 0, taskData.time_estimate_minutes || 0,
          taskData.makePrivate ? 1 : 0, taskData.share ? 1 : 0, taskData.repeat ? 1 : 0, taskData.isDependent ? 1 : 0,
          sanitizeForMySQL(taskData.validationBy), sanitizeForMySQL(taskData.effortLabel), sanitizeForMySQL(taskData.checklist), sanitizeForMySQL(taskData.workflowGuide)
        ];
  
        const columns = [...baseColumns];
        const values = [...baseValues];
        if (createdAtValue) {
          columns.push('created_at');
          values.push(createdAtValue);
        }
  
        const placeholders = columns.map(() => '?').join(', ');
        const insertQuery = `
          INSERT INTO tasks (${columns.join(', ')})
          VALUES (${placeholders})
        `;
  
        try {
          // Debug logging to see exact values
          console.log(`\n=== ROW ${i + 1} DEBUG ===`);
          console.log('Query:', insertQuery);
          console.log('Values:', values);
          console.log('Values length:', values.length);
          
          await mysqlPool.execute(insertQuery, values);
          successCount++;
          console.log(`Row ${i + 1} imported successfully`);
        } catch (err) {
          errorCount++;
          errors.push(`Row ${i + 1}: ${err.message}`);
          console.error(`Import error for row ${i + 1}:`, err.message);
          console.error('Full error:', err);
        }
      }
      // Send response after all rows are processed
      res.json({
        message: `Import completed. ${successCount} tasks imported successfully. ${errorCount} errors.`,
        successCount,
        errorCount,
        errors: errors.length > 0 ? errors : undefined
      });
  
    } catch (error) {
      console.error('Error processing file:', error);
      res.status(500).json({ error: 'Error processing file' });
    }
  });
  // Update existing tasks from file
  router.post('/update', upload.single('file'), async (req, res) => {
    console.log('=== TASK UPDATE REQUEST RECEIVED ===');
    console.log('Request headers:', req.headers);
    console.log('Request body keys:', Object.keys(req.body || {}));
    console.log('File received:', req.file ? 'YES' : 'NO');
    
    if (!req.file) {
      console.log('No file uploaded - returning 400 error');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);
      
      if (data.length === 0) {
        return res.status(400).json({ error: 'No data found in file' });
      }
      
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const taskId = row['Task ID'] || row['task_id'] || row['id'];
        
        if (!taskId) {
          errorCount++;
          errors.push(`Row ${i + 2}: Task ID is required for updates`);
          continue;
        }
        
        try {
          // Check if task exists
          const checkQuery = 'SELECT id FROM tasks WHERE id = ?';
          const [existingTasks] = await connection.execute(checkQuery, [taskId]);
          
          if (existingTasks.length === 0) {
            errorCount++;
            errors.push(`Row ${i + 2}: Task with ID ${taskId} not found`);
            continue;
          }
          
          // Build update query dynamically based on provided fields
          const updateFields = [];
          const updateValues = [];
          
          const fieldMappings = {
            'Title': 'title',
            'Description': 'description',
            'Status': 'status',
            'Priority': 'priority',
            'Complexity': 'complexity',
            'Impact': 'impact',
            'Unit': 'unit',
            'Target': 'target',
            'Effort Estimate': 'effort_estimate_label',
            'Time Estimate (Hours)': 'time_estimate_hours',
            'Time Estimate (Minutes)': 'time_estimate_minutes',
            'Due Date': 'due_date',
            'Start Date': 'start_date',
            'Assigned To': 'assigned_to',
            'Department': 'department',
            'Labels': 'labels',
            'Checklist': 'checklist',
            'Workflow Guide': 'workflow_guide'
          };
          
          Object.entries(fieldMappings).forEach(([excelField, dbField]) => {
            if (row[excelField] !== undefined && row[excelField] !== null && row[excelField] !== '') {
              updateFields.push(`${dbField} = ?`);
              updateValues.push(row[excelField]);
            }
          });
          
          if (updateFields.length === 0) {
            errorCount++;
            errors.push(`Row ${i + 2}: No valid fields to update`);
            continue;
          }
          
          updateValues.push(taskId);
          
          const updateQuery = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
          await connection.execute(updateQuery, updateValues);
          
          successCount++;
          console.log(`Updated task ${taskId} successfully`);
          
        } catch (error) {
          console.error(`Error updating task ${taskId}:`, error);
          errorCount++;
          errors.push(`Row ${i + 2}: Error updating task ${taskId} - ${error.message}`);
        }
      }
      
      res.json({
        message: `Update completed. ${successCount} tasks updated successfully. ${errorCount} errors.`,
        successCount,
        errorCount,
        errors: errors.length > 0 ? errors : undefined
      });
      
    } catch (error) {
      console.error('Error processing update file:', error);
      res.status(500).json({ error: 'Error processing update file' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
  // Task Timesheet API endpoint
router.get('/:id/timesheet', async (req, res) => {
    const taskId = req.params.id;
    
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
  
      const query = `
        SELECT 
          tt.*,
          -- Format datetime for display using MySQL DATE_FORMAT (timestamps are already in Pakistan timezone)
          DATE_FORMAT(tt.start_time, '%a %d %b %Y %H:%i') as formatted_start_time,
          DATE_FORMAT(tt.end_time, '%a %d %b %Y %H:%i') as formatted_end_time,
          -- Use hours_logged if available, otherwise calculate from start_time and end_time
          -- Use ABS() to handle any legacy negative values
          CASE 
            WHEN tt.hours_logged IS NOT NULL AND tt.hours_logged != 0 THEN ABS(tt.hours_logged)
            WHEN tt.start_time IS NOT NULL AND tt.end_time IS NOT NULL THEN 
              ABS(TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time))
            ELSE 0
          END as hours_logged_seconds
        FROM task_timesheet tt
        WHERE tt.task_id = ?
        ORDER BY tt.start_time DESC
      `;
      
      const [results] = await connection.execute(query, [taskId]);
      res.json(results);
    } catch (err) {
      console.error('Error fetching task timesheet:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });

  // Get task summary (counts only - optimized for dashboard)
  router.get('/summary', async (req, res) => {
    const { user_id, role, employee_name, department, employee, search, status, priority, complexity, impact, effortEstimateLabel, unit, target, labels, assignedTo } = req.query;

    // Get user permissions from headers
    const userPermissions = req.headers['user-permissions'] ? JSON.parse(req.headers['user-permissions']) : [];
    const userRole = req.headers['user-role'] || role || 'employee';
    const userName = req.headers['user-name'] || employee_name || '';

    // Build WHERE clause (same logic as /api/tasks but only return counts)
    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN due_date < CURDATE() AND status != 'Completed' THEN 1 ELSE 0 END) as overdue
      FROM tasks
      WHERE 1=1
    `;
    const params = [];

    // Check permissions to determine what tasks user can see (same logic as /api/tasks)
    const hasViewOwnTasks = userPermissions.includes('view_own_tasks');
    const hasViewAllTasks = userPermissions.includes('view_tasks') || userPermissions.includes('all');
    const hasViewTasksContent = userPermissions.includes('view_tasks_content');
    const hasDwmView = userPermissions.includes('dwm_view');

    const isAdminUser = userRole === 'admin';
    const hasViewAllTasksPermission = userPermissions.includes('view_tasks') || userPermissions.includes('all');

    // If user only has view_own_tasks permission, filter by assigned_to
    if (hasViewOwnTasks && !hasViewAllTasksPermission && !isAdminUser && userName) {
      if (hasDwmView) {
        query += ' AND (assigned_to LIKE ? OR (assigned_to LIKE ? AND status != \'Completed\' AND (LOWER(IFNULL(labels,\'\')) LIKE \'%daily%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%weekly%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%monthly%\')))';
        params.push(`%${userName}%`, `%${userName}%`);
      } else {
        query += ' AND assigned_to LIKE ?';
        params.push(`%${userName}%`);
      }
    } else if (hasViewAllTasksPermission || isAdminUser) {
      // User can see all tasks
    } else if (hasViewTasksContent && !hasViewOwnTasks && !hasViewAllTasksPermission && !isAdminUser) {
      query += ' AND 1=0'; // Show no tasks
    } else {
      query += ' AND 1=0'; // Show no tasks
    }

    // Add search functionality
    if (search) {
      query += ' AND (title LIKE ? OR description LIKE ? OR assigned_to LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Add filter functionality (same as /api/tasks)
    if (department) {
      query += ' AND department = ?';
      params.push(department);
    }
    if (employee) {
      query += ' AND assigned_to LIKE ?';
      params.push(`%${employee}%`);
    }
    if (status) {
      const statusParts = String(status).split(',').map(s => s.trim()).filter(Boolean);
      if (statusParts.length === 1) {
        query += ' AND status = ?';
        params.push(statusParts[0]);
      } else if (statusParts.length > 1) {
        const placeholders = statusParts.map(() => '?').join(', ');
        query += ` AND status IN (${placeholders})`;
        params.push(...statusParts);
      }
    }
    if (priority) {
      query += ' AND priority = ?';
      params.push(priority);
    }
    if (complexity) {
      query += ' AND complexity = ?';
      params.push(complexity);
    }
    if (impact) {
      query += ' AND impact = ?';
      params.push(impact);
    }
    if (effortEstimateLabel) {
      query += ' AND effort_estimate_label = ?';
      params.push(effortEstimateLabel);
    }
    if (unit) {
      query += ' AND unit = ?';
      params.push(unit);
    }
    if (target) {
      query += ' AND target = ?';
      params.push(target);
    }
    if (labels) {
      const labelParts = String(labels)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      if (labelParts.length === 1) {
        query += ' AND labels LIKE ?';
        params.push(`%${labelParts[0]}%`);
      } else if (labelParts.length > 1) {
        const likeConditions = labelParts.map(() => 'labels LIKE ?').join(' OR ');
        query += ` AND (${likeConditions})`;
        for (const part of labelParts) {
          params.push(`%${part}%`);
        }
      }
    }
    if (assignedTo) {
      query += ' AND assigned_to LIKE ?';
      params.push(`%${assignedTo}%`);
    }

    try {
      const [results] = await mysqlPool.execute(query, params);
      res.json({
        total: results[0].total || 0,
        completed: results[0].completed || 0,
        in_progress: results[0].in_progress || 0,
        pending: results[0].pending || 0,
        overdue: results[0].overdue || 0
      });
    } catch (err) {
      console.error('Error fetching task summary:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

module.exports = router;