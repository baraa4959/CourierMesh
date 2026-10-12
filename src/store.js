import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {decrypt,encrypt,fingerprint,maskEmail} from './crypto.js';
import {validateProvider} from './validate.js';
export function openStore(cfg){mkdirSync(dirname(cfg.dbPath),{recursive:true,mode:0o700});const db=new DatabaseSync(cfg.dbPath);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');db.exec(`
 CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, credential_enc TEXT NOT NULL, enabled INTEGER NOT NULL, priority INTEGER NOT NULL, daily_limit INTEGER NOT NULL, monthly_limit INTEGER NOT NULL, hourly_limit INTEGER NOT NULL, minute_limit INTEGER NOT NULL, created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL, secret_hash TEXT NOT NULL, allowed_from TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER);
 CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, api_key_id TEXT NOT NULL, idempotency TEXT UNIQUE, recipient_hash TEXT NOT NULL, recipient_masked TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_enc TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, provider_id TEXT, last_error TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS ix_messages_queue ON messages(status,created_at);
 CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id), provider_id TEXT NOT NULL REFERENCES providers(id), status TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, response_code INTEGER, note TEXT);
 CREATE INDEX IF NOT EXISTS ix_attempt_quota ON attempts(provider_id,status,started_at);
 `);
 const q=(sql,...args)=>db.prepare(sql).all(...args);const get=(sql,...args)=>db.prepare(sql).get(...args);
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
 function viewProvider(p){ const u=usage(p.id);return {id:p.id,name:p.name,type:p.type,enabled:!!p.enabled,priority:p.priority,dailyLimit:p.daily_limit,monthlyLimit:p.monthly_limit,hourlyLimit:p.hourly_limit,minuteLimit:p.minute_limit,usage:u,createdAt:p.created_at}; }
 function usage(id){const now=Date.now(),day=new Date(now).setUTCHours(0,0,0,0);const statuses="('reserved','accepted','unknown')";const total=(since)=>get(`SELECT count(*) AS n FROM attempts WHERE provider_id=? AND status IN ${statuses} AND started_at>=?`,id,since)?.n??0;return {day:total(day), rolling30d:total(now-30*86400000),hour:total(now-3600000),minute:total(now-60000)};}
 function listProviders(){return q('SELECT * FROM providers ORDER BY priority ASC,created_at ASC').map(viewProvider);}
 function createProvider(input){const p=validateProvider(input);const id=randomUUID(),now=Date.now();db.prepare('INSERT INTO providers VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,p.name,p.type,encrypt(p.credentials,cfg.encryptionKey),p.enabled?1:0,p.priority,p.dailyLimit,p.monthlyLimit,p.hourlyLimit,p.minuteLimit,now);return viewProvider(get('SELECT * FROM providers WHERE id=?',id));}
 function editProvider(id,input){const current=get('SELECT * FROM providers WHERE id=?',id);if(!current)throw Error('Provider not found');const prior={type:current.type,name:current.name,enabled:!!current.enabled,priority:current.priority,dailyLimit:current.daily_limit,monthlyLimit:current.monthly_limit,hourlyLimit:current.hourly_limit,minuteLimit:current.minute_limit,credentials:decrypt(current.credential_enc,cfg.encryptionKey)};const p=validateProvider({...input,credentials:input.credentials && Object.keys(input.credentials).length?{...prior.credentials,...input.credentials}:prior.credentials},prior);db.prepare('UPDATE providers SET name=?,credential_enc=?,enabled=?,priority=?,daily_limit=?,monthly_limit=?,hourly_limit=?,minute_limit=? WHERE id=?').run(p.name,encrypt(p.credentials,cfg.encryptionKey),p.enabled?1:0,p.priority,p.dailyLimit,p.monthlyLimit,p.hourlyLimit,p.minuteLimit,id);return viewProvider(get('SELECT * FROM providers WHERE id=?',id));}
 function createKey(name,allowedFrom,secret){if(typeof name!=='string'||name.length<2||name.length>80)throw Error('Invalid key name');const id=randomUUID(),now=Date.now();db.prepare('INSERT INTO api_keys VALUES (?,?,?,?,?,NULL)').run(id,name,fingerprint(secret),allowedFrom.toLowerCase(),now);return {id,name,allowedFrom,createdAt:now,token:`${id}.${secret}`};}
 function authenticate(token){if(typeof token!=='string'||token.length>250)return null;const parts=token.split('.');if(parts.length!==2)return null;const k=get('SELECT * FROM api_keys WHERE id=? AND revoked_at IS NULL',parts[0]);if(!k||fingerprint(parts[1])!==k.secret_hash)return null;return k;}
 function enqueue(m,key,idempotency){return transaction(()=>{
  if(idempotency){const ex=get('SELECT id,status FROM messages WHERE idempotency=?',`${key.id}:${idempotency}`);if(ex){const existing=get('SELECT payload_hash FROM messages WHERE id=?',ex.id);if(existing.payload_hash!==fingerprint(JSON.stringify(m)))throw Error('IDEMPOTENCY_CONFLICT');return {...ex,duplicate:true};}}
  const queueSize=get("SELECT COUNT(*) AS n FROM messages WHERE status IN ('queued','processing')")?.n??0;
  if(queueSize>=cfg.maxQueueDepth)throw Error('QUEUE_FULL');
  const id=randomUUID(),now=Date.now();db.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,key.id,idempotency?`${key.id}:${idempotency}`:null,fingerprint(m.to),maskEmail(m.to),fingerprint(JSON.stringify(m)),encrypt(m,cfg.encryptionKey),m.kind,'queued',null,null,now,now+cfg.messageTtlSeconds*1000,now);return {id,status:'queued',duplicate:false};
 });}
 function nextJob(){return transaction(()=>{const job=get("SELECT * FROM messages WHERE status='queued' AND expires_at>? ORDER BY created_at ASC LIMIT 1",Date.now());if(!job)return null;
   // A stuck message without an eligible provider is left queued to respect minute quotas.
   const tried=q('SELECT provider_id FROM attempts WHERE message_id=?',job.id).map(x=>x.provider_id);
   const providers=q('SELECT * FROM providers WHERE enabled=1 ORDER BY priority ASC, created_at ASC');
   const eligible=providers.filter(p=>!tried.includes(p.id)&& (p.type!=='loops'||job.kind==='otp'||!!decrypt(p.credential_enc,cfg.encryptionKey).genericTransactionalId));
   const selected=eligible.find(p=>{const u=usage(p.id);return (!p.daily_limit||u.day<p.daily_limit)&&(!p.monthly_limit||u.rolling30d<p.monthly_limit)&&(!p.hourly_limit||u.hour<p.hourly_limit)&&(!p.minute_limit||u.minute<p.minute_limit);});
   if(!selected) {
     const hasRecoverable=eligible.some(p=>{const u=usage(p.id);return (!p.daily_limit||u.day<p.daily_limit)&&(!p.monthly_limit||u.rolling30d<p.monthly_limit);});
     if(!hasRecoverable)db.prepare("UPDATE messages SET status='failed',payload_enc='',last_error='No eligible provider with quota',updated_at=? WHERE id=?").run(Date.now(),job.id);
     return null;
   }
   const attemptId=randomUUID();db.prepare("UPDATE messages SET status='processing',provider_id=?,updated_at=? WHERE id=?").run(selected.id,Date.now(),job.id);
   db.prepare('INSERT INTO attempts VALUES (?,?,?,?,?,?,?,?)').run(attemptId,job.id,selected.id,'reserved',Date.now(),null,null,null);
   return {id:job.id,attemptId,provider:{...viewProvider(selected),credentials:decrypt(selected.credential_enc,cfg.encryptionKey)},message:decrypt(job.payload_enc,cfg.encryptionKey)};
 });}
 function finish(job,outcome){return transaction(()=>{
   const now=Date.now();const status=outcome.kind==='accepted'?'accepted':outcome.kind==='uncertain'?'unknown':'rejected';
   db.prepare('UPDATE attempts SET status=?,finished_at=?,response_code=?,note=? WHERE id=?').run(status,now,outcome.status||null,outcome.reason?.slice(0,250)||null,job.attemptId);
   const msgStatus=status==='accepted'?'accepted':status==='unknown'?'unknown':'queued';
   db.prepare('UPDATE messages SET status=?,payload_enc=CASE WHEN ? IN (\'accepted\',\'unknown\') THEN \'\' ELSE payload_enc END,last_error=?,updated_at=? WHERE id=?').run(msgStatus,msgStatus,outcome.reason?.slice(0,200)||null,now,job.id);
 });}
 function expire(){db.prepare("UPDATE messages SET status='expired',payload_enc='',updated_at=? WHERE status='queued' AND expires_at<=?").run(Date.now(),Date.now());}
 function recover(){return transaction(()=>{const jobs=q("SELECT id FROM messages WHERE status='processing'");for(const m of jobs){db.prepare("UPDATE attempts SET status='unknown',note='Worker restarted during attempt',finished_at=? WHERE message_id=? AND status='reserved'").run(Date.now(),m.id);db.prepare("UPDATE messages SET status='unknown',payload_enc='',last_error='Worker restarted during dispatch; automatic resend suppressed',updated_at=? WHERE id=?").run(Date.now(),m.id);}return jobs.length;});}
 function prune(){const redact=Date.now()-14*86400000,keep=Date.now()-35*86400000;db.prepare("UPDATE messages SET recipient_masked='[redacted]', recipient_hash='' WHERE created_at<? AND recipient_masked!='[redacted]'").run(redact);db.prepare('DELETE FROM attempts WHERE message_id IN (SELECT id FROM messages WHERE created_at<?)').run(keep);db.prepare('DELETE FROM messages WHERE created_at<?').run(keep);}
 function stats(){const byStatus=q('SELECT status,count(*) count FROM messages GROUP BY status');return {messages:Object.fromEntries(byStatus.map(x=>[x.status,x.count])),providers:listProviders(),queue:get("SELECT count(*) count FROM messages WHERE status IN ('queued','processing')").count};}
 function listMessages(){return q('SELECT id,recipient_masked AS recipient,kind,status,created_at AS createdAt,updated_at AS updatedAt,provider_id AS providerId,last_error AS lastError FROM messages WHERE created_at>=? ORDER BY created_at DESC LIMIT 100',Date.now()-14*86400000);}
 function messageStatus(id,key){return get('SELECT id,status,kind,created_at AS createdAt,updated_at AS updatedAt FROM messages WHERE id=? AND api_key_id=?',id,key.id);}
 function listKeys(){return q('SELECT id,name,allowed_from AS allowedFrom,created_at AS createdAt,revoked_at AS revokedAt FROM api_keys ORDER BY created_at DESC');}
 function revokeKey(id){return db.prepare('UPDATE api_keys SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(Date.now(),id).changes;}
 function removeProvider(id){const attempts=get('SELECT COUNT(*) n FROM attempts WHERE provider_id=?',id)?.n??0;if(attempts) { db.prepare('UPDATE providers SET enabled=0 WHERE id=?').run(id);return 'disabled';}db.prepare('DELETE FROM providers WHERE id=?').run(id);return 'deleted';}
 function close(){db.close();}
 return {db,createProvider,editProvider,listProviders,createKey,authenticate,enqueue,nextJob,finish,expire,recover,prune,stats,listMessages,messageStatus,listKeys,revokeKey,removeProvider,close};
}
