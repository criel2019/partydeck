'use strict';

if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch (_) {}
}

const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 4040,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  refreshTokenDays: parseInt(process.env.REFRESH_TOKEN_DAYS, 10) || 30,
  authCodeTtlMinutes: parseInt(process.env.AUTH_CODE_TTL_MINUTES, 10) || 5,
  serverBaseUrl: (process.env.SERVER_BASE_URL || '').replace(/\/+$/, ''),

  kakao: {
    clientId: process.env.KAKAO_CLIENT_ID || '',
    clientSecret: process.env.KAKAO_CLIENT_SECRET || '',
  },
  naver: {
    clientId: process.env.NAVER_CLIENT_ID || '',
    clientSecret: process.env.NAVER_CLIENT_SECRET || '',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  portone: {
    apiSecret: process.env.PORTONE_API_SECRET || '',
    storeId: process.env.PORTONE_STORE_ID || '',
    channelKey: process.env.PORTONE_CHANNEL_KEY || '',
  },
});

module.exports = config;
