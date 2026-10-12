import { getConfig } from './config.js';
import { openStore } from './store.js';
import { createHttp } from './http.js';
import { smtpServer } from './smtp.js';
import { createWorker } from './worker.js';
let config, store, http, smtp, stop;
try { config = getConfig(); store = openStore(config); if (store.account.initial) { console.warn('\n============================================================\nCourierMesh FIRST RUN — ADMIN CREDENTIALS (shown once)\nUsername: admin\nTemporary password: ' + store.account.initial + '\nChange this password immediately after signing in.\nKeep your /data volume, and do not expose logs publicly.\n============================================================\n'); } http = createHttp(store, config); smtp = smtpServer(store, config); stop = createWorker(store, config).start(); console.info(JSON.stringify({ service: 'couriermesh', state: 'started', httpPort: config.httpPort, smtpPort: config.smtpEnabled ? config.smtpPort : null, requireStarttls: config.smtpRequireTls })); }
catch (e) { console.error('CourierMesh failed to start:', e.message); process.exit(1); }
function shutdown() { stop?.(); http?.close(); smtp?.close(); setTimeout(() => { store?.close(); process.exit(0); }, 250).unref(); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
