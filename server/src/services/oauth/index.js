'use strict';

var kakao = require('./kakao');
var naver = require('./naver');
var google = require('./google');

var providers = { kakao: kakao, naver: naver, google: google };

function getProvider(name) {
  var p = providers[name];
  if (!p) throw new Error('Unknown provider: ' + name);
  return p;
}

function listProviders() {
  return Object.values(providers).map(function (p) {
    return { id: p.id, name: p.name };
  });
}

module.exports = { getProvider, listProviders };
