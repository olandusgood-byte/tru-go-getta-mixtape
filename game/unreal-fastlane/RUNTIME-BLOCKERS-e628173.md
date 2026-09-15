# TRU GO GETTA WORLD — e628173 Runtime Blocker Map

Generated: 2026-09-15  
Evidence-weighted completion: **70%**  
Source readiness: **PASS**

## What is already ready

- Checkpoint transport: 19 chunks, SHA-256 verified.
- Structural verification: 43/43 PASS.
- Portable C++ / CTest: PASS.
- GitHub-hosted runtime preflight: PASS.
- Public Supabase runtime URL/key: available.
- PostHog project token: available.
- Windows runner bootstrap: `scripts/windows/Install-TGGWorldRunner.ps1`.
- Runner bootstrap contract test: PASS on GitHub-hosted Windows.

## Core runtime boundary

The Unreal runtime job requires a compatible GitHub Actions runner with labels:

- `self-hosted`
- `Windows`
- `X64`

That machine must have Unreal Engine 5.8 and Visual Studio 2022 with the MSVC x64 C++ toolchain. Until such a runner is online, package/boot and packaged gameplay cannot produce real evidence.

## Credential-dependent gates

### Authenticated backend (+6%)

Requires a short-lived test-user access token in `TGG_SUPABASE_TEST_ACCESS_TOKEN`.

### Two-user EOS + voice (+6%)

Requires two distinct Supabase test-user access tokens, EOS product/deployment/client configuration, and two distinct EOS test identities. These values stay in GitHub Actions secrets or the local runner environment and are never committed.

The server witness is `tgg_world_v11_7_multiplayer_proof()`. It passes only when the server observes two distinct authenticated users with active characters in the same live instance with fresh presence heartbeats. Synthetic client presence is not accepted as proof.

### Observability (+6%)

PostHog configuration is available. The remaining external input is `TGG_SENTRY_UNREAL_ENDPOINT`, and the gate remains pending until the Sentry crash ID is observed remotely and a matching proof marker exists.

## Live database readiness

- Auth users present: 3
- Accounts explicitly tagged QA/test: 0
- Users with active World characters: 0
- Active/draining World instances: 0
- Fresh presence users: 0

Existing production RPCs already cover the required lifecycle:

- `tgg_world_create_character(...)`
- `tgg_world_v11_6_presence_bootstrap()`
- `tgg_world_presence_heartbeat_full(...)`
- `tgg_world_instance_roster()`
- `tgg_world_v11_7_multiplayer_proof()`

Existing user accounts are intentionally not modified automatically because none are marked as disposable QA identities.

## Completion rule

Do not advance the percentage from 70% merely because configuration or source code exists. Each of the five remaining gates contributes 6% only after its real runtime evidence marker passes.
