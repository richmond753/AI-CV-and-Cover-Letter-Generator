const express  = require('express');
const PDFDocument = require('pdfkit');
const auth     = require('../middleware/auth');
const db       = require('../db');
const { callGemini } = require('../controllers/gemini');
const router   = express.Router();

const MAX_FIELD = 5000;
const clip = (value) => String(value || '').slice(0, MAX_FIELD);

// ── POST /api/cv/generate ──────────────────────────────────
router.post('/generate', auth, async (req, res) => {
  const name          = clip(req.body.name);
  const title         = clip(req.body.title);
  const email         = clip(req.body.email);
  const phone         = clip(req.body.phone);
  const location      = clip(req.body.location);
  const links         = clip(req.body.links);
  const education     = clip(req.body.education);
  const experience    = clip(req.body.experience);
  const skills        = clip(req.body.skills);
  const projects      = clip(req.body.projects);
  const certifications = clip(req.body.certifications);

  if (!name || !education || !skills) {
    return res.status(400).json({ success: false, message: 'Name, education, and skills are required.' });
  }

  const prompt = `You are a professional CV writer. Create a clean, ATS-optimised CV for the following person.

Name: ${name}
Target Job Title: ${title}
Email: ${email} | Phone: ${phone} | Location: ${location}
${links ? `Links: ${links}` : ''}

EDUCATION:
${education}

WORK EXPERIENCE:
${experience || 'No work experience provided — focus on education, projects, and skills.'}

SKILLS:
${skills}

PROJECTS:
${projects || 'N/A'}

CERTIFICATIONS:
${certifications || 'N/A'}

Instructions:
- Use clear section headings (EDUCATION, EXPERIENCE, SKILLS, PROJECTS, CERTIFICATIONS)
- Use bullet points for experience and projects
- Quantify achievements where possible
- Keep it to 1 page worth of content
- Do NOT include any preamble or explanation — output ONLY the CV text`;

  try {
    const cv = await callGemini(prompt);

    await db.query(
      `INSERT INTO cvs (user_id, education, experience, skills, projects, certifications, generated_cv)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE education=VALUES(education), experience=VALUES(experience),
       skills=VALUES(skills), projects=VALUES(projects), certifications=VALUES(certifications), generated_cv=VALUES(generated_cv)`,
      [req.user.id, education, experience, skills, projects, certifications, cv]
    );

    res.json({ success: true, cv });
  } catch (err) {
    console.error('CV generation error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to generate CV.',
      ...(process.env.NODE_ENV !== 'production' ? { error: err.message } : {})
    });
  }
});

// ── GET /api/cv/latest ─────────────────────────────────────
router.get('/latest', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT education, experience, skills, projects, certifications, generated_cv, updated_at FROM cvs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      [req.user.id]
    );

    if (!rows.length) {
      return res.json({ success: true, cv: null });
    }

    res.json({ success: true, cv: rows[0] });
  } catch (err) {
    console.error('Load CV error:', err);
    res.status(500).json({ success: false, message: 'Failed to load saved CV.' });
  }
});

// ── POST /api/cv/download ──────────────────────────────────
router.post('/download', auth, (req, res) => {
  const { cv } = req.body;
  if (!cv) return res.status(400).json({ success: false, message: 'No CV content provided.' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="my-cv.pdf"');

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  const lines = String(cv).split(/\r?\n/);
  let firstHeadingWritten = false;

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#0D1117').text(req.user.fullname || 'CV', { align: 'center' });
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(10).fillColor('#5B6AF0').text(req.user.email || '', { align: 'center' });
  doc.moveDown(0.8);

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) {
      doc.moveDown(0.35);
      return;
    }

    if (/^[A-Z][A-Z\s&/-]+:?$/.test(trimmed)) {
      if (firstHeadingWritten) doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0D1117').text(trimmed.replace(/:$/, ''));
      doc.moveDown(0.12);
      firstHeadingWritten = true;
      return;
    }

    if (/^[-•]/.test(trimmed)) {
      doc.font('Helvetica').fontSize(10).fillColor('#1C2333').text(`• ${trimmed.replace(/^[-•]\s*/, '')}`, { indent: 8 });
      return;
    }

    doc.font('Helvetica').fontSize(10.5).fillColor('#1C2333').text(trimmed, { paragraphGap: 4 });
  });

  doc.end();
});

// ── DELETE /api/cv/latest ──────────────────────────────────
router.delete('/latest', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM cvs WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'Saved CV deleted.' });
  } catch (err) {
    console.error('Delete CV error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete saved CV.' });
  }
});

module.exports = router;
