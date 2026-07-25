// Simple in-memory sliding-window rate limiter.
// Sufficient for single-instance deploys; swap for Redis in multi-instance scale-out.

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 100, keyFn, message } = {}) {
  const hits = new Map();

  // Periodic cleanup to avoid unbounded growth
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const next = times.filter(t => t > cutoff);
      if (next.length) hits.set(key, next);
      else hits.delete(key);
    }
  }, Math.min(windowMs, 60_000)).unref();

  return function rateLimit(req, res, next) {
    const key = (keyFn ? keyFn(req) : null) || req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    const times = (hits.get(key) || []).filter(t => t > windowStart);
    times.push(now);
    hits.set(key, times);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - times.length)));

    if (times.length > max) {
      return res.status(429).json({
        success: false,
        message: message || 'Too many requests. Please wait a moment and try again.',
        retryAfterSec: Math.ceil(windowMs / 1000)
      });
    }
    next();
  };
}

module.exports = { createRateLimiter };
