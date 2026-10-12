/** Run with CM_API_URL=https://... CM_API_TOKEN=KEY_ID.SECRET node examples/send-otp.mjs */
import {randomUUID,randomInt} from 'node:crypto';
const endpoint=process.env.CM_API_URL;
const token=process.env.CM_API_TOKEN;
if(!endpoint||!token)throw Error('CM_API_URL and CM_API_TOKEN required');
const res=await fetch(`${endpoint.replace(/\/$/,'')}/v1/send`,{
 method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},
 body:JSON.stringify({kind:'otp',from:process.env.CM_FROM||'no-reply@notify.example.com',to:process.env.CM_TO||'recipient@example.net',subject:'Verify your account',code:String(randomInt(100000,1000000))})
});const data=await res.json();if(!res.ok)throw Error(`${res.status}: ${JSON.stringify(data)}`);
console.log('Queued:',data.id,'status:',data.status);
