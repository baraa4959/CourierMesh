import {randomBytes} from 'node:crypto';
const int = (key, fallback, min, max) => { const v = Number(process.env[key] ?? fallback); if (!Number.isInteger(v) || v < min || v > max) throw Error(`Invalid ${key}`); return v; };
export function getConfig() {
  const adminToken = process.env.ADMIN_TOKEN ?? '';
  const encryptionKey = process.env.ENCRYPTION_KEY ?? '';
  if (adminToken && adminToken.length < 32) throw Error('ADMIN_TOKEN must contain at least 32 random characters when supplied');
  if (!/^[a-f\d]{64}$/i.test(encryptionKey)) throw Error('ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)');
  return {
    adminToken, encryptionKey: Buffer.from(encryptionKey, 'hex'),
    dbPath: process.env.DB_PATH || './data/couriermesh.db',
    httpHost: process.env.HTTP_HOST || '0.0.0.0', httpPort: int('HTTP_PORT',8080,1,65535),
    smtpHost: process.env.SMTP_HOST || '0.0.0.0', smtpPort: int('SMTP_PORT',2525,1,65535),
    smtpEnabled: process.env.SMTP_ENABLED !== 'false',
    smtpRequireTls: process.env.SMTP_REQUIRE_TLS !== 'false',
    smtpCert: process.env.SMTP_CERT || '', smtpKey: process.env.SMTP_KEY || '',
    maxMessageBytes: int('MAX_MESSAGE_BYTES',65536,1024,524288),
    maxQueueDepth: int('MAX_QUEUE_DEPTH',10000,1,100000),
    messageTtlSeconds: int('MESSAGE_TTL_SECONDS',600,60,86400),
    httpTimeoutMs: int('PROVIDER_TIMEOUT_MS',12000,1000,60000),
    allowFrom: (process.env.ALLOWED_SENDERS || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean),
    workerIntervalMs: int('WORKER_INTERVAL_MS',400,100,60000),
    workerConcurrency: int('WORKER_CONCURRENCY',6,1,20)
  };
}
export function generateKey(prefix='cm_') { return prefix + randomBytes(32).toString('base64url'); }
