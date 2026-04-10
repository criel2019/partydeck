'use strict';

var express = require('express');
var fs = require('fs');
var path = require('path');
var router = express.Router();

var config = require('../config');
var db = require('../db');
var jwtService = require('../services/jwt');
var cryptoService = require('../services/crypto');
var oauth = require('../services/oauth');
var requireAuth = require('../middleware/auth');

var authorizeHtml = fs.readFileSync(path.join(__dirname, '..', 'views', 'authorize.html'), 'utf8');
var callbackHtml = fs.readFileSync(path.join(__dirname, '..', 'views', 'callback.html'), 'utf8');

// ---------- GET /auth/providers ----------
router.get('/auth/providers', function (_req, res) {
  res.json(oauth.listProviders());
});

// ---------- GET /auth/authorize ----------
router.get('/auth/authorize', function (req, res) {
  var qs = new URLSearchParams({
    client: req.query.client || 'partyplay',
    returnTo: req.query.returnTo || '',
    responseMode: req.query.responseMode || 'fragment',
    state: req.query.state || '',
  }).toString();

  var html = authorizeHtml.replace(/\{\{queryString\}\}/g, qs);
  res.type('html').send(html);
});

// ---------- GET /auth/:provider ----------
router.get('/auth/:provider', function (req, res) {
  var providerName = req.params.provider;
  if (providerName === 'authorize' || providerName === 'providers' || providerName === 'token' || providerName === 'me') return;

  var provider;
  try { provider = oauth.getProvider(providerName); } catch (_e) {
    return res.status(400).json({ error: 'Unknown provider' });
  }

  var state = req.query.state || '';
  var returnTo = req.query.returnTo || '';
  var responseMode = req.query.responseMode || 'fragment';
  var clientId = req.query.client || 'partyplay';
  var origin = '';
  try { origin = new URL(returnTo).origin; } catch (_e) {}

  var redirectUri = config.serverBaseUrl + '/auth/' + providerName + '/callback';

  // Store pending OAuth state
  db.query(
    'INSERT INTO oauth_pending (state, provider, return_to, response_mode, client_id, origin) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (state) DO UPDATE SET provider=$2, return_to=$3, response_mode=$4, client_id=$5, origin=$6',
    [state, providerName, returnTo, responseMode, clientId, origin]
  ).then(function () {
    var authUrl = provider.getAuthUrl(redirectUri, state);
    res.redirect(authUrl);
  }).catch(function (err) {
    console.error('[auth] Failed to store OAuth state:', err);
    res.status(500).json({ error: 'Internal error' });
  });
});

// ---------- GET /auth/:provider/callback ----------
router.get('/auth/:provider/callback', async function (req, res) {
  var providerName = req.params.provider;
  var code = req.query.code || '';
  var state = req.query.state || '';
  var oauthError = req.query.error || '';

  // Look up pending state
  var pending;
  try {
    var result = await db.query('SELECT * FROM oauth_pending WHERE state = $1', [state]);
    pending = result.rows[0];
  } catch (err) {
    console.error('[auth] DB error looking up pending state:', err);
    return res.status(500).send('Internal error');
  }

  if (!pending) {
    return res.status(400).send('Invalid or expired state');
  }

  // Clean up pending state
  db.query('DELETE FROM oauth_pending WHERE state = $1', [state]).catch(function () {});

  var returnTo = pending.return_to;
  var responseMode = pending.response_mode;
  var origin = pending.origin;

  // If OAuth provider returned an error
  if (oauthError || !code) {
    return renderCallback(res, {
      mode: responseMode,
      code: '',
      state: state,
      error: oauthError || 'Authorization failed',
      origin: origin,
      returnTo: returnTo,
      message: '로그인에 실패했습니다.',
    });
  }

  try {
    var provider = oauth.getProvider(providerName);
    var redirectUri = config.serverBaseUrl + '/auth/' + providerName + '/callback';

    // Exchange code for provider access token
    var accessToken = await provider.exchangeCode(code, redirectUri, state);

    // Fetch profile from provider
    var profile = await provider.getProfile(accessToken);

    // Upsert user
    var upsertResult = await db.query(
      `INSERT INTO users (provider, provider_id, display_name, email, profile_image, last_login_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (provider, provider_id) DO UPDATE
       SET display_name = COALESCE(NULLIF($3, ''), users.display_name),
           email = COALESCE($4, users.email),
           profile_image = COALESCE(NULLIF($5, ''), users.profile_image),
           last_login_at = now()
       RETURNING id, created_at, last_login_at`,
      [providerName, profile.providerId, profile.displayName, profile.email, profile.profileImage]
    );
    var user = upsertResult.rows[0];
    var isNew = (user.created_at.getTime() === user.last_login_at.getTime());

    // Generate auth code
    var authCode = cryptoService.randomCode();
    var codeHash = cryptoService.hashToken(authCode);
    var expiresAt = new Date(Date.now() + config.authCodeTtlMinutes * 60 * 1000);

    await db.query(
      'INSERT INTO auth_codes (user_id, code_hash, state, return_to, response_mode, origin, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [user.id, codeHash, state, returnTo, responseMode, origin, expiresAt]
    );

    renderCallback(res, {
      mode: responseMode,
      code: authCode,
      state: state,
      error: '',
      origin: origin,
      returnTo: returnTo,
      message: '로그인 완료! 잠시만 기다려주세요...',
    });
  } catch (err) {
    console.error('[auth] OAuth callback error:', err);
    renderCallback(res, {
      mode: responseMode,
      code: '',
      state: state,
      error: err.message || 'Authentication failed',
      origin: origin,
      returnTo: returnTo,
      message: '로그인 중 오류가 발생했습니다.',
    });
  }
});

function renderCallback(res, data) {
  var html = callbackHtml
    .replace(/\{\{mode\}\}/g, data.mode || 'fragment')
    .replace(/\{\{code\}\}/g, data.code || '')
    .replace(/\{\{state\}\}/g, data.state || '')
    .replace(/\{\{error\}\}/g, (data.error || '').replace(/'/g, "\\'"))
    .replace(/\{\{origin\}\}/g, data.origin || '*')
    .replace(/\{\{returnTo\}\}/g, data.returnTo || '')
    .replace(/\{\{message\}\}/g, data.message || '');
  res.type('html').send(html);
}

// ---------- POST /auth/token/exchange ----------
router.post('/auth/token/exchange', async function (req, res) {
  var code = req.body.code || '';
  var clientId = req.body.clientId || '';

  if (!code) return res.status(400).json({ error: 'Missing code' });

  var codeHash = cryptoService.hashToken(code);

  try {
    var result = await db.query(
      'SELECT * FROM auth_codes WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now() LIMIT 1',
      [codeHash]
    );
    var authCode = result.rows[0];
    if (!authCode) return res.status(400).json({ error: 'Invalid or expired code' });

    // Mark as used
    await db.query('UPDATE auth_codes SET used_at = now() WHERE id = $1', [authCode.id]);

    // Get user
    var userResult = await db.query('SELECT * FROM users WHERE id = $1', [authCode.user_id]);
    var user = userResult.rows[0];
    if (!user) return res.status(400).json({ error: 'User not found' });

    // Check if new user (created within last 30 seconds)
    var isNewUser = (Date.now() - new Date(user.created_at).getTime()) < 30000;

    // Generate tokens
    var accessToken = jwtService.signAccessToken(user.id);
    var refreshToken = jwtService.generateRefreshToken();
    var refreshHash = cryptoService.hashToken(refreshToken);
    var refreshExpiresAt = new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000);

    await db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshHash, refreshExpiresAt]
    );

    // Update last login
    await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      refresh_expires_in: config.refreshTokenDays * 24 * 60 * 60,
      is_new_user: isNewUser,
      user: formatUser(user),
    });
  } catch (err) {
    console.error('[auth] Token exchange error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ---------- POST /auth/token/refresh ----------
router.post('/auth/token/refresh', async function (req, res) {
  var refreshToken = req.body.refreshToken || '';
  if (!refreshToken) return res.status(400).json({ error: 'Missing refreshToken' });

  var tokenHash = cryptoService.hashToken(refreshToken);

  try {
    var result = await db.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() LIMIT 1',
      [tokenHash]
    );
    var stored = result.rows[0];
    if (!stored) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    // Revoke old token (rotation)
    await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [stored.id]);

    // Get user
    var userResult = await db.query('SELECT * FROM users WHERE id = $1', [stored.user_id]);
    var user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Issue new tokens
    var accessToken = jwtService.signAccessToken(user.id);
    var newRefreshToken = jwtService.generateRefreshToken();
    var newRefreshHash = cryptoService.hashToken(newRefreshToken);
    var refreshExpiresAt = new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000);

    await db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, newRefreshHash, refreshExpiresAt]
    );

    await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

    res.json({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
      refresh_expires_in: config.refreshTokenDays * 24 * 60 * 60,
      is_new_user: false,
      user: formatUser(user),
    });
  } catch (err) {
    console.error('[auth] Token refresh error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ---------- POST /auth/token/revoke ----------
router.post('/auth/token/revoke', async function (req, res) {
  var refreshToken = req.body.refreshToken || '';
  if (refreshToken) {
    var tokenHash = cryptoService.hashToken(refreshToken);
    await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [tokenHash]).catch(function () {});
  }
  res.json({ ok: true });
});

// ---------- GET /auth/me ----------
router.get('/auth/me', requireAuth, async function (req, res) {
  try {
    var result = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    var user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(formatUser(user));
  } catch (err) {
    console.error('[auth] /auth/me error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

function formatUser(user) {
  return {
    id: user.id,
    display_name: user.display_name || '',
    email: user.email || '',
    profile_image: user.profile_image || '',
    last_login_at: user.last_login_at ? user.last_login_at.toISOString() : '',
  };
}

module.exports = router;
