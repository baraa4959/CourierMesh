# Deployment guide

CourierMesh supports a single-instance deployment. The application has two listeners: HTTP port `8080` and SMTP submission port `2525`. Both are internal; expose HTTP through an HTTPS reverse proxy, and connect SMTP via a private Docker network.

## Prerequisites

- Oracle Compute / Ubuntu host or another Linux server with Docker Engine and Compose
- A persistent volume for `/data` (SQLite DB, WAL files, generated SMTP TLS certificate)
- A verified sending domain for at least one chosen provider
- Secrets generated independently with `openssl rand -hex 32`
- An HTTPS hostname to access the admin console and API remotely

## Docker Compose

```bash
cp .env.example .env
openssl rand -hex 32 # first value -> ADMIN_TOKEN
openssl rand -hex 32 # second value -> ENCRYPTION_KEY
chmod 600 .env
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8080/healthz
```

The example binds HTTP **only** to `127.0.0.1:8080` and exposes SMTP `2525` only inside the Docker `backend` network. It must not be published as `0.0.0.0:2525:2525`. Enable HTTPS externally using your existing reverse proxy, ideally with an access-control rule for `/admin/*` (the UI uses the same origin).

## Easypanel deployment

1. Create a new App / Service with a Git repository containing this project and Dockerfile.
2. Build using the Dockerfile at repository root.
3. Set service HTTP port to **8080**; create an HTTPS domain such as `gateway.example.com` via Easypanel.
4. Add a persistent mounted volume with **container path `/data`**. Never replace the volume during upgrades.
5. Set every environment variable in `.env.example` using Easypanel's secret/environment settings; use two different random secrets for `ADMIN_TOKEN` and `ENCRYPTION_KEY`.
6. Ensure `SMTP_CERT=/data/tls/smtp.crt` and `SMTP_KEY=/data/tls/smtp.key`. The container initializes a private self-signed STARTTLS certificate on first boot if they are missing. Prefer a trusted internal CA or a real certificate when possible.
7. Configure the application and CourierMesh services on a shared **private Docker network** if you want SMTP access. Refer to the actual Docker DNS service alias assigned by Easypanel; do not assume it is `couriermesh`.
8. Do **not** create a public TCP port mapping for 2525. If the app is on a separate network, join both services to a common private Docker network instead.
9. Visit `https://gateway.example.com`, unlock with `ADMIN_TOKEN`, and add one provider and one application key.
10. Send a **single test** OTP to a controlled inbox and confirm actual delivery before increasing traffic.

Use a reverse proxy with `request_body_limit` equal to or below the gateway limits. Do not use Cloudflare orange-cloud for direct TCP SMTP: the gateway's SMTP service is private and does not need a public DNS record.

## STARTTLS trust

SMTP is STARTTLS-only by default (`SMTP_REQUIRE_TLS=true`). The generated self-signed certificate contains `DNS:couriermesh` and `DNS:localhost` SAN names. The client must either use the matching host and trust `/data/tls/smtp.crt` as an internal CA, or replace both files with a certificate for the real internal host.

Example client settings for a Node.js SMTP client supporting custom CA:

```js
{
  host: 'couriermesh',
  port: 2525,
  secure: false,
  requireTLS: true,
  auth: { user: 'APPLICATION_KEY_ID', pass: 'APPLICATION_SECRET' },
  tls: { ca: [readFileSync('/path/to/approved/smtp.crt')] }
}
```

Do not globally set `NODE_TLS_REJECT_UNAUTHORIZED=0`. An administrator can consciously choose `SMTP_REQUIRE_TLS=false` **only** if the sending application shares an isolated, trusted private network; even there plaintext SMTP authentication is weaker than STARTTLS. **Never expose a plaintext-auth SMTP service publicly.**

## Environment variables

| Name | Default | Description |
|---|---|---|
| `ADMIN_TOKEN` | required | 32+ random characters. Required for administrative endpoints. |
| `ENCRYPTION_KEY` | required | 32 bytes encoded as 64 hex characters. Protect and back up securely. |
| `DB_PATH` | `/data/couriermesh.db` in container | Persistent encrypted SQLite metadata and outbox. |
| `HTTP_HOST` / `HTTP_PORT` | `0.0.0.0` / `8080` | HTTP API and web dashboard; reverse-proxy TLS. |
| `SMTP_ENABLED` | `true` | Enable SMTP submission listener. |
| `SMTP_HOST` / `SMTP_PORT` | `0.0.0.0` / `2525` | Private SMTP submission. |
| `SMTP_REQUIRE_TLS` | `true` | Disallow AUTH until STARTTLS. |
| `SMTP_CERT` / `SMTP_KEY` | `/data/tls/*` | Persistent TLS material (auto-generated in image). |
| `ALLOWED_SENDERS` | empty | Comma-separated global allowed senders (strongly recommended). |
| `MAX_QUEUE_DEPTH` | `10000` | Maximum pending / actively processing jobs. |
| `MAX_MESSAGE_BYTES` | `65536` | Maximum body size (raw SMTP or JSON). |
| `MESSAGE_TTL_SECONDS` | `600` | Queued message expiration; align with OTP expiry. |
| `PROVIDER_TIMEOUT_MS` | `12000` | Timeout for each HTTPS provider call. |
| `WORKER_INTERVAL_MS` | `400` | Scheduling loop tick in milliseconds. |
| `WORKER_CONCURRENCY` | `6` | Concurrent delivery attempts (1–20). |

## Domain setup

Each provider requires verification of its own sending domain or subdomain. For fewer DNS conflicts, dedicate a separate subdomain per provider, for example `loops.example.com`, `resend.example.com` and `brevo.example.com`. Add the **exact SPF, DKIM and other records provided by the provider**. Never create two SPF records or two DMARC records for one DNS name. Never delete website, proxy, tunnel, or MX records unless the underlying service has explicitly been retired.

The gateway is **not an MX receiver**. There is no reason to point `example.com` MX to CourierMesh.

## Scaling and reliability

Use **exactly one active CourierMesh replica** when sharing its SQLite volume. SQLite's transaction-based reservations prevent same-process quota races, but the project does not include distributed leader election or shared worker leases. Back up `/data` daily. A rollback must preserve the volume and the original `ENCRYPTION_KEY`. To increase throughput for launch day, tune `WORKER_CONCURRENCY`, provider minute/hour quotas, and `MAX_QUEUE_DEPTH` only after validating provider acceptance and limits.
