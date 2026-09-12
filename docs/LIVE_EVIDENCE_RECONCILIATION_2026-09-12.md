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
auto-remediation remains disabled.

No database writes, production changes, destructive actions, or automated
remediation were performed during this reconciliation.
