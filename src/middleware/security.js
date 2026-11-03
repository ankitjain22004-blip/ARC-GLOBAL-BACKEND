const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { AdminUser } = require('../models');

const COOKIE = 'arc_token';
const cookieOpts = () => ({ httpOnly: true, secure: env.isProd, sameSite: env.isProd ? 'none' : 'lax', domain: env.cookieDomain, path: '/', maxAge: 8 * 3600 * 1000 });
// Strip Mongo operators ($...) and dotted keys from user input (NoSQL injection defence).
const clean = (o) => {
  if (Array.isArray(o)) return o.map(clean);
  if (o && typeof o === 'object' && !Buffer.isBuffer(o)) {
    const r = {};
    for (const k of Object.keys(o)) { if (k.startsWith('$') || k.includes('.')) continue; r[k] = clean(o[k]); }
    return r;
  }
  return o;
};
const sanitize = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  for (const k of Object.keys(req.query || {})) if (typeof req.query[k] !== 'string') delete req.query[k];
  next();
};
// CSRF defence for cookie auth: state-changing requests need a custom header (forces a CORS preflight) plus an approved Origin.
const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const csrf = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = (req.get('origin') || '').replace(/\/$/, '');
  const okOrigin = origin ? env.origins.includes(origin) || (!env.isProd && localOrigin.test(origin)) : !env.isProd;
  if (req.get('x-arc-csrf') !== '1' || !okOrigin) return res.status(403).json({ ok: false, error: 'CSRF check failed' });
  next();
};
const requireAdmin = async (req, res, next) => {
  try {
    const t = req.cookies && req.cookies[COOKIE];
    if (!t) return res.status(401).json({ ok: false, error: 'Not authenticated' });
    const p = jwt.verify(t, env.jwtSecret, { algorithms: ['HS256'] });
    const u = await AdminUser.findById(p.sub);
    if (!u) return res.status(401).json({ ok: false, error: 'Not authenticated' });
    req.admin = { id: u.id, email: u.email, role: u.role };
    next();
  } catch { res.status(401).json({ ok: false, error: 'Not authenticated' }); }
};
const limiter = (windowMs, max, msg) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: msg }, skip: () => process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMIT });
const loginLimiter = limiter(15 * 60 * 1000, 10, 'Too many login attempts. Try again in 15 minutes.');
const formLimiter = limiter(60 * 60 * 1000, 10, 'Too many submissions. Please try again later.');
const apiLimiter = limiter(60 * 1000, 300, 'Too many requests.');
const notFound = (_req, res) => res.status(404).json({ ok: false, error: 'Not found' });
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  if (err.name === 'ZodError') return res.status(400).json({ ok: false, error: 'Validation failed', details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) });
  if (err.name === 'MulterError') return res.status(400).json({ ok: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5 MB)' : err.message });
  if (err.status && err.status < 500) return res.status(err.status).json({ ok: false, error: err.message });
  console.error(err);
  res.status(500).json({ ok: false, error: 'Server error' });
};
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { COOKIE, cookieOpts, sanitize, csrf, requireAdmin, loginLimiter, formLimiter, apiLimiter, notFound, errorHandler, wrap, clean };
