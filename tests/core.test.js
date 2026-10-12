import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import net from 'node:net';
import {openStore} from '../src/store.js';
import {createWorker} from '../src/worker.js';
import {deliver} from '../src/providers.js';
import {parseMime} from '../src/smtp.js';
import {createHttp} from '../src/http.js';
import {smtpServer} from '../src/smtp.js';
import {validateMessage} from '../src/validate.js';
import {renderOtpTemplate,validateOtpTemplate} from '../src/otp-template.js';
const cfg=(dir)=>({dbPath:join(dir,'db.sqlite'),encryptionKey:randomBytes(32),adminToken:'Z'.repeat(40),allowFrom:[],maxQueueDepth:100,maxMessageBytes:65536,messageTtlSeconds:600,httpPort:0,httpHost:'127.0.0.1',smtpPort:0,smtpHost:'127.0.0.1',smtpEnabled:true,smtpRequireTls:false,workerConcurrency:4,workerIntervalMs:100,httpTimeoutMs:1000});
function useStore(t){const dir=mkdtempSync(join(tmpdir(),'couriermesh-test-'));const config=cfg(dir),store=openStore(config);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {config,store,dir};}
const otp={kind:'otp',from:'no-reply@example.com',to:'recipient@example.net',code:'847291'};
const template={subject:'Security code',text:'Use {{code}} to sign in.',html:'<div dir="rtl"><strong>{{code}}</strong></div>',direction:'rtl'};
function provider(type='resend',name=type){const cred={loops:{apiKey:'test',transactionalId:'temp_123'},resend:{apiKey:'test'},brevo:{apiKey:'test'},mailjet:{apiKey:'key',secretKey:'sec'},smtp2go:{apiKey:'test'},sendpulse:{clientId:'id',clientSecret:'secret'}};return {type,name,credentials:cred[type],priority:10,dailyLimit:100,monthlyLimit:1000,hourlyLimit:30,minuteLimit:10};}
test('provider credentials encrypted, secret never exposed in listings',t=>{const {store,dir}=useStore(t);const p=store.createProvider(provider());assert.equal(p.type,'resend');assert.equal('credentials' in p,false);assert.ok(!readFileSync(join(dir,'db.sqlite')).includes('"apiKey":"test"'));assert.equal(store.listProviders().length,1);});
test('idempotent submissions and encrypted OTP payloads',t=>{const {store,dir}=useStore(t);const key=store.createKey('example-app','no-reply@example.com','shh');const identity=store.authenticate(key.token);const m=validateMessage(otp,{allowFrom:[],maxMessageBytes:65536});let first=store.enqueue(m,identity,'user123');let second=store.enqueue(m,identity,'user123');assert.equal(first.id,second.id);assert.equal(second.duplicate,true);assert.ok(!readFileSync(join(dir,'db.sqlite')).includes('847291'));});
test('minute/daily quota reservation is atomic and fallback goes to another provider after definitive rejection',async t=>{const {store,config}=useStore(t);store.saveOtpTemplate(template);store.createProvider({...provider('resend'),minuteLimit:1});store.createProvider({...provider('brevo'),priority:20});const key=store.authenticate(store.createKey('app','*','secret').token);store.enqueue(validateMessage(otp,config),key,'id1');let job=store.nextJob();assert.equal(job.provider.type,'resend');store.finish(job,{kind:'rejected',status:429,reason:'limit'});job=store.nextJob();assert.equal(job.provider.type,'brevo');store.finish(job,{kind:'accepted',status:201});assert.equal(store.stats().messages.accepted,1);assert.equal(store.listProviders().find(x=>x.type==='resend').usage.day,0);});
test('uncertain result never retries on an alternative provider',async t=>{const {store,config}=useStore(t);store.saveOtpTemplate(template);store.createProvider(provider('resend'));store.createProvider(provider('brevo'));const key=store.authenticate(store.createKey('app','*','secret').token);store.enqueue(validateMessage(otp,config),key,null);const job=store.nextJob();store.finish(job,{kind:'uncertain',reason:'timeout'});assert.equal(store.stats().messages.unknown,1);assert.equal(store.nextJob(),null);});
test('raw email is rejected before queueing',t=>{const {store,config}=useStore(t);assert.throws(()=>validateMessage({...otp,kind:'raw',text:'hello'},config),/OTP messages only/);assert.equal(store.stats().queue,0);});
test('six provider adapters use expected endpoints and metadata',async()=>{const seen=[];const fetchImpl=async(url,opts)=>{seen.push({url,opts});if(url.includes('/oauth/access_token'))return {ok:true,status:200,text:async()=>JSON.stringify({access_token:'oauth-token'})};if(url.includes('mailjet'))return {ok:true,status:200,text:async()=>JSON.stringify({Messages:[{Status:'success'}]})};if(url.includes('sendpulse'))return {ok:true,status:200,text:async()=>JSON.stringify({result:true})};return {ok:true,status:202,text:async()=>JSON.stringify({id:'ok'})};};
 for(const type of ['loops','resend','brevo','mailjet','smtp2go','sendpulse']) {const p=provider(type);const result=await deliver({id:'id-001',provider:p,message:{...otp,subject:'Verify'},template},{fetchImpl});assert.equal(result.kind,'accepted',type);}
 assert.equal(seen.length,7);assert.ok(seen.some(x=>x.url==='https://api.resend.com/emails'));assert.ok(seen.some(x=>x.url==='https://api.smtp2go.com/v3/email/send'));assert.ok(seen.some(x=>x.url==='https://app.loops.so/api/v1/transactional'));
 const loops=seen.find(x=>x.url.includes('loops'));const body=JSON.parse(loops.opts.body);assert.equal(body.addToAudience,false);assert.equal(body.dataVariables.code,'847291');
});
test('SMTP2GO failure embedded in a 200 is not accepted',async()=>{const result=await deliver({id:'x',provider:provider('smtp2go'),message:{...otp,subject:'Verify'},template},{fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({data:{failed:1,failures:['Invalid sender']}})})});assert.equal(result.kind,'rejected');});
test('network timeouts become unknown outcomes without duplicate retry',async()=>{const result=await deliver({id:'x',provider:provider('resend'),message:{...otp,subject:'Verify'},template},{fetchImpl:async()=>{throw Error('timeout')}});assert.equal(result.kind,'uncertain');});
test('MIME parsing recognizes OTP special header and prevents header spoofing',()=>{const raw='From: no-reply@example.com\r\nTo: recipient@example.net\r\nSubject: Your code\r\nX-CourierMesh-OTP: 913572\r\n\r\nYour code is 913572';const m=parseMime(raw,{allowFrom:[],maxMessageBytes:65536});assert.equal(m.kind,'otp');assert.equal(m.code,'913572');assert.throws(()=>parseMime(raw.replace('913572','!'),{allowFrom:[],maxMessageBytes:65536}));});
test('HTTP API requires authentication, verifies sender permissions, and returns queued receipt',async t=>{const {store,config}=useStore(t);const server=createHttp(store,config);await new Promise(r=>server.on('listening',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/admin/stats')).status,401);assert.equal((await fetch(base+'/healthz')).status,200);
 const admin={Authorization:`Bearer ${config.adminToken}`};const create=await fetch(base+'/admin/keys',{method:'POST',headers:{...admin,'Content-Type':'application/json'},body:JSON.stringify({name:'otp-app',allowedFrom:'no-reply@example.com'})});assert.equal(create.status,201);const key=await create.json();const req=await fetch(base+'/v1/send',{method:'POST',headers:{Authorization:`Bearer ${key.token}`,'Content-Type':'application/json','Idempotency-Key':'user-1'},body:JSON.stringify({...otp,from:'spoof@example.com'})});assert.equal(req.status,403);
 const blocked=await fetch(base+'/v1/send',{method:'POST',headers:{Authorization:`Bearer ${key.token}`,'Content-Type':'application/json'},body:JSON.stringify({kind:'raw',from:otp.from,to:otp.to,text:'Forbidden'})});assert.equal(blocked.status,400);
 const good=await fetch(base+'/v1/send',{method:'POST',headers:{Authorization:`Bearer ${key.token}`,'Content-Type':'application/json','Idempotency-Key':'user-1'},body:JSON.stringify(otp)});assert.equal(good.status,202);const obj=await good.json();assert.equal(obj.status,'queued');const status=await fetch(base+'/v1/messages/'+obj.id,{headers:{Authorization:`Bearer ${key.token}`}});assert.equal((await status.json()).status,'queued');
});
test('SMTP submission authenticates, validates envelope and queues mail',async t=>{const {store,config}=useStore(t);const token=store.createKey('smtp-app','no-reply@example.com','secret');const server=smtpServer(store,config);await new Promise(r=>server.on('listening',r));t.after(()=>server.close());
 const client=net.connect(server.address().port,'127.0.0.1');t.after(()=>client.destroy());let buf='',lines=[],wait=[];client.on('data',chunk=>{buf+=chunk.toString();let pos;while((pos=buf.indexOf('\n'))>=0){const line=buf.slice(0,pos).trim();buf=buf.slice(pos+1);lines.push(line);for(const fn of wait.splice(0))fn();}});
 const read=async prefix=>{let deadline=Date.now()+2000;while(Date.now()<deadline){let i=lines.findIndex(x=>x.startsWith(prefix));if(i>=0)return lines.splice(i,1)[0];await new Promise(r=>{wait.push(r);setTimeout(r,10).unref();});}throw Error('Missing response '+prefix+':'+lines.join(','));};
 await read('220');client.write('EHLO site.example\r\n');await read('250 HELP');client.write(`AUTH PLAIN ${Buffer.from(`\0${token.id}\0secret`).toString('base64')}\r\n`);await read('235');client.write('MAIL FROM:<no-reply@example.com>\r\n');await read('250 Sender');client.write('RCPT TO:<recipient@example.net>\r\n');await read('250 Recipient');client.write('DATA\r\n');await read('354');client.write('From: no-reply@example.com\r\nTo: recipient@example.net\r\nSubject: SMTP test\r\nX-CourierMesh-OTP: 123456\r\n\r\nDelivery test\r\n.\r\n');await read('250 2.0.0 Queued');assert.equal(store.stats().messages.queued,1);
});
test('same idempotency key with different payload is rejected',t=>{const {store,config}=useStore(t);const key=store.authenticate(store.createKey('app','*','secret').token);store.enqueue(validateMessage(otp,config),key,'same');assert.throws(()=>store.enqueue(validateMessage({...otp,code:'991122'},config),key,'same'),/IDEMPOTENCY_CONFLICT/);});
test('private template is encrypted at rest and correctly rendered',t=>{
 const {store,dir}=useStore(t);store.saveOtpTemplate(template);
 assert.deepEqual(store.getOtpTemplate(),template);
 const db=readFileSync(join(dir,'db.sqlite')).toString('utf8');
 assert.ok(!db.includes('Use {{code}} to sign in.'));
 const rendered=renderOtpTemplate(otp,store.getOtpTemplate());
 assert.equal(rendered.subject,'Security code');assert.match(rendered.html,/847291/);assert.match(rendered.text,/847291/);
 assert.ok(!rendered.html.includes('{{code}}'));
});
test('non-Loops providers require a private OTP template',t=>{
 const {store,config}=useStore(t);store.createProvider(provider('resend'));
 const key=store.authenticate(store.createKey('app','*','secret').token);
 store.enqueue(validateMessage(otp,config),key,null);
 assert.equal(store.nextJob(),null);
 assert.equal(store.stats().messages.failed,1);
});
test('dangerous template markup and missing placeholders are rejected',()=>{
 assert.throws(()=>renderOtpTemplate({kind:'raw',from:otp.from,to:otp.to,code:otp.code},template),/OTP/);
 assert.throws(()=>validateOtpTemplate({...template,text:'Missing placeholder'}),/must include/);
 assert.throws(()=>validateOtpTemplate({...template,html:'<script>alert(1)</script> {{code}}'}),/Unsafe HTML/);
});
test('1000 OTP messages can be durably queued without an external provider service',t=>{const {store,config}=useStore(t);config.maxQueueDepth=1200;const key=store.authenticate(store.createKey('app','*','secret').token);for(let i=0;i<1000;i++)store.enqueue(validateMessage({...otp,to:`recipient${i}@example.net`,code:String(100000+i)},config),key,`message-${i}`);assert.equal(store.stats().queue,1000);assert.equal(store.listMessages().length,100);});
test('all non-Loops providers use identical private template content',async()=>{
 const seen=[];
 for(const type of ['resend','brevo','mailjet','smtp2go','sendpulse']){
  const result=await deliver({id:'q',provider:provider(type),message:otp,template},{fetchImpl:async(url,opts)=>{
   if(url.endsWith('/oauth/access_token'))return {ok:true,status:200,text:async()=>JSON.stringify({access_token:'token'})};
   seen.push({type,body:JSON.parse(opts.body)});
   const payload=type==='mailjet'?{Messages:[{Status:'success'}]}:type==='sendpulse'?{result:true}:{};
   return {ok:true,status:200,text:async()=>JSON.stringify(payload)};
  }});
  assert.equal(result.kind,'accepted');
 }
 assert.equal(seen.length,5);
 for(const {type,body} of seen){
  const msg=type==='mailjet'?body.Messages[0]:type==='sendpulse'?body.email:body;
  assert.ok(JSON.stringify(msg).includes('Security code'));
  assert.ok(JSON.stringify(msg).includes('847291'));
 }
});
