require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// ─── Database & Initialization ──────────────────────────────
const { checkMySQLHealth } = require('./config/database');
const { initializeDatabaseTables } = require('./db/init');

// ─── Express App Setup ──────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('build'));

// ─── Route Modules ──────────────────────────────────────────
app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/notices', require('./routes/notices'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/clet-notifications', require('./routes/cletNotifications'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/errors', require('./routes/errors'));
app.use('/api/appreciations', require('./routes/appreciations'));
app.use('/api/appreciation-types', require('./routes/appreciations').typesRouter);
app.use('/api/employees', require('./routes/employees'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/designations', require('./routes/designations'));
app.use('/api/labels', require('./routes/labels'));
app.use('/api/task-config', require('./routes/taskConfig'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/warning-letters', require('./routes/warningLetters'));
app.use('/api/warning-letter-types', require('./routes/warningLetters').typesRouter);
app.use('/api/employees', require('./routes/warningLetters').employeeRouter);
app.use('/api/health-settings', require('./routes/healthSettings'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/idle-accountability', require('./routes/idleAccountability'));
app.use('/api/admin', require('./routes/idleAccountability').adminRouter);
app.use('/api/wages', require('./routes/idleAccountability').wagesRouter);
// Note: Some route files may export additional sub-routers.
// For example, warningLetters.js also handles /api/warning-letter-types,
// leaves.js also handles /api/leave-types, etc.
// Mount those explicitly if they use different base paths:
//
// const warningLetterTypesRouter = require('./routes/warningLetterTypes');
// app.use('/api/warning-letter-types', warningLetterTypesRouter);

// ─── Static Assets ─────────────────────────────────────────
// Favicon
app.get('/favicon.ico', (req, res) => {
  // Look for favicon in common locations
  const faviconPath = path.join(__dirname, 'build', 'favicon.ico');
  if (fs.existsSync(faviconPath)) {
    res.sendFile(faviconPath);
  } else {
    // Return a default favicon or empty response
    res.status(204).send(); // No content
  }
});

// Web App Manifest
app.get('/manifest.json', (req, res) => {
  const manifestPath = path.join(__dirname, 'build', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    res.sendFile(manifestPath);
  } else {
    // Return a default manifest
    res.json({
      "short_name": "EMS",
      "name": "Employee Management System",
      "icons": [
        {
          "src": "favicon.ico",
          "sizes": "64x64 32x32 24x24 16x16",
          "type": "image/x-icon"
        }
      ],
      "start_url": ".",
      "display": "standalone",
      "theme_color": "#000000",
      "background_color": "#ffffff"
    });
  }
});

// ─── SPA Catch-All (MUST be last) ──────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// ─── Startup ────────────────────────────────────────────────
(async () => {
  // Initialize database tables & migrations
  await initializeDatabaseTables();

  // Health check
  console.log('🔍 Running initial health check...');
  const isHealthy = await checkMySQLHealth();
  console.log(isHealthy ? '✅ Initial health check passed' : '⚠️ Initial health check failed');

  // Start listening
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`   http://localhost:${PORT}`);
  });
})();
