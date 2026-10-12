# Operations runbook

## Pre-launch checklist

- [ ] All production secrets generated uniquely and not checked into git.
- [ ] HTTPS configured on public HTTP listener, admin optionally IP-restricted.
- [ ] SMTP port 2525 only reachable from trusted application containers.
- [ ] Persistent `/data` volume is mounted and backed up, encryption key securely backed up separately.
- [ ] Sending domain verified with active provider and SPF/DKIM/DMARC aligned.
- [ ] At least one provider enabled with realistic daily, hourly and rolling 30-day limits.
- [ ] Test messages delivered to at least two controlled inboxes using different recipient providers.
- [ ] Rate limits on application endpoints that trigger email configured (including verification resends, if enabled).
- [ ] Initial admin password changed; credentials and startup logs secured. Application keys are sender-scoped.
- [ ] Acceptance throughput and quota capacity tested with a **small** controlled batch (never send 1,000 test messages to random recipients).
- [ ] Delivery failure / quota / unknown states handled visibly in the application.

## Capacity planning for a 1,000-message traffic spike

This project **does not create additional free provider capacity**. The sum of approved provider capacities must independently support the projected 1,000 valid messages (plus any retry or resend reserve). Quotas configured in the dashboard do not raise upstream provider caps. If a provider supports 100 messages/day, it can never legitimately send 300/day just because the gateway is configured to allow it. Use provider support channels to confirm burst acceptance on new accounts.

For example, 1,000 outbound emails in 10 minutes is an average of 1.67 handoffs/second, *excluding resends*. With six parallel workers, a queue deadline of 10 minutes, and provider requests taking 1–2 seconds, processing is feasible only if the upstream hourly/daily quotas also allow it. Benchmark with actual accounts before launch.

## Backups

1. Stop the container (or use a consistent SQLite backup facility).
2. Copy `/data/couriermesh.db` along with any relevant WAL state if not stopped.
3. Preserve `ENCRYPTION_KEY` **separately** from the backup.
4. Keep access to backed-up mailbox addresses and API key metadata strictly limited.
5. Restore the volume and the **same key** on a single instance, validate `/healthz`, inspect dashboard.

## Upgrades

- Pin the container image to a tested tag/digest before production.
- Back up `/data`, including TLS certificate files.
- Deploy one replica and use graceful Docker stop; interrupted provider calls may be recorded as unknown on next boot.
- Run `npm test` and verify provider API contracts before replacing a working release.

## Troubleshooting

| Symptom | Likely reason | Action |
|---|---|---|
| SMTP authentication refused | STARTTLS missing, incorrect key ID or secret | Use STARTTLS; username is ID, password is SECRET |
| HTTP 401 | Invalid/rotated application or admin token | Create new app key, sign in to admin or verify configured legacy `ADMIN_TOKEN` |
| HTTP 403 | Sender not allowed for app key | Set exact `allowedFrom`; verify sending domain |
| Messages `failed` | No eligible provider / daily/30-day budget | Add/enable permitted provider; don't raise limits beyond plan |
| Messages `expired` | Hourly/minute throttling exceeded TTL | Increase legitimate provider capacity, tune concurrency/deadline |
| Messages `unknown` | Network timeout, 5xx, crash mid-dispatch | **Do not automatically resend**; provide user-controlled new OTP |
| Loops skipped for generic mail | Missing optional generic transactional template | Use an OTP template for verification or configure `genericTransactionalId` for generic messages |
| Provider reports accepted but mail not in inbox | Spam filtering, sender DNS, suppression or bounce | Inspect provider event logs / recipient spam folder |
| Certificate trust error | Generated self-signed TLS certificate | Distribute trusted CA/cert to SMTP client or install a real certificate |

## Monitoring

`GET /healthz` and `/readyz` are unauthenticated liveness endpoints; they contain no sensitive data. Dashboard metrics show queued/accepted/unknown counts. Consider adding a separate host-level monitor for process exit, disk capacity and memory, because liveness alone does not verify actual provider delivery.

## Diagnostic mode

Open **Diagnostics** to capture API/SMTP submissions without forwarding them. Mode auto-expires in ten minutes. Prefer `POST /v1/probe` or `dryRun:true` to avoid pausing real submissions. Only sanitized metadata (not content) is stored and removed after 24 hours. `202 captured` is a local connectivity confirmation, **not** successful email delivery.

## Lost admin password

Use an authenticated server terminal and run `node /app/scripts/reset-admin.mjs` inside the container. A random new eight-character temporary password is printed there once and immediately requires replacement; application API keys and provider credentials are left intact.
