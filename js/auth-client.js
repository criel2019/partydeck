(function (window, document) {
  'use strict';

  function normalizeBaseUrl(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function randomString() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (value) {
        return value.toString(16).padStart(2, '0');
      }).join('');
    }

    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function openPopup(url) {
    return window.open(
      url,
      'partydeck-auth',
      'popup=yes,width=520,height=720,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes,status=no'
    );
  }

  function decodeJwtPayload(token) {
    var parts = String(token || '').split('.');
    if (parts.length !== 3) {
      return null;
    }

    var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    var padded = payload + '='.repeat((4 - (payload.length % 4 || 4)) % 4);

    try {
      return JSON.parse(window.atob(padded));
    } catch (_error) {
      return null;
    }
  }

  function createClient(options) {
    var config = Object.assign(
      {
        authBaseUrl: window.location.origin,
        clientId: 'partydeck',
        storage: 'session',
        returnTo: window.location.origin + window.location.pathname + window.location.search,
        popupTimeoutMs: 5 * 60 * 1000
      },
      options || {}
    );

    config.authBaseUrl = normalizeBaseUrl(config.authBaseUrl);

    var authOrigin = new URL(config.authBaseUrl).origin;
    var storage = config.storage === 'local' ? window.localStorage : window.sessionStorage;
    var tokenStorageKey = 'partydeck.auth.tokens.' + config.clientId;
    var stateStorageKey = 'partydeck.auth.state.' + config.clientId;
    var cachedSession = null;

    function readStoredSession() {
      var raw = storage.getItem(tokenStorageKey);
      if (!raw) {
        return null;
      }

      try {
        return JSON.parse(raw);
      } catch (_error) {
        storage.removeItem(tokenStorageKey);
        return null;
      }
    }

    function writeStoredSession(session) {
      cachedSession = session;
      storage.setItem(tokenStorageKey, JSON.stringify(session));
    }

    function clearStoredSession() {
      cachedSession = null;
      storage.removeItem(tokenStorageKey);
    }

    function getCachedSession() {
      if (!cachedSession) {
        cachedSession = readStoredSession();
      }

      return cachedSession;
    }

    function setPendingState(state) {
      storage.setItem(stateStorageKey, state);
    }

    function getPendingState() {
      return storage.getItem(stateStorageKey);
    }

    function clearPendingState() {
      storage.removeItem(stateStorageKey);
    }

    function isAccessTokenFresh(session, skewSec) {
      if (!session || !session.accessToken || !session.expiresAt) {
        return false;
      }

      var nowSec = Math.floor(Date.now() / 1000);
      return session.expiresAt - nowSec > (skewSec || 30);
    }

    function buildAuthorizeUrl(responseMode, provider) {
      var params = new URLSearchParams();
      var state = randomString();

      params.set('client', config.clientId);
      params.set('returnTo', config.returnTo);
      params.set('responseMode', responseMode);
      params.set('state', state);

      setPendingState(state);

      return {
        state: state,
        url: config.authBaseUrl + (provider ? '/auth/' + provider : '/auth/authorize') + '?' + params.toString()
      };
    }

    function parseHashResult() {
      var hash = window.location.hash ? window.location.hash.slice(1) : '';
      if (!hash) {
        return null;
      }

      var params = new URLSearchParams(hash);
      var authCode = params.get('auth_code');
      var authError = params.get('auth_error');
      var state = params.get('state');

      if (!authCode && !authError) {
        return null;
      }

      window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      return {
        code: authCode,
        error: authError,
        state: state
      };
    }

    async function postJson(path, body, accessToken) {
      var headers = {
        'Content-Type': 'application/json'
      };

      if (accessToken) {
        headers.Authorization = 'Bearer ' + accessToken;
      }

      var response = await fetch(new URL(path, config.authBaseUrl + '/').toString(), {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: headers,
        body: JSON.stringify(body)
      });

      var payload = await response.json().catch(function () {
        return { error: 'Invalid JSON response' };
      });

      if (!response.ok) {
        throw new Error(payload.error || 'Request failed');
      }

      return payload;
    }

    async function fetchJson(path, accessToken) {
      var headers = {};

      if (accessToken) {
        headers.Authorization = 'Bearer ' + accessToken;
      }

      var response = await fetch(new URL(path, config.authBaseUrl + '/').toString(), {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: headers
      });

      var payload = await response.json().catch(function () {
        return { error: 'Invalid JSON response' };
      });

      if (!response.ok) {
        throw new Error(payload.error || 'Request failed');
      }

      return payload;
    }

    function persistTokenPayload(payload) {
      var accessPayload = decodeJwtPayload(payload.access_token);
      var session = {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        tokenType: payload.token_type,
        expiresAt: accessPayload && accessPayload.exp ? accessPayload.exp : null,
        refreshExpiresIn: payload.refresh_expires_in,
        isNewUser: !!payload.is_new_user,
        user: payload.user || null
      };

      writeStoredSession(session);
      return session;
    }

    async function exchangeCode(code) {
      var payload = await postJson('/auth/token/exchange', {
        code: code,
        clientId: config.clientId
      });

      clearPendingState();
      return persistTokenPayload(payload);
    }

    async function refresh() {
      var session = getCachedSession();
      if (!session || !session.refreshToken) {
        clearStoredSession();
        return null;
      }

      try {
        return persistTokenPayload(await postJson('/auth/token/refresh', {
          refreshToken: session.refreshToken,
          clientId: config.clientId
        }));
      } catch (_error) {
        clearStoredSession();
        clearPendingState();
        return null;
      }
    }

    async function ensureSession() {
      var redirectResult = parseHashResult();
      if (redirectResult) {
        if (redirectResult.error) {
          clearPendingState();
          throw new Error(redirectResult.error);
        }

        var expectedState = getPendingState();
        if (expectedState && redirectResult.state && redirectResult.state !== expectedState) {
          clearPendingState();
          throw new Error('State mismatch');
        }

        return exchangeCode(redirectResult.code);
      }

      var session = getCachedSession();
      if (isAccessTokenFresh(session)) {
        return session;
      }

      return refresh();
    }

    function waitForPopupResult(popup, expectedState) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timeoutId = null;
        var pollId = null;

        function cleanup() {
          window.removeEventListener('message', onMessage);
          if (timeoutId) {
            window.clearTimeout(timeoutId);
          }
          if (pollId) {
            window.clearInterval(pollId);
          }
        }

        function settle(fn, value) {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          fn(value);
        }

        function onMessage(event) {
          if (event.origin !== authOrigin) {
            return;
          }

          var data = event.data || {};
          if (data.state !== expectedState) {
            return;
          }

          if (data.type === 'partydeck-auth:error') {
            clearPendingState();
            settle(reject, new Error(data.error || 'Authentication failed'));
            return;
          }

          if (data.type === 'partydeck-auth:code' && data.code) {
            exchangeCode(data.code).then(
              function (session) {
                settle(resolve, session);
              },
              function (error) {
                settle(reject, error);
              }
            );
          }
        }

        timeoutId = window.setTimeout(function () {
          settle(reject, new Error('Authentication timed out'));
        }, config.popupTimeoutMs);

        pollId = window.setInterval(function () {
          if (!popup || popup.closed) {
            settle(reject, new Error('Authentication window closed'));
          }
        }, 500);

        window.addEventListener('message', onMessage);
      });
    }

    async function login(options) {
      var provider = options && options.provider ? options.provider : null;
      var preferRedirect = options && options.redirect === true;

      if (!preferRedirect) {
        var popupTarget = buildAuthorizeUrl('web_message', provider);
        var popup = openPopup(popupTarget.url);
        if (popup) {
          popup.focus();
          return waitForPopupResult(popup, popupTarget.state);
        }
      }

      var redirectTarget = buildAuthorizeUrl('fragment', provider);
      window.location.assign(redirectTarget.url);
      return null;
    }

    async function fetchCurrentUser() {
      var session = await ensureSession();
      if (!session || !session.accessToken) {
        return null;
      }

      try {
        var user = await fetchJson('/auth/me', session.accessToken);
        session.user = {
          id: user.id,
          display_name: user.display_name,
          email: user.email,
          profile_image: user.profile_image,
          last_login_at: user.last_login_at
        };
        writeStoredSession(session);
        return session.user;
      } catch (_error) {
        return null;
      }
    }

    async function logout() {
      var session = getCachedSession();
      if (session && session.refreshToken) {
        try {
          await postJson('/auth/token/revoke', {
            refreshToken: session.refreshToken,
            clientId: config.clientId
          });
        } catch (_error) {
          // Keep going and clear local state.
        }
      }

      clearPendingState();
      clearStoredSession();
    }

    async function fetchWithAuth(input, init) {
      var session = await ensureSession();
      if (!session || !session.accessToken) {
        throw new Error('Not authenticated');
      }

      var requestInit = Object.assign({}, init || {});
      requestInit.headers = Object.assign({}, requestInit.headers || {}, {
        Authorization: 'Bearer ' + session.accessToken
      });

      var response = await fetch(input, requestInit);
      if (response.status !== 401) {
        return response;
      }

      var refreshed = await refresh();
      if (!refreshed || !refreshed.accessToken) {
        return response;
      }

      requestInit.headers.Authorization = 'Bearer ' + refreshed.accessToken;
      return fetch(input, requestInit);
    }

    return {
      config: config,
      ensureSession: ensureSession,
      fetchCurrentUser: fetchCurrentUser,
      fetchWithAuth: fetchWithAuth,
      getSession: function () {
        return getCachedSession();
      },
      loadProviders: function () {
        return fetchJson('/auth/providers');
      },
      login: login,
      logout: logout,
      refresh: refresh
    };
  }

  window.PartyDeckAuth = {
    createClient: createClient
  };
})(window, document);
