const db = require('../db');
const config = require('../config');

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

async function ensureUsageTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NOT NULL,
      action     VARCHAR(64) NOT NULL,
      day_key    CHAR(10) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_usage_user_day (user_id, day_key),
      KEY idx_usage_action (action),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

async function ensureFeedbackTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NULL,
      rating     TINYINT NOT NULL,
      message    VARCHAR(1000) NULL,
      page       VARCHAR(120) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_feedback_created (created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
}

async function ensurePasswordResetsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at    DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_reset_token (token_hash),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

async function ensureSchemaExtras() {
  try {
    await ensureUsageTable();
    await ensureFeedbackTable();
    await ensurePasswordResetsTable();
  } catch (err) {
    console.warn('Schema extras warning:', err.message);
  }
}

async function countTodayGenerations(userId) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM usage_events
     WHERE user_id = ? AND day_key = ? AND action LIKE 'generate:%'`,
    [userId, todayKey()]
  );
  return rows[0]?.c || 0;
}

async function recordUsage(userId, action) {
  await db.query(
    'INSERT INTO usage_events (user_id, action, day_key) VALUES (?, ?, ?)',
    [userId, action, todayKey()]
  );
}

async function getUsageSummary(userId) {
  const used = await countTodayGenerations(userId);
  const limit = config.freeDailyGenerations;
  return {
    day: todayKey(),
    used,
    limit,
    remaining: Math.max(0, limit - used),
    plan: 'free'
  };
}

/** Middleware: enforce freemium daily AI generation quota. */
function requireGenerationQuota(actionLabel) {
  return async function usageGate(req, res, next) {
    try {
      const used = await countTodayGenerations(req.user.id);
      if (used >= config.freeDailyGenerations) {
        return res.status(402).json({
          success: false,
          code: 'QUOTA_EXCEEDED',
          message: `You've used your ${config.freeDailyGenerations} free AI generations for today. Come back tomorrow, or upgrade for unlimited access.`,
          usage: {
            used,
            limit: config.freeDailyGenerations,
            remaining: 0,
            plan: 'free'
          }
        });
      }
      // Attach recorder so route can call after success
      req.recordGeneration = async () => {
        await recordUsage(req.user.id, `generate:${actionLabel}`);
      };
      req.usagePreview = {
        used,
        limit: config.freeDailyGenerations,
        remaining: Math.max(0, config.freeDailyGenerations - used - 1)
      };
      next();
    } catch (err) {
      console.error('Usage gate error:', err);
      // Fail open for availability — don't block users if usage table is down
      req.recordGeneration = async () => {};
      next();
    }
  };
}

module.exports = {
  ensureSchemaExtras,
  countTodayGenerations,
  recordUsage,
  getUsageSummary,
  requireGenerationQuota,
  todayKey
};
