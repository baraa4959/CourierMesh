# Security design and limitations

CourierMesh handles secrets, email addresses and one-time passwords. Deploy it on an appropriately hardened host, behind HTTPS, and treat its encryption master key as critical material.

## Controls implemented

- Per-app revocable tokens with a sender-authorization scope.
- Global sender allowlist (`ALLOWED_SENDERS`) and strict SMTP MAIL FROM/From matching.
- SMTP authorization requires STARTTLS by default, unless the operator explicitly opts out.
- AES-256-GCM authenticated encryption for queued payloads and provider credentials.
- Redacted admin API: no access to raw message bodies or provider secrets after submission.
- Fixed provider API endpoint allowlist; provider configs cannot supply arbitrary URLs (limits SSRF).
- Restrictive HTTP response headers and no CORS credential grants.
- Input validation, size limits, one-recipient-per-email restriction and queue bound.
- Request rate limiting (per instance), idempotent HTTP submissions.
- Definitive rejection can fall back; ambiguous provider acceptance is **not** retried.
- Docker runtime uses a non-root user, read-only root filesystem and dropped Linux capabilities.

## Known limits / deployment responsibilities

- The admin dashboard uses an administrator bearer token, **not full multi-user SSO / RBAC**. Protect the admin route behind TLS, and if possible VPN or a second reverse-proxy access policy.
- This implementation has **no enterprise audit retention**, delivery webhooks, automatic key rotation or vulnerability review certification.
- Self-signed STARTTLS certificates require explicit client trust. Never disable TLS verification globally.
- API credentials, SMTP passwords, and OTP payloads leave this server to reach the configured provider. This is required to deliver the message.
- A stolen database backup plus an offline dictionary of email addresses can potentially deanonymize SHA-256 email fingerprints. Protect backups.
- The HTTP API requires HTTPS termination at the reverse proxy. Never expose port 8080 directly on public interfaces.
- In-memory request throttles are per process, not distributed. Applications must separately rate-limit OTP issuance per account/IP and enforce verification attempt limits, short expiry, one-time use and hashed OTP storage.
- A single SQLite instance is supported; no replication or automatic failover.
- Node 22's built-in SQLite interface is experimental; pin and re-test runtime updates.

## Secret rotation

API tokens can be revoked individually from the dashboard. For an ADMIN_TOKEN rotation, change the environment variable and restart. For an `ENCRYPTION_KEY` change, data encrypted with the old key becomes unreadable: schedule a migration and do not simply replace it on a running deployment.

## Reporting vulnerabilities

See [`../SECURITY.md`](../SECURITY.md). Do not publish API tokens, domain ownership verification records, SMTP credentials, private recipient data or exploit proof-of-concepts in public issue trackers.
