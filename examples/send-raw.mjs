/** Run with CM_API_URL=https://... CM_API_TOKEN=KEY_ID.SECRET node examples/send-raw.mjs */
import {randomUUID} from 'node:crypto';
const endpoint=process.env.CM_API_URL;const token=process.env.CM_API_TOKEN;
if(!endpoint||!token)throw Error('Set CM_API_URL and CM_API_TOKEN');
const res=await fetch(`${endpoint.replace(/\/$/,'')}/v1/send`,{
 method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},
 body:JSON.stringify({kind:'raw',from:process.env.CM_FROM||'no-reply@notify.example.com',to:process.env.CM_TO||'student@example.com',subject:'Welcome',text:'Thanks for signing up!'})
});console.log(res.status,await res.json());
