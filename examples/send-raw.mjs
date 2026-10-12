// Demonstrates a generic transactional message, with an optional no-send probe.
// Required: COURIERMESH_URL and COURIERMESH_API_KEY; set SENDER and RECIPIENT.
const base = process.env.COURIERMESH_URL || 'https://mail.example.org';
const key = process.env.COURIERMESH_API_KEY;
const from = process.env.SENDER;
const to = process.env.RECIPIENT;
if (!key || !from || !to) throw new Error('Set COURIERMESH_API_KEY, SENDER and RECIPIENT');

const dryRun = process.env.DRY_RUN === 'true';
const response = await fetch(`${base}/${dryRun ? 'v1/probe' : 'v1/send'}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ kind: 'raw', from, to, subject: 'Welcome', text: 'Welcome to our service.' })
});
console.log(response.status, await response.text());
