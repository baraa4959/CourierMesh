# Changelog

All notable changes to CourierMesh are documented here. Versioning follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-12

### Added

- Self-hosted, dependency-free Node.js 22 implementation.
- HTTPS application API and TLS-authenticated private SMTP submission.
- Six provider adapters: Loops, Resend, Brevo, Mailjet, SMTP2GO, SendPulse.
- Transactional OTP templates and raw-email support where available.
- Priority-ordered provider routing and four quota windows.
- SQLite WAL outbox, message idempotency, parallel workers and conservative retry behavior.
- Encrypted queued bodies and provider configuration; redacted activity metadata.
- Browser administration, provider configuration, one-time application keys and controlled test sends.
- Docker, Easypanel instructions, CI and security/deployment documentation.

### Known limitations

- Provider integrations tested with mocked remote APIs; real account validation required.
- One-replica SQLite deployment; not a clustered gateway.
- No provider webhook reconciliation or guaranteed end-to-end delivery confirmation.
