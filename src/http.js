import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {constantEqual,fingerprint} from './crypto.js';
import {email,validateMessage,TYPES} from './validate.js';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
const allowedFiles={'/':'index.html','/assets/app.js':'app.js','/assets/style.css':'style.css','/assets/logo.svg':'logo.svg'};
const mimetypes={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','other':'text/html; charset=utf-8'};
const limits=new Map();
function allowRate(identity,limit=180){const now=Date.now();const x=limits.get(identity);if(!x||x.time<now-60000){if(limits.size>10000)for(const [id,v] of limits)if(v.time<now-60000)limits.delete(id);limits.set(identity,{count:1,time:now});return true;}return ++x.count<=limit;}
function reply(res,code,payload,extra={}){res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra});res.end(JSON.stringify(payload));}
async function body(req,max=32768){if((req.headers['content-type']||'').toLowerCase().split(';')[0].trim()!=='application/json')throw Error('Content-Type must be application/json');let chunks=[],n=0;for await(const chunk of req){n+=chunk.length;if(n>max)throw Error('Request too large');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Invalid JSON');}}
export function createHttp(store,cfg){
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 res.setHeader('Access-Control-Allow-Origin','null');
 const path=new URL(req.url,'http://localhost').pathname;
 try{
 if(req.method==='GET' && (path==='/healthz'||path==='/readyz'))return reply(res,200,{status:'ok'});
 if((req.method==='GET'||req.method==='HEAD')&&allowedFiles[path]){const fname=allowedFiles[path];res.writeHead(200,{'content-type':mimetypes['.'+fname.split('.').at(-1)]??mimetypes.other,'cache-control':'no-store'});return res.end(req.method==='HEAD'?undefined:readFileSync(resolve(base,fname)));}
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(path.startsWith('/admin/')){
   if(!constantEqual(token,cfg.adminToken))return reply(res,401,{error:'Unauthorized'});
   if(!allowRate('admin:'+req.socket.remoteAddress,300))return reply(res,429,{error:'Too many requests'});
   if(path==='/admin/session' && req.method==='GET')return reply(res,200,{authenticated:true});
   if(path==='/admin/test-send' && req.method==='POST'){const msg=validateMessage(await body(req),cfg);if(msg.kind!=='otp')return reply(res,400,{error:'Admin test sends OTP only'});return reply(res,202,store.enqueue(msg,{id:'admin'},`test-${randomBytes(12).toString('hex')}`));}
   if(path==='/admin/stats' && req.method==='GET')return reply(res,200,store.stats());
   if(path==='/admin/providers' && req.method==='GET')return reply(res,200,store.listProviders());
   if(path==='/admin/providers' && req.method==='POST')return reply(res,201,store.createProvider(await body(req)));
   if(/^\/admin\/providers\/[a-f\d-]{36}$/.test(path)){
     const id=path.split('/').at(-1);
     if(req.method==='PATCH')return reply(res,200,store.editProvider(id,await body(req)));
     if(req.method==='DELETE')return reply(res,200,{result:store.removeProvider(id)});
   }
   if(path==='/admin/keys'&&req.method==='GET')return reply(res,200,store.listKeys());
   if(path==='/admin/keys'&&req.method==='POST'){
     const input=await body(req);let allowed='*';if(input.allowedFrom && input.allowedFrom!=='*')allowed=email(input.allowedFrom);
     return reply(res,201,store.createKey(input.name,allowed,randomBytes(32).toString('base64url')));
   }
   if(/^\/admin\/keys\/[a-f\d-]{36}$/.test(path) && req.method==='DELETE')return reply(res,200,{revoked:!!store.revokeKey(path.split('/').at(-1))});
   if(path==='/admin/messages'&&req.method==='GET')return reply(res,200,store.listMessages());
   return reply(res,404,{error:'Not found'});
 }
 if(path.startsWith('/v1/')){
  const key=store.authenticate(token);if(!key)return reply(res,401,{error:'Invalid API key'});
  if(!allowRate('key:'+key.id,600))return reply(res,429,{error:'Request rate exceeded'});
  if(path==='/v1/send'&&req.method==='POST'){
   const value=validateMessage(await body(req,cfg.maxMessageBytes+4096),cfg);
   if(key.allowed_from!=='*'&&key.allowed_from!==value.from)return reply(res,403,{error:'Sender not authorized for this API key'});
   const idempotency=req.headers['idempotency-key'];if(idempotency&&(typeof idempotency!=='string'||idempotency.length>120||!/^[\w:.-]+$/.test(idempotency)))return reply(res,400,{error:'Invalid Idempotency-Key'});
   const result=store.enqueue(value,key,idempotency??null);return reply(res,202,result);
  }
  if(/^\/v1\/messages\/[a-f\d-]{36}$/.test(path)&&req.method==='GET'){
   const result=store.messageStatus(path.split('/').at(-1),key);return result?reply(res,200,result):reply(res,404,{error:'Not found'});
  }
  return reply(res,404,{error:'Not found'});
 }
 return reply(res,404,{error:'Not found'});
 }catch(e){const message=e.message??'Internal error';if(message==='IDEMPOTENCY_CONFLICT')return reply(res,409,{error:'Idempotency key already used with different message'});if(message==='QUEUE_FULL')return reply(res,503,{error:'Queue at capacity'},{'Retry-After':'30'});
   if(/Invalid|Unsupported|required|not found|must|oversized|too large|too many|Sender|Quota|key name|provider name|credentials|API key/i.test(message))return reply(res,400,{error:message.replace(/\b(apiKey|secretKey|clientSecret)\b/g,'credential')});
   console.error(JSON.stringify({event:'http_error',error:message}));return reply(res,500,{error:'Internal server error'});
 }
});server.listen(cfg.httpPort,cfg.httpHost);return server;
}
