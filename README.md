<div align="center">

<img src="public/logo.svg" alt="CourierMesh logo" width="92" />

# CourierMesh

**One endpoint. Six delivery adapters. Your limits, under control.**

An open-source, self-hosted transactional email gateway built for verification codes, authentication mail and small applications. Deploy on a single VM with no paid database, Redis queue, or proprietary backend.

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Node](https://img.shields.io/badge/node-22%2B-339933) ![Docker](https://img.shields.io/badge/deployment-Docker-2496ed) ![SMTP](https://img.shields.io/badge/SMTP-STARTTLS-35bfaa) ![Providers](https://img.shields.io/badge/providers-6-8475ef)

[Quick start](#quick-start) · [Providers](#providers) · [Provider setup](docs/PROVIDERS.md) · [Architecture](#architecture) · [Security](docs/SECURITY.md) · [API](docs/API.md) · [OpenAPI](docs/openapi.yaml) · [Deployment](docs/DEPLOYMENT.md) · [Operations](docs/OPERATIONS.md)

</div>

---

## Why CourierMesh?

Running a small self-hosted application should not require a paid transactional email subscription or opening outbound SMTP port 25. CourierMesh accepts messages through **one authenticated HTTPS API** or **one internal SMTP endpoint**, then hands them to whichever configured provider has available capacity.

It does not bypass the terms, approval requirements, abuse checks, or quotas imposed by a provider. Your account is responsible for ensuring that its sending volume and domain authorization are valid.

### At a glance

| Capability | Included |
|---|---|
| Six provider integrations | Loops, Resend, Brevo, Mailjet, SMTP2GO, SendPulse |
| Application connectivity | HTTPS JSON API + authenticated SMTP submission |
| Quota policies | Per-provider per-minute, per-hour, per-UTC-day, rolling 30-day caps |
| Routing | Priority-based with quota-aware fallthrough |
| Availability | Durable SQLite outbox, configurable parallel workers |
| Safety | No retry if provider acceptance is uncertain |
| Access | Scoped application keys, one-time token display, sender allowlist |
| Visibility | Browser admin console, message states, quota meters, provider list |
| Encryption | AES-256-GCM encryption for provider credentials and queued email bodies |
| Infrastructure | Docker, Easypanel, SQLite, one service |
| Privacy | No analytics, no tracking pixels, no marketing list synchronization |

**Limits of scope:** CourierMesh does not host mailboxes, receive MX mail, verify inbox delivery, handle bounces automatically, manage marketing audiences, or offer guaranteed exactly-once external delivery. Read [Design decisions](docs/ARCHITECTURE.md).

## Architecture

```mermaid
flowchart TD
    A[Student application] -->|HTTPS 443 / REST API| B[CourierMesh]
    A -->|Internal SMTP 2525 / STARTTLS| B
    B --> C[(Encrypted SQLite outbox)]
    C --> D{Priority and quota router}
    D --> E[Loops - OTP templates]
    D --> F[Resend]
    D --> G[Brevo]
    D --> H[Mailjet]
    D --> I[SMTP2GO]
    D --> J[SendPulse]
    E --> K[Student mailbox]
    F --> K
    G --> K
    H --> K
    I --> K
    J --> K
```

Every provider request goes out over HTTPS **port 443**. Oracle Always Free's outbound SMTP 25 restrictions do not affect these API adapters.

## Quick start

Requirements: Docker Engine and Docker Compose. Production containers run Node.js 22 with SQLite built in. **No `npm install` required.**

```bash
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# Use DIFFERENT outputs in .env:
# ADMIN_TOKEN=<32+ random chars>
# ENCRYPTION_KEY=<64 hexadecimal chars>
# ALLOWED_SENDERS=no-reply@notify.yourdomain.com

docker compose up -d --build
curl -fsS http://127.0.0.1:8080/healthz
```

Open the admin console on `http://127.0.0.1:8080` through an HTTPS reverse proxy for remote access. For SSH-only access, use `ssh -L 8080:127.0.0.1:8080 ubuntu@YOUR_SERVER` and open `http://localhost:8080` locally. **Never publish admin HTTP directly to the Internet without TLS.**

1. Sign in using your `ADMIN_TOKEN`.
2. Add and enable a provider with verified sending domain, API credentials, and quotas.
3. Create an application key with an exact authorized sender address.
4. Connect via HTTPS API (best for OTP) or authenticated private-network SMTP.
5. Run a real single-recipient acceptance and inbox test before inviting students.

For Easypanel instructions, persistent storage, networking, TLS trust, and deployment constraints, see [Deployment](docs/DEPLOYMENT.md).

## Providers

| Adapter | Input | Provider account prerequisites | Typical purpose |
|---|---|---|---|
| **Loops** | OTP template; optional generic text template | API key + published OTP transaction ID; optional generic template ID | Verification codes, optional generic SMTP text bridging |
| **Resend** | OTP / raw | API key + verified sender/domain | General transactional messages |
| **Brevo** | OTP / raw | API key + verified sender/domain | General transactional messages |
| **Mailjet** | OTP / raw | Public API key + private secret + verified sender | General transactional messages |
| **SMTP2GO** | OTP / raw | API key + verified sender | General transactional messages |
| **SendPulse** | OTP / raw | API client ID + secret + approved SMTP account | General transactional messages |

**Loops exception:** Loops only accepts published transactional templates; it is *not* a free-form SMTP relay. For OTP, create and publish a template with the case-sensitive `{code}` variable and either use the HTTPS API or `X-CourierMesh-OTP` SMTP header. To route ordinary SMTP text emails through Loops without changing your SMTP client, optionally configure a **generic text transactional template ID** whose body uses `{message}` and whose subject uses `{subject}`. The gateway injects those variables (HTML layout is not preserved). Without this second template, ordinary SMTP mail uses the five raw-capable adapters.

### Conservative dashboard defaults (verify against your plan)

| Provider | Daily | 30-day | Hourly | Minute |
|---|---:|---:|---:|---:|
| Loops | 0 (no daily cap set) | 4,000 | 600 | 8 |
| Resend | 100 | 3,000 | 100 | 4 |
| Brevo | 300 | 9,000 | 300 | 5 |
| Mailjet | 200 | 6,000 | 200 | 3 |
| SMTP2GO | 200 | 1,000 | 200 | 3 |
| SendPulse | 400 | 12,000 | 50 | 1 |

These defaults are *locally configured safety budgets*, **not** verified account entitlements. Provider offers, rate limits, account status and terms change. The monthly cap is a conservative **rolling 30-day window**. Daily resets at **00:00 UTC**. A zero cap means *no local cap*—it does not change the provider's own cap. Set more restrictive numbers for new/unapproved accounts.

## Send an OTP (HTTPS)

```bash
curl -X POST https://mail-gateway.yourdomain.com/v1/send \
  -H 'Authorization: Bearer KEY_ID.SECRET' \
  -H 'Idempotency-Key: signup-student-123' \
  -H 'Content-Type: application/json' \
  -d '{
    "kind": "otp",
    "from": "no-reply@notify.yourdomain.com",
    "to": "student@example.com",
    "subject": "Your CCIT verification code",
    "code": "782194",
    "variables": {"appName": "CCIT Students"}
  }'
```

```json
{"id":"75f...","status":"queued","duplicate":false}
```

A `202` response means the request is **durably queued**, **not delivered**. Poll `GET /v1/messages/{id}` using the same application key to observe `accepted`, `failed`, `expired`, or `unknown`. For OTP flows, make sure your application's OTP expiration and gateway queue deadline are consistent. Never expose the application key to browser JavaScript.

For SMTP usage, see [API and SMTP](docs/API.md). For the implementation details of quota routing and crash recovery, see [Architecture](docs/ARCHITECTURE.md).

## Project structure

```text
couriermesh/
├── src/                  # Node 22 server, SMTP, SQLite outbox, provider adapters
├── public/               # Responsive control plane + vector brand mark
├── docs/                 # Architecture, deployment, API, operations, security
├── tests/                # Node built-in test runner
├── examples/             # Integration samples
├── .github/workflows/    # Continuous integration
├── Dockerfile
├── compose.yaml
├── .env.example
└── LICENSE
```

## Development

```bash
node --version        # 22.13+ recommended
npm run check
npm test
```

The core runtime is dependency-free, enabling offline tests and limiting supply-chain exposure. SQLite support in Node.js 22 is currently marked experimental; pin a known-working Node image and validate newer releases before deployment. The Dockerfile currently uses Node 22; for strict production reproducibility, pin it to a tested patch or digest.

## Open-source project

MIT licensed. Contributions are welcome: see [Contributing](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), and [Security policy](SECURITY.md). Please follow providers' published rate limits and anti-spam rules. This project is not affiliated with Loops, Resend, Brevo, Mailjet, SMTP2GO or SendPulse.

### Release readiness

The repository includes unit/integration tests with simulated provider responses and a functional local SMTP/API path. **Live provider delivery, real-world DNS alignment, Easypanel deployment, load testing, independent security review, and 1,000-user launch validation still require real accounts and deployment access.** Do not assume a provider's acceptance response means the message reached the inbox.

## Publish to GitHub

This source archive is deliberately not attached to a specific GitHub user or organization. To publish it under your own account:

```bash
git init -b main
git add .
git commit -m "Release CourierMesh 1.0.0"
# Install and authenticate GitHub CLI first:
gh repo create couriermesh --public --source=. --remote=origin --push
```

Set the GitHub repository description to **"Self-hosted, quota-aware email gateway with six provider adapters, SMTP submission and a secure HTTP API."** Enable branch protection and security advisories before inviting contributors. Do not commit `.env`, private SMTP certificates, or runtime data.
