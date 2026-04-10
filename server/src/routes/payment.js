'use strict';

var express = require('express');
var crypto = require('crypto');
var router = express.Router();

var db = require('../db');
var config = require('../config');
var portone = require('../services/portone');
var products = require('../services/products');

// ---------- POST /api/payment-kit/web/create-session ----------
router.post('/api/payment-kit/web/create-session', async function (req, res) {
  var productId = req.body.productId || '';
  var returnUrl = req.body.returnUrl || '';

  var product = products.getProduct(productId);
  if (!product) {
    return res.json({ ok: false, message: 'Unknown product: ' + productId });
  }

  try {
    // Generate unique payment ID
    var paymentId = 'pp-' + crypto.randomUUID();

    // Store session in DB
    var sessionResult = await db.query(
      'INSERT INTO payment_sessions (product_id, portone_payment_id, amount, currency, return_url) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [productId, paymentId, product.amount, product.currency, returnUrl]
    );
    var sessionId = sessionResult.rows[0].id;

    // Pre-register expected amount with PortOne
    await portone.preRegisterPayment(paymentId, product.amount, product.currency);

    // Build redirect URL that includes session info in returnUrl
    var separator = returnUrl.indexOf('?') >= 0 ? '&' : '?';
    var fullReturnUrl = returnUrl + separator +
      'paymentSessionId=' + encodeURIComponent(sessionId) +
      '&paymentStatus=success';

    // Build PortOne checkout URL (client-side SDK redirect pattern)
    // The client will be redirected to this URL which loads PortOne's payment UI
    var checkoutUrl = config.serverBaseUrl + '/api/payment-kit/web/checkout?' +
      'sessionId=' + encodeURIComponent(sessionId) +
      '&paymentId=' + encodeURIComponent(paymentId) +
      '&returnUrl=' + encodeURIComponent(fullReturnUrl);

    res.json({
      ok: true,
      sessionId: sessionId,
      redirectUrl: checkoutUrl,
      message: 'Redirecting to checkout...',
    });
  } catch (err) {
    console.error('[payment] create-session error:', err);
    res.json({ ok: false, message: err.message || 'Failed to create checkout session' });
  }
});

// ---------- GET /api/payment-kit/web/checkout ----------
// Serves the PortOne payment SDK page
router.get('/api/payment-kit/web/checkout', async function (req, res) {
  var sessionId = req.query.sessionId || '';
  var paymentId = req.query.paymentId || '';
  var returnUrl = req.query.returnUrl || '';

  try {
    var result = await db.query('SELECT * FROM payment_sessions WHERE id = $1 AND status = $2', [sessionId, 'pending']);
    var session = result.rows[0];
    if (!session) return res.status(400).send('Invalid or expired session');

    var product = products.getProduct(session.product_id);
    var orderName = product ? product.title : 'PartyPlay Diamond';

    // Render PortOne checkout page
    res.type('html').send(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>결제 - PartyPlay</title>
<script src="https://cdn.portone.io/v2/browser-sdk.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Noto Sans KR',sans-serif;background:#0a0a12;color:#e8e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh}
.msg{text-align:center;font-size:15px;color:#7a7a9a}
</style>
</head>
<body>
<div class="msg">결제창을 불러오는 중...</div>
<script>
(async function() {
  try {
    var resp = await PortOne.requestPayment({
      storeId: ${JSON.stringify(config.portone.storeId)},
      channelKey: ${JSON.stringify(config.portone.channelKey)},
      paymentId: ${JSON.stringify(paymentId)},
      orderName: ${JSON.stringify(orderName)},
      totalAmount: ${session.amount},
      currency: "CURRENCY_KRW",
      payMethod: "CARD",
      redirectUrl: ${JSON.stringify(returnUrl)},
    });
    if (resp.code) {
      // User cancelled or error
      var failUrl = ${JSON.stringify(returnUrl)}.replace('paymentStatus=success', 'paymentStatus=fail');
      failUrl += '&code=' + encodeURIComponent(resp.code) + '&message=' + encodeURIComponent(resp.message || '');
      window.location.replace(failUrl);
    }
    // On mobile, redirect happens automatically via redirectUrl
  } catch (err) {
    document.querySelector('.msg').textContent = '결제 오류: ' + (err.message || err);
  }
})();
</script>
</body>
</html>`);
  } catch (err) {
    console.error('[payment] checkout page error:', err);
    res.status(500).send('Internal error');
  }
});

// ---------- POST /api/payment-kit/web/confirm-session ----------
router.post('/api/payment-kit/web/confirm-session', async function (req, res) {
  var sessionId = req.body.sessionId || '';
  var status = (req.body.status || '').toLowerCase();

  if (!sessionId) {
    return res.json({ ok: false, message: 'Missing sessionId' });
  }

  try {
    // Load session
    var sessionResult = await db.query('SELECT * FROM payment_sessions WHERE id = $1', [sessionId]);
    var session = sessionResult.rows[0];
    if (!session) {
      return res.json({ ok: false, message: 'Session not found' });
    }
    if (session.status === 'confirmed') {
      // Already confirmed — return existing purchase
      var existingPurchase = await db.query('SELECT * FROM purchases WHERE session_id = $1 LIMIT 1', [sessionId]);
      if (existingPurchase.rows[0]) {
        var ep = existingPurchase.rows[0];
        return res.json({
          ok: true,
          productId: ep.product_id,
          transactionId: ep.transaction_id,
          purchases: [{
            productId: ep.product_id,
            transactionId: ep.transaction_id,
            grants: JSON.parse(JSON.stringify(ep.grants_json)),
          }],
        });
      }
    }

    // Check status
    var failStatuses = ['fail', 'failed', 'cancel', 'canceled'];
    if (failStatuses.indexOf(status) >= 0) {
      await db.query('UPDATE payment_sessions SET status = $1 WHERE id = $2', ['failed', sessionId]);
      return res.json({ ok: false, message: req.body.query && req.body.query.message || 'Payment was canceled' });
    }

    // Verify with PortOne
    var paymentId = session.portone_payment_id;
    if (!paymentId) {
      return res.json({ ok: false, message: 'No payment ID linked to session' });
    }

    var payment = await portone.getPayment(paymentId);

    // Verify payment status and amount
    if (!payment || payment.status !== 'PAID') {
      await db.query('UPDATE payment_sessions SET status = $1 WHERE id = $2', ['failed', sessionId]);
      return res.json({ ok: false, message: 'Payment not completed. Status: ' + (payment && payment.status || 'unknown') });
    }

    var paidAmount = payment.amount && payment.amount.total ? payment.amount.total : 0;
    if (paidAmount < session.amount) {
      await db.query('UPDATE payment_sessions SET status = $1 WHERE id = $2', ['failed', sessionId]);
      return res.json({ ok: false, message: 'Amount mismatch: expected ' + session.amount + ', got ' + paidAmount });
    }

    // Confirm session
    await db.query('UPDATE payment_sessions SET status = $1, confirmed_at = now() WHERE id = $2', ['confirmed', sessionId]);

    // Get product grants
    var product = products.getProduct(session.product_id);
    var grants = product ? product.grants : [];

    // Insert purchase record
    var transactionId = paymentId;
    await db.query(
      'INSERT INTO purchases (session_id, product_id, transaction_id, grants_json) VALUES ($1,$2,$3,$4)',
      [sessionId, session.product_id, transactionId, JSON.stringify(grants)]
    );

    res.json({
      ok: true,
      productId: session.product_id,
      transactionId: transactionId,
      purchases: [{
        productId: session.product_id,
        transactionId: transactionId,
        grants: grants,
      }],
    });
  } catch (err) {
    console.error('[payment] confirm-session error:', err);
    res.json({ ok: false, message: err.message || 'Failed to confirm payment' });
  }
});

module.exports = router;
