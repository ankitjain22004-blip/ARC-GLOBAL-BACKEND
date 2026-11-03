// Usage: ADMIN_EMAIL=you@x.com ADMIN_PASSWORD='long-passphrase' npm run create-admin
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const connect = require('../src/config/db');
const { AdminUser } = require('../src/models');
(async () => {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim(), pw = process.env.ADMIN_PASSWORD || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Set ADMIN_EMAIL');
  if (pw.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  if (!env.mongoUri) throw new Error('Set MONGODB_URI');
  await connect(env.mongoUri);
  await AdminUser.findOneAndUpdate({ email }, { email, passwordHash: await bcrypt.hash(pw, 12) }, { upsert: true, setDefaultsOnInsert: true });
  console.log('Admin ready:', email); process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
