const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const auth     = require('../middleware/auth');
const config   = require('../config');
const router   = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const signToken = (payload) =>
  jwt.sign(payload, config.jwt.secret || process.env.JWT_SECRET, { expiresIn: config.jwt.expiresIn });

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── POST /api/auth/register ────────────────────────────────
router.post('/register', async (req, res) => {
  const fullname = String(req.body.fullname || '').trim();
  const email    = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!fullname || !email || !password)
    return res.status(400).json({ success: false, message: 'All fields are required.' });

  if (fullname.length > 150)
    return res.status(400).json({ success: false, message: 'Full name is too long.' });

  if (!EMAIL_RE.test(email))
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });

  if (password.length < 8)
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(409).json({ success: false, message: 'Email already registered.' });

    const hashed = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (fullname, email, password) VALUES (?, ?, ?)',
      [fullname, email, hashed]
    );

    const user = { id: result.insertId, fullname, email };
    const token = signToken(user);

    res.status(201).json({ success: true, token, user });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────
router.post('/login', async (req, res) => {
  const email    = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password)
    return res.status(400).json({ success: false, message: 'Email and password required.' });

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0)
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const payload = { id: user.id, fullname: user.fullname, email: user.email };
    const token = signToken(payload);

    res.json({ success: true, token, user: payload });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, fullname, email, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
});

// ── PATCH /api/auth/profile ────────────────────────────────
router.patch('/profile', auth, async (req, res) => {
  const fullname = String(req.body.fullname || '').trim();
  if (!fullname) return res.status(400).json({ success: false, message: 'Full name is required.' });
  if (fullname.length > 150) return res.status(400).json({ success: false, message: 'Full name is too long.' });

  try {
    await db.query('UPDATE users SET fullname = ? WHERE id = ?', [fullname, req.user.id]);
    const [rows] = await db.query('SELECT id, fullname, email FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];
    const token = signToken({ id: user.id, fullname: user.fullname, email: user.email });
    res.json({ success: true, user, token, message: 'Profile updated.' });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

// ── POST /api/auth/change-password ─────────────────────────
router.post('/change-password', auth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (!currentPassword || !newPassword)
    return res.status(400).json({ success: false, message: 'Current and new password are required.' });
  if (newPassword.length < 8)
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
  if (currentPassword === newPassword)
    return res.status(400).json({ success: false, message: 'New password must be different from the current one.' });

  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });

    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
});

// ── POST /api/auth/forgot-password ─────────────────────────
// Always returns success to avoid email enumeration. In development (or when
// SMTP isn't configured) we also return a resetUrl so you can test the flow.
router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }

  const generic = {
    success: true,
    message: 'If that email is registered, a reset link has been prepared. Check your inbox (and spam).'
  };

  try {
    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.json(generic);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [rows[0].id]);
    await db.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [rows[0].id, tokenHash, expires]
    );

    const resetUrl = `${config.appUrl}/pages/reset-password.html?token=${rawToken}`;
    console.log(`[password-reset] ${email} → ${resetUrl}`);

    // Ready for real email provider later (SendGrid / SES / etc.)
    const payload = { ...generic };
    if (!config.isProd) payload.resetUrl = resetUrl;
    res.json(payload);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Could not start password reset. Please try again.' });
  }
});

// ── POST /api/auth/reset-password ──────────────────────────
router.post('/reset-password', async (req, res) => {
  const token = String(req.body.token || '').trim();
  const newPassword = String(req.body.newPassword || '');

  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: 'Reset token and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
  }

  try {
    const tokenHash = hashToken(token);
    const [rows] = await db.query(
      `SELECT id, user_id FROM password_resets
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [tokenHash]
    );
    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, rows[0].user_id]);
    await db.query('UPDATE password_resets SET used_at = NOW() WHERE id = ?', [rows[0].id]);

    res.json({ success: true, message: 'Password updated. You can log in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Could not reset password. Please try again.' });
  }
});

module.exports = router;
