const express  = require('express');
const auth     = require('../middleware/auth');
const db       = require('../db');
const { callGemini, extractJsonString } = require('../controllers/gemini');
const router   = express.Router();

const MAX_FIELD = 12000;
const clip = (value) => String(value || '').slice(0, MAX_FIELD);

// ── POST /api/ats/check ────────────────────────────────────
router.post('/check', auth, async (req, res) => {
  const cvText        = clip(req.body.cvText);
  const jobDescription = clip(req.body.jobDescription);

  if (!cvText || !jobDescription) {
    return res.status(400).json({ success: false, message: 'Both CV text and job description are required.' });
  }

  const prompt = `You are an ATS (Applicant Tracking System) expert. Analyse the CV against the job description.

CV:
${cvText}

JOB DESCRIPTION:
${jobDescription}

Return ONLY a valid JSON object (no markdown, no backticks) with this exact structure:
{
  "score": <integer 0-100>,
  "foundKeywords": ["keyword1", "keyword2", ...],
  "missingKeywords": ["keyword1", "keyword2", ...],
  "suggestions": ["suggestion1", "suggestion2", "suggestion3", "suggestion4", "suggestion5"]
}

Rules:
- score: how well the CV matches the JD (keyword coverage, relevant experience, formatting)
- foundKeywords: important skills/terms from the JD that appear in the CV (max 10)
- missingKeywords: important skills/terms from the JD missing from the CV (max 8)
- suggestions: 5 specific, actionable improvements to increase the score`;

  try {
    const raw = await callGemini(prompt);
    const clean = extractJsonString(raw);
    const data = JSON.parse(clean);

    if (typeof data.score !== 'number' || !Array.isArray(data.foundKeywords) || !Array.isArray(data.missingKeywords) || !Array.isArray(data.suggestions)) {
      return res.status(502).json({ success: false, message: 'ATS analysis returned an unexpected format.' });
    }

    // Clamp the score to a sane 0–100 integer range.
    data.score = Math.max(0, Math.min(100, Math.round(data.score)));

    await db.query(
      'INSERT INTO ats_reports (user_id, score, recommendations) VALUES (?, ?, ?)',
      [req.user.id, data.score, JSON.stringify(data.suggestions)]
    );

    res.json({ success: true, data });
  } catch (err) {
    console.error('ATS check error:', err);
    res.status(500).json({
      success: false,
      message: 'ATS analysis failed.',
      ...(process.env.NODE_ENV !== 'production' ? { error: err.message } : {})
    });
  }
});

// ── GET /api/ats/latest ───────────────────────────────────
router.get('/latest', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT score, recommendations, created_at FROM ats_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    if (!rows.length) {
      return res.json({ success: true, report: null });
    }

    const report = rows[0];
    report.recommendations = report.recommendations ? JSON.parse(report.recommendations) : [];
    res.json({ success: true, report });
  } catch (err) {
    console.error('Load ATS error:', err);
    res.status(500).json({ success: false, message: 'Failed to load saved ATS report.' });
  }
});

module.exports = router;
