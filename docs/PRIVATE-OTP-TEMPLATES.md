# Private OTP templates

CourierMesh accepts **verification-code email only** through its authenticated HTTP API and its private SMTP submission service. Arbitrary raw/text/HTML email sending is disabled.

## Configure in the admin dashboard

1. Deploy with persistent `/data` storage and keep `ENCRYPTION_KEY` unchanged across upgrades.
2. Sign in with the admin token and open **OTP Template**.
3. Enter the subject, plain-text message, optional HTML version, and text direction (RTL/LTR). Place `{{code}}` in the text and, when used, in the HTML version.
4. Save the template. It is stored **AES-256-GCM encrypted** in the SQLite database at `/data/couriermesh.db`. The content is not bundled with or uploaded to GitHub.
5. Send one test OTP with each enabled provider before enabling production failover.

The plain-text version and the optional HTML are the same content delivered across Resend, Brevo, Mailjet, SMTP2GO and SendPulse. When no custom HTML is provided, CourierMesh creates a readable HTML email with the code emphasized and the chosen text direction. When custom HTML is supplied, `{{code}}` is substituted directly. Use trusted HTML authored by your team.

**Loops is different:** Loops controls its own published transactional template. Configure that template in Loops with the `code` data variable. CourierMesh cannot read/synchronize Loops' HTML design automatically. To match the same look on all other providers, reproduce the Loops HTML in your private CourierMesh HTML field. Keep your organization-specific template out of the public repository.

Without a saved private template, **only Loops** is eligible to send OTPs. Other providers are not used until the template is configured.

## API request

```json
{"kind":"otp","from":"no-reply@notify.example.com","to":"recipient@example.net","code":"123456"}
```

The API client does **not** supply subject or body. Those are controlled centrally in the template. The application must generate and securely validate OTP codes and decide their validity window; CourierMesh only queues and sends them.

## SMTP

SMTP clients can supply `X-CourierMesh-OTP: 123456` to select the OTP template. Without the header, a supported ordinary SMTP message is handled as a general transactional email. SMTP remains private-network only; HTTP API is preferred for OTP integrations.

## Privacy and backup

- Templates and provider credentials are encrypted before saving, and the encryption key must not be committed, posted, or lost.
- `/data` must be persistent; ensure your own encrypted backup of the volume and a secure backup of `ENCRYPTION_KEY`.
- Admin API `GET/PUT /admin/otp-template` can read/write the private template after authentication. Protect the admin domain with HTTPS and access restrictions.
- A public GitHub repository contains only application logic and generic documentation. Never paste production template text into source files, examples, logs or GitHub issues.
