import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import {openStore} from '../src/store.js';
import {smtpServer} from '../src/smtp.js';

test('SMTP requires STARTTLS and accepts secure authentication after TLS upgrade',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cm-tls-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-subj','/CN=localhost'],{stdio:'ignore'});
 const config={dbPath:join(dir,'db'),encryptionKey:randomBytes(32),adminToken:'a'.repeat(40),smtpEnabled:true,smtpHost:'127.0.0.1',smtpPort:0,smtpRequireTls:true,smtpCert:join(dir,'cert.pem'),smtpKey:join(dir,'key.pem'),maxMessageBytes:65536,maxQueueDepth:100,allowFrom:[],messageTtlSeconds:600};
 const store=openStore(config);const server=smtpServer(store,config);await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();store.close()});
 let stream=net.connect(server.address().port,'127.0.0.1'),buffer='',received=[];function wire(){stream.on('data',data=>{buffer+=data.toString();let i;while((i=buffer.indexOf('\n'))>=0){received.push(buffer.slice(0,i).trim());buffer=buffer.slice(i+1);}});}wire();
 const wait=async prefix=>{for(let i=0;i<200;i++){const index=received.findIndex(l=>l.startsWith(prefix));if(index>=0)return received.splice(index,1)[0];await new Promise(r=>setTimeout(r,8));}throw Error(`Response '${prefix}' not received. Saw: ${received.join('|')}`);};
 await wait('220');stream.write('EHLO demo.local\r\n');await wait('250 HELP');stream.write('AUTH PLAIN\r\n');await wait('538');stream.write('STARTTLS\r\n');await wait('220');stream.removeAllListeners('data');received=[];buffer='';
 stream=tls.connect({socket:stream,rejectUnauthorized:false,servername:'localhost'});await new Promise((resolve,reject)=>{stream.once('secureConnect',resolve);stream.once('error',reject);});wire();stream.write('EHLO demo.local\r\n');await wait('250 HELP');stream.write('AUTH PLAIN '+Buffer.from('\0invalid\0secret').toString('base64')+'\r\n');await wait('535');stream.end();
});
