window.PARTYDECK_PAYMENT_CONFIG = {
  projectKey: 'partydeck',
  debugPurchasesOnWeb: false,
  webCheckout: {
    enabled:
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]',
    createSessionUrl: 'http://localhost:4040/api/payment-kit/web/create-session',
    confirmSessionUrl: 'http://localhost:4040/api/payment-kit/web/confirm-session',
    storageKey: 'payment-kit:partydeck:web-checkout',
    sessionQueryKey: 'paymentSessionId',
    statusQueryKey: 'paymentStatus'
  },
  providerFactory: function (environment, providers) {
    var config = window.PARTYDECK_PAYMENT_CONFIG;

    if (environment.channel === 'app') {
      return providers.createCapacitorBridgeProvider({
        bridgeName: 'PartyDeckBilling',
        fallback: providers.createUnavailableProvider(
          'Capacitor billing bridge is not installed yet.'
        )
      });
    }

    if (environment.channel === 'web' &&
        config.webCheckout &&
        config.webCheckout.enabled) {
      return providers.createHostedCheckoutProvider({
        projectKey: config.projectKey,
        createSessionUrl: config.webCheckout.createSessionUrl,
        confirmSessionUrl: config.webCheckout.confirmSessionUrl,
        storageKey: config.webCheckout.storageKey,
        sessionQueryKey: config.webCheckout.sessionQueryKey,
        statusQueryKey: config.webCheckout.statusQueryKey
      });
    }

    if (environment.channel === 'web' &&
        config.debugPurchasesOnWeb) {
      return providers.createLocalDebugProvider({
        receiptPrefix: 'partydeck-web'
      });
    }

    return providers.createUnavailableProvider(
      'Web checkout is disabled for this project.'
    );
  },
  resolveProductAvailability: function (product, environment, config) {
    var channelAllowed = !Array.isArray(product.channels) ||
      product.channels.indexOf(environment.channel) >= 0;
    var platformAllowed = !Array.isArray(product.platforms) ||
      product.platforms.indexOf(environment.os) >= 0 ||
      product.platforms.indexOf(environment.channel) >= 0;
    var liveAllowed = channelAllowed && platformAllowed;
    var liveWebEnabled = !!(
      config.webCheckout &&
      config.webCheckout.enabled &&
      config.webCheckout.createSessionUrl &&
      config.webCheckout.confirmSessionUrl
    );

    if (environment.channel === 'web') {
      if (liveAllowed && liveWebEnabled) {
        return {
          available: true,
          mode: 'live',
          reason: ''
        };
      }

      if (config.debugPurchasesOnWeb && product.allowDebugWeb) {
        return {
          available: true,
          mode: 'debug',
          reason: ''
        };
      }

      return {
        available: false,
        mode: 'disabled',
        reason: liveAllowed
          ? 'CONFIGURE WEB CHECKOUT'
          : (product.disabledReason || 'NOT SUPPORTED')
      };
    }

    if (liveAllowed) {
      return {
        available: true,
        mode: 'live',
        reason: ''
      };
    }

    return {
      available: false,
      mode: 'disabled',
      reason: product.disabledReason || 'NOT SUPPORTED'
    };
  },
  products: [
    {
      id: 'diamond_pack_15',
      title: 'Diamond Pack 15',
      description: 'Starter currency pack',
      kind: 'consumable',
      priceLabel: 'KRW 3,000',
      channels: ['web', 'app'],
      platforms: ['web', 'ios', 'android'],
      allowDebugWeb: true,
      storeIds: {
        ios: 'partydeck.diamond_pack_15',
        android: 'partydeck.diamond_pack_15'
      },
      grants: [
        { type: 'currency', key: 'diamond', amount: 15 }
      ]
    },
    {
      id: 'diamond_pack_30',
      title: 'Diamond Pack 30',
      description: 'Most common refill',
      kind: 'consumable',
      priceLabel: 'KRW 5,000',
      channels: ['web', 'app'],
      platforms: ['web', 'ios', 'android'],
      allowDebugWeb: true,
      storeIds: {
        ios: 'partydeck.diamond_pack_30',
        android: 'partydeck.diamond_pack_30'
      },
      grants: [
        { type: 'currency', key: 'diamond', amount: 30 }
      ]
    },
    {
      id: 'diamond_pack_50',
      title: 'Diamond Pack 50',
      description: 'Value pack',
      kind: 'consumable',
      priceLabel: 'KRW 7,000',
      channels: ['web', 'app'],
      platforms: ['web', 'ios', 'android'],
      allowDebugWeb: true,
      storeIds: {
        ios: 'partydeck.diamond_pack_50',
        android: 'partydeck.diamond_pack_50'
      },
      grants: [
        { type: 'currency', key: 'diamond', amount: 50 }
      ]
    },
    {
      id: 'diamond_pack_100',
      title: 'Diamond Pack 100',
      description: 'Large currency pack',
      kind: 'consumable',
      priceLabel: 'KRW 10,000',
      channels: ['web', 'app'],
      platforms: ['web', 'ios', 'android'],
      allowDebugWeb: true,
      storeIds: {
        ios: 'partydeck.diamond_pack_100',
        android: 'partydeck.diamond_pack_100'
      },
      grants: [
        { type: 'currency', key: 'diamond', amount: 100 }
      ]
    }
  ]
};
