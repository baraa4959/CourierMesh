export const TYPES=['loops','resend','brevo','mailjet','smtp2go','sendpulse'];
export const MAIL_RE=/^[^\s@<>\x00-\x1F]{1,64}@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,63}$/i;
export function email(v) { if(typeof v!=='string'|| v.length>254 || !MAIL_RE.test(v)) throw Error('Invalid email address');return v.trim().toLowerCase();}
export function validateProvider(p, old={}) {
 if (!p || typeof p!=='object' || Array.isArray(p)) throw Error('Invalid provider configuration');
 const type=p.type??old.type;
 if(!TYPES.includes(type) || (old.type && type!==old.type)) throw Error('Unsupported provider type');
 const name=p.name??old.name;
 if(typeof name!=='string'||name.length<2||name.length>80) throw Error('Provider name must be 2-80 characters');
 const daily=cap(p.dailyLimit??old.dailyLimit??0); const monthly=cap(p.monthlyLimit??old.monthlyLimit??0); const hourly=cap(p.hourlyLimit??old.hourlyLimit??0); const minute=cap(p.minuteLimit??old.minuteLimit??0);
 const priority=Number(p.priority??old.priority??100);
 if(!Number.isInteger(priority)||priority<0||priority>10000) throw Error('Invalid priority');
 let credentials=p.credentials??old.credentials;
 if(!credentials || typeof credentials!=='object'|| Array.isArray(credentials)) throw Error('Credentials required');
 if(type==='mailjet' && (!credentials.apiKey||!credentials.secretKey)) throw Error('Mailjet API key and secret required');
 if(type==='sendpulse' && (!credentials.clientId||!credentials.clientSecret)) throw Error('SendPulse clientId and clientSecret required');
 if(['loops','resend','brevo','smtp2go'].includes(type) && !credentials.apiKey) throw Error('API key required');
 if(type==='loops' && !credentials.transactionalId) throw Error('Loops published transactionalId is required');
 if(Object.keys(credentials).some(k=> typeof credentials[k]!=='string'||credentials[k].length>512)) throw Error('Invalid credential format');
 return {type,name:name.trim(),credentials,priority,dailyLimit:daily,monthlyLimit:monthly,hourlyLimit:hourly,minuteLimit:minute,enabled:p.enabled===undefined ? (old.enabled ?? true) : p.enabled===true};
}
function cap(n){const v=Number(n); if(!Number.isInteger(v)||v<0||v>100000000)throw Error('Quota must be a non-negative integer; 0 means unlimited');return v;}
export function validateMessage(input, cfg){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid message');
 if(input.kind!==undefined&&input.kind!=='otp')throw Error('OTP messages only');
 if(input.text!==undefined||input.html!==undefined)throw Error('Raw email is disabled; OTP messages only');
 const from=email(input.from),to=email(input.to);
 if(cfg.allowFrom.length&&!cfg.allowFrom.includes(from))throw Error('Sender not on ALLOWED_SENDERS list');
 const code=String(input.code??'');
 if(!/^[\w\-]{4,24}$/.test(code))throw Error('OTP code must be 4-24 alphanumeric, dash, or underscore characters');
 const variables=input.variables??{};
 if(!variables||typeof variables!=='object'||Array.isArray(variables)||Object.keys(variables).length>15||Object.entries(variables).some(([k,v])=>!/^[\w-]{1,50}$/.test(k)||!['string','number'].includes(typeof v)||String(v).length>300))throw Error('Invalid template variables');
 return {kind:'otp',from,to,code,variables};
}
