'use strict';

const jwt = require('../services/jwt');

function requireAuth(req, res, next) {
  var header = req.headers.authorization || '';
  var token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    var payload = jwt.verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = requireAuth;
