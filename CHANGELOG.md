## 1.2.1 — Bootstrap interface cleanup

- Replaced the previous custom-styled administration console with locally bundled Bootstrap 5.3.6 components.
- Removed decorative icons, all-caps marketing labels, promotional copy, duplicate headings and extra letter spacing from the interface.
- Simplified navigation, tables, forms, login, templates and diagnostics while preserving all element IDs and REST/SMTP behavior.
- Retained Arabic RTL and all four existing translations; no new external runtime dependency or database migration.
- Added static UI integrity tests and visually checked dashboard rendering in English and Arabic at desktop/mobile sizes.

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

## [1.2.0] - 2026-10-12

- Reintroduced standard transactional `raw` email through REST API and authenticated SMTP without breaking existing OTP requests and application keys.
- Added privacy-safe REST `/v1/probe`, `dryRun:true`, SMTP `X-CourierMesh-Probe`, and time-limited capture mode for API and SMTP incoming traffic.
- Redesigned the responsive control console with Arabic (RTL), English, French and Spanish translations, with no external CDN.
- Added local administrator account bootstrap, random eight-character temporary password, forced password change, scrypt password hashes, expiring sessions, and trusted server-side reset command.
- Kept optional existing `ADMIN_TOKEN` authorization, database paths, existing encrypted providers, API keys and private OTP templates compatible with previous deployments.
- Updated documentation, OpenAPI spec, operations guide, smoke tests and Docker image.
