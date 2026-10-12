<div align="center">
  <img src="public/logo.svg" width="88" alt="CourierMesh logo" />

  # CourierMesh

  **One endpoint. Flexible delivery. Complete control.**

  A self-hosted transactional email gateway with a responsive admin console, six outbound HTTPS providers, a private SMTP receiver, durable SQLite queue, and a safe built-in connection test lab.

  [Getting started](#quick-start) · [API reference](docs/API.md) · [Providers](docs/PROVIDERS.md) · [Deployment](docs/DEPLOYMENT.md) · [Diagnostics](docs/DIAGNOSTICS.md) · [Security](docs/SECURITY.md)
</div>

## Features

- **One REST API** for OTP and plain-text/HTML transactional email, plus private authenticated **SMTP with STARTTLS**.
- **Six outbound adapters:** Loops, Resend, Brevo, Mailjet, SMTP2GO and SendPulse. Delivery is through the providers' HTTPS APIs; outbound TCP port 25 is not required.
- **Connection diagnostics:** temporarily capture **all new incoming** API/SMTP messages without sending to a provider, automatically expiring after 10 minutes; or test just one API message with `POST /v1/probe` / `dryRun: true` or one SMTP message with `X-CourierMesh-Probe: true`.
- **English, العربية, Français, Español**, including right-to-left Arabic layout; all frontend assets are served locally with no CDN dependency.
- **Admin login:** first deployment generates user `admin` and a one-time eight-character password shown only in runtime logs. Login forces an immediate change to a stronger password. Password hashes use scrypt. Session tokens are hashed and expire after eight hours. Existing `ADMIN_TOKEN` remains supported, if configured.
- **Private OTP templates:** configure subject, plain text, RTL/LTR and optional HTML from the admin console. The contents are encrypted in the local SQLite volume, never committed to GitHub. Loops OTP uses its own published Loops template.
- **Operational safety:** sender allowlists, independent application keys, provider quotas and priorities, encrypted credential storage, private queues, message expiry, failover after definitive rejection, and no automatic retry when provider acceptance is uncertain.

## Quick start

Requires Node.js **22.13+** or Docker and a **persistent writable** `/data` volume.

```sh
cp .env.example .env
# Set ENCRYPTION_KEY to a new 64-character random hexadecimal string:
openssl rand -hex 32
# Copy the result into .env as ENCRYPTION_KEY=...
# Never commit .env or expose the database, logs or configuration secrets.
npm start
```

Open `http://localhost:8080` locally. The **first startup** logs a generated `admin` password **once**. Change it at first login. Use HTTPS and a restricted admin dashboard for public deployment. For Easypanel use the included `Dockerfile`, internal HTTP port **8080** and persistent mount **`/data`**.

> ⚠️ An eight-character password is a temporary bootstrap secret **only**, not an acceptable long-term administrator password. First login requires a 12+ character replacement with uppercase, lowercase and numeric characters. Keep startup logs private and rotate any legacy `ADMIN_TOKEN` as part of normal secret hygiene.

## Connecting an application

Create an application key under **API & SMTP keys** in the dashboard. Keep the Bearer token in your backend, never browser JavaScript.

**OTP:**

```sh
curl -X POST https://mail.example.org/v1/send \
 -H 'Authorization: Bearer <APP_KEY>' \
 -H 'Content-Type: application/json' \
 -d '{"kind":"otp","from":"no-reply@example.org","to":"user@example.net","code":"123456"}'
```

**General transactional email:**

```sh
curl -X POST https://mail.example.org/v1/send \
 -H 'Authorization: Bearer <APP_KEY>' \
 -H 'Content-Type: application/json' \
 -d '{"kind":"raw","from":"no-reply@example.org","to":"user@example.net","subject":"Hello","text":"Welcome aboard"}'
```

For an integration test **without sending anything externally**, change `/v1/send` to `/v1/probe` or add `"dryRun":true`; use an active key and a permitted sender. `202 {"status":"captured"}` proves CourierMesh authenticated and validated the submission, **not** delivery to an inbox. More information: [Diagnostics](docs/DIAGNOSTICS.md).

## How routing works

CourierMesh accepts one recipient per message, routes by priority and local provider quota, and queues encrypted content. Loops sends OTP through a published Loops template; general messages via Loops additionally require `genericTransactionalId`. Other providers can send general email directly; OTP via these providers requires a private OTP template configured in the dashboard. Limit fields are locally configured budgets, **not** guarantees of provider availability.

`accepted` means *the provider API accepted the request*, not *delivered to the recipient*. `unknown` means external acceptance could not be confirmed and automatic resends are suppressed.

## Upgrade from v1.0 / v1.1 (Easypanel)

1. **Back up `/data`** (all SQLite database and TLS files) and your existing environment variables. Use a database-consistent backup while the service is stopped, or `sqlite3 .backup` if available.
2. **Keep the same `ENCRYPTION_KEY`, `DB_PATH`, domain, application keys and persistent `/data` mount.** Do not delete the original volume and keep **one replica** for SQLite.
3. Pull the latest `main` and **rebuild/redeploy** your Docker service. New schema tables are added in place; existing providers, keys and private OTP template are retained.
4. The migration also creates a local admin account and prints its **temporary password once** in the runtime logs. Existing `ADMIN_TOKEN` login continues to work if set. A newly initialized admin account does not invalidate old API/SMTP application tokens.
5. Log in with `admin`, change its password, open **Diagnostics**, and run a no-send probe before sending real messages.
6. Disable or reconfigure any unwanted provider. **Probe mode intercepts new submissions from *all* applications** until stopped or timed out; do not turn it on during live verification traffic.

If the first-run password was lost, use the server console to run `node /app/scripts/reset-admin.mjs` inside the running container; it rotates the administrator password, invalidates admin sessions and shows another one-time temporary password. It does **not** alter application API keys.

## Privacy and limitations

- No private organization-branded message is bundled or committed; custom templates are entered at runtime.
- Outbound sending depends on third-party service approvals, DNS verification, quotas and limits. No account restrictions are bypassed.
- Basic SMTP intentionally supports **one recipient**, `text/plain`, `text/html` and `multipart/alternative`; **attachments, arbitrary MIME types, mailbox reception and IMAP are not supported**.
- This is a **transactional gateway**, not a bulk marketing mailer or mailbox provider.
- Only **one SQLite-writing service instance** is supported. Do not make two replicas share `/data`.
- Privacy-safe diagnostics retain **sender, masked recipient, type, transport and timestamp**, without message content, for up to one day. Do not log secrets or publicly publish the dashboard.

See [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), [API](docs/API.md), [Provider setup](docs/PROVIDERS.md) and [Operations](docs/OPERATIONS.md). MIT licensed.
