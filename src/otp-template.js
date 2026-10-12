// Template content is supplied by each operator at runtime, never bundled with the application.
const CODE='{{code}}';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateOtpTemplate(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid OTP template');
 const subject=value.subject,text=value.text,html=value.html??'';
 const direction=value.direction??'rtl';
 if(typeof subject!=='string'||!subject.trim()||subject.length>180||/[\r\n]/.test(subject))throw Error('Invalid template subject');
 if(typeof text!=='string'||!text.includes(CODE)||text.length>16000)throw Error('Template text must include {{code}} (max 16000 characters)');
 if(typeof html!=='string'||html.length>64000||(html&&!html.includes(CODE)))throw Error('Template HTML must include {{code}} (max 64000 characters)');
 if(html&&/<\s*\/?\s*(?:script|iframe|object|embed|form)\b|\bon\w+\s*=/i.test(html))throw Error('Unsafe HTML in template');
 if(!['rtl','ltr'].includes(direction))throw Error('Invalid template direction');
 return {subject:subject.trim(),text,html,direction};
}
export function renderOtpTemplate(message,template){
 if(message.kind!=='otp')throw Error('OTP messages only');
 if(!template)throw Error('OTP template not configured');
 const code=message.code;
 const substitute=s=>s.replaceAll(CODE,code);
 const direction=template.direction;
 const html=template.html
  ? substitute(template.html)
  : `<div dir="${direction}" style="font-family:Arial,sans-serif;line-height:1.9;max-width:600px;margin:auto;padding:24px;text-align:${direction==='rtl'?'right':'left'}">${template.text.split(CODE).map((part,i)=>`${i?`<div dir="ltr" style="text-align:center;font-size:32px;font-weight:700;letter-spacing:5px;margin:18px 0">${esc(code)}</div>`:''}${esc(part).replace(/\n/g,'<br>')}`).join('')}</div>`;
 return {from:message.from,to:message.to,subject:template.subject,text:substitute(template.text),html};
}
