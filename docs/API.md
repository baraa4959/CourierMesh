# API and SMTP reference

## Authentication

The administrator enters `ADMIN_TOKEN` in the dashboard to authenticate `/admin/*` using the HTTP `Authorization: Bearer` header. The token is kept in browser-tab memory only. Treat the admin endpoint as sensitive and put it behind HTTPS and optionally network access controls.

An application key is generated from the dashboard. **Copy it immediately**. It consists of `KEY_ID.SECRET`; the backend stores a SHA-256 verifier and never reveals the secret again. Each key has an `allowedFrom` address, or `*` if you deliberately want all verified sender addresses.

**HTTP API:**

```
Authorization: Bearer KEY_ID.SECRET
```

**SMTP authentication:**

```
username: KEY_ID
password: SECRET
```

## POST /v1/send

Accept a message asynchronously. Returns `202 Accepted` with a durable message ID. The gateway will subsequently attempt provider handoff.

```json
{
  "kind": "otp",
  "to": "student@example.com",
  "from": "no-reply@notify.example.com",
  "subject": "Verify your email address",
  "code": "123456",
  "variables": {"appName": "Student Portal"}
}
```

For ordinary messages, use `kind=raw` and provide `text` and/or `html`:

```json
{
  "kind": "raw",
  "to": "student@example.com",
  "from": "no-reply@notify.example.com",
  "subject": "Welcome",
  "text": "Your registration was approved."
}
```

The `Idempotency-Key` header is recommended to prevent duplicate queue submissions from application retries. Keys must be at most 120 characters and may contain alphanumerics, underscore, colon, period or dash. Idempotency is scoped to the caller's application key, and stored with job history. A repeated key returns the existing message ID and `duplicate=true`. Supply a new key if the user explicitly requests a *new* OTP code.

**Expected response**

```json
{"id":"550e8400-e29b-41d4-a716-446655440000","status":"queued","duplicate":false}
```

**HTTP status codes:** `202` queued; `400` validation; `401` invalid token; `403` forbidden sender; `429` request throttled; `503` queue full.

## GET /v1/messages/{id}

Accessible only to the same application key that created the message. Responses contain status and timestamps, never message body, recipient or OTP code.

| Status | Meaning |
|---|---|
| `queued` | Persisted, awaiting an eligible provider and worker |
| `processing` | Provider call underway |
| `accepted` | Provider API accepted handoff (inbox delivery not guaranteed) |
| `failed` | No enabled eligible provider with available daily / monthly capacity or compatible format |
| `expired` | Message exceeded queue TTL |
| `unknown` | Request outcome was ambiguous; never automatically resent |

## Admin endpoints

The dashboard consumes these token-protected endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /admin/session` | Validate admin token |
| `GET /admin/stats` | Quotas, provider status, message counts |
| `POST /admin/test-send` | Send one real test OTP from the dashboard |
| `GET /admin/providers` | Provider list without secrets |
| `POST /admin/providers` | Add provider |
| `PATCH /admin/providers/:id` | Update provider configuration |
| `DELETE /admin/providers/:id` | Delete unused provider, or disable provider with history |
| `GET /admin/keys` | List keys without secrets |
| `POST /admin/keys` | Create a new key; secret returned **once** |
| `DELETE /admin/keys/:id` | Revoke key |
| `GET /admin/messages` | Redacted recent activity |

For provider management, valid `type`s are `loops`, `resend`, `brevo`, `mailjet`, `smtp2go`, `sendpulse`. Config must include `name`, `priority`, `enabled`, `dailyLimit`, `monthlyLimit`, `hourlyLimit`, `minuteLimit`, and type-dependent `credentials`:

- Loops: `apiKey`, `transactionalId` (OTP) and optional `genericTransactionalId` for generic text mail; Loops templates must contain matching `{code}` or `{message}` and `{subject}` variables
- Resend, Brevo, SMTP2GO: `apiKey`
- Mailjet: `apiKey`, `secretKey`
- SendPulse: `clientId`, `clientSecret`

A limit of zero disables **the local** limit. Manage upstream quotas separately. Credentials are never returned by list or edit endpoints. When patching a provider, omit credentials to preserve existing credentials; to rotate Mailjet/SendPulse credentials, supply the full pair.

## SMTP submission

Connect to SMTP port `2525` on a **private Docker network** with `EHLO`, `STARTTLS`, `AUTH PLAIN` or `AUTH LOGIN`, `MAIL FROM`, `RCPT TO`, `DATA`. Limitations are intentional:

- Exactly **one recipient per message** (prevents accidental bulk blast and keeps quota accounting accurate).
- MIME `text/plain`, `text/html`, and `multipart/alternative` supported for common clients. Large attachments, other MIME types and arbitrary relay extensions are unsupported.
- The `From` header must match the `MAIL FROM` envelope, and `To` must match the sole `RCPT TO` address; sender must match key allowlist.
- `AUTH` requires TLS unless explicitly disabled by the operator on an isolated network.
- SMTP `250 Queued` means the message was durably recorded, **not delivered**.
- `X-CourierMesh-OTP: 123456` makes an SMTP submission eligible for the Loops OTP adapter. Without this header, Loops can still send generic SMTP text if `genericTransactionalId` is configured with a published Loops template providing `{message}` and `{subject}` variables; otherwise it is skipped.
- `X-CourierMesh-Variables: <base64-encoded-json>` optionally sets additional Loops variables; API clients should prefer native JSON.

See [Examples](../examples/) for runnable integration samples.
