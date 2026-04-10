'use strict';

var express = require('express');
var router = express.Router();

router.get('/health/live', function (_req, res) {
  res.json({ status: 'ok' });
});

module.exports = router;
