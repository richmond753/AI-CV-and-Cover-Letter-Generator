const express  = require('express');
const auth     = require('../middleware/auth');
const db       = require('../db');
const { callGemini, extractJsonString } = require('../controllers/gemini');
const router   = express.Router();

const MAX_FIELD = 3000;
const clip = (value) => String(value || '').slice(0, MAX_FIELD);

// ── POST /api/interview/generate ──────────────────────────
router.post('/generate', auth, async (req, res) => {
  const jobTitle = clip(req.body.jobTitle);
  const industry = clip(req.body.industry);
  const level    = clip(req.body.level);
  const focus    = String(req.body.focus || '').trim();
  const context  = clip(req.body.context);
  // Clamp count to a reasonable range to keep prompts and responses bounded.
  const count    = Math.max(1, Math.min(20, parseInt(req.body.count, 10) || 0));

  if (!jobTitle || !industry || !level || !count) {
    return res.status(400).json({ success: false, message: 'Job title, industry, level, and count are required.' });
  }

  const techCount = focus === 'behavioral' ? 0 : Math.floor(count / 2);
  const behCount  = focus === 'technical'  ? 0 : count - techCount;

  const prompt = `You are a senior interviewer at a top ${industry} company. Generate realistic interview questions and model answers.

Role: ${jobTitle}
Industry: ${industry}
Level: ${level}
${context ? `Additional context: ${context}` : ''}

Generate ${techCount} technical questions and ${behCount} behavioral questions.

Return ONLY valid JSON (no markdown, no backticks):
{
  "technical": [
    { "question": "...", "answer": "A model answer the candidate should aim for..." },
    ...
  ],
  "behavioral": [
    { "question": "...", "answer": "STAR-method answer: Situation, Task, Action, Result..." },
    ...
  ]
}

For behavioral questions, base answers on the STAR method.
For technical questions, give clear, accurate answers at the ${level} level.`;

  try {
    const raw = await callGemini(prompt);
    const clean = extractJsonString(raw);
    const data = JSON.parse(clean);

    if (!Array.isArray(data.technical) || !Array.isArray(data.behavioral)) {
      return res.status(500).json({ success: false, message: 'Interview response returned an unexpected format.' });
    }

    await db.query(
      'INSERT INTO interview_questions (user_id, job_title, generated_questions) VALUES (?, ?, ?)',
      [req.user.id, jobTitle, JSON.stringify(data)]
    );

    res.json({ success: true, data });
  } catch (err) {
    console.error('Interview generation error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to generate interview questions.',
      ...(process.env.NODE_ENV !== 'production' ? { error: err.message } : {})
    });
  }
});

// ── GET /api/interview/latest ─────────────────────────────
router.get('/latest', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT job_title, generated_questions, created_at FROM interview_questions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    if (!rows.length) {
      return res.json({ success: true, interview: null });
    }

    const interview = rows[0];
    interview.generated_questions = interview.generated_questions ? JSON.parse(interview.generated_questions) : null;
    res.json({ success: true, interview });
  } catch (err) {
    console.error('Load interview error:', err);
    res.status(500).json({ success: false, message: 'Failed to load saved interview questions.' });
  }
});

module.exports = router;
