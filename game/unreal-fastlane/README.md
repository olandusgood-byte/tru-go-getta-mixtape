# TRU GO GETTA WORLD — Unreal Fast-Lane Snapshot

Canonical recoverable source checkpoint for the Unreal Engine 5.8 vertical slice.

- Latest recovered checkpoint: `e628173`
- Source fingerprint: `e628173668e9`
- Archive SHA-256: `d9873c842d66b0508d0b8e447de8e2cdb95362c5d15e4486e50cbb5e3f51bd58`
- Archive transport: **19 ordered base64 text chunks**, reconstructed and SHA-verified by the Windows workflow
- Recovery base: verified `90457ba` archive + rebuilt two-client EOS/voice proof layer
- Source readiness: **PASS**
- Evidence-weighted vertical-slice completion: **70%**
- Structural verifiers: **43/43 PASS**
- Portable C++ tests: **1/1 PASS**
- Whitespace + privileged credential literal scans: **PASS**
- Unreal 5.8 Windows compile/cook/package: **PENDING real Windows UE 5.8 + VS2022 execution**

The recovery replaces the incomplete `8014d5a` upload and the truncated direct binary transport with a deterministic 19-piece text checkpoint. The runtime workflow concatenates the chunks, decodes them, and refuses to continue unless the rebuilt archive matches the pinned SHA-256 above.

The source keeps the existing Creator District/gameplay/backend fast-lane and adds the recovered two-real-client EOS proof path with a unique per-run lobby proof ID, real `IVoiceChatUser` channel observation, per-process environment credentials, and the live Supabase multiplayer witness.

The two-client proof requires two distinct Supabase access tokens and two distinct EOS test identities. It passes only when both packaged clients join the same fresh EOS proof lobby, each reports a joined EOS voice channel, and the live server witness sees at least two current authenticated users in the same instance.

Remaining evidence gates are UE 5.8 package+boot, authenticated backend smoke, real two-user EOS+voice, PostHog+remote Sentry delivery, and packaged Creator District gameplay QA. Runtime gates are never marked PASS from source code alone.

See `WINDOWS-RUNTIME-RUNBOOK-e628173.md`, `RELEASE-READINESS-e628173.md`, and `checkpoints/e628173/MANIFEST.txt`.

The existing `game/` web prototype is intentionally preserved. This folder is additive; older snapshots remain rollback checkpoints.

## Runtime evidence dispatch

- Dispatch refresh requested: `2026-09-15` via AUTO WORK continuation.
- Dispatch refresh requested: `2026-09-16` after confirming the corrected `tgg-ue58` runner label is present on the current branch.
- This watched-path touch is intentionally non-functional; it exists only to enqueue the existing self-hosted Windows runtime evidence workflow without changing game source or readiness claims.
