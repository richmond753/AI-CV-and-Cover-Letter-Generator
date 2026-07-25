const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const { getUsageSummary } = require('../services/usage');
const router = express.Router();

// ── GET /api/usage/me ──────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const usage = await getUsageSummary(req.user.id);
    res.json({ success: true, usage });
  } catch (err) {
    console.error('Usage me error:', err);
    res.status(500).json({ success: false, message: 'Failed to load usage.' });
  }
});

// ── POST /api/feedback ─────────────────────────────────────
router.post('/feedback', auth, async (req, res) => {
  const rating = parseInt(req.body.rating, 10);
  const message = String(req.body.message || '').trim().slice(0, 1000);
  const page = String(req.body.page || '').trim().slice(0, 120);

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Please choose a rating from 1 to 5.' });
  }

  try {
    await db.query(
      'INSERT INTO feedback (user_id, rating, message, page) VALUES (?, ?, ?, ?)',
      [req.user.id, rating, message || null, page || null]
    );
    res.status(201).json({ success: true, message: 'Thank you — your feedback helps us improve CareerAI.' });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ success: false, message: 'Could not save feedback. Please try again.' });
  }
});

module.exports = router;
