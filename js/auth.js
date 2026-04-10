(function (window, document) {
  'use strict';

  if (!window.PartyPlayAuth || typeof window.PartyPlayAuth.createClient !== 'function') {
    return;
  }

  var CLIENT_ID = 'partyplay';
  var PENDING_ACTION_KEY = 'partyplay.auth.pending-action.' + CLIENT_ID;
  var PENDING_ACTION_TTL_MS = 10 * 60 * 1000;
  var READY_TIMEOUT_MS = 15000;
  var PUBLIC_AUTH_BASE_URL = 'https://partyplay-production.up.railway.app';
  var LAN_AUTH_BASE_URL = 'https://partyplay-production.up.railway.app';
  var AUTH_BASE_URL = PUBLIC_AUTH_BASE_URL;

  function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function getRuntimeConfig() {
    return window.PartyPlayRuntimeConfig || {};
  }

  function getSuperAccountConfig() {
    var authConfig = getRuntimeConfig().auth || {};
    var superAccount = authConfig.superAccount || null;
    return superAccount && superAccount.enabled ? superAccount : null;
  }

  function isSuperAccountSession(session) {
    return !!(session && session.isSuperAccount);
  }

  function buildSuperSession(superAccount) {
    var now = new Date();
    var user = Object.assign({
      id: 'partyplay-super',
      display_name: 'SUPER ADMIN',
      email: 'super@partyplay.local',
      profile_image: '',
      last_login_at: now.toISOString()
    }, cloneJson(superAccount && superAccount.user ? superAccount.user : {}) || {});
    var nowSec = Math.floor(now.getTime() / 1000);

    return {
      accessToken: 'partyplay-super-access-token',
      refreshToken: 'partyplay-super-refresh-token',
      tokenType: 'Bearer',
      expiresAt: nowSec + (60 * 60 * 24 * 365 * 10),
      refreshExpiresIn: 60 * 60 * 24 * 365 * 10,
      isNewUser: false,
      isSuperAccount: true,
      user: user
    };
  }

  function createSuperAuthClient(superAccount) {
    var session = buildSuperSession(superAccount);

    return {
      config: {
        authBaseUrl: AUTH_BASE_URL,
        clientId: CLIENT_ID,
        storage: 'memory',
        returnTo: window.location.origin + window.location.pathname + window.location.search
      },
      ensureSession: function () {
        return Promise.resolve(session);
      },
      fetchCurrentUser: function () {
        return Promise.resolve(session.user);
      },
      fetchWithAuth: function (input, init) {
        var requestInit = Object.assign({}, init || {});
        requestInit.headers = Object.assign({}, requestInit.headers || {}, {
          Authorization: 'Bearer ' + session.accessToken,
          'X-PartyPlay-Super-Account': 'true'
        });
        return window.fetch(input, requestInit);
      },
      getSession: function () {
        return session;
      },
      loadProviders: function () {
        return Promise.resolve([]);
      },
      login: function () {
        return Promise.resolve(session);
      },
      logout: function () {
        return Promise.resolve(session);
      },
      refresh: function () {
        return Promise.resolve(session);
      }
    };
  }

  function isPrivateHostname(hostname) {
    var value = String(hostname || '').trim().toLowerCase();
    if (!value) {
      return false;
    }

    return (
      value === 'localhost' ||
      value === '127.0.0.1' ||
      value === '[::1]' ||
      value === '::1' ||
      /^10\./.test(value) ||
      /^192\.168\./.test(value) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(value) ||
      /\.local$/.test(value)
    );
  }

  function uniqueBaseUrls(values) {
    return values.filter(function (value, index, items) {
      return value && items.indexOf(value) === index;
    });
  }

  function getCapacitorPlatform() {
    var cap = window.Capacitor;
    return cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : '';
  }

  function isCapacitorNativeRuntime() {
    var platform = getCapacitorPlatform();
    return platform === 'android' || platform === 'ios';
  }

  function buildAuthBaseCandidates() {
    var hostname = String(window.location.hostname || '').trim();

    if (isCapacitorNativeRuntime()) {
      return uniqueBaseUrls([
        LAN_AUTH_BASE_URL,
        PUBLIC_AUTH_BASE_URL
      ]);
    }

    if (window.location.protocol === 'file:') {
      return ['https://127.0.0.1:3000'];
    }

    if (hostname === '127.0.0.1' || hostname === 'localhost') {
      return ['https://127.0.0.1:3000'];
    }

    if (isPrivateHostname(hostname)) {
      return uniqueBaseUrls([
        'https://' + hostname + ':3000',
        'https://127.0.0.1:3000',
        LAN_AUTH_BASE_URL,
        PUBLIC_AUTH_BASE_URL
      ]);
    }

    return uniqueBaseUrls([
      LAN_AUTH_BASE_URL,
      PUBLIC_AUTH_BASE_URL
    ]);
  }

  async function canReachAuthBaseUrl(baseUrl) {
    if (typeof window.fetch !== 'function') {
      return baseUrl === PUBLIC_AUTH_BASE_URL;
    }

    var abortController = typeof window.AbortController === 'function'
      ? new window.AbortController()
      : null;
    var timeoutId = window.setTimeout(function () {
      if (abortController) {
        abortController.abort();
      }
    }, 1200);

    try {
      var response = await window.fetch(baseUrl + '/health/live', {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: abortController ? abortController.signal : undefined
      });
      return !!(response && response.ok);
    } catch (_error) {
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function resolveAuthBaseUrl() {
    var candidates = buildAuthBaseCandidates();

    for (var i = 0; i < candidates.length; i += 1) {
      if (await canReachAuthBaseUrl(candidates[i])) {
        return candidates[i];
      }
    }

    return candidates[0] || PUBLIC_AUTH_BASE_URL;
  }

  var controller = {
    client: null,
    session: null,
    loginInFlight: false,
    initialized: false,
    appReady: false,
    overlayDismissed: false,
    currentScreen: 'loadingScreen',
    launchIntent: null,
    protectedActions: [],
    originalShowScreen: null
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function isAuthenticated() {
    return !!(controller.session && controller.session.user);
  }

  function getActiveScreenId() {
    var active = document.querySelector('.screen.active');
    return active ? active.id : controller.currentScreen || 'loadingScreen';
  }

  function showToastSafe(message) {
    if (!message) {
      return;
    }

    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }

    window.console.log(message);
  }

  function preferredNicknameFromUser(user) {
    if (!user) {
      return '';
    }

    var source = String(user.display_name || '').trim();
    if (!source && user.email) {
      source = String(user.email).split('@')[0];
    }

    return source.trim().slice(0, 8);
  }

  function initialFromUser(user) {
    var source = preferredNicknameFromUser(user);
    return source ? source.slice(0, 1).toUpperCase() : 'PD';
  }

  function formatLastLogin(value) {
    if (!value) {
      return '';
    }

    var date = new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }

    return date.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getRoomLinkCode() {
    var params = new URLSearchParams(window.location.search);
    var roomCode = String(params.get('room') || '').trim().toUpperCase();
    return roomCode && roomCode.length >= 4 ? roomCode : '';
  }

  function detectLaunchIntent() {
    var roomCode = getRoomLinkCode();
    if (!roomCode) {
      return null;
    }

    return {
      action: 'join-room',
      payload: {
        joinCode: roomCode
      },
      roomCode: roomCode,
      source: 'room-link'
    };
  }

  function consumeLaunchIntent() {
    if (!controller.launchIntent) {
      return;
    }

    controller.launchIntent = null;

    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has('room')) {
        return;
      }

      url.searchParams.delete('room');
      var nextUrl = url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
      window.history.replaceState(null, document.title, nextUrl);
    } catch (_error) {
      // If URL rewriting fails, continuing is safer than interrupting gameplay.
    }
  }

  function readPendingAction() {
    var raw = window.sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) {
      return null;
    }

    try {
      var payload = JSON.parse(raw);
      if (!payload || !payload.action || !payload.createdAt) {
        window.sessionStorage.removeItem(PENDING_ACTION_KEY);
        return null;
      }

      if (Date.now() - payload.createdAt > PENDING_ACTION_TTL_MS) {
        window.sessionStorage.removeItem(PENDING_ACTION_KEY);
        return null;
      }

      return payload;
    } catch (_error) {
      window.sessionStorage.removeItem(PENDING_ACTION_KEY);
      return null;
    }
  }

  function writePendingAction(action, payload) {
    window.sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify({
      action: action,
      payload: payload || null,
      createdAt: Date.now()
    }));
  }

  function clearPendingAction() {
    window.sessionStorage.removeItem(PENDING_ACTION_KEY);
  }

  function ensureLaunchIntentQueued() {
    if (!controller.launchIntent || readPendingAction()) {
      return;
    }

    writePendingAction(controller.launchIntent.action, controller.launchIntent.payload);
  }

  function syncNickname(user) {
    var nameInput = byId('nameInput');
    if (!nameInput) {
      return;
    }

    var currentName = String(nameInput.value || '').trim();
    if (currentName && currentName !== '플레이어') {
      return;
    }

    var nextName = preferredNicknameFromUser(user);
    if (!nextName) {
      return;
    }

    nameInput.value = nextName;
    if (typeof window.saveProfile === 'function') {
      window.saveProfile();
    }
  }

  function syncPaymentBridge() {
    if (!window.PartyPlayPayments) {
      return;
    }

    window.PartyPlayPayments.fetchWithAuth = function (input, init) {
      return controller.client.fetchWithAuth(input, init);
    };

    window.PartyPlayPayments.getAuthState = function () {
      return {
        authenticated: isAuthenticated(),
        user: isAuthenticated() ? controller.session.user : null,
        superAccount: isSuperAccountSession(controller.session)
      };
    };
  }

  function emitAuthState() {
    window.partyplayAuthController = controller;
    window.partyplayAuthFetch = function (input, init) {
      return controller.client.fetchWithAuth(input, init);
    };

    if (typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent('partyplay-auth:state', {
        detail: {
          authenticated: isAuthenticated(),
          user: isAuthenticated() ? controller.session.user : null,
          superAccount: isSuperAccountSession(controller.session)
        }
      }));
    }
  }

  function showAccountCreationFeedback(session, source) {
    if (!session || !session.isNewUser || !session.user || !window.sessionStorage) {
      return;
    }

    var welcomeKey = 'partyplay.auth.welcomed.' + (session.user.id || 'unknown');
    if (window.sessionStorage.getItem(welcomeKey)) {
      return;
    }

    window.sessionStorage.setItem(welcomeKey, String(Date.now()));
    showToastSafe(source === 'overlay' ? '첫 시작이 준비됐어요. 바로 이어갈게요.' : '첫 시작이 준비됐어요.');
  }

  function getIntentDescriptor(intent, screenId) {
    if (intent && intent.action === 'join-room' && intent.payload && intent.payload.joinCode) {
      var roomCode = intent.payload.joinCode;
      return {
        cardSubtitle: '친구가 보낸 방 링크예요. 계정만 고르면 바로 이어집니다.',
        cardName: roomCode + ' 방으로 들어가 볼까요',
        cardMeta: '로그인이 끝나면 ' + roomCode + ' 방으로 바로 입장합니다.',
        cardNote: '간단히 계정만 고르면 됩니다.',
        buttonText: roomCode + ' 방 들어가기',
        gateEyebrow: 'ROOM LINK',
        gateTitle: roomCode + ' 방으로 들어가 볼까요',
        gateMessage: '편한 계정 하나만 고르면 ' + roomCode + ' 방으로 바로 이어집니다.',
        gateFoot: '로그인이 끝나면 자동으로 연결됩니다.'
      };
    }

    if (screenId && screenId !== 'mainMenu' && screenId !== 'loadingScreen') {
      return {
        cardSubtitle: '이 화면은 로그인 후 이어서 사용할 수 있어요.',
        cardName: '계정을 고르고 이어서 플레이할까요',
        cardMeta: '지금 보던 흐름은 로그인 후 자연스럽게 이어집니다.',
        cardNote: '편한 계정으로 이어서 시작해 보세요.',
        buttonText: '소셜로 계속하기',
        gateEyebrow: 'KEEP GOING',
        gateTitle: '계정을 고르고 이어서 플레이해 주세요',
        gateMessage: '로그인이 끝나면 지금 보던 흐름으로 바로 돌아옵니다.',
        gateFoot: '연결 후 바로 이어집니다.'
      };
    }

    return {
      cardSubtitle: '카카오, 네이버, 구글 계정으로 가볍게 시작할 수 있어요.',
      cardName: '계정을 고르고 팟플을 시작해 보세요',
      cardMeta: '한 번 연결해 두면 플레이 흐름이 자연스럽게 이어집니다.',
      cardNote: '처음이라면 바로 준비돼요.',
      buttonText: '소셜로 시작하기',
      gateEyebrow: 'START',
      gateTitle: '소셜 계정으로 시작해 주세요',
      gateMessage: '편한 계정 하나로 바로 이어서 플레이할 수 있어요.',
      gateFoot: '가볍게 시작해 보세요.'
    };
  }

  function shouldShowGate(state) {
    if (isAuthenticated()) {
      return false;
    }

    if (!controller.appReady) {
      return false;
    }

    if (controller.currentScreen === 'loadingScreen') {
      return false;
    }

    if (state === 'error' || controller.loginInFlight) {
      return true;
    }

    if (controller.launchIntent) {
      return true;
    }

    if (controller.currentScreen && controller.currentScreen !== 'mainMenu') {
      return true;
    }

    return true;
  }

  function render(session, options) {
    var state = options && options.state ? options.state : (isAuthenticated() ? 'signed-in' : 'signed-out');
    var card = byId('authCard');
    var chip = byId('authChip');
    var subtitle = byId('authSubtitle');
    var avatar = byId('authAvatar');
    var name = byId('authName');
    var meta = byId('authMeta');
    var note = byId('authNote');
    var loginButton = byId('authLoginBtn');
    var logoutButton = byId('authLogoutBtn');
    var gate = byId('authGateOverlay');
    var gateEyebrow = byId('authGateEyebrow');
    var gateTitle = byId('authGateTitle');
    var gateMessage = byId('authGateMessage');
    var gateFoot = byId('authGateFoot');
    var gateLoginButton = byId('authGateLoginBtn');
    var gateDismissButton = byId('authGateDismissBtn');
    var busy = !!(options && options.busy);
    var user = session && session.user ? session.user : null;
    var intent = readPendingAction() || controller.launchIntent;
    var screenId = controller.currentScreen || getActiveScreenId();
    var copy = getIntentDescriptor(intent, screenId);
    var lastLogin = formatLastLogin(user && user.last_login_at);
    var gateVisible = shouldShowGate(state);

    if (card) {
      card.setAttribute('data-auth-state', state);
    }

    if (chip) {
      chip.textContent = state === 'signed-in'
        ? '로그인됨'
        : (state === 'loading' ? '확인 중' : (state === 'error' ? '오류' : '로그인 필요'));
    }

    if (subtitle) {
      subtitle.textContent = user
        ? '로그인 상태가 복구되면 방 만들기, 참가, 상점 진입을 바로 이어갈 수 있어요.'
        : (options && options.subtitle ? options.subtitle : copy.cardSubtitle);
    }

    if (name) {
      name.textContent = user
        ? (session && session.isNewUser
          ? ((user.display_name || user.email || '새 사용자') + '님, 가입이 완료됐어요')
          : (user.display_name || user.email || '로그인된 사용자'))
        : (options && options.name ? options.name : copy.cardName);
    }

    if (meta) {
      meta.textContent = user
        ? ((session && session.isNewUser)
          ? '가입이 완료됐어요. 지금부터 방 만들기, 참가, 상점을 바로 이용할 수 있어요.'
          : '로그인되어 있어요.')
        : (options && options.meta ? options.meta : copy.cardMeta);
    }

    if (note) {
      note.textContent = user
        ? ''
        : (options && options.note ? options.note : copy.cardNote);
    }

    if (avatar) {
      if (user && user.profile_image) {
        avatar.textContent = initialFromUser(user);
        avatar.style.backgroundImage = 'url("' + String(user.profile_image).replace(/"/g, '\\"') + '")';
        avatar.classList.add('has-image');
      } else {
        avatar.style.backgroundImage = '';
        avatar.textContent = initialFromUser(user);
        avatar.classList.remove('has-image');
      }
    }

    if (loginButton) {
      loginButton.hidden = !!user;
      loginButton.disabled = busy;
      loginButton.textContent = busy ? '로그인 창 여는 중...' : copy.buttonText;
    }

    if (logoutButton) {
      logoutButton.hidden = !user || isSuperAccountSession(session);
      logoutButton.disabled = busy;
    }

    if (gate) {
      gate.hidden = !gateVisible;
    }

    if (gateEyebrow) {
      gateEyebrow.textContent = user ? 'SIGNED IN' : copy.gateEyebrow;
    }

    if (gateTitle) {
      gateTitle.textContent = user
        ? ((session && session.isNewUser)
          ? '회원가입이 완료됐어요'
          : (user.display_name || user.email || '로그인됨'))
        : (options && options.gateTitle ? options.gateTitle : copy.gateTitle);
    }

    if (gateMessage) {
      gateMessage.textContent = user
        ? ((session && session.isNewUser)
          ? '첫 로그인과 동시에 계정 생성이 끝났어요. 이제 원하는 기능을 바로 이용할 수 있어요.'
          : '이미 로그인된 상태입니다. 이제 원하는 기능을 바로 이용할 수 있어요.')
        : (options && options.gateMessage ? options.gateMessage : copy.gateMessage);
    }

    if (gateFoot) {
      gateFoot.textContent = user
        ? ((session && session.isNewUser)
          ? '다음부터는 회원가입 없이 같은 소셜 버튼으로 바로 로그인됩니다.'
          : '로그아웃 전까지는 같은 브라우저 세션에서 상태를 유지합니다.')
        : (options && options.gateFoot ? options.gateFoot : copy.gateFoot);
    }

    if (gateLoginButton) {
      gateLoginButton.disabled = busy;
      gateLoginButton.textContent = busy ? '로그인 창 여는 중...' : copy.buttonText;
    }

    if (gateDismissButton) {
      gateDismissButton.hidden =
        busy ||
        !!controller.launchIntent ||
        (screenId && screenId !== 'mainMenu');
    }

    document.body.setAttribute('data-auth-gate-open', gateVisible ? 'true' : 'false');

    controller.protectedActions.forEach(function (item) {
      var element = byId(item.buttonId);
      if (!element) {
        return;
      }

      element.classList.add('auth-guarded');
      element.setAttribute('data-auth-locked', isAuthenticated() ? 'false' : 'true');
      element.setAttribute('aria-disabled', isAuthenticated() ? 'false' : 'true');
    });

    syncPaymentBridge();
    emitAuthState();
  }

  function findProtectedAction(actionName) {
    return controller.protectedActions.find(function (item) {
      return item.action === actionName;
    }) || null;
  }

  async function hydrateSession(options) {
    try {
      render(controller.session, {
        state: options && options.silent ? undefined : 'loading',
        busy: !(options && options.silent),
        meta: '세션과 토큰을 확인하고 있어요.'
      });

      var session = await controller.client.ensureSession();
      if (session && !session.user) {
        await controller.client.fetchCurrentUser();
        session = controller.client.getSession();
      }

      controller.session = session || null;
      if (isAuthenticated()) {
        syncNickname(controller.session.user);
      }

      render(controller.session);
      showAccountCreationFeedback(controller.session, 'hydrate');
      return controller.session;
    } catch (error) {
      controller.session = null;
      controller.overlayDismissed = false;
      clearPendingAction();
      render(null, {
        state: 'error',
        name: '로그인 확인에 실패했어요',
        meta: error.message || '세션 확인 중 오류가 발생했습니다.',
        note: '다시 로그인하면 이어서 진행할 수 있어요.',
        gateTitle: '로그인 상태를 확인하지 못했어요',
        gateMessage: error.message || '세션 확인 중 오류가 발생했습니다.',
        gateFoot: '다시 로그인하면 방 참가나 방 만들기를 이어갈 수 있어요.'
      });
      return null;
    }
  }

  function waitForAppReady() {
    return new Promise(function (resolve, reject) {
      var startedAt = Date.now();
      var timer = window.setInterval(function () {
        var loadingScreen = byId('loadingScreen');
        var ready =
          typeof window.createRoom === 'function' &&
          typeof window.joinRoom === 'function' &&
          typeof window.showToast === 'function' &&
          (!loadingScreen || !loadingScreen.classList.contains('active'));

        if (ready) {
          window.clearInterval(timer);
          resolve();
          return;
        }

        if (Date.now() - startedAt > READY_TIMEOUT_MS) {
          window.clearInterval(timer);
          reject(new Error('PartyPlay did not finish booting in time.'));
        }
      }, 150);
    });
  }

  function wrapShowScreen() {
    if (controller.originalShowScreen || typeof window.showScreen !== 'function') {
      controller.currentScreen = getActiveScreenId();
      return;
    }

    controller.originalShowScreen = window.showScreen;
    controller.currentScreen = getActiveScreenId();

    window.showScreen = function (id) {
      var result = controller.originalShowScreen.apply(this, arguments);
      controller.currentScreen = id || getActiveScreenId();

      if (!isAuthenticated() && controller.currentScreen !== 'mainMenu' && controller.currentScreen !== 'loadingScreen') {
        controller.overlayDismissed = false;
      }

      render(controller.session);
      return result;
    };
  }

  async function runProtectedAction(actionConfig, payload) {
    if (!actionConfig) {
      return null;
    }

    if (actionConfig.beforeRun) {
      actionConfig.beforeRun(payload);
    }

    clearPendingAction();

    if (
      actionConfig.action === 'join-room' &&
      controller.launchIntent &&
      payload &&
      controller.launchIntent.payload &&
      controller.launchIntent.payload.joinCode === payload.joinCode
    ) {
      consumeLaunchIntent();
    }

    return actionConfig.original();
  }

  async function resumePendingAction() {
    var pending = readPendingAction();
    if (!pending || !isAuthenticated()) {
      return;
    }

    var actionConfig = findProtectedAction(pending.action);
    if (!actionConfig) {
      clearPendingAction();
      return;
    }

    showToastSafe('로그인 완료. 이어서 진행합니다.');
    await runProtectedAction(actionConfig, pending.payload);
  }

  async function startLoginFlow(options) {
    var pendingAction = options && options.pendingAction ? options.pendingAction : null;
    var loadingMeta = options && options.loadingMeta
      ? options.loadingMeta
      : '로그인 뒤에는 지금 보던 흐름으로 자동 복귀합니다.';

    if (controller.loginInFlight) {
      showToastSafe('이미 로그인 창이 열려 있어요.');
      return null;
    }

    if (pendingAction) {
      writePendingAction(pendingAction.action, pendingAction.payload);
    } else {
      ensureLaunchIntentQueued();
    }

    controller.overlayDismissed = false;
    controller.loginInFlight = true;
    render(controller.session, {
      state: 'loading',
      busy: true,
      meta: loadingMeta,
      gateMessage: loadingMeta
    });

    var preserveErrorState = false;

    try {
      var session = await controller.client.login();
      if (!session) {
        return null;
      }

      controller.session = session;
      if (controller.session && !controller.session.user) {
        await controller.client.fetchCurrentUser();
        controller.session = controller.client.getSession();
      }

      if (isAuthenticated()) {
        syncNickname(controller.session.user);
      }

      render(controller.session);
      showAccountCreationFeedback(controller.session, 'overlay');

      if (readPendingAction()) {
        await resumePendingAction();
      } else {
        showToastSafe('로그인되었어요.');
      }

      return controller.session;
    } catch (error) {
      preserveErrorState = true;
      controller.overlayDismissed = false;
      render(null, {
        state: 'error',
        name: '로그인이 완료되지 않았어요',
        meta: error.message || '로그인 창에서 인증을 마치지 못했습니다.',
        note: '다시 시도하면 이어서 진행할 수 있어요.',
        gateTitle: '로그인을 완료하지 못했어요',
        gateMessage: error.message || '로그인 창을 닫았거나 인증 중 문제가 발생했습니다.',
        gateFoot: '메인 로비에서 다시 시도하거나, 로그인 버튼을 다시 눌러 이어갈 수 있어요.'
      });

      if (error && error.message === 'Authentication window closed') {
        showToastSafe('로그인을 취소했어요.');
      } else {
        showToastSafe(error && error.message ? error.message : '로그인에 실패했어요.');
      }
      return null;
    } finally {
      controller.loginInFlight = false;
      if (!preserveErrorState) {
        render(controller.session);
      }
    }
  }

  async function handleProtectedAction(actionConfig, payloadFactory) {
    var payload = typeof payloadFactory === 'function' ? payloadFactory() : null;

    if (actionConfig.precheck && actionConfig.precheck(payload) === false) {
      return actionConfig.original();
    }

    if (controller.loginInFlight) {
      showToastSafe('로그인 창에서 계속 진행해 주세요.');
      return null;
    }

    var session = controller.session;
    if (!session || !session.accessToken) {
      session = await controller.client.ensureSession().catch(function () {
        return null;
      });

      if (session && !session.user) {
        await controller.client.fetchCurrentUser().catch(function () {
          return null;
        });
        session = controller.client.getSession();
      }

      controller.session = session || null;
      render(controller.session);
    }

    if (isAuthenticated()) {
      return runProtectedAction(actionConfig, payload);
    }

    return startLoginFlow({
      pendingAction: {
        action: actionConfig.action,
        payload: payload
      },
      loadingMeta: '로그인 뒤에는 지금 누른 기능으로 자동 복귀합니다.'
    });
  }

  function wrapProtectedActions() {
    controller.protectedActions = [
      {
        action: 'create-room',
        fnName: 'createRoom',
        buttonId: 'createRoomBtn'
      },
      {
        action: 'join-room',
        fnName: 'joinRoom',
        buttonId: 'joinRoomBtn',
        payloadFactory: function () {
          var input = byId('joinCodeInput');
          return {
            joinCode: input ? String(input.value || '').trim().toUpperCase() : ''
          };
        },
        precheck: function (payload) {
          return !!(payload && payload.joinCode);
        },
        beforeRun: function (payload) {
          if (!payload || !payload.joinCode) {
            return;
          }

          var input = byId('joinCodeInput');
          if (input) {
            input.value = payload.joinCode;
          }
        }
      },
      {
        action: 'pet-quick-access',
        fnName: 'tamaQuickAccess',
        buttonId: 'tamaMenuBtn'
      },
      {
        action: 'practice-mode',
        fnName: 'startPracticeMode',
        buttonId: 'practiceModeBtn'
      },
      {
        action: 'fortress-pve',
        fnName: 'startFortressPvE',
        buttonId: 'fortressPveBtn'
      },
      {
        action: 'diamond-shop',
        fnName: 'openDiamondShop',
        buttonId: 'diamondShopEntry'
      }
    ].map(function (item) {
      var original = window[item.fnName];
      item.original = typeof original === 'function' ? original : function () {};

      window[item.fnName] = function () {
        return handleProtectedAction(item, item.payloadFactory);
      };

      return item;
    });
  }

  function bindUi() {
    var loginButtons = [byId('authLoginBtn'), byId('authGateLoginBtn')].filter(Boolean);
    var logoutButton = byId('authLogoutBtn');
    var dismissButton = byId('authGateDismissBtn');

    loginButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        startLoginFlow({
          loadingMeta: '로그인 창을 열고 있어요. 인증이 끝나면 바로 이어서 진행합니다.'
        });
      });
    });

    if (dismissButton) {
      dismissButton.addEventListener('click', function () {
        controller.overlayDismissed = true;
        render(controller.session);
        showToastSafe('메인 로비는 둘러볼 수 있어요. 플레이는 로그인 후에 이어집니다.');
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener('click', async function () {
        await controller.client.logout();
        controller.session = null;
        controller.overlayDismissed = false;
        clearPendingAction();
        controller.launchIntent = detectLaunchIntent();
        render(null, {
          state: 'signed-out',
          name: '로그아웃되었어요',
          meta: '다시 로그인하면 멀티플레이와 상점을 이용할 수 있어요.',
          note: '토큰은 이 브라우저 세션에서 즉시 제거했습니다.'
        });
        showToastSafe('로그아웃되었어요.');
      });
    }
  }

  async function initialize() {
    if (controller.initialized) {
      return;
    }

    controller.launchIntent = detectLaunchIntent();
    controller.currentScreen = getActiveScreenId();
    var superAccount = getSuperAccountConfig();
    if (superAccount) {
      AUTH_BASE_URL = String(superAccount.authBaseUrl || LAN_AUTH_BASE_URL);
      controller.client = createSuperAuthClient(superAccount);
    } else {
      AUTH_BASE_URL = await resolveAuthBaseUrl();
      controller.client = window.PartyPlayAuth.createClient({
        authBaseUrl: AUTH_BASE_URL,
        clientId: CLIENT_ID,
        storage: isCapacitorNativeRuntime() ? 'local' : 'session',
        returnTo: window.location.origin + window.location.pathname + window.location.search
      });
    }

    wrapShowScreen();
    wrapProtectedActions();
    bindUi();

    render(null, {
      state: 'loading',
      busy: true,
      meta: '로그인 상태를 확인하고 있어요.'
    });

    try {
      await waitForAppReady();
      controller.appReady = true;
      controller.currentScreen = getActiveScreenId();

      await hydrateSession();

      if (controller.launchIntent && isAuthenticated() && !readPendingAction()) {
        ensureLaunchIntentQueued();
      }

      await resumePendingAction();
      render(controller.session);
    } catch (error) {
      controller.overlayDismissed = false;
      render(null, {
        state: 'error',
        name: '팟플 준비를 기다리는 중이에요',
        meta: error.message || '앱 부팅이 늦어지고 있습니다.',
        note: '잠시 후 새로고침하면 다시 시도할 수 있어요.',
        gateTitle: '앱 준비가 아직 끝나지 않았어요',
        gateMessage: error.message || '앱 부팅이 늦어지고 있습니다.',
        gateFoot: '새로고침 뒤 다시 확인하면 로그인 흐름을 계속 진행할 수 있어요.'
      });
    }

    window.addEventListener('focus', function () {
      if (!controller.loginInFlight) {
        hydrateSession({ silent: true }).catch(function () {
          return null;
        });
      }
    });

    controller.initialized = true;
  }

  initialize();
})(window, document);
