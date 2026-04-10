'use strict';

const jsonwebtoken = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

function signAccessToken(userId) {
  return jsonwebtoken.sign(
    { sub: userId },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function verifyAccessToken(token) {
  return jsonwebtoken.verify(token, config.jwtSecret);
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken };
