const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AdminUser } = require('../models');
const v = require('../validators');
const { COOKIE, cookieOpts, loginLimiter, requireAdmin, wrap } = require('../middleware/security');
const DUMMY = bcrypt.hashSync('not-a-real-password', 12); // equalises timing for unknown emails

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = v.login.parse(req.body);
  const u = await AdminUser.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  const ok = await bcrypt.compare(password, u ? u.passwordHash : DUMMY);
  if (!u || !ok) return res.status(401).json({ ok: false, error: 'Incorrect email or password' });
  u.lastLoginAt = new Date(); await u.save();
  const token = jwt.sign({ sub: u.id }, env.jwtSecret, { algorithm: 'HS256', expiresIn: env.jwtExpires });
  res.cookie(COOKIE, token, cookieOpts()).json({ ok: true, admin: { email: u.email, role: u.role } });
}));
router.post('/logout', (_req, res) => {
  const { maxAge, ...o } = cookieOpts();
  res.clearCookie(COOKIE, o).json({ ok: true });
});
router.get('/me', requireAdmin, (req, res) => res.json({ ok: true, admin: req.admin }));
module.exports = router;
