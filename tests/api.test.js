// Run: cd backend && npm install && npm test   (downloads an in-memory MongoDB on first run; needs internet)
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(48);
process.env.ALLOWED_ORIGINS = 'https://achillesracingclub.com';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const { AdminUser, Content, Enquiry, Application } = require('../src/models');
const H = { Origin: 'https://achillesracingclub.com', 'X-ARC-CSRF': '1' };
let mongod, agent;
before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await AdminUser.create({ email: 'admin@test.com', passwordHash: await bcrypt.hash('correct-horse-battery', 4) });
});
after(async () => { await mongoose.disconnect(); await mongod.stop(); });

test('health check', async () => { const r = await request(app).get('/health'); assert.equal(r.status, 200); assert.equal(r.body.db, true); });
test('admin API rejects unauthenticated requests', async () => {
  for (const p of ['/api/admin/stats', '/api/admin/enquiries', '/api/admin/content', '/api/admin/applications', '/api/admin/media']) assert.equal((await request(app).get(p)).status, 401, p);
});
test('login rejects wrong password and unknown email', async () => {
  assert.equal((await request(app).post('/api/admin/auth/login').set(H).send({ email: 'admin@test.com', password: 'nope' })).status, 401);
  assert.equal((await request(app).post('/api/admin/auth/login').set(H).send({ email: 'x@test.com', password: 'nope' })).status, 401);
});
test('state-changing request without CSRF header or bad origin is blocked', async () => {
  assert.equal((await request(app).post('/api/enquiries').set('Origin', 'https://evil.example').set('X-ARC-CSRF', '1').send({})).status, 403);
  assert.equal((await request(app).post('/api/enquiries').set('Origin', H.Origin).send({})).status, 403);
});
test('public enquiry: validation, honeypot, save', async () => {
  assert.equal((await request(app).post('/api/enquiries').set(H).send({ name: '', email: 'bad', message: '' })).status, 400);
  assert.equal((await request(app).post('/api/enquiries').set(H).send({ name: 'Bot', email: 'b@b.co', message: 'hi', website: 'spam' })).status, 400);
  const r = await request(app).post('/api/enquiries').set(H).send({ type: 'parts', name: 'Asha', email: 'a@x.com', message: 'Need brake disc' });
  assert.equal(r.status, 201); assert.equal(await Enquiry.countDocuments({ name: 'Asha' }), 1);
});
test('NoSQL operators are not accepted in login', async () => {
  const r = await request(app).post('/api/admin/auth/login').set(H).send({ email: { $gt: '' }, password: { $gt: '' } });
  assert.equal(r.status, 400);
});
test('career application with PDF is stored; non-PDF rejected', async () => {
  const bad = await request(app).post('/api/careers').set(H).field('name', 'Ravi').field('email', 'r@x.com').attach('resume', Buffer.from('not a pdf'), 'cv.pdf');
  assert.equal(bad.status, 400);
  const ok = await request(app).post('/api/careers').set(H).field('name', 'Ravi').field('email', 'r@x.com').field('area', 'Design').attach('resume', Buffer.from('%PDF-1.4 test'), 'cv.pdf');
  assert.equal(ok.status, 201); assert.equal(await Application.countDocuments({ name: 'Ravi' }), 1);
});
test('admin flow: login, content save is public, enquiry management, logout', async () => {
  agent = request.agent(app);
  assert.equal((await agent.post('/api/admin/auth/login').set(H).send({ email: 'admin@test.com', password: 'correct-horse-battery' })).status, 200);
  assert.equal((await agent.get('/api/admin/auth/me')).body.admin.email, 'admin@test.com');
  assert.equal((await agent.put('/api/admin/content/ticker').set(H).send({ value: ['A', 'B'], published: true })).status, 200);
  assert.equal((await agent.put('/api/admin/content/notakey').set(H).send({ value: [] })).status, 400);
  const pub = await request(app).get('/api/site/content');
  assert.deepEqual(pub.body.rows.find((x) => x.key === 'ticker').value, ['A', 'B']);
  await agent.put('/api/admin/content/ticker').set(H).send({ value: ['A'], published: false });
  assert.equal((await request(app).get('/api/site/content')).body.rows.some((x) => x.key === 'ticker'), false, 'unpublished must not be public');
  const list = await agent.get('/api/admin/enquiries?q=asha'); assert.equal(list.body.total, 1);
  const id = list.body.rows[0]._id;
  assert.equal((await agent.put('/api/admin/enquiries/' + id).set(H).send({ status: 'resolved', notes: 'called' })).body.row.status, 'resolved');
  assert.equal((await agent.put('/api/admin/enquiries/' + id).set(H).send({ status: 'bogus' })).status, 400);
  assert.match((await agent.get('/api/admin/enquiries/export.csv')).text, /Asha/);
  assert.equal((await agent.get('/api/admin/stats')).body.enquiries.total >= 1, true);
  assert.equal((await agent.delete('/api/admin/enquiries/' + id).set(H)).status, 200);
  await agent.post('/api/admin/auth/logout').set(H);
  assert.equal((await agent.get('/api/admin/stats')).status, 401);
});
