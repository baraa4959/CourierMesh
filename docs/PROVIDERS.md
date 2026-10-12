# Provider setup cookbook

CourierMesh **does not create an account, bypass verification, or expand a provider's free quota**. Create a separate account at each desired provider, verify your sending domain, and enter its credentials in the admin console. The free limits shown in the dashboard are editable defaults, not a guarantee of provider approval or capacity.

## Loops

1. Create a Loops account and verify a sender domain (for example `loops.example.org`).
2. Create and **publish** a transactional template for OTP; use the case-sensitive variable `code` in the message body.
3. Copy its transactional ID and create an API key.
4. In CourierMesh, select `Loops` and enter `apiKey` and `transactionalId`.
5. Test with a single controlled address. For ordinary transactional mail through Loops, optionally publish a **second generic** transactional template containing `subject` and `message` variables, and store its ID as `genericTransactionalId` in CourierMesh. OTP uses the original `transactionalId`. Loops recipients are **not** automatically enrolled in marketing audiences (`addToAudience:false`).

Docs: [Loops transactional guide](https://app.loops.so/docs/transactional/guide).

## Resend

1. Create a Resend API key with sending permissions.
2. Verify your sending domain and follow Resend's sending restrictions for new accounts.
3. Select `Resend` in CourierMesh and enter `apiKey`.
4. Confirm that `from` uses a verified identity in Resend.

Docs: [Resend API](https://resend.com/docs/api-reference/emails/send-email).

## Brevo

1. Create a Brevo API key for transactional sending.
2. Verify a sending identity/domain; ensure API sending is enabled for the account.
3. Select `Brevo` and enter `apiKey`.

Docs: [Brevo transactional email](https://developers.brevo.com/docs/send-a-transactional-email).

## Mailjet

1. Obtain the **API Key** and **Secret Key** for a validated sender.
2. In CourierMesh select `Mailjet`, enter `apiKey` and `secretKey`.
3. Test one email; check activity and Mailjet delivery logs.

Docs: [Mailjet Send API v3.1](https://dev.mailjet.com/docs/email-api/send-api-v31/send-basic-email).

## SMTP2GO

1. Verify a sender email/domain and obtain an API key.
2. Select `SMTP2GO`, enter `apiKey`.
3. Set the quotas to your actual SMTP2GO plan. API responses can be HTTP 200 while containing a failed-recipient count; CourierMesh checks for this explicitly.

Docs: [SMTP2GO standard email API](https://developers.smtp2go.com/reference/send-standard-email).

## SendPulse

1. Activate/obtain approval for SendPulse SMTP, and verify a sender identity.
2. Create OAuth API client credentials (`clientId`, `clientSecret`) in your SendPulse account.
3. Select `SendPulse` in CourierMesh and enter those credentials.
4. The gateway obtains an OAuth token and calls the transactional SMTP API over HTTPS; SMTP port 25 is never used.
5. Keep free plan budgets within SendPulse's hourly cap and daily cap. Their published free SMTP documentation mentions **50 emails/hour** and **400/day**, but account-specific limits can vary.

Docs: [SendPulse SMTP API](https://web.sendpulse.com/latam/integrations/api/smtp), [SendPulse quota limits](https://web.sendpulse.com/knowledge-base/smtp/limits).

## Private OTP template

For Resend, Brevo, Mailjet, SMTP2GO, and SendPulse, configure a private OTP subject, text and optional HTML from the **OTP Template** tab before using these adapters. Actual template content is encrypted on the server and is never stored in GitHub. The `{{code}}` placeholder is required. Loops continues using its provider-hosted published OTP template. See [Private OTP templates](PRIVATE-OTP-TEMPLATES.md).

## Domain authentication rules

- Authorize each `From` identity at the **actual sender provider**; the gateway cannot sign DKIM itself for mail handled by a provider.
- If several providers use separate subdomains, each can have its own SPF/DKIM records.
- Do not create duplicate SPF TXT values at one owner name or duplicate `_dmarc` TXT values for one owner name.
- DKIM selectors are provider-specific; add the exact records supplied by each vendor.
- Do not delete your website A/CNAME, application tunnel DNS or MX mail reception entries as part of gateway installation.

## Handling free-tier burst traffic

No service automatically grants 1,000 accepted emails in a day from a new account. Confirm each service's daily and hourly acceptance capacity, and reserve budget for users who request a second OTP. If no provider is eligible, the gateway returns a clear failed/expired status rather than silently bypassing account restrictions.

## Diagnostics

Before testing real delivery, use [local connection diagnostics](DIAGNOSTICS.md) to confirm application tokens, sender authorization and SMTP/REST connectivity without contacting providers.
