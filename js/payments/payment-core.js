(function (global) {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function createEmitter() {
    var listeners = {};
    return {
      on: function (eventName, handler) {
        if (!listeners[eventName]) listeners[eventName] = [];
        listeners[eventName].push(handler);
        return function () {
          listeners[eventName] = (listeners[eventName] || []).filter(function (item) {
            return item !== handler;
          });
        };
      },
      emit: function (eventName, payload) {
        (listeners[eventName] || []).forEach(function (handler) {
          try {
            handler(payload);
          } catch (error) {
            setTimeout(function () {
              throw error;
            }, 0);
          }
        });
      }
    };
  }

  function detectEnvironment() {
    var cap = global.Capacitor;
    var ua = (global.navigator && global.navigator.userAgent) || '';
    var capPlatform = cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : '';
    var os = capPlatform ||
      (/Android/i.test(ua) ? 'android' : (/iPhone|iPad|iPod/i.test(ua) ? 'ios' : 'web'));
    var runtime = capPlatform === 'ios' || capPlatform === 'android' ? 'capacitor' : 'browser';
    return {
      runtime: runtime,
      os: os,
      channel: runtime === 'capacitor' ? 'app' : 'web',
      key: runtime === 'capacitor' ? os : 'web'
    };
  }

  function createStorage(projectKey) {
    var prefix = 'payment-kit:' + projectKey + ':';
    return {
      getJson: function (key, fallback) {
        try {
          var raw = global.localStorage.getItem(prefix + key);
          return raw ? JSON.parse(raw) : fallback;
        } catch (_error) {
          return fallback;
        }
      },
      setJson: function (key, value) {
        global.localStorage.setItem(prefix + key, JSON.stringify(value));
      }
    };
  }

  function requestJson(url, options) {
    return global.fetch(url, options).then(function (response) {
      return response.text().then(function (text) {
        var parsed = {};
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch (_error) {
            parsed = { ok: false, message: text };
          }
        }

        if (response.ok) {
          return parsed;
        }

        return Promise.reject(new Error(parsed.message || ('Request failed: ' + response.status)));
      });
    });
  }

  function clearUrlParams(paramNames) {
    if (!global.history || typeof global.history.replaceState !== 'function') {
      return;
    }

    var nextUrl = new URL(global.location.href);
    paramNames.forEach(function (name) {
      nextUrl.searchParams.delete(name);
    });
    global.history.replaceState({}, global.document.title, nextUrl.pathname + nextUrl.search + nextUrl.hash);
  }

  function createUnavailableProvider(message) {
    return {
      name: 'unavailable',
      purchase: function () {
        return Promise.resolve({
          ok: false,
          message: message || 'Payments are not available in this environment.'
        });
      },
      restore: function () {
        return Promise.resolve({
          ok: false,
          message: message || 'Restore is not available in this environment.',
          purchases: []
        });
      },
      resume: function () {
        return Promise.resolve({
          ok: false,
          skipped: true,
          message: message || 'Resume is not available in this environment.'
        });
      }
    };
  }

  function createLocalDebugProvider(options) {
    var opts = options || {};
    var prefix = opts.receiptPrefix || 'debug';
    return {
      name: 'local-debug',
      purchase: function (request) {
        var transactionId = prefix + '-' + Date.now();
        return Promise.resolve({
          ok: true,
          mode: 'debug',
          transactionId: transactionId,
          purchases: [
            {
              productId: request.product.id,
              transactionId: transactionId,
              grants: clone(request.product.grants || [])
            }
          ]
        });
      },
      restore: function () {
        return Promise.resolve({
          ok: true,
          mode: 'debug',
          purchases: []
        });
      },
      resume: function () {
        return Promise.resolve({
          ok: false,
          skipped: true,
          message: 'Debug checkout does not use redirect resume.'
        });
      }
    };
  }

  function createCapacitorBridgeProvider(options) {
    var opts = options || {};
    var bridgeName = opts.bridgeName || 'PaymentBridge';
    var fallback = opts.fallback || createUnavailableProvider('Capacitor payment bridge is missing.');

    function getBridge() {
      if (global.Capacitor &&
          global.Capacitor.Plugins &&
          global.Capacitor.Plugins[bridgeName]) {
        return global.Capacitor.Plugins[bridgeName];
      }
      if (global[bridgeName]) return global[bridgeName];
      return null;
    }

    return {
      name: 'capacitor-bridge',
      purchase: function (request) {
        var bridge = getBridge();
        if (!bridge || typeof bridge.purchase !== 'function') {
          return fallback.purchase(request);
        }
        return Promise.resolve(bridge.purchase({
          productId: request.product.id,
          storeIds: request.product.storeIds || {},
          product: request.product,
          environment: request.environment
        }));
      },
      restore: function (request) {
        var bridge = getBridge();
        if (!bridge || typeof bridge.restore !== 'function') {
          return fallback.restore(request);
        }
        return Promise.resolve(bridge.restore({
          environment: request.environment
        }));
      },
      resume: function () {
        return Promise.resolve({
          ok: false,
          skipped: true,
          message: 'Capacitor bridge checkout does not use redirect resume.'
        });
      }
    };
  }

  function createHostedCheckoutProvider(options) {
    var opts = options || {};
    var storageKey = opts.storageKey || 'payment-kit:pending-web-checkout';
    var sessionQueryKey = opts.sessionQueryKey || 'paymentSessionId';
    var statusQueryKey = opts.statusQueryKey || 'paymentStatus';
    var cleanParams = Array.isArray(opts.cleanParams) ? opts.cleanParams : [
      sessionQueryKey,
      statusQueryKey,
      'paymentKey',
      'orderId',
      'amount',
      'code',
      'message'
    ];
    var successStatuses = Array.isArray(opts.successStatuses)
      ? opts.successStatuses
      : ['success', 'authorized', 'confirmed'];
    var failedStatuses = Array.isArray(opts.failedStatuses)
      ? opts.failedStatuses
      : ['fail', 'failed', 'cancel', 'canceled'];
    var requestHeaders = Object.assign({
      'Content-Type': 'application/json'
    }, opts.headers || {});

    function readPendingSession() {
      try {
        var raw = global.localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
      } catch (_error) {
        return null;
      }
    }

    function writePendingSession(session) {
      global.localStorage.setItem(storageKey, JSON.stringify(session));
    }

    function clearPendingSession() {
      global.localStorage.removeItem(storageKey);
    }

    function getReturnUrl() {
      if (typeof opts.returnUrl === 'function') {
        return opts.returnUrl();
      }
      if (typeof opts.returnUrl === 'string' && opts.returnUrl) {
        return opts.returnUrl;
      }
      return global.location.origin + global.location.pathname + global.location.hash;
    }

    function serializeQuery(searchParams) {
      var query = {};
      searchParams.forEach(function (value, key) {
        query[key] = value;
      });
      return query;
    }

    return {
      name: 'hosted-checkout',
      purchase: function (request) {
        if (!opts.createSessionUrl) {
          return Promise.resolve({
            ok: false,
            message: 'Web checkout create-session endpoint is not configured.'
          });
        }

        var payload = {
          projectKey: opts.projectKey || '',
          productId: request.product.id,
          product: request.product,
          environment: request.environment,
          context: request.context || {},
          currentUrl: global.location.href,
          returnUrl: getReturnUrl()
        };

        return requestJson(opts.createSessionUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(payload)
        }).then(function (result) {
          if (!result || result.ok === false) {
            return result || {
              ok: false,
              message: 'Failed to create a checkout session.'
            };
          }

          var redirectUrl = result.redirectUrl || result.checkoutUrl || result.url;
          if (!redirectUrl) {
            return {
              ok: false,
              message: 'Checkout session did not return a redirect URL.'
            };
          }

          writePendingSession({
            sessionId: result.sessionId || null,
            productId: request.product.id,
            product: request.product,
            createdAt: Date.now()
          });

          global.location.assign(redirectUrl);
          return {
            ok: false,
            redirecting: true,
            mode: 'redirect',
            message: result.message || 'Redirecting to checkout...'
          };
        }).catch(function (error) {
          return {
            ok: false,
            message: error.message || 'Failed to open checkout.'
          };
        });
      },
      restore: function () {
        return Promise.resolve({
          ok: false,
          message: 'Restore is not available for web checkout.'
        });
      },
      resume: function (request) {
        if (!opts.confirmSessionUrl) {
          return Promise.resolve({
            ok: false,
            skipped: true,
            message: 'Web checkout confirm-session endpoint is not configured.'
          });
        }

        var search = new URLSearchParams(global.location.search || '');
        var sessionId = search.get(sessionQueryKey);
        if (!sessionId) {
          return Promise.resolve({
            ok: false,
            skipped: true,
            message: 'No checkout return found.'
          });
        }

        var status = (search.get(statusQueryKey) || '').toLowerCase();
        if (status && failedStatuses.indexOf(status) >= 0) {
          clearPendingSession();
          clearUrlParams(cleanParams);
          return Promise.resolve({
            ok: false,
            skipped: false,
            code: search.get('code') || '',
            message: search.get('message') || 'Payment was canceled.'
          });
        }

        if (status && successStatuses.indexOf(status) < 0 && !opts.allowUnknownStatus) {
          clearUrlParams(cleanParams);
          return Promise.resolve({
            ok: false,
            skipped: false,
            message: 'Unknown payment status: ' + status
          });
        }

        return requestJson(opts.confirmSessionUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify({
            projectKey: opts.projectKey || '',
            sessionId: sessionId,
            status: status || 'success',
            query: serializeQuery(search),
            pendingSession: readPendingSession(),
            environment: request.environment,
            context: request.context || {}
          })
        }).then(function (result) {
          clearUrlParams(cleanParams);
          if (result && result.ok) {
            clearPendingSession();
          }
          return result;
        }).catch(function (error) {
          clearUrlParams(cleanParams);
          return {
            ok: false,
            message: error.message || 'Failed to confirm the payment.'
          };
        });
      }
    };
  }

  function normalizePurchaseEntries(result, product) {
    if (!result || !result.ok) return [];
    if (Array.isArray(result.purchases)) return clone(result.purchases);
    return [
      {
        productId: product.id,
        transactionId: result.transactionId || ('purchase-' + Date.now()),
        grants: clone(result.grants || product.grants || [])
      }
    ];
  }

  function extractEntitlements(entries) {
    var entitlements = {};
    entries.forEach(function (entry) {
      (entry.grants || []).forEach(function (grant) {
        if (grant.type !== 'entitlement') return;
        entitlements[grant.key] = {
          key: grant.key,
          sourceProductId: entry.productId,
          grantedAt: Date.now()
        };
      });
    });
    return entitlements;
  }

  function defaultAvailabilityResolver(product, environment) {
    var channelAllowed = !Array.isArray(product.channels) || product.channels.indexOf(environment.channel) >= 0;
    var platformAllowed = !Array.isArray(product.platforms) ||
      product.platforms.indexOf(environment.os) >= 0 ||
      product.platforms.indexOf(environment.channel) >= 0;

    if (channelAllowed && platformAllowed) {
      return {
        available: true,
        mode: 'live',
        reason: ''
      };
    }

    return {
      available: false,
      mode: 'disabled',
      reason: product.disabledReason || 'This product is not enabled on this platform.'
    };
  }

  function createPaymentKit(config) {
    if (!config || !config.projectKey) {
      throw new Error('PaymentKit requires a projectKey.');
    }

    var emitter = createEmitter();
    var environment = detectEnvironment();
    var storage = createStorage(config.projectKey);
    var catalog = Array.isArray(config.products) ? clone(config.products) : [];
    var history = storage.getJson('purchase-history', []);
    var entitlements = storage.getJson('entitlements', {});
    var availabilityResolver = config.resolveProductAvailability || defaultAvailabilityResolver;
    var provider = config.providerFactory
      ? config.providerFactory(environment, {
          createUnavailableProvider: createUnavailableProvider,
          createLocalDebugProvider: createLocalDebugProvider,
          createCapacitorBridgeProvider: createCapacitorBridgeProvider,
          createHostedCheckoutProvider: createHostedCheckoutProvider,
          requestJson: requestJson
        })
      : createUnavailableProvider('No payment provider has been configured.');

    function inspectProduct(product) {
      var state = availabilityResolver(product, environment, config) || {};
      return Object.assign({}, product, {
        available: !!state.available,
        availabilityMode: state.mode || (state.available ? 'live' : 'disabled'),
        availabilityReason: state.reason || ''
      });
    }

    function getProduct(productId) {
      var product = catalog.find(function (item) {
        return item.id === productId;
      });
      return product ? inspectProduct(product) : null;
    }

    function getProducts() {
      return catalog.map(inspectProduct);
    }

    function persist() {
      storage.setJson('purchase-history', history);
      storage.setJson('entitlements', entitlements);
    }

    function mergePurchaseEntries(entries) {
      if (!Array.isArray(entries) || !entries.length) return;

      var nextEntries = entries.filter(function (entry) {
        return !history.some(function (saved) {
          return saved.productId === entry.productId &&
            saved.transactionId === entry.transactionId;
        });
      });

      if (!nextEntries.length) return;

      history = history.concat(nextEntries.map(function (entry) {
        return Object.assign({
          capturedAt: Date.now()
        }, clone(entry));
      }));
      entitlements = Object.assign({}, entitlements, extractEntitlements(nextEntries));
      persist();
    }

    async function purchase(productId, context) {
      var product = getProduct(productId);
      if (!product) {
        return {
          ok: false,
          message: 'Unknown product: ' + productId
        };
      }

      if (!product.available) {
        return {
          ok: false,
          message: product.availabilityReason || 'This product is not available here.',
          product: product
        };
      }

      var result = await provider.purchase({
        product: product,
        environment: environment,
        context: context || {}
      });

      if (!result || !result.ok) {
        return result;
      }

      var entries = normalizePurchaseEntries(result, product);
      mergePurchaseEntries(entries);

      var payload = Object.assign({}, result, {
        product: product,
        purchases: entries,
        entitlements: clone(entitlements)
      });
      emitter.emit('purchase', payload);
      return payload;
    }

    async function restore(context) {
      var result = await provider.restore({
        environment: environment,
        context: context || {}
      });
      var entries = normalizePurchaseEntries(result, {
        id: 'restore',
        grants: []
      });
      mergePurchaseEntries(entries);
      var payload = Object.assign({}, result, {
        purchases: entries,
        entitlements: clone(entitlements)
      });
      emitter.emit('restore', payload);
      return payload;
    }

    async function resume(context) {
      if (!provider || typeof provider.resume !== 'function') {
        return {
          ok: false,
          skipped: true,
          message: 'Resume is not available in this environment.'
        };
      }

      var result = await provider.resume({
        environment: environment,
        context: context || {}
      });

      if (!result || result.skipped) {
        return result || {
          ok: false,
          skipped: true,
          message: 'No pending checkout found.'
        };
      }

      if (!result.ok) {
        return result;
      }

      var product = result.productId ? getProduct(result.productId) : null;
      var entries = normalizePurchaseEntries(result, product || {
        id: result.productId || 'external',
        grants: []
      });
      mergePurchaseEntries(entries);

      var payload = Object.assign({}, result, {
        product: product,
        purchases: entries,
        entitlements: clone(entitlements)
      });
      emitter.emit('purchase', payload);
      return payload;
    }

    return {
      config: clone(config),
      environment: environment,
      getProducts: getProducts,
      getProduct: getProduct,
      getPurchaseHistory: function () { return clone(history); },
      getEntitlements: function () { return clone(entitlements); },
      hasEntitlement: function (key) { return !!entitlements[key]; },
      purchase: purchase,
      restore: restore,
      resume: resume,
      on: emitter.on
    };
  }

  global.PaymentKit = {
    createPaymentKit: createPaymentKit,
    detectEnvironment: detectEnvironment,
    createUnavailableProvider: createUnavailableProvider,
    createLocalDebugProvider: createLocalDebugProvider,
    createCapacitorBridgeProvider: createCapacitorBridgeProvider,
    createHostedCheckoutProvider: createHostedCheckoutProvider,
    requestJson: requestJson,
    clearUrlParams: clearUrlParams
  };
})(window);
