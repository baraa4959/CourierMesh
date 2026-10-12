# Contributing to CourierMesh

Thanks for helping improve the project. Please open a focused issue describing the problem, reproduction and expected behavior before major structural changes. Small PRs are welcome.

## Developer checklist

1. Use Node.js 22.13+.
2. Run `npm run check && npm test`.
3. Add regression tests for SMTP parsing, quota reservation, retry uncertainty and new provider response formats.
4. Document any provider API or quota policy changes with official documentation links.
5. Do not commit real API keys, `.env`, production database files, log exports or recipients' email addresses.
6. Keep third-party API endpoints fixed in adapter code; never expose arbitrary URL configuration to untrusted users.
7. New features must be backwards-compatible with the single-replica persistence model or explicitly document a migration.

## Code review standards

Provider responses must distinguish **definitive non-acceptance** from **uncertain acceptance**. It is preferable to require user intervention than to silently send two OTP emails. Do not claim a successful inbox delivery based on provider HTTP 2xx alone.
