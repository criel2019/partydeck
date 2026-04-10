'use strict';

var fetch = require('node-fetch');
var config = require('../../config');

function getAuthUrl(redirectUri, state) {
  var params = new URLSearchParams({
    client_id: config.naver.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: state,
  });
  return 'https://nid.naver.com/oauth2.0/authorize?' + params.toString();
}

async function exchangeCode(code, redirectUri, state) {
  var params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.naver.clientId,
    client_secret: config.naver.clientSecret,
    code: code,
    state: state,
  });
  var res = await fetch('https://nid.naver.com/oauth2.0/token?' + params.toString());
  var data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

async function getProfile(accessToken) {
  var res = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  var data = await res.json();
  if (data.resultcode !== '00') throw new Error('Naver profile fetch failed');
  var r = data.response || {};
  return {
    providerId: String(r.id),
    displayName: r.nickname || r.name || '',
    email: r.email || null,
    profileImage: r.profile_image || '',
  };
}

module.exports = { id: 'naver', name: '네이버', getAuthUrl, exchangeCode, getProfile };
