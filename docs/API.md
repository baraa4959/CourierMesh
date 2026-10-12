# API reference — CourierMesh 1.2

Base URL `https://your-gateway.example.org`. Protected application API endpoints use `Authorization: Bearer <APPLICATION_TOKEN>` over HTTPS. Create keys under **API & SMTP keys**; restrict each key to a sender address whenever possible. Application tokens are compatible with v1.0 and v1.1.

## POST /v1/send

Accepted JSON messages:

```json
{"kind":"otp","from":"no-reply@example.org","to":"user@example.net","code":"123456","variables":{"name":"User"}}
```

```json
{"kind":"raw","from":"no-reply@example.org","to":"user@example.net","subject":"Hello","text":"Welcome!","html":"<p>Welcome!</p>"}
```

For backward compatibility, `kind` defaults to `raw`; for OTP, `subject` is optional. Raw messages require a subject and at least one of `text` or `html`. The content limit defaults to 64 KB combined. One destination address is supported per request. The optional `Idempotency-Key` request header deduplicates matching queued messages within one application key.

Returns HTTP 202 `{ "id":"...", "status":"queued", "duplicate":false }`. It means queued for outbound delivery, not delivered.

Use `"dryRun":true` to validate and locally capture one request without contacting an external email provider. While admin-enabled global capture mode is active, `/v1/send` likewise returns `status: captured` and does not queue the received message.

## POST /v1/probe

Uses exactly the same authentication, sender validation and request shapes as `/v1/send` but **always** records a local, sanitized test receipt. Returns HTTP 202 `{ "id":"<UUID>", "status":"captured", "transport":"api", "dryRun":true }`. Message content is not persisted or forwarded.

## GET /v1/messages/:id

Bearer token required. Returns status for a queued message created by the same API key. A locally captured diagnostic does **not** have a queue status; view recent probes under `/admin/diagnostics` instead.

## Browser administrator sessions

- `POST /auth/login` with `{"username":"admin","password":"..."}` — returns a short-lived administrator session token and `mustChangePassword` boolean. This is *not* an application sending token.
- `GET /admin/session` — current session summary. For compatibility, an existing `ADMIN_TOKEN` may still be used if set in the server environment.
- `PUT /admin/account/password` — `{"currentPassword":"...","newPassword":"..."}`. New password must be 12–128 characters with uppercase, lowercase and a digit. This revokes all existing password sessions; log in again.
- `POST /admin/logout` — revoke current password-based session.
- `GET /admin/stats`, `GET /admin/providers`, `POST /admin/providers`, `PATCH /admin/providers/:id` — providers and quotas.
- `GET /admin/keys`, `POST /admin/keys`, `DELETE /admin/keys/:id` — application tokens.
- `GET /admin/messages` — recent message metadata.
- `GET /admin/otp-template`, `PUT /admin/otp-template` — encrypted operator-provided OTP template.
- `POST /admin/test-send` — enqueue a real OTP or general transactional test, except when capture mode is on.
- `GET /admin/diagnostics` — mode and last 100 sanitized captures.
- `PUT /admin/diagnostics` — `{"seconds":600}` to turn on for a maximum ten minutes, `{"seconds":0}` to turn off.

All `/admin/*` routes require admin session or legacy admin token. New password-session holders are restricted to password change while their initial temporary password is in use.

## SMTP

Submission to private `SMTP_PORT=2525` with STARTTLS and AUTH PLAIN/LOGIN. Username is **application key ID** and password is its secret (the substring after `.` in the generated HTTP Bearer token). Supports one message recipient per envelope and basic `text/plain`, `text/html` and `multipart/alternative`; MIME attachments are intentionally unsupported. OTP is selected by `X-CourierMesh-OTP: 123456`. A normal message without this header is treated as `raw`. For a no-send test include `X-CourierMesh-Probe: true` or enable temporary global capture mode.

## Status and errors

The gateway validates requests and enforces sender allowlists. Common responses: 400 invalid message, 401 invalid token, 403 sender blocked, 409 conflicting idempotency key, 428 mandatory admin password reset, 429 throttled, 503 queue capacity. An external provider's `accepted` state means **handoff**, not inbox delivery. An `unknown` outcome is not retried automatically to avoid duplicates.
