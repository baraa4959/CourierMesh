import net from 'node:net';
import tls from 'node:tls';
import {readFileSync} from 'node:fs';
import {validateMessage,email} from './validate.js';
const REPLY={auth:'535 5.7.8 Authentication failed',syntax:'501 5.5.2 Invalid command',bad:'550 5.7.1 Not allowed'};
function decodeWord(s){return s.replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi,(all,charset,enc,data)=>{try{const b=enc.toLowerCase()==='b'?Buffer.from(data,'base64'):Buffer.from(data.replace(/_/g,' ').replace(/=([0-9A-F]{2})/gi,(_,n)=>String.fromCharCode(parseInt(n,16))),'latin1');return b.toString(charset.toLowerCase()==='utf-8'?'utf8':'latin1');}catch{return all;}});}
function qp(s){return s.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)));}
function addr(v){const bracket=v.match(/<([^>]+)>/);return email((bracket?bracket[1]:v).trim());}
export function parseMime(raw,cfg){const normalized=raw.replace(/\r\n/g,'\n');const pos=normalized.indexOf('\n\n');if(pos===-1)throw Error('Missing headers');const head=normalized.slice(0,pos).replace(/\n[ \t]+/g,' ');const headers={};for(const line of head.split('\n')){const index=line.indexOf(':');if(index>0){const k=line.slice(0,index).toLowerCase(); if(!(k in headers))headers[k]=line.slice(index+1).trim();}}
 if(!headers.from||!headers.to||!headers.subject)throw Error('Required From, To and Subject headers missing');
 const from=addr(headers.from);const to=addr(headers.to);const subject=decodeWord(headers.subject);
 if(/[\r\n]/.test(subject))throw Error('Invalid subject');
 const contentType=headers['content-type']??'text/plain';if(/multipart\/mixed|application\/|attachment/i.test(contentType))throw Error('Attachments and multipart/mixed are not supported');
 let text='',html='';const body=normalized.slice(pos+2);
 function decoded(segment,enc){const str=enc?.toLowerCase()==='base64'?Buffer.from(segment.replace(/\s/g,''),'base64').toString('utf8'):enc?.toLowerCase()==='quoted-printable'?Buffer.from(qp(segment),'latin1').toString('utf8'):segment;return str;}
 const boundary=contentType.match(/boundary="?([^";\s]+)"?/i)?.[1];
 if(boundary){for(const part of body.split('--'+boundary)){const p=part.replace(/^\r?\n/,'');const ix=p.indexOf('\n\n');if(ix<0)continue;const meta=p.slice(0,ix).toLowerCase(),payload=p.slice(ix+2).replace(/\n--$/,'').trimEnd();if(/content-disposition:\s*attachment|filename\s*=/i.test(meta))throw Error('Attachments unsupported');const enc=meta.match(/content-transfer-encoding:\s*([\w-]+)/)?.[1];if(/content-type:\s*text\/html/.test(meta))html=decoded(payload,enc);else if(/content-type:\s*text\/plain/.test(meta))text=decoded(payload,enc);}}
 else {const enc=headers['content-transfer-encoding'];if(/text\/html/i.test(contentType))html=decoded(body,enc);else if(/text\/plain/i.test(contentType))text=decoded(body,enc);else throw Error('Unsupported MIME type');}
 const otp=headers['x-couriermesh-otp'];const varsHeader=headers['x-couriermesh-variables'];let variables={};if(varsHeader){try{variables=JSON.parse(Buffer.from(varsHeader,'base64').toString('utf8'));}catch{throw Error('Invalid variables header');}}
 if(!otp)throw Error('OTP messages only; X-CourierMesh-OTP header required');
 return validateMessage({kind:'otp',from,to,code:otp,variables},cfg);
}
export function smtpServer(store,cfg){
 if(!cfg.smtpEnabled)return null;
 const hasTls=!!(cfg.smtpCert&&cfg.smtpKey);
 if(cfg.smtpRequireTls&&!hasTls)throw Error('SMTP_REQUIRE_TLS=true requires SMTP_CERT and SMTP_KEY');
 const secureContext=hasTls?tls.createSecureContext({cert:readFileSync(cfg.smtpCert),key:readFileSync(cfg.smtpKey),minVersion:'TLSv1.2'}):null;
 const server=net.createServer(socket=>{
   socket.setTimeout(30000);let conn=socket,buf='',mode='command',authed=null,from=null,to=null,raw='',helo=false,tlsActive=false,authStep='',authUser='',closed=false;
   function send(s){if(!conn.destroyed)conn.write(s+'\r\n');}
   function reset(){from=null;to=null;raw='';mode='command';}
   function authenticate(user,password){const key=store.authenticate(`${user}.${password}`);if(!key){send(REPLY.auth);return;}authed=key;send('235 2.7.0 Authentication successful');}
   function process(line){
     if(mode==='data'){if(line==='.'){
       mode='command';try{if(!authed||!from||!to)throw Error('Invalid envelope');const m=parseMime(raw,cfg);if(m.from!==from||m.to!==to)throw Error('Header/envelope mismatch');if(authed.allowed_from!=='*'&&m.from!==authed.allowed_from)throw Error('Sender not authorized for this API key');const result=store.enqueue(m,authed,null);send(`250 2.0.0 Queued as ${result.id}`);}catch(e){send(e.message==='QUEUE_FULL'?'452 4.3.1 Queue full':`550 5.7.1 ${e.message.replace(/[^a-zA-Z0-9 .,\/:-]/g,'').slice(0,90)}`);}reset();return;}
       raw+=(line.startsWith('..')?line.slice(1):line)+'\r\n';if(Buffer.byteLength(raw)>cfg.maxMessageBytes){send('552 5.3.4 Message too large');reset();}return;
     }
     if(authStep){const step=authStep;authStep='';if(line==='*'){send('501 Authentication canceled');return;}try{const decoded=Buffer.from(line,'base64').toString('utf8');if(step==='plain'){const parts=decoded.split('\0');authenticate(parts.at(-2),parts.at(-1));}else if(step==='user'){authUser=decoded;authStep='password';send('334 UGFzc3dvcmQ6');}else authenticate(authUser,decoded);}catch{send(REPLY.auth);}return;}
     const parts=line.match(/^([A-Z]+)(?:\s+(.*))?$/i);if(!parts){send(REPLY.syntax);return;}const cmd=parts[1].toUpperCase(),arg=parts[2]??'';
     if(cmd==='EHLO'||cmd==='HELO'){helo=true;reset();send(`250-couriermesh\r\n250-8BITMIME\r\n250-SIZE ${cfg.maxMessageBytes}${secureContext&&!tlsActive?'\r\n250-STARTTLS':''}${tlsActive||!cfg.smtpRequireTls?'\r\n250-AUTH PLAIN LOGIN':''}\r\n250 HELP`);return;}
     if(cmd==='NOOP'){send('250 OK');return;}if(cmd==='QUIT'){send('221 2.0.0 Bye');closed=true;conn.end();return;}
     if(cmd==='RSET'){reset();send('250 Reset');return;}
     if(cmd==='STARTTLS'){
       if(!secureContext||tlsActive){send('454 TLS unavailable');return;}send('220 Ready to start TLS');
       conn.removeAllListeners('data');conn.removeAllListeners('error');conn.removeAllListeners('timeout');
       const upgraded=new tls.TLSSocket(conn,{isServer:true,secureContext});conn=upgraded;tlsActive=true;helo=false;authed=null;buf='';reset();wire();return;
     }
     if(cmd==='AUTH'){
       if(cfg.smtpRequireTls&&!tlsActive){send('538 5.7.11 Encryption required');return;}
       if(!helo){send('503 EHLO first');return;}const [method,param]=arg.split(/\s+/);
       if(method?.toUpperCase()==='PLAIN'){
         if(!param){send('334 ');authStep='plain';return;}const str=Buffer.from(param,'base64').toString('utf8').split('\0');authenticate(str.at(-2),str.at(-1));return;
       }
       if(method?.toUpperCase()==='LOGIN'){if(param){authUser=Buffer.from(param,'base64').toString('utf8');authStep='password';send('334 UGFzc3dvcmQ6');}else{authStep='user';send('334 VXNlcm5hbWU6');}return;}
       send('504 Unsupported authentication mechanism');return;
     }
     if(cmd==='MAIL'){if(!authed){send('530 Authenticate first');return;}if(!/^FROM:/i.test(arg)){send(REPLY.syntax);return;}try{from=addr(arg.slice(5).replace(/\s+SIZE=\d+.*/i,''));if(authed.allowed_from!=='*'&&from!==authed.allowed_from)throw Error('Sender blocked');to=null;send('250 Sender OK');}catch{send(REPLY.bad);}return;}
     if(cmd==='RCPT'){if(!from){send('503 MAIL FROM first');return;}if(to){send('452 One recipient per message');return;}if(!/^TO:/i.test(arg)){send(REPLY.syntax);return;}try{to=addr(arg.slice(3));send('250 Recipient OK');}catch{send(REPLY.bad);}return;}
     if(cmd==='DATA'){if(!to){send('503 RCPT TO first');return;}mode='data';raw='';send('354 End with <CRLF>.<CRLF>');return;}
     send('502 Command not implemented');
   }
   function wire(){conn.on('data',chunk=>{buf+=chunk.toString('utf8');if(Buffer.byteLength(buf)>cfg.maxMessageBytes+4096){send('552 Input too large');conn.destroy();return;}let idx;while((idx=buf.indexOf('\n'))!==-1){const line=buf.slice(0,idx).replace(/\r$/,'');buf=buf.slice(idx+1);if(!closed)process(line);}});conn.on('error',()=>{});conn.on('timeout',()=>conn.destroy());}
   wire();send('220 couriermesh ESMTP ready');
 });server.listen(cfg.smtpPort,cfg.smtpHost);return server;
}
