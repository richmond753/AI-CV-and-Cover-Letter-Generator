// Central configuration — single source of truth for env-backed settings.
// Keeps routes lean and makes production tuning (quotas, limits) one-place.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 5000),

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  },

  corsOrigins: (process.env.FRONTEND_URL || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  // Freemium controls (profitability + cost control)
  freeDailyGenerations: num(process.env.FREE_DAILY_GENERATIONS, 15),
  rateLimitWindowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rateLimitMax: num(process.env.RATE_LIMIT_MAX, 200),
  aiRateLimitMax: num(process.env.AI_RATE_LIMIT_MAX, 30),

  uploadMaxBytes: num(process.env.UPLOAD_MAX_BYTES, 2 * 1024 * 1024),

  appName: 'CareerAI',
  appUrl: process.env.APP_URL || `http://localhost:${num(process.env.PORT, 5000)}`
};

module.exports = config;
