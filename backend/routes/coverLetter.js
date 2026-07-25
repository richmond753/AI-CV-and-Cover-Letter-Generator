const express  = require('express');
const PDFDocument = require('pdfkit');
const auth     = require('../middleware/auth');
const db       = require('../db');
const { callGemini } = require('../controllers/gemini');
const { requireGenerationQuota } = require('../services/usage');
const router   = express.Router();

const MAX_FIELD = 8000;
const clip = (value) => String(value || '').slice(0, MAX_FIELD);

// ── POST /api/cover-letter/generate ───────────────────────
router.post('/generate', auth, requireGenerationQuota('cover-letter'), async (req, res) => {
  const jobTitle       = clip(req.body.jobTitle);
  const companyName    = clip(req.body.companyName);
  const jobDescription = clip(req.body.jobDescription);
  const userName       = clip(req.body.userName);
  const background     = clip(req.body.background);
  const tone           = String(req.body.tone || '').trim();
  const cvContext      = clip(req.body.cvContext);

  if (!jobTitle || !companyName || !jobDescription) {
    return res.status(400).json({ success: false, message: 'Job title, company name, and job description are required.' });
  }

  const toneMap = {
    professional: 'formal and professional',
    enthusiastic: 'enthusiastic and energetic',
    concise:      'concise and direct, no fluff',
    creative:     'creative and personality-driven'
  };

  const prompt = `Write a tailored cover letter for a job application.

Applicant: ${userName || req.user.fullname}
Target Role: ${jobTitle} at ${companyName}
Tone: ${toneMap[tone] || 'professional'}

JOB DESCRIPTION:
${jobDescription}

APPLICANT BACKGROUND:
${background || cvContext || 'Not provided — use general graduate-level language.'}

Instructions:
- Address it "Dear Hiring Team,"
- 3-4 paragraphs: opening hook, relevant experience, why this company, strong close
- Match keywords from the job description naturally
- End with: "Yours sincerely,\n${userName || req.user.fullname}"
- Output ONLY the cover letter text, no preamble`;

  try {
    const coverLetter = await callGemini(prompt);

    await db.query(
      'INSERT INTO cover_letters (user_id, company_name, job_title, content) VALUES (?, ?, ?, ?)',
      [req.user.id, companyName, jobTitle, coverLetter]
    );

    if (req.recordGeneration) await req.recordGeneration();
    res.json({ success: true, coverLetter, usage: req.usagePreview || null });
  } catch (err) {
    console.error('Cover letter error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to generate cover letter.',
      ...(process.env.NODE_ENV !== 'production' ? { error: err.message } : {})
    });
  }
});

// ── GET /api/cover-letter/latest ──────────────────────────
router.get('/latest', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT company_name, job_title, content, created_at FROM cover_letters WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    if (!rows.length) {
      return res.json({ success: true, coverLetter: null });
    }

    res.json({ success: true, coverLetter: rows[0] });
  } catch (err) {
    console.error('Load cover letter error:', err);
    res.status(500).json({ success: false, message: 'Failed to load saved cover letter.' });
  }
});

// ── POST /api/cover-letter/download ───────────────────────
router.post('/download', auth, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ success: false });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="cover-letter.pdf"');

  const doc = new PDFDocument({ margin: 60, size: 'A4' });
  doc.pipe(res);

  const lines = String(content).split(/\r?\n/);
  doc.font('Helvetica').fontSize(10.5).fillColor('#0D1117');

  lines.forEach(line => {
    const trimmed = line.trimEnd();
    if (!trimmed) {
      doc.moveDown(0.5);
      return;
    }

    if (/^Dear/i.test(trimmed) || /^Yours sincerely/i.test(trimmed)) {
      doc.font('Helvetica-Bold').text(trimmed, { paragraphGap: 6 });
      doc.font('Helvetica');
      return;
    }

    doc.text(trimmed, { paragraphGap: 4, lineGap: 3 });
  });

  doc.end();
});

// ── GET /api/cover-letter/history ─────────────────────────
router.get('/history', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, company_name, job_title, created_at
       FROM cover_letters WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 10`,
      [req.user.id]
    );
    res.json({ success: true, history: rows });
  } catch (err) {
    console.error('Cover letter history error:', err);
    res.status(500).json({ success: false, message: 'Failed to load cover letter history.' });
  }
});

// ── GET /api/cover-letter/:id ─────────────────────────────
router.get('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid id.' });
  try {
    const [rows] = await db.query(
      'SELECT id, company_name, job_title, content, created_at FROM cover_letters WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Cover letter not found.' });
    res.json({ success: true, coverLetter: rows[0] });
  } catch (err) {
    console.error('Cover letter get error:', err);
    res.status(500).json({ success: false, message: 'Failed to load cover letter.' });
  }
});

// ── DELETE /api/cover-letter/latest ───────────────────────
router.delete('/latest', auth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM cover_letters WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    res.json({ success: true, message: 'Saved cover letter deleted.' });
  } catch (err) {
    console.error('Delete cover letter error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete saved cover letter.' });
  }
});

module.exports = router;
