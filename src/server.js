require('dns').setServers(['1.1.1.1']);

const env = require('./config/env');
env.validate();
const connect = require('./config/db');
const app = require('./app');
connect(env.mongoUri)
  .then(() => app.listen(env.port, () => console.log(`ARC API listening on ${env.port} (${env.nodeEnv})`)))
  .catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
