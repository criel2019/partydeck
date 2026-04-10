'use strict';

var fetch = require('node-fetch');
var config = require('../../config');

function getAuthUrl(redirectUri, state) {
  var params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: state,
    access_type: 'offline',
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

async function exchangeCode(code, redirectUri) {
  var res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      code: code,
    }).toString(),
  });
  var data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Google token exchange failed');
  return data.access_token;
}

async function getProfile(accessToken) {
  var res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  var data = await res.json();
  if (!res.ok) throw new Error('Google profile fetch failed');
  return {
    providerId: String(data.id),
    displayName: data.name || '',
    email: data.email || null,
    profileImage: data.picture || '',
  };
}

module.exports = { id: 'google', name: 'Google', getAuthUrl, exchangeCode, getProfile };
