const router = require('express').Router();
const multer = require('multer');
const mongoose = require('mongoose');
const { Content, Enquiry, Application, Resume, MediaAsset, TYPES } = require('../models');
const v = require('../validators');
const media = require('../services/media');
const { requireAdmin, wrap } = require('../middleware/security');
router.use(requireAdmin);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const oid = (id) => { if (!mongoose.isValidObjectId(id)) throw bad('Invalid id'); return id; };
const page = (q) => ({ page: Math.max(1, parseInt(q.page) || 1), limit: Math.min(100, Math.max(1, parseInt(q.limit) || 20)) });

// ---- Dashboard (real counts) ----
router.get('/stats', wrap(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 864e5);
  const [total, fresh, pending, apps, newApps, byType, byDay, recent, contents] = await Promise.all([
    Enquiry.countDocuments(), Enquiry.countDocuments({ status: 'new' }), Enquiry.countDocuments({ status: 'pending' }),
    Application.countDocuments(), Application.countDocuments({ status: 'new' }),
    Enquiry.aggregate([{ $group: { _id: '$type', n: { $sum: 1 } } }]),
    Enquiry.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Enquiry.find().sort({ createdAt: -1 }).limit(6).select('name type subject status createdAt').lean(),
    Content.find().select('key value updatedAt').lean(),
  ]);
  const len = (k) => { const r = contents.find((c) => c.key === k); return r && Array.isArray(r.value) ? r.value.length : null; };
  res.json({ ok: true, enquiries: { total, new: fresh, pending }, applications: { total: apps, new: newApps },
    counts: { programmes: len('programmes'), events: len('events'), vehicles: len('vehicles'), parts: len('parts'), team: len('team'), gallery: len('gallery') },
    byType: Object.fromEntries(TYPES.map((t) => [t, (byType.find((x) => x._id === t) || {}).n || 0])), byDay: byDay.map((d) => ({ day: d._id, n: d.n })),
    recent, updates: contents.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5).map((c) => ({ key: c.key, updatedAt: c.updatedAt })) });
}));

// ---- Website content (vehicles, parts, programmes, events, team, gallery, text sections) ----
router.get('/content', wrap(async (_req, res) => res.json({ ok: true, rows: await Content.find().lean() })));
router.put('/content/:key', wrap(async (req, res) => {
  if (!v.CONTENT_KEYS.includes(req.params.key)) throw bad('Unknown content section');
  const b = v.contentBody.parse(req.body);
  const doc = await Content.findOneAndUpdate({ key: req.params.key }, { $set: { value: b.value, ...(b.published !== undefined && { published: b.published }), updatedBy: req.admin.email } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.json({ ok: true, row: doc });
}));
// Insert only the sections that don't exist yet (never overwrites edited content).
router.post('/content/import', wrap(async (req, res) => {
  const sections = req.body && req.body.sections;
  if (!sections || typeof sections !== 'object') throw bad('sections required');
  let added = 0;
  for (const key of Object.keys(sections)) {
    if (!v.CONTENT_KEYS.includes(key)) continue;
    const { value } = v.contentBody.parse({ value: sections[key] });
    const r = await Content.updateOne({ key }, { $setOnInsert: { key, value, published: true, updatedBy: req.admin.email } }, { upsert: true });
    if (r.upsertedCount) added++;
  }
  res.json({ ok: true, added });
}));

// ---- Enquiries ----
const enquiryFilter = (q) => {
  const f = {};
  if (TYPES.includes(q.type)) f.type = q.type;
  if (['new', 'pending', 'contacted', 'resolved'].includes(q.status)) f.status = q.status;
  if (q.from || q.to) { f.createdAt = {}; if (q.from && !isNaN(Date.parse(q.from))) f.createdAt.$gte = new Date(q.from); if (q.to && !isNaN(Date.parse(q.to))) f.createdAt.$lte = new Date(new Date(q.to).getTime() + 864e5 - 1); }
  if (q.q) { const r = new RegExp(esc(q.q.slice(0, 80)), 'i'); f.$or = [{ name: r }, { email: r }, { subject: r }, { message: r }, { phone: r }]; }
  return f;
};
router.get('/enquiries/export.csv', wrap(async (req, res) => {
  const rows = await Enquiry.find(enquiryFilter(req.query)).sort({ createdAt: -1 }).limit(10000).lean();
  const cell = (x) => { let s = String(x ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }; // CSV-injection safe
  const head = ['Date', 'Type', 'Name', 'Email', 'Phone', 'Subject', 'Message', 'Status', 'Notes'];
  const csv = [head.join(',')].concat(rows.map((r) => [r.createdAt.toISOString(), r.type, r.name, r.email, r.phone, r.subject, r.message, r.status, r.notes].map(cell).join(','))).join('\r\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="enquiries.csv"' }).send(csv);
}));
router.get('/enquiries', wrap(async (req, res) => {
  const { page: p, limit } = page(req.query), f = enquiryFilter(req.query);
  const [rows, total] = await Promise.all([Enquiry.find(f).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).lean(), Enquiry.countDocuments(f)]);
  res.json({ ok: true, rows, total, page: p, pages: Math.ceil(total / limit) });
}));
router.get('/enquiries/:id', wrap(async (req, res) => { const r = await Enquiry.findById(oid(req.params.id)).lean(); if (!r) throw bad('Not found', 404); res.json({ ok: true, row: r }); }));
router.put('/enquiries/:id', wrap(async (req, res) => { const r = await Enquiry.findByIdAndUpdate(oid(req.params.id), { $set: v.enquiryUpdate.parse(req.body) }, { new: true, runValidators: true }); if (!r) throw bad('Not found', 404); res.json({ ok: true, row: r }); }));
router.delete('/enquiries/:id', wrap(async (req, res) => { const r = await Enquiry.findByIdAndDelete(oid(req.params.id)); if (!r) throw bad('Not found', 404); res.json({ ok: true }); }));

// ---- Career applications ----
router.get('/applications', wrap(async (req, res) => {
  const { page: p, limit } = page(req.query), f = {};
  if (['new', 'reviewing', 'shortlisted', 'rejected', 'hired'].includes(req.query.status)) f.status = req.query.status;
  if (req.query.q) { const r = new RegExp(esc(req.query.q.slice(0, 80)), 'i'); f.$or = [{ name: r }, { email: r }, { area: r }]; }
  const [rows, total] = await Promise.all([Application.find(f).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).lean(), Application.countDocuments(f)]);
  res.json({ ok: true, rows, total, page: p, pages: Math.ceil(total / limit) });
}));
router.put('/applications/:id', wrap(async (req, res) => { const r = await Application.findByIdAndUpdate(oid(req.params.id), { $set: v.applicationUpdate.parse(req.body) }, { new: true, runValidators: true }); if (!r) throw bad('Not found', 404); res.json({ ok: true, row: r }); }));
router.get('/applications/:id/resume', wrap(async (req, res) => {
  const a = await Application.findById(oid(req.params.id)).lean(); if (!a || !a.resumeId) throw bad('No resume', 404);
  const r = await Resume.findById(a.resumeId).select('+data'); if (!r) throw bad('No resume', 404);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${(r.filename || 'resume.pdf').replace(/[^\w.\- ]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff' }).send(r.data);
}));
router.delete('/applications/:id', wrap(async (req, res) => {
  const a = await Application.findByIdAndDelete(oid(req.params.id)); if (!a) throw bad('Not found', 404);
  if (a.resumeId) await Resume.findByIdAndDelete(a.resumeId);
  res.json({ ok: true });
}));

// ---- Media (Cloudinary) ----
router.get('/media', wrap(async (_req, res) => res.json({ ok: true, rows: await MediaAsset.find().sort({ createdAt: -1 }).limit(200).lean(), storageConfigured: media.configured() })));
router.post('/media', upload.single('file'), wrap(async (req, res) => {
  if (!media.configured()) throw bad('Image storage is not configured (set CLOUDINARY_* variables).', 503);
  if (!req.file) throw bad('No file');
  const fmt = media.sniff(req.file.buffer); if (!fmt) throw bad('Only JPEG, PNG, WebP or GIF images are allowed');
  const r = await media.upload(req.file.buffer);
  const row = await MediaAsset.create({ url: r.secure_url, publicId: r.public_id, originalName: (req.file.originalname || '').slice(0, 120), bytes: r.bytes, format: r.format, uploadedBy: req.admin.email });
  res.status(201).json({ ok: true, row });
}));
router.delete('/media/:id', wrap(async (req, res) => {
  const m = await MediaAsset.findById(oid(req.params.id)); if (!m) throw bad('Not found', 404);
  if (media.configured()) await media.destroy(m.publicId);
  await m.deleteOne(); res.json({ ok: true });
}));
module.exports = router;
