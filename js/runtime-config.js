(function (window) {
  'use strict';

  window.PartyPlayRuntimeConfig = Object.assign({
    auth: {
      superAccount: {
        enabled: false,
        authBaseUrl: '',
        user: {
          id: 'partyplay-super',
          display_name: 'SUPER ADMIN',
          email: 'super@partyplay.local',
          profile_image: '',
          last_login_at: ''
        }
      }
    }
  }, window.PartyPlayRuntimeConfig || {});
})(window);
