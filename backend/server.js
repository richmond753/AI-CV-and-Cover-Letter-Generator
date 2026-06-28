const path     = require('path');
// Load backend/.env explicitly so the app works whether started from the
// project root (npm start) or from the backend folder.
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express  = require('express');
const cors     = require('cors');

const authRoutes        = require('./routes/auth');
const cvRoutes          = require('./routes/cv');
const coverLetterRoutes = require('./routes/coverLetter');
const atsRoutes         = require('./routes/ats');
const interviewRoutes   = require('./routes/interview');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ── Startup environment checks ──────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_super_secret_jwt_key_change_this_in_production') {
  console.warn('⚠️  JWT_SECRET is missing or using the default value. Set a strong secret in .env.');
}
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
  console.warn('⚠️  GEMINI_API_KEY is not configured. AI features will fail until it is set in .env.');
}

// ── Middleware ──────────────────────────────────────────────
// CORS: the SPA is served from the same origin, so default to that. Allow an
// explicit FRONTEND_URL override (comma-separated list) for split deployments.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true
}));

// Minimal security headers (avoids an extra dependency on helmet).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Lightweight request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// ── API Routes ──────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/cv',            cvRoutes);
app.use('/api/cover-letter',  coverLetterRoutes);
app.use('/api/ats',           atsRoutes);
app.use('/api/interview',     interviewRoutes);

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'CareerAI', uptime: process.uptime() }));

// Unknown API endpoints should return JSON, not the SPA shell.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

// ── SPA fallback ────────────────────────────────────────────
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Centralised error handler ───────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ success: false, message: 'Internal server error.' });
});

// ── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\n🚀 CareerAI server running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

// ── Graceful shutdown ───────────────────────────────────────
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
