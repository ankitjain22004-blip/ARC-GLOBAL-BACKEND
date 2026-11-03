const router = require('express').Router();
const multer = require('multer');
const { Content, Enquiry, Application, Resume } = require('../models');
const v = require('../validators');
const media = require('../services/media');
const { formLimiter, wrap } = require('../middleware/security');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12 } });

// Published website sections only (drafts are never returned).
router.get('/site/content', wrap(async (_req, res) => {
  const rows = await Content.find({ published: true }).select('key value -_id').lean();
  res.set('Cache-Control', 'public, max-age=30').json({ ok: true, rows });
}));
router.post('/enquiries', formLimiter, wrap(async (req, res) => {
  const d = v.enquiry.parse(req.body);
  if (d.website) return res.status(400).json({ ok: false, error: 'Rejected' });
  delete d.website;
  await Enquiry.create({ ...d, ip: req.ip });
  res.status(201).json({ ok: true });
}));
router.post('/careers', formLimiter, upload.single('resume'), wrap(async (req, res) => {
  const d = v.career.parse(req.body);
  delete d.website;
  let resume;
  if (req.file) {
    if (!media.isPdf(req.file.buffer)) return res.status(400).json({ ok: false, error: 'Resume must be a PDF' });
    resume = await Resume.create({ filename: (req.file.originalname || 'resume.pdf').replace(/[^\w.\- ]/g, '_').slice(0, 120), data: req.file.buffer, size: req.file.size });
  }
  await Application.create({ ...d, resumeId: resume && resume._id, resumeName: resume && resume.filename, ip: req.ip });
  res.status(201).json({ ok: true });
}));
module.exports = router;
