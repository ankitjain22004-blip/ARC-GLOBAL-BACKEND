const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const env = require('./config/env');
const sec = require('./middleware/security');

const app = express();
app.set('trust proxy', 1); // Railway sits behind a proxy; needed for correct client IP in rate limits
app.disable('x-powered-by');
app.use(helmet());
const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({
  credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-ARC-CSRF'],
  origin: (origin, cb) => cb(null, !origin || env.origins.includes(origin.replace(/\/$/, '')) || (!env.isProd && localOrigin.test(origin))),
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(sec.sanitize);
app.get('/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api', sec.apiLimiter, sec.csrf);
app.use('/api/admin/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/public'));
app.use(sec.notFound);
app.use(sec.errorHandler);
module.exports = app;
