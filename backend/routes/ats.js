const express  = require('express');
const multer   = require('multer');
const auth     = require('../middleware/auth');
const db       = require('../db');
const config   = require('../config');
const { callGemini, extractJsonString } = require('../controllers/gemini');
const { requireGenerationQuota } = require('../services/usage');
const router   = express.Router();

const MAX_FIELD = 12000;
const clip = (value) => String(value || '').slice(0, MAX_FIELD);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxBytes, files: 1 },
  fileFilter(req, file, cb) {
    const ok = /pdf|plain|text|msword|officedocument|markdown/i.test(file.mimetype)
      || /\.(txt|md|pdf|doc|docx)$/i.test(file.originalname || '');
    if (!ok) return cb(new Error('Please upload a .txt, .md, or .pdf file.'));
    cb(null, true);
  }
});

async function extractTextFromUpload(file) {
  const name = (file.originalname || '').toLowerCase();
  const mime = file.mimetype || '';

  if (mime.includes('pdf') || name.endsWith('.pdf')) {
    try {
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(file.buffer);
      return String(parsed.text || '').trim();
    } catch (err) {
      throw new Error('Could not read that PDF. Try exporting as text, or paste the CV manually.');
    }
  }

  // Plain text / markdown / anything else we treat as UTF-8
  return file.buffer.toString('utf8').trim();
}

function parseStoredReport(raw) {
  if (!raw) return { suggestions: [], foundKeywords: [], missingKeywords: [] };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return { suggestions: parsed, foundKeywords: [], missingKeywords: [] };
    }
    return {
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      foundKeywords: Array.isArray(parsed.foundKeywords) ? parsed.foundKeywords : [],
      missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : []
    };
  } catch {
    return { suggestions: [], foundKeywords: [], missingKeywords: [] };
  }
}

// ── POST /api/ats/extract ──────────────────────────────────
// Upload a CV file and return extracted text (no AI call).
router.post('/extract', auth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please choose a file to upload.' });
    }
    try {
      const text = await extractTextFromUpload(req.file);
      if (!text) {
        return res.status(400).json({ success: false, message: 'No readable text found in that file.' });
      }
      res.json({
        success: true,
        text: text.slice(0, MAX_FIELD),
        truncated: text.length > MAX_FIELD,
        filename: req.file.originalname
      });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message || 'Could not extract text.' });
    }
  });
});

// ── POST /api/ats/check ────────────────────────────────────
router.post('/check', auth, requireGenerationQuota('ats'), async (req, res) => {
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

    data.score = Math.max(0, Math.min(100, Math.round(data.score)));

    const stored = JSON.stringify({
      suggestions: data.suggestions,
      foundKeywords: data.foundKeywords,
      missingKeywords: data.missingKeywords
    });

    await db.query(
      'INSERT INTO ats_reports (user_id, score, recommendations) VALUES (?, ?, ?)',
      [req.user.id, data.score, stored]
    );

    if (req.recordGeneration) await req.recordGeneration();
    res.json({ success: true, data, usage: req.usagePreview || null });
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
      'SELECT id, score, recommendations, created_at FROM ats_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    if (!rows.length) {
      return res.json({ success: true, report: null });
    }

    const report = rows[0];
    const parsed = parseStoredReport(report.recommendations);
    res.json({
      success: true,
      report: {
        id: report.id,
        score: report.score,
        created_at: report.created_at,
        suggestions: parsed.suggestions,
        recommendations: parsed.suggestions,
        foundKeywords: parsed.foundKeywords,
        missingKeywords: parsed.missingKeywords
      }
    });
  } catch (err) {
    console.error('Load ATS error:', err);
    res.status(500).json({ success: false, message: 'Failed to load saved ATS report.' });
  }
});

// ── GET /api/ats/history ──────────────────────────────────
router.get('/history', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, score, created_at FROM ats_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
      [req.user.id]
    );
    res.json({ success: true, history: rows });
  } catch (err) {
    console.error('ATS history error:', err);
    res.status(500).json({ success: false, message: 'Failed to load ATS history.' });
  }
});

// ── GET /api/ats/:id ──────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid report id.' });
  try {
    const [rows] = await db.query(
      'SELECT id, score, recommendations, created_at FROM ats_reports WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Report not found.' });
    const report = rows[0];
    const parsed = parseStoredReport(report.recommendations);
    res.json({
      success: true,
      report: {
        id: report.id,
        score: report.score,
        created_at: report.created_at,
        suggestions: parsed.suggestions,
        recommendations: parsed.suggestions,
        foundKeywords: parsed.foundKeywords,
        missingKeywords: parsed.missingKeywords
      }
    });
  } catch (err) {
    console.error('ATS get error:', err);
    res.status(500).json({ success: false, message: 'Failed to load ATS report.' });
  }
});

module.exports = router;
