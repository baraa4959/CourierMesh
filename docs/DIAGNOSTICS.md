# No-send diagnostics (API and SMTP)

CourierMesh v1.2 lets you prove that an application can **authenticate and submit a valid message** without contacting an outbound email provider. A captured message is **not** delivered and must not be interpreted as an email receipt.

## Option A: temporary capture mode

In **Diagnostics**, select **Enable for 10 minutes**. The admin endpoint `PUT /admin/diagnostics` accepts `{ "seconds": 600 }` (range 0..600). While active, **all new submissions** from `/v1/send`, the admin test form, and the private SMTP listener are locally captured rather than queued. The switch automatically expires after ten minutes even if the browser closes or the container restarts. Use `{ "seconds": 0 }` to stop early.

To inspect sanitized captures, open the diagnostics table or call `GET /admin/diagnostics` with an admin session Bearer token or your legacy `ADMIN_TOKEN`. Metadata includes transport, message type, sender, **masked recipient** and timestamp. No message body, OTP, provider password, API key or content is stored in this table. Records are pruned after 24 hours. Existing queued messages **are not paused** by this mode; only newly received messages are intercepted.

Do not enable global capture during real user traffic. All connected applications will receive `202` but the intercepted messages will **not** go to an inbox. This is intentional.

## Option B: a single API probe (preferred for production)

Send a valid message to `POST /v1/probe` with the same application API key used for `/v1/send`:

```sh
curl -X POST https://mail.example.org/v1/probe \
 -H 'Authorization: Bearer <APP_KEY>' \
 -H 'Content-Type: application/json' \
 -d '{"kind":"raw","from":"no-reply@example.org","to":"user@example.net","subject":"Connectivity test","text":"Hello"}'
```

Alternatively set `"dryRun": true` on a normal `POST /v1/send` request. Both approaches enforce authentication, sender allowlisting, message validation and rate limiting, and return a local receipt like:

```json
{"id":"<UUID>","status":"captured","transport":"api","dryRun":true}
```

They never call a provider even when global capture mode is off.

## Option C: a single SMTP probe

Connect to the existing private SMTP listener (`2525`, authenticated STARTTLS) and include this message header:

```text
X-CourierMesh-Probe: true
```

CourierMesh validates the SMTP envelope, application credentials and message body, then returns `250 ... Captured as <UUID>`. The outgoing providers are not contacted. You can also leave all SMTP messages unmodified and enable the temporary global capture mode from the dashboard.

Do not open SMTP to public networks. Internal TLS uses a generated self-signed certificate by default; configure the client to trust it explicitly. Never disable TLS certificate checks as a general deployment workaround.
