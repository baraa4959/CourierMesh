import {createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual} from 'node:crypto';
export const fingerprint = (v) => createHash('sha256').update(String(v)).digest('hex');
export function constantEqual(a,b) { const x=Buffer.from(String(a)); const y=Buffer.from(String(b)); return x.length===y.length && timingSafeEqual(x,y); }
export function encrypt(value,key) { const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv); const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]); return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64'); }
export function decrypt(value,key) {const b=Buffer.from(value,'base64'); const decipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));decipher.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString('utf8'));}
export function maskEmail(email) { const [local,domain] = email.split('@');return `${local?.slice(0,2)||'*'}***@${domain||'unknown'}`; }
