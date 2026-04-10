'use strict';

var fetch = require('node-fetch');
var config = require('../config');

var BASE_URL = 'https://api.portone.io';

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'PortOne ' + config.portone.apiSecret,
  };
}

async function preRegisterPayment(paymentId, totalAmount, currency) {
  var res = await fetch(BASE_URL + '/payments/' + encodeURIComponent(paymentId) + '/pre-register', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      storeId: config.portone.storeId,
      totalAmount: totalAmount,
      currency: currency || 'KRW',
    }),
  });
  if (!res.ok) {
    var err = await res.json().catch(function () { return {}; });
    throw new Error(err.message || 'PortOne pre-register failed: ' + res.status);
  }
  return res.json();
}

async function getPayment(paymentId) {
  var res = await fetch(BASE_URL + '/payments/' + encodeURIComponent(paymentId), {
    method: 'GET',
    headers: headers(),
  });
  if (!res.ok) {
    var err = await res.json().catch(function () { return {}; });
    throw new Error(err.message || 'PortOne getPayment failed: ' + res.status);
  }
  return res.json();
}

async function confirmPayment(paymentId) {
  var res = await fetch(BASE_URL + '/payments/' + encodeURIComponent(paymentId) + '/confirm', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ storeId: config.portone.storeId }),
  });
  if (!res.ok) {
    var err = await res.json().catch(function () { return {}; });
    throw new Error(err.message || 'PortOne confirm failed: ' + res.status);
  }
  return res.json();
}

module.exports = { preRegisterPayment, getPayment, confirmPayment };
