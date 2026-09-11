# TGG Production Baseline — 2026-09-11

This document records the live production facts verified against the connected Supabase project and Stripe account on 2026-09-11. It is a control-plane baseline only; it does **not** replay, recreate, or mutate production schema.

## Current production state

- Production release gate: `released`
- Release label: `PRODUCTION-LAUNCH-2026-09-11`
- Core launch readiness: true
- Prelaunch readiness score: 99.09
- Runtime contracts: 11/11
- Blogger pages/restores: 36/36
- Blogger production drift: 0
- Staged writes: 0
- Evidence override used: false
- Public discovery canonical contract: healthy
- Canonical homepage path: `/`
- Discover alias: `/p/homepage.html`
- Public discovery currently reports 2 playable homepage releases, 2 published releases, 2 artists, 1 video, and 1 membership tier.
- Video pipeline health: `ok=true`, pipeline verified.
- Production restore validation: 36/36 restore objects validated.
- Latest database/security smoke run: 12/12 passed, 0 blockers.

## Business / realtime provider state

- Live Stripe product exists for `Backstage Supporter`.
- Live recurring price is USD 4.99/month.
- Active live subscription Payment Link exists and is mapped to the TGG membership tier.
- TGG has not yet recorded a live Stripe webhook event/customer reconciliation in the canonical webhook ledger; live payment reconciliation remains an evidence gate.
- Provider activation registry reports `broadcast.sfu_turn` verified.
- Provider activation registry reports `distribution.provider` verified.
- Call validation ledger contains a completed validation.

## Remaining evidence gates

1. Protected Audio browser QA is the only pending item in the 11-flow browser QA execution matrix (10/11 verified).
2. Protected Audio has user-attested success recorded separately; it is intentionally **not** labeled browser-verified.
3. TGG World multiplayer witness remains pending and requires two distinct authenticated users observed simultaneously in the same instance. Synthetic presence is intentionally rejected.
4. Live Stripe customer/webhook round-trip evidence is still absent from `tgg_stripe_webhook_events`.
5. Creative Core contracts exist, including authenticated recording session/take RPCs and the shared Studio project model, but current canonical runtime tables contain no persisted recording sessions/takes/assets or render jobs; do not claim production runtime proof from empty tables.
6. Supabase Auth leaked-password protection remains an external configuration warning.

## Security notes

- Production readiness evidence reports RLS enabled across the production table set checked by the gate.
- The Supabase advisor reports many `RLS enabled with no policy` informational notices. These are deny-by-default and must not be mass-opened merely to silence the advisor.
- `public.tgg_public_epk(text)` is intentionally anonymous and `SECURITY DEFINER`; its private implementation validates the public slug and returns only explicitly public EPK/release data. Treat the advisor warning as an architectural exception unless a safer equivalent public contract replaces it.

## Source-control parity warning

The live Supabase migration history is materially ahead of the repository folder `supabase/migrations/`, which currently contains only the older AB005 migration files. Do **not** reconstruct or reapply live production DDL blindly.

Before disaster-recovery or clean-environment bootstrap is considered complete, export/reconcile the authoritative live schema and migration ledger into source control using a reviewed baseline process. Preserve the current zero-drift production state while doing this.

## Operating rule

From this baseline forward:

- Do not rerun completed production layers.
- Prefer verification and convergence over reinstalling schema.
- Never mark browser, two-user, payment, or World evidence as passed without real evidence.
- No mass index creation/drop based only on advisor counts; use hot-path query evidence.
- No production-secret values belong in this repository.
