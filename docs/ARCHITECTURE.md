# Architecture and design decisions

## Data path

1. HTTP / SMTP authentication and per-application sender authorization.
2. Input validation (one recipient, content bounds, recognized MIME for SMTP).
3. Idempotent insertion into a persistent SQLite outbox (`BEGIN IMMEDIATE`).
4. Worker claims the oldest eligible queued message, reserves a provider quota slot and records an attempt **in the same transaction**.
5. API adapter calls a fixed allowlisted HTTPS endpoint with a timeout.
6. Result is recorded as accepted / rejected / uncertain. Definitive rejection can fall through to the next provider. Ambiguous outcomes are marked **unknown and never retried**.
7. Completed messages are visible in the admin console for 14 days; privacy-redacted quota records are retained for 35 days. OTP payload ciphertext is cleared when accepted / unknown / failed / expired.

## Quotas and selection

Provider priority is ascending. A provider is eligible if it is enabled, supports the message format (Loops requires the corresponding published template), has not been attempted for the message, and has capacity within **four** independently configured windows: minute (rolling), hour (rolling), day (UTC calendar), and 30 days (rolling). Reserved attempts count against capacity until a definitive rejection releases them. Unknown outcomes still count conservatively. Multiple concurrent workers use atomic SQLite transactions to prevent over-reservation.

This scheduler is a **local budget guard**, not a real-time copy of provider-side balances. Provider account limits, identity checks, rate controls and policies always take precedence. If minute/hour quotas are temporarily exhausted, jobs wait until capacity is available or expire. If no provider has remaining daily/30-day capacity (or none supports the message type), jobs fail. Backend queues are bounded.

## Durability and duplicates

The gateway provides durable at-least-once *queue acceptance* and conservative delivery attempts—not end-to-end exactly-once email delivery. On a network timeout, TLS error, upstream 5xx, or a crash during a provider call, it is not possible to know reliably whether the provider accepted the mail. The project deliberately stops and reports `unknown` rather than trying another provider and causing duplicate OTP emails. A client must decide whether the user should request a new OTP.

Resend receives an Idempotency-Key for additional provider-side protection. Other providers do not offer identical request semantics.

## SQLite and deployment model

`node:sqlite` provides a synchronous embedded database with WAL journaling. One process handles the queue and HTTP/SMTP listeners, and SQLite transactions serialize reservations while provider calls execute concurrently. It is deliberately a **single-replica design**; do not run multiple containers on a shared database and assume cluster coordination.

## Privacy and retention

Application plaintext OTPs and email bodies are encrypted before persistence using AES-256-GCM with a 32-byte operator-supplied master key. Provider credentials use the same mechanism. Non-sensitive metadata includes masked recipient and SHA-256 recipient fingerprint. An SHA-256 email fingerprint is not inherently anonymous against dictionary attacks; protect SQLite backups accordingly. Detailed message activity is shown only for 14 days. Recipient metadata is redacted at day 14, while minimal quota records are retained for 35 days to preserve 30-day rolling quota integrity. The master key must remain stable across restarts; rotation requires an offline migration.

## Explicit non-goals

- Receiving MX mail, hosting IMAP mailboxes, POP3 or full MTA replacement.
- Guaranteed mailbox delivery, bounce or complaint webhook aggregation.
- General MIME attachments, mail merges, mass marketing, bulk distribution.
- Distributed leader election, multi-region clustering, automated provider onboarding.
- Circumventing provider terms or subscription quotas.
