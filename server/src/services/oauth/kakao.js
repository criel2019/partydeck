'use strict';

var fetch = require('node-fetch');
var config = require('../../config');

function getAuthUrl(redirectUri, state) {
  var params = new URLSearchParams({
    client_id: config.kakao.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: state,
    scope: 'profile_nickname,profile_image,account_email',
  });
  return 'https://kauth.kakao.com/oauth/authorize?' + params.toString();
}

async function exchangeCode(code, redirectUri) {
  var res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.kakao.clientId,
      client_secret: config.kakao.clientSecret,
      redirect_uri: redirectUri,
      code: code,
    }).toString(),
  });
  var data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Kakao token exchange failed');
  return data.access_token;
}

async function getProfile(accessToken) {
  var res = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  var data = await res.json();
  if (!res.ok) throw new Error('Kakao profile fetch failed');
  var account = data.kakao_account || {};
  var profile = account.profile || {};
  return {
    providerId: String(data.id),
    displayName: profile.nickname || '',
    email: account.email || null,
    profileImage: profile.profile_image_url || '',
  };
}

module.exports = { id: 'kakao', name: '카카오', getAuthUrl, exchangeCode, getProfile };
