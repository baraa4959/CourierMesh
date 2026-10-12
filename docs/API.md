# OTP-only API and SMTP reference

CourierMesh accepts **verification codes only**. `kind: "raw"`, arbitrary HTML/text sending and SMTP messages without a verification header are rejected.

## Authentication

The admin dashboard uses the operator's `ADMIN_TOKEN` on `/admin/*`. Applications get a distinct key through **API & SMTP Keys**. The secret is shown once, in the `KEY_ID.SECRET` format.

- HTTP: `Authorization: Bearer KEY_ID.SECRET`
- SMTP: username `KEY_ID` and password `SECRET` after STARTTLS

Store application secrets on your **backend**, never in a browser or mobile client.

## POST /v1/send

```http
POST /v1/send
Content-Type: application/json
Authorization: Bearer KEY_ID.SECRET
Idempotency-Key: signup-123-attempt-1
```

```json
{
  "kind": "otp",
  "from": "no-reply@notify.example.com",
  "to": "recipient@example.net",
  "code": "123456"
}
```

`kind` can be omitted, but if supplied it must be `otp`. `code` is required (4–24 alphanumeric, underscore or dash characters). Optional `variables` are forwarded to Loops for its published transactional template. `subject`, `text` and `html` are not configurable by the sender: the gateway uses the saved private template for the five non-Loops providers; Loops uses its published template.

On acceptance, HTTP returns `202` with `{ "id": "...", "status": "queued", "duplicate": false }`. This does **not** mean the email reached the recipient. Poll `GET /v1/messages/{id}` using the same application token.

`Idempotency-Key` prevents accidental double queueing, is scoped to the application key and must be at most 120 characters (letters, numbers, `_`, `.`, `:`, `-`). A conflicting request returns `409`. Use a new key for a new OTP attempt.

Response codes: `202` queued; `400` invalid/non-OTP message; `401` invalid token; `403` unauthorized sender; `409` idempotency conflict; `429` rate limited; `503` queue full.

## GET /v1/messages/{id}

States: `queued`, `processing`, `accepted` (provider accepted), `failed`, `expired`, `unknown` (ambiguous provider outcome, not automatically resent).

## Admin template endpoints

All require `Authorization: Bearer ADMIN_TOKEN` over HTTPS.

- `GET /admin/otp-template`: `{ "configured": false, "template": null }` when no template is saved; otherwise includes the decrypted template **for the authenticated administrator only**.
- `PUT /admin/otp-template`: save `{ "subject": "...", "text": "...{{code}}...", "html": "...{{code}}...", "direction": "rtl" }`. HTML is optional, but a code marker must appear in both text and custom HTML.

Templates are stored encrypted in the persistent SQLite database, not source control. See [Private OTP templates](PRIVATE-OTP-TEMPLATES.md).

Other admin endpoints: `GET /admin/session`, `GET /admin/stats`, `POST /admin/test-send`, `GET/POST /admin/providers`, `PATCH/DELETE /admin/providers/:id`, `GET/POST /admin/keys`, `DELETE /admin/keys/:id`, and `GET /admin/messages`.

Provider credential types: Loops (`apiKey`, `transactionalId`), Resend/Brevo/SMTP2GO (`apiKey`), Mailjet (`apiKey`, `secretKey`) and SendPulse (`clientId`, `clientSecret`).

## SMTP OTP submission

On private network port `2525`, use `EHLO`, `STARTTLS`, `AUTH`, `MAIL FROM`, `RCPT TO`, `DATA`. The SMTP email **must** include header `X-CourierMesh-OTP: 123456`. Its arbitrary body and subject are ignored; the centrally managed templates determine content. Exactly one recipient is supported. Attachments are not supported. Keep the submission port private; HTTPS REST API is the recommended method.
