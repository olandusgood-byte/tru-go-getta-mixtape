# Activation Bridge Source Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the already-live TGG Activation Bridge and Master Admin control-plane reconciliation reproducible from GitHub without changing certified core behavior.

**Architecture:** Keep `tgg-one-final-page-audit` as the repurposed owner-only Activation Bridge Edge Function and check in its exact live source. Add one idempotent migration that reconciles the canonical Master Admin route, runtime manifest, drift guard, launch closeout URL, Edge registry/retirement metadata, and cleanup self-protection. Add a SQL regression test that fails if the route, manifest, drift guard, or cleanup protection regress.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), PostgreSQL/PLpgSQL, Supabase Vault RPCs, GitHub.

**Spec:** `docs/PRODUCTION_MIGRATION_PARITY_CLOSEOUT_2026-09-14.md` plus the verified production state on 2026-09-16.

## Global Constraints

- Preserve core launch readiness: 11/11 browser evidence and zero core blockers.
- Reuse existing Edge slug `tgg-one-final-page-audit`; do not allocate a 101st Edge Function.
- Never embed service-role keys or provider secret values in source control.
- The HTML shell may be public, but every sensitive provider action must remain authenticated and owner-guarded by existing RPCs.
- Keep Stripe Payment Link fallback and existing provider safe modes unchanged.
- Do not alter Creator OS or public-site routes beyond the Master Admin canonical URL.

---

### Task 1: Regression Test

**Files:**
- Create: `supabase/tests/activation_bridge_master_admin.sql`

**Interfaces:**
- Consumes: `public.tgg_site_routes`, `public.tgg_master_shared_settings`, `private.tgg_edge_function_registry`, `private.tgg_edge_physical_cleanup_candidates()`, `public.tgg_runtime_drift_guard()`.
- Produces: a SQL regression check that raises on any Master Admin/Activation Bridge drift.

- [ ] **Step 1: Write the failing test**

Create assertions for the canonical URL `https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit`, route activity, runtime-manifest parity, canonical/keep registry state, cleanup ineligibility, and drift guard success.

- [ ] **Step 2: Verify the pre-sync repository is missing the source/migration contract**

Confirm the default branch does not contain `supabase/functions/tgg-one-final-page-audit/index.ts` or the new reconciliation migration.

- [ ] **Step 3: Commit the regression test**

Commit message: `test: lock activation bridge master admin contract`.

### Task 2: Check In Exact Live Edge Source

**Files:**
- Create: `supabase/functions/tgg-one-final-page-audit/index.ts`
- Create: `supabase/functions/tgg-one-final-page-audit/deno.json`

**Interfaces:**
- Consumes: owner session from Supabase Auth and existing RPCs `tgg_creator_expansion_control_center`, `tgg_one_final_activation_readiness`, `tgg_one_final_activation_queue`, `tgg_livekit_credentials_save`, `tgg_provider_activation_stage`, `tgg_store_provider_secret`, `tgg_provider_activation_verify`, `tgg_blogger_reconnect_link_create`.
- Produces: `TGG-ACTIVATION-BRIDGE-V1` HTML response on GET and owner-only provider activation UX.

- [ ] **Step 1: Copy the exact production v370 source**

Use the current `Supabase.get_edge_function` response as source of truth. Keep the publishable key only; never add a service-role key.

- [ ] **Step 2: Preserve runtime contract**

GET returns HTML with `x-tgg-activation-bridge: TGG-ACTIVATION-BRIDGE-V1`; non-GET returns 405 JSON. Secret inputs are cleared after submission and RPC responses do not return provider secret values.

- [ ] **Step 3: Commit Edge source**

Commit message: `feat: track owner activation bridge edge source`.

### Task 3: Add Idempotent Control-Plane Reconciliation Migration

**Files:**
- Create: `supabase/migrations/20260916155930_activation_bridge_master_admin_reconciliation.sql`

**Interfaces:**
- Consumes: existing `owner_master_admin` route, runtime manifest row, Edge registry/retirement rows, and current ONE-FINAL helper functions.
- Produces: canonical Master Admin URL parity and cleanup self-protection while preserving Creator OS/public-site contracts.

- [ ] **Step 1: Recreate the current route-enforcement function**

Set `owner_master_admin` to the Activation Bridge URL while leaving all other route rules unchanged.

- [ ] **Step 2: Reconcile the route and CHECK constraint**

Drop the legacy Master Admin URL CHECK, update the route, then re-add the CHECK using the Activation Bridge URL.

- [ ] **Step 3: Reconcile runtime manifest and Edge metadata**

Set `canonical_master_admin`, `owner_console_url`, `direct_owner_console_url`, and `canonical_owner_route` to the Activation Bridge URL; set `master_admin_edge` to `tgg-one-final-page-audit` and `owner_console_strategy` to `dedicated_owner_activation_bridge`. Mark the Edge registry canonical/keep and the retirement manifest hold/reference_count=1.

- [ ] **Step 4: Recreate drift/closeout/cleanup helpers from verified production definitions**

Install `DRIFT-GUARD-ONE-FINAL-2.0`, `LAUNCH-CLOSEOUT-1.3`, and cleanup protection that returns `keep` / `registry_keep_canonical` for canonical or `retirement_state='keep'` functions.

- [ ] **Step 5: Commit migration**

Commit message: `fix: persist activation bridge control plane`.

### Task 4: Verification and Merge

**Files:**
- Verify only; no additional production files unless a test exposes a defect.

**Interfaces:**
- Consumes: branch files and live Supabase state.
- Produces: verified GitHub parity and a merge-ready branch.

- [ ] **Step 1: Verify branch contents**

Fetch all four new artifacts from the branch and confirm required markers/URLs are present.

- [ ] **Step 2: Run live read-only verification**

Confirm `public.tgg_runtime_drift_guard()->>'ok' = true`, `public.tgg_launch_readiness()` remains core-ready with browser evidence 11/11, the Activation Bridge registry is canonical/keep, and `private.tgg_edge_physical_cleanup_candidates()` reports `eligible=false` with `cleanup_action='keep'`.

- [ ] **Step 3: Open and review PR**

Compare branch to `main`; ensure changes are limited to this plan, test, Edge source, and migration.

- [ ] **Step 4: Merge after verification**

Merge with no production redeploy required because the branch is source-control parity for already-live verified state.
