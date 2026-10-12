import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../src/store.js';
import {createHttp} from '../src/http.js';
import {parseMime} from '../src/smtp.js';
import {deliver} from '../src/providers.js';
const sender='noreply@example.com',to='test@example.net';
const raw={kind:'raw',from:sender,to,subject:'Test email',text:'This is a safe test.'};
function setup(t){const dir=mkdtempSync(join(tmpdir(),'couriermesh-upgrade-'));const cfg={dbPath:join(dir,'app.db'),encryptionKey:randomBytes(32),adminToken:'Z'.repeat(40),allowFrom:[],maxQueueDepth:100,maxMessageBytes:65536,messageTtlSeconds:600,httpPort:0,httpHost:'127.0.0.1',smtpPort:0,smtpHost:'127.0.0.1',smtpEnabled:false,smtpRequireTls:true};const store=openStore(cfg);t.after(()=>{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});});return {store,cfg,dir};}
async function openServer(t,store,cfg){const srv=createHttp(store,cfg);await new Promise(r=>srv.on('listening',r));t.after(()=>srv.close());return `http://127.0.0.1:${srv.address().port}`;}
const json=(url,data,auth='',method='POST')=>fetch(url,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:JSON.stringify(data)});
test('first start creates one-time eight-character admin password and requires change',async t=>{
 const {store,cfg,dir}=setup(t);const temporary=store.account.initial;assert.equal(temporary.length,8);assert.equal(store.account.login('admin','bad'),null);
 const base=await openServer(t,store,cfg);const signed=await json(base+'/auth/login',{username:'admin',password:temporary});assert.equal(signed.status,200);const info=await signed.json();assert.equal(info.mustChangePassword,true);
 assert.equal((await fetch(base+'/admin/providers',{headers:{Authorization:`Bearer ${info.token}`}})).status,428);
 const update=await json(base+'/admin/account/password',{currentPassword:temporary,newPassword:'StrongReplacement123!'},info.token,'PUT');assert.equal(update.status,200);
 assert.equal((await fetch(base+'/admin/providers',{headers:{Authorization:`Bearer ${info.token}`}})).status,401);
 const again=await json(base+'/auth/login',{username:'admin',password:'StrongReplacement123!'});const second=await again.json();assert.equal(second.mustChangePassword,false);
 assert.equal((await fetch(base+'/admin/providers',{headers:{Authorization:`Bearer ${second.token}`}})).status,200);
 const db=readFileSync(join(dir,'app.db')).toString('utf8');assert.ok(!db.includes(temporary));assert.ok(!db.includes('StrongReplacement123!'));
});
test('existing database, API keys and encrypted providers survive a restart',t=>{
 const {store,cfg}=setup(t);const secret=store.createKey('legacy-app',sender,'secret');store.createProvider({type:'resend',name:'Resend',credentials:{apiKey:'testKey'},priority:1,dailyLimit:100,monthlyLimit:2000,hourlyLimit:20,minuteLimit:3});store.saveOtpTemplate({subject:'Secret title',text:'{{code}} only',html:'',direction:'ltr'});
 const password=store.account.initial;store.close();const restarted=openStore(cfg);assert.equal(restarted.account.initial,null);assert.equal(restarted.account.login('admin',password).mustChangePassword,true);assert.ok(restarted.authenticate(secret.token));assert.equal(restarted.listProviders().length,1);assert.equal(restarted.getOtpTemplate().subject,'Secret title');restarted.close();
});
test('global capture mode intercepts /v1/send and /v1/probe without queue or provider usage',async t=>{
 const {store,cfg,dir}=setup(t);const base=await openServer(t,store,cfg);const key=store.createKey('test-app',sender,'secret');
 const probe=await json(base+'/v1/probe',raw,key.token);assert.equal(probe.status,202);assert.equal((await probe.json()).status,'captured');
 assert.equal(store.stats().queue,0);assert.equal(store.diagnosticStatus().receipts.length,1);
 const switched=await json(base+'/admin/diagnostics',{seconds:600},cfg.adminToken,'PUT');assert.equal(switched.status,200);assert.equal((await switched.json()).active,true);
 const receipt=await json(base+'/v1/send',{...raw,subject:'Private content',text:'Top secret data'},key.token);assert.equal((await receipt.json()).status,'captured');
 assert.equal(store.stats().queue,0);assert.equal(store.listProviders().length,0);
 const db=readFileSync(join(dir,'app.db')).toString('utf8');assert.ok(!db.includes('Top secret data'));assert.ok(!db.includes('Private content'));
 const off=await json(base+'/admin/diagnostics',{seconds:0},cfg.adminToken,'PUT');assert.equal((await off.json()).active,false);
 const normal=await json(base+'/v1/send',raw,key.token);assert.equal((await normal.json()).status,'queued');assert.equal(store.stats().queue,1);
});
test('normal MIME and special SMTP probe header remain supported',()=>{
 const mime='From: noreply@example.com\r\nTo: test@example.net\r\nSubject: Hello\r\nX-CourierMesh-Probe: true\r\n\r\nA message';const cfg={allowFrom:[],maxMessageBytes:65536};const msg=parseMime(mime,cfg);assert.equal(msg.kind,'raw');assert.equal(msg.subject,'Hello');
});
test('general email can route through non-OTP adapters without a private OTP template',async t=>{
 const {store,cfg}=setup(t);store.createProvider({type:'resend',name:'Resend',credentials:{apiKey:'testKey'},priority:1,dailyLimit:100,monthlyLimit:2000,hourlyLimit:20,minuteLimit:3});const key=store.authenticate(store.createKey('app',sender,'secret').token);const m={...raw};store.enqueue(m,key,'general-1');const job=store.nextJob();assert.equal(job.message.kind,'raw');assert.equal(job.template,null);
 let hit=false;const outcome=await deliver(job,{fetchImpl:async(url,opts)=>{hit=true;assert.equal(url,'https://api.resend.com/emails');assert.equal(JSON.parse(opts.body).text,raw.text);return {ok:true,status:200,text:async()=>'{"id":"test"}'}}});assert.equal(outcome.kind,'accepted');assert.equal(hit,true);
});
test('legacy admin token still authenticates when configured',async t=>{const {store,cfg}=setup(t);const base=await openServer(t,store,cfg);const result=await fetch(base+'/admin/session',{headers:{Authorization:`Bearer ${cfg.adminToken}`}});assert.equal(result.status,200);assert.equal((await result.json()).legacy,true);});

test('SMTP diagnostic header locally captures authenticated mail without queueing',async t=>{
 const net=await import('node:net');const {smtpServer}=await import('../src/smtp.js');
 const {store,cfg}=setup(t);const tk=store.createKey('smtp-app',sender,'secret');
 const smtp=smtpServer(store,{...cfg,smtpEnabled:true,smtpHost:'127.0.0.1',smtpPort:0,smtpRequireTls:false});await new Promise(r=>smtp.on('listening',r));t.after(()=>smtp.close());
 const client=net.connect(smtp.address().port,'127.0.0.1');t.after(()=>client.destroy());
 let buffer='',lines=[],pending=[];client.on('data',chunk=>{buffer+=chunk.toString();while(buffer.includes('\n')){let index=buffer.indexOf('\n');const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);lines.push(line);pending.splice(0).forEach(f=>f());}});
 const read=async prefix=>{for(let i=0;i<180;i++){const index=lines.findIndex(x=>x.startsWith(prefix));if(index!==-1)return lines.splice(index,1)[0];await new Promise(resolve=>{pending.push(resolve);setTimeout(resolve,10).unref();});}throw Error('No response '+prefix+': '+lines.join(','));};
 await read('220');client.write('EHLO test.local\r\n');await read('250 HELP');
 client.write(`AUTH PLAIN ${Buffer.from(`\0${tk.id}\0secret`).toString('base64')}\r\n`);await read('235');
 client.write(`MAIL FROM:<${sender}>\r\n`);await read('250 Sender');client.write(`RCPT TO:<${to}>\r\n`);await read('250 Recipient');client.write('DATA\r\n');await read('354');
 client.write(`From: ${sender}\r\nTo: ${to}\r\nSubject: Diagnostic only\r\nX-CourierMesh-Probe: true\r\n\r\nDo not deliver.\r\n.\r\n`);
 const receipt=await read('250 2.0.0 Captured');assert.match(receipt,/Captured as/);assert.equal(store.stats().queue,0);
 assert.equal(store.diagnosticStatus().receipts[0].transport,'smtp');
});
