const path     = require('path');
const express  = require('express');
const cors     = require('cors');
const config   = require('./config');
const { createRateLimiter } = require('./middleware/rateLimit');
const { ensureSchemaExtras } = require('./services/usage');
const db = require('./db');

const authRoutes        = require('./routes/auth');
const cvRoutes          = require('./routes/cv');
const coverLetterRoutes = require('./routes/coverLetter');
const atsRoutes         = require('./routes/ats');
const interviewRoutes   = require('./routes/interview');
const usageRoutes       = require('./routes/usage');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ── Startup environment checks ──────────────────────────────
if (!config.jwt.secret || config.jwt.secret === 'your_super_secret_jwt_key_change_this_in_production' || config.jwt.secret === 'change_this_to_a_long_random_secret') {
  console.warn('⚠️  JWT_SECRET is missing or using the default value. Set a strong secret in .env.');
}
if (!config.gemini.apiKey || config.gemini.apiKey === 'your_gemini_api_key_here') {
  console.warn('⚠️  GEMINI_API_KEY is not configured. AI features will fail until it is set in .env.');
}

// Optional gzip — keep working if compression isn't installed yet
try {
  app.use(require('compression')());
} catch {
  console.warn('ℹ️  compression package not installed — responses will be uncompressed.');
}

app.use(cors({
  origin: config.corsOrigins.length ? config.corsOrigins : true,
  credentials: true
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Global + AI-specific rate limits (scalability / abuse protection)
app.use('/api/', createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  message: 'Too many requests from this network. Please slow down.'
}));

const aiLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  max: config.aiRateLimitMax,
  keyFn: (req) => (req.user && req.user.id ? `u:${req.user.id}` : req.ip),
  message: 'AI generation rate limit reached. Please wait a few minutes.'
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.originalUrl.startsWith('/api')) {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

// Cache static assets briefly in production
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: config.isProd ? '1h' : 0,
  etag: true
}));

app.use('/api/auth', authRoutes);
app.use('/api/cv', aiLimiter, cvRoutes);
app.use('/api/cover-letter', aiLimiter, coverLetterRoutes);
app.use('/api/ats', aiLimiter, atsRoutes);
app.use('/api/interview', aiLimiter, interviewRoutes);
app.use('/api/usage', usageRoutes);

// Deep health check (DB connectivity) — ops / uptime monitors
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try {
    await db.query('SELECT 1');
    dbOk = true;
  } catch { dbOk = false; }

  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    service: config.appName,
    uptime: process.uptime(),
    db: dbOk ? 'up' : 'down',
    freeDailyGenerations: config.freeDailyGenerations
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File is too large. Max upload is 2 MB.' });
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message && !config.isProd ? err.message : 'Internal server error.'
  });
});

const server = app.listen(config.port, async () => {
  console.log(`\n🚀 ${config.appName} running on http://localhost:${config.port}`);
  console.log(`   Environment: ${config.env}`);
  console.log(`   Free daily AI generations: ${config.freeDailyGenerations}\n`);
  await ensureSchemaExtras();
});

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
