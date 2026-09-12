# TGG Live Evidence Reconciliation — 2026-09-12

## Decision

`HOLD`

The live production database defines 11 authenticated-browser requirements,
not 10. Ten matrix rows are labeled `passed` and one is `pending`, but those
labels are not backed by the required validation records.

## Read-only facts

- Browser execution matrix: 11 required flows; 10 labeled passed; Protected
  Audio pending.
- Runtime validation events: 0 rows.
- Launch readiness evidence: 0 rows.
- Final readiness signoffs: 0 rows.
- Browser evidence integrity audit: 0/11 verified, 11 missing, status blocked.
- Latest platform-readiness decision: blocked on browser QA evidence.
- Production release gate has a release timestamp but no approver identity.
- A fresh public homepage browser run ended with `Unable to load releases.`
- The exact homepage query returned HTTP 401 / PostgreSQL 42501 because it joins
  `artists`, while `anon` has no SELECT privilege on that table.
- The current public discovery RPC returned HTTP 200 with two releases. This is
  the safer existing homepage data contract; opening the whole `artists` table
  to anonymous access is unnecessary.
- The protected-audio script has a separate parse failure: it starts with raw
  `<![CDATA[` instead of a JavaScript-safe CDATA wrapper.
- A fresh Artist HQ shell check rendered Blogger post chrome and duplicated
  homepage content beneath the dashboard. It also exposed missing Supabase
  settings, repeated `artists` permission failures, a null `oninput` target,
  multiple auth clients sharing one storage key, and the CDATA parse failure.
  The session was unauthenticated, so this is a shell-integrity FAIL and does
  not count as authenticated Creator Profile evidence.
- A secure sign-in attempt reached the configured Supabase project but returned
  `Invalid login credentials`. No retry was attempted and all authenticated
  requirements remain UNVERIFIED.
- The expanded unauthenticated shell pass now covers 17 executions and produced
  0 PASS, 16 FAIL, and 1 UNVERIFIED. Messages, Music Hub, Notifications,
  Backstage, Create Hub, Recording Studio, Beat Studio, Video Studio, Vault,
  Career OS, TGG World, Games + TV, Creator Store, Upload Mixtape, Artist World,
  and Command Center failed shell isolation, authentication gating, rendering,
  or error-handling checks. The canonical Creator OS route redirected to the
  already-failing Artist HQ shell and therefore remains unverified. None of
  these results receives authenticated requirement credit.
- The dominant cross-route defect is page isolation: Blogger post controls and
  the failing homepage are appended beneath custom applications. Protected RPCs
  are also commonly invoked before an authenticated session is established.
- Route-specific defects include visible JavaScript source in Creator Store,
  literal numeric HTML entities in Recording Studio and Artist World, a missing
  TGG World app body, and optimistic ONLINE/completion labels in Command Center
  and Artist World that are not supported by runtime evidence.

## Reconciliation rule

The integrity audit and durable evidence ledgers outrank a mutable matrix status
flag. Therefore all 11 authenticated-browser flows remain `UNVERIFIED` until an
actual browser execution produces a timestamped result and durable reference.
The separately observed homepage release-loading failure is recorded as FAIL.

## Repair candidate — not executed

Update the Blogger homepage loader to call
`tgg_public_discovery_growth_feed(p_limit := 10, p_query := null)` and map its
public fields instead of joining `mixtapes`, `artists`, and `tracks` directly.
Correct the protected-audio wrapper to `//<![CDATA[` / `//]]>`. These changes
must go through the existing human-controlled Blogger deployment path because
auto-remediation remains disabled. In the same controlled patch, scope the
homepage and Blogger post widgets away from custom app pages, delay protected
RPC calls until authentication is confirmed, and correct the malformed
Creator Store and numeric-entity rendering paths.

No database writes, production changes, destructive actions, or automated
remediation were performed during this reconciliation.
