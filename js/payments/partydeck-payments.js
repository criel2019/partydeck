(function (global) {
  'use strict';

  if (!global.PaymentKit || !global.PARTYDECK_PAYMENT_CONFIG) {
    return;
  }

  var paymentKit = global.PaymentKit.createPaymentKit(
    global.PARTYDECK_PAYMENT_CONFIG
  );

  function byId(id) {
    return document.getElementById(id);
  }

  function showToastSafe(message) {
    if (typeof global.showToast === 'function') {
      global.showToast(message);
      return;
    }
    global.console.log(message);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function syncDiamondSummary() {
    var diamondBalance = byId('diamondShopBalance');
    var mainMenuDiamond = byId('mmDiamond');
    var currentDiamond = typeof global.getDiamond === 'function'
      ? global.getDiamond()
      : 0;

    if (diamondBalance) diamondBalance.textContent = formatNumber(currentDiamond);
    if (mainMenuDiamond) mainMenuDiamond.textContent = formatNumber(currentDiamond);

    var goldBalance = byId('diamondShopGoldBalance');
    if (goldBalance && typeof global.getEconomy === 'function') {
      goldBalance.textContent = formatNumber(global.getEconomy().gold || 0);
    }
  }

  function summarizeGrant(product) {
    var grants = product.grants || [];
    if (!grants.length) return product.description || '';
    return grants.map(function (grant) {
      if (grant.type === 'currency') {
        return '+' + grant.amount + ' ' + grant.key;
      }
      return grant.key;
    }).join(', ');
  }

  function getStatusChip(product) {
    if (!product.available) return product.availabilityReason || 'DISABLED';
    if (product.availabilityMode === 'debug') return 'WEB DEBUG';
    if (product.channels && product.channels.length === 1 && product.channels[0] === 'app') {
      return 'APP';
    }
    return 'LIVE';
  }

  function getEnvironmentNote() {
    if (paymentKit.environment.channel === 'app') {
      return 'App checkout ready. Attach a Capacitor billing bridge to go live.';
    }
    if (global.PARTYDECK_PAYMENT_CONFIG.webCheckout &&
        global.PARTYDECK_PAYMENT_CONFIG.webCheckout.enabled) {
      return 'Web checkout is wired to the hosted payment backend.';
    }
    if (global.PARTYDECK_PAYMENT_CONFIG.debugPurchasesOnWeb) {
      return 'Web debug checkout is enabled. Replace it with hosted checkout before release.';
    }
    return 'Web checkout is not configured yet.';
  }

  function setEnvironmentNote() {
    var note = byId('diamondShopPlatformNote');
    if (note) note.textContent = getEnvironmentNote();
  }

  function applyPurchases(purchases) {
    (purchases || []).forEach(function (purchase) {
      (purchase.grants || []).forEach(function (grant) {
        if (grant.type === 'currency' &&
            grant.key === 'diamond' &&
            typeof global.addDiamond === 'function') {
          global.addDiamond(grant.amount);
        }
      });
    });
    syncDiamondSummary();
  }

  function createProductButton(product) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.style.width = '100%';
    button.style.textAlign = 'left';
    button.style.padding = '14px 16px';
    button.style.display = 'flex';
    button.style.flexDirection = 'column';
    button.style.gap = '6px';

    if (!product.available) {
      button.disabled = true;
      button.style.opacity = '0.55';
      button.style.cursor = 'not-allowed';
    }

    var topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'center';
    topRow.style.justifyContent = 'space-between';
    topRow.style.gap = '10px';

    var title = document.createElement('strong');
    title.textContent = product.title;
    title.style.fontSize = '15px';

    var chip = document.createElement('span');
    chip.textContent = getStatusChip(product);
    chip.style.fontSize = '10px';
    chip.style.fontWeight = '800';
    chip.style.padding = '3px 8px';
    chip.style.borderRadius = '999px';
    chip.style.background = product.available && product.availabilityMode === 'debug'
      ? 'rgba(255, 193, 7, 0.18)'
      : (product.available ? 'rgba(0, 230, 118, 0.18)' : 'rgba(255,255,255,0.1)');
    chip.style.color = product.available && product.availabilityMode === 'debug'
      ? '#ffd54f'
      : (product.available ? '#69f0ae' : '#bbb');

    topRow.appendChild(title);
    topRow.appendChild(chip);

    var description = document.createElement('div');
    description.textContent = summarizeGrant(product);
    description.style.fontSize = '12px';
    description.style.opacity = '0.8';

    var price = document.createElement('div');
    price.textContent = product.available
      ? product.priceLabel
      : (product.availabilityReason || product.priceLabel);
    price.style.fontSize = '13px';
    price.style.fontWeight = '800';
    price.style.color = product.available ? '#ffffff' : '#ffb0b0';

    button.appendChild(topRow);
    button.appendChild(description);
    button.appendChild(price);

    if (product.available) {
      button.addEventListener('click', function () {
        global.PartyDeckPayments.purchaseProduct(product.id);
      });
    }

    return button;
  }

  function renderShop() {
    var list = byId('diamondShopProductList');
    if (!list) return;

    list.innerHTML = '';
    paymentKit.getProducts().forEach(function (product) {
      list.appendChild(createProductButton(product));
    });

    setEnvironmentNote();
    syncDiamondSummary();

    var restoreButton = byId('diamondShopRestoreBtn');
    if (restoreButton) {
      var hasRestoreTargets = paymentKit.getProducts().some(function (product) {
        return product.kind !== 'consumable';
      });
      restoreButton.style.display = hasRestoreTargets ? 'block' : 'none';
    }

    var cheatButton = byId('diamondShopGoldCheatBtn');
    var cheatHint = byId('diamondShopGoldCheatHint');
    var showCheat = paymentKit.environment.channel === 'web';
    if (cheatButton) cheatButton.style.display = showCheat ? 'block' : 'none';
    if (cheatHint) cheatHint.style.display = showCheat ? 'block' : 'none';

    var legacyButtons = document.querySelectorAll(
      '#diamondShopOverlay button[onclick^="buyDiamond"]'
    );
    legacyButtons.forEach(function (button) {
      button.style.display = 'none';
    });
  }

  function findProductByGrantAmount(amount) {
    return paymentKit.getProducts().find(function (product) {
      return (product.grants || []).some(function (grant) {
        return grant.type === 'currency' &&
          grant.key === 'diamond' &&
          grant.amount === amount;
      });
    }) || null;
  }

  async function purchaseProduct(productId) {
    var result = await paymentKit.purchase(productId, {
      surface: 'diamond-shop'
    });

    if (result && result.redirecting) {
      showToastSafe(result.message || 'Redirecting to checkout...');
      return result;
    }

    if (!result.ok) {
      showToastSafe(result.message || 'Purchase failed.');
      return result;
    }

    applyPurchases(result.purchases);

    var grantedParts = [];
    (result.purchases || []).forEach(function (purchase) {
      (purchase.grants || []).forEach(function (grant) {
        if (grant.type === 'currency') {
          grantedParts.push('+' + grant.amount + ' ' + grant.key);
          return;
        }
        grantedParts.push(grant.key);
      });
    });
    var grantedText = grantedParts.join(', ');

    showToastSafe(
      (result.mode === 'debug' ? 'Debug purchase complete' : 'Purchase complete') +
      (grantedText ? ': ' + grantedText : '')
    );
    renderShop();
    return result;
  }

  async function resumeWebCheckout() {
    if (paymentKit.environment.channel !== 'web') return null;

    var result = await paymentKit.resume({
      surface: 'diamond-shop'
    });

    if (!result || result.skipped) {
      return result;
    }

    if (!result.ok) {
      showToastSafe(result.message || 'Payment failed.');
      renderShop();
      return result;
    }

    applyPurchases(result.purchases);

    var grantedParts = [];
    (result.purchases || []).forEach(function (purchase) {
      (purchase.grants || []).forEach(function (grant) {
        if (grant.type === 'currency') {
          grantedParts.push('+' + grant.amount + ' ' + grant.key);
          return;
        }
        grantedParts.push(grant.key);
      });
    });

    showToastSafe(
      'Payment confirmed' + (grantedParts.length ? ': ' + grantedParts.join(', ') : '')
    );
    renderShop();
    return result;
  }

  async function purchaseByGrantAmount(amount) {
    var product = findProductByGrantAmount(amount);
    if (!product) {
      if (typeof global.addDiamond === 'function') {
        global.addDiamond(amount);
        syncDiamondSummary();
      }
      return {
        ok: true,
        mode: 'legacy'
      };
    }
    return purchaseProduct(product.id);
  }

  async function restorePurchases() {
    var result = await paymentKit.restore({
      surface: 'diamond-shop'
    });

    if (!result.ok) {
      showToastSafe(result.message || 'Restore failed.');
      return result;
    }

    applyPurchases(result.purchases);
    showToastSafe('Restore finished.');
    renderShop();
    return result;
  }

  function openShop() {
    renderShop();
    var overlay = byId('diamondShopOverlay');
    if (overlay) overlay.style.display = 'block';
  }

  paymentKit.on('purchase', syncDiamondSummary);
  paymentKit.on('restore', syncDiamondSummary);

  global.PartyDeckPayments = {
    environment: paymentKit.environment,
    getProducts: function () { return paymentKit.getProducts(); },
    getEntitlements: function () { return paymentKit.getEntitlements(); },
    openShop: openShop,
    renderShop: renderShop,
    purchaseProduct: purchaseProduct,
    purchaseByGrantAmount: purchaseByGrantAmount,
    restorePurchases: restorePurchases,
    resumeWebCheckout: resumeWebCheckout
  };

  async function initialize() {
    renderShop();
    await resumeWebCheckout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})(window);
