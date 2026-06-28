const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const router   = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

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
    // Check existing user
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

module.exports = router;
