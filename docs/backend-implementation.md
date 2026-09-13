# Backend implementation

Target: InsForge project POS AI. The implementation follows PRD P0 and the current Next.js frontend. Manual payment recording and operator-verified SaaS invoices are the pilot scope; payment gateways are P1.

## Architecture

- Next.js server routes use InsForge SSR authentication and the user's token. Refresh credentials remain in httpOnly cookies.
- PostgreSQL owns authorization, tenant/outlet boundaries, prices, stock, cost snapshots, ledger entries, idempotency, approvals, and subscription enforcement.
- App-owned normalized tables use the `nusa_` prefix in `public`. Direct runtime table writes are revoked. Narrow RPCs expose authorized projections and domain commands.
- A tenant transaction lock serializes conflicting business commands. This favors correctness for the pilot; high-volume sharding can narrow locks later.
- Private InsForge Storage holds proof files. AI uses the project's server-only OpenRouter gateway and can propose only allowlisted operations.
- Existing UI components receive server projections shaped for the frontend; demo fixtures remain for isolated unit tests only.

## Verification targets

Tenant and outlet isolation; revoked memberships; cashier cost redaction; idempotent checkout/receiving/refunds; last-unit concurrency; exact money allocation; stale quotations and stock counts; stock/cash reconciliation; trial/grace expiry; quota concurrency; private AI history; invoice operator separation; authenticated storage; production build.

This document will record the final deployed environment, checks, and any external rollout requirements after implementation.
