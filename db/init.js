const { mysqlPool } = require('../config/database');

const initializeDatabaseTables = async () => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.query(
      "SET SESSION sql_mode = (SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))"
    );
    await connection.ping();

    // Create task_history table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS task_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        action VARCHAR(255) NOT NULL,
        description TEXT,
        user_name VARCHAR(255),
        user_id INT,
        old_value TEXT,
        new_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_task_id (task_id),
        INDEX idx_created_at (created_at)
      )
    `);

    // Create warning_letter_types table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS warning_letter_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        status ENUM('Active', 'Inactive') DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create warning_letters table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS warning_letters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        employee_name VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        warning_date DATE,
        severity ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_employee_id (employee_id),
        INDEX idx_warning_date (warning_date),
        INDEX idx_severity (severity),
        INDEX idx_created_at (created_at)
      )
    `);

    // Create task_configuration table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS task_configuration (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_type ENUM('scoring_weights', 'scoring_points') NOT NULL,
        config_data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_config_type (config_type)
      )
    `);

    // Add password column to employees table
    try {
      await connection.execute(`ALTER TABLE employees ADD COLUMN password VARCHAR(255) DEFAULT 'admin123'`);
      console.log('Password column added to employees table');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') console.error('Error adding password column:', err.message);
    }

    // Add file_links column to tasks table
    try {
      await connection.execute(`ALTER TABLE tasks ADD COLUMN file_links TEXT DEFAULT NULL`);
      console.log('file_links column added to tasks table');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') console.error('Error adding file_links column:', err.message);
    }

    // Add video_links column to tasks table
    try {
      await connection.execute(`ALTER TABLE tasks ADD COLUMN video_links TEXT DEFAULT NULL`);
      console.log('video_links column added to tasks table');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') console.error('Error adding video_links column:', err.message);
    }

    // Create leave management tables
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        department_id INT NULL,
        status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        reason TEXT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        start_segment ENUM('shift_start','shift_middle','full_day') NOT NULL DEFAULT 'full_day',
        end_segment ENUM('shift_middle','shift_end','full_day') NOT NULL DEFAULT 'full_day',
        days_requested DECIMAL(5,2) NOT NULL DEFAULT 1,
        is_paid TINYINT(1) NOT NULL DEFAULT 1,
        is_uninformed TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        decision_by INT NULL,
        decision_at DATETIME NULL,
        decision_reason TEXT,
        INDEX idx_leave_employee_id (employee_id),
        INDEX idx_leave_department_id (department_id),
        INDEX idx_leave_status (status),
        INDEX idx_leave_start_end_date (start_date, end_date)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        year INT NOT NULL,
        month INT NOT NULL,
        paid_quota INT NOT NULL DEFAULT 2,
        paid_used INT NOT NULL DEFAULT 0,
        uninformed_leaves INT NOT NULL DEFAULT 0,
        next_month_deduction INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_leave_balance_employee_month (employee_id, year, month),
        INDEX idx_leave_balance_employee_id (employee_id)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS leave_policies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        policy_key VARCHAR(100) NOT NULL UNIQUE,
        policy_value JSON NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS department_restricted_days (
        id INT AUTO_INCREMENT PRIMARY KEY,
        department_id INT NOT NULL,
        day_of_week TINYINT NOT NULL COMMENT '0=Sunday, 1=Monday, ... 6=Saturday',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_dept_day (department_id, day_of_week),
        INDEX idx_department_restricted_days_dept (department_id)
      )
    `);

    // Leave requests: add new columns (ignore if already exist)
    const leaveRequestNewColumns = [
      ['emergency_type', 'VARCHAR(100) NULL'],
      ['requested_swap_with_leave_id', 'INT NULL'],
      ['swap_responded_at', 'DATETIME NULL'],
      ['swap_accepted', 'TINYINT(1) NULL'],
      ['acknowledged_by', 'INT NULL'],
      ['acknowledged_at', 'DATETIME NULL'],
      ['is_important_date_override', 'TINYINT(1) NOT NULL DEFAULT 0'],
      ['policy_reason_detail', 'TEXT NULL'],
      ['expected_return_date', 'DATE NULL'],
      ['leave_type_id', 'INT NULL'],
      ['approved_via_swap', 'TINYINT(1) NOT NULL DEFAULT 0']
    ];
    for (const [colName, colDef] of leaveRequestNewColumns) {
      try {
        await connection.execute(`ALTER TABLE leave_requests ADD COLUMN ${colName} ${colDef}`);
        console.log(`leave_requests.${colName} added`);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
          console.error(`Error adding leave_requests.${colName}:`, err.message);
        }
      }
    }

    // Create errors table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS errors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NULL,
        employee_name VARCHAR(100) NOT NULL,
        task_id INT NULL,
        error_date DATE NULL,
        severity VARCHAR(20) NOT NULL,
        priority VARCHAR(20) NOT NULL,
        description TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_employee_id (employee_id),
        INDEX idx_task_id (task_id)
      )
    `);

    // Create idle accountability table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS idle_accountability (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NULL,
        employee_email VARCHAR(255) NULL,
        date DATE NOT NULL,
        idle_hours DECIMAL(10,4) NOT NULL,
        idle_minutes INT NOT NULL,
        threshold_minutes INT NOT NULL,
        status ENUM('pending','submitted','ticket_created','waived') NOT NULL DEFAULT 'pending',
        category VARCHAR(100) NULL,
        subcategory VARCHAR(100) NULL,
        reason_text TEXT NULL,
        ticket_id INT NULL,
        submitted_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_idle_emp_date (employee_id, date),
        INDEX idx_idle_date_status (date, status),
        INDEX idx_idle_status (status),
        INDEX idx_idle_employee_id (employee_id),
        INDEX idx_idle_employee_email (employee_email)
      )
    `);

    // Add indexes for tasks table - use proper MySQL syntax for older versions
    try {
      // Check if indexes already exist before creating them
      const existingIndexes = await connection.execute(`
        SELECT INDEX_NAME FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() AND table_name = 'tasks'
      `);
      
      const indexExists = (name) => existingIndexes[0].some(row => row.INDEX_NAME === name);

      if (!indexExists('idx_tasks_status')) {
        await connection.execute(`CREATE INDEX idx_tasks_status ON tasks(status)`);
      }
      if (!indexExists('idx_tasks_priority')) {
        await connection.execute(`CREATE INDEX idx_tasks_priority ON tasks(priority)`);
      }
      if (!indexExists('idx_tasks_department')) {
        await connection.execute(`CREATE INDEX idx_tasks_department ON tasks(department)`);
      }
      if (!indexExists('idx_tasks_complexity')) {
        await connection.execute(`CREATE INDEX idx_tasks_complexity ON tasks(complexity)`);
      }
      if (!indexExists('idx_tasks_impact')) {
        await connection.execute(`CREATE INDEX idx_tasks_impact ON tasks(impact)`);
      }
      if (!indexExists('idx_tasks_created_at')) {
        await connection.execute(`CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC)`);
      }
      if (!indexExists('idx_tasks_assigned_to')) {
        await connection.execute(`CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to(255))`);
      }
      if (!indexExists('idx_tasks_dept_status')) {
        await connection.execute(`CREATE INDEX idx_tasks_dept_status ON tasks(department, status)`);
      }
      if (!indexExists('idx_tasks_assigned_status')) {
        await connection.execute(`CREATE INDEX idx_tasks_assigned_status ON tasks(assigned_to(255), status)`);
      }

      console.log('✅ Database indexes created/verified for tasks table');
    } catch (err) {
      console.error('Error creating indexes:', err);
    }

    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = { initializeDatabaseTables };