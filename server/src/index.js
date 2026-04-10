'use strict';

var config = require('./config');
var express = require('express');
var cors = require('./middleware/cors');
var { migrate } = require('./db/migrate');

var healthRoutes = require('./routes/health');
var authRoutes = require('./routes/auth');
var paymentRoutes = require('./routes/payment');

var app = express();

// Middleware
app.use(cors);
app.use(express.json());

// Routes
app.use(healthRoutes);
app.use(authRoutes);
app.use(paymentRoutes);

// Global error handler
app.use(function (err, _req, res, _next) {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start
async function start() {
  try {
    await migrate();
  } catch (err) {
    console.error('[server] Migration failed:', err);
    process.exit(1);
  }

  app.listen(config.port, '0.0.0.0', function () {
    console.log('[server] PartyPlay server listening on port ' + config.port);
  });
}

start();
