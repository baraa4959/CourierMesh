import { renderOtpTemplate } from './otp-template.js';
import { renderMessage } from './validate.js';
/** A successful HTTP response is merely provider acceptance, never proof of mailbox delivery. */
export async function deliver(job, options = {}) {
  const { provider } = job, cred = provider.credentials;
  if (job.message.kind === 'otp' && provider.type !== 'loops' && !job.template) return { kind: 'rejected', reason: 'OTP template not configured' };
  const m = provider.type === 'loops' ? job.message : job.message.kind === 'otp' ? renderOtpTemplate(job.message, job.template) : renderMessage(job.message);
  const timeout = options.timeoutMs ?? 12000; const transport = options.fetchImpl ?? fetch;
  let url, body, headers = { 'content-type': 'application/json', 'accept': 'application/json' };
  switch (provider.type) {
    case 'loops':
      url = 'https://app.loops.so/api/v1/transactional'; headers.Authorization = `Bearer ${cred.apiKey}`;
      if (m.kind === 'otp') body = { transactionalId: cred.transactionalId, email: m.to, addToAudience: false, dataVariables: { ...m.variables, code: m.code } };
      else if (cred.genericTransactionalId) body = { transactionalId: cred.genericTransactionalId, email: m.to, addToAudience: false, dataVariables: { subject: m.subject, message: m.text || m.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() } };
      else return { kind: 'rejected', reason: 'Loops generic template is not configured' }; break;
    case 'resend':
      url = 'https://api.resend.com/emails'; headers.Authorization = `Bearer ${cred.apiKey}`;
      headers['Idempotency-Key'] = `couriermesh/${job.id}`;
      body = { from: m.from, to: [m.to], subject: m.subject, text: m.text, html: m.html || undefined }; break;
    case 'brevo':
      url = 'https://api.brevo.com/v3/smtp/email'; headers['api-key'] = cred.apiKey;
      body = { sender: { email: m.from }, to: [{ email: m.to }], subject: m.subject, ...(m.html ? { htmlContent: m.html } : { textContent: m.text }) }; break;
    case 'mailjet':
      url = 'https://api.mailjet.com/v3.1/send'; headers.Authorization = 'Basic ' + Buffer.from(`${cred.apiKey}:${cred.secretKey}`).toString('base64');
      body = { Messages: [{ From: { Email: m.from }, To: [{ Email: m.to }], Subject: m.subject, TextPart: m.text, HTMLPart: m.html || undefined }] }; break;
    case 'smtp2go':
      url = 'https://api.smtp2go.com/v3/email/send'; headers['X-Smtp2go-Api-Key'] = cred.apiKey;
      body = { sender: m.from, to: [m.to], subject: m.subject, text_body: m.text, html_body: m.html || undefined, fastaccept: false }; break;
    case 'sendpulse': {
      const access = await request(transport, 'https://api.sendpulse.com/oauth/access_token', { 'content-type': 'application/json' }, { grant_type: 'client_credentials', client_id: cred.clientId, client_secret: cred.clientSecret }, timeout);
      if (access.kind !== 'accepted') return access;
      const token = access.data?.access_token;
      if (!token) return { kind: 'rejected', reason: 'SendPulse OAuth response missing access_token' };
      url = 'https://api.sendpulse.com/smtp/emails'; headers.Authorization = `Bearer ${token}`;
      body = { email: { from: { email: m.from }, to: [{ email: m.to }], subject: m.subject, text: m.text, html: Buffer.from(m.html || `<pre>${m.text}</pre>`).toString('base64') } }; break;
    }
    default: return { kind: 'rejected', reason: 'Unknown provider type' };
  }
  const result = await request(transport, url, headers, body, timeout);
  if (result.kind !== 'accepted') return result;
  const data = result.data;
  if (provider.type === 'smtp2go' && (Number(data?.data?.failed || data?.failed || 0) > 0 || (Array.isArray(data?.data?.failures) && data.data.failures.length))) return { kind: 'rejected', status: 200, reason: 'SMTP2GO reports failed recipients' };
  if (provider.type === 'sendpulse' && data?.result !== true) return { kind: 'rejected', status: 200, reason: 'SendPulse did not confirm acceptance' };
  if (provider.type === 'loops' && data?.success === false) return { kind: 'rejected', status: 200, reason: 'Loops did not confirm acceptance' };
  if (provider.type === 'mailjet' && data?.Messages?.[0]?.Status !== 'success') return { kind: 'rejected', status: 200, reason: 'Mailjet message not accepted' };
  return { kind: 'accepted', status: result.status, providerMessageId: data?.id || data?.messageId || data?.data?.email_id || undefined };
}
async function request(fetchImpl, url, headers, body, timeoutMs) {
  let response, content;
  try {    
response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    content = await response.text();
  } catch (e) { return { kind: 'uncertain', reason: 'Network/timeout error: provider acceptance cannot be determined' }; }
  let data = {}; try { data = JSON.parse(content); } catch { data = {}; }
  // HTTP 429/4xx are definitive non-acceptance. 5xx and unusual successful responses are conservatively uncertain.
  if (response.status === 429 || response.status >= 400 && response.status < 500) return { kind: 'rejected', status: response.status, reason: `Provider refused request (HTTP ${response.status})` };
  if (!response.ok) return { kind: 'uncertain', status: response.status, reason: `Provider/server error (HTTP ${response.status}), outcome uncertain` };
  return { kind: 'accepted', status: response.status, data };
}
