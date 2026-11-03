require('dotenv').config();
const list = (s) => (s || '').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);
const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  origins: list(process.env.ALLOWED_ORIGINS),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cloudinary: { name: process.env.CLOUDINARY_CLOUD_NAME, key: process.env.CLOUDINARY_API_KEY, secret: process.env.CLOUDINARY_API_SECRET },
};
env.isProd = env.nodeEnv === 'production';
env.validate = () => {
  const missing = ['mongoUri', 'jwtSecret'].filter((k) => !env[k]);
  if (missing.length) throw new Error('Missing environment variables: ' + missing.join(', '));
  if (env.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  if (env.isProd && !env.origins.length) throw new Error('ALLOWED_ORIGINS must be set in production');
};
module.exports = env;
