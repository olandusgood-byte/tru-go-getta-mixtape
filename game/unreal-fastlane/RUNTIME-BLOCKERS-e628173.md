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
- Supabase multiplayer witness endpoint: reachable and correctly rejects anonymous callers with HTTP 401.
- PostHog project token: available.
- PostHog provider delivery contract: verified independently with personless smoke `tgg-ph-35032126362-1` for checkpoint `e628173`; the exact event and expected properties were observed in the connected PostHog project.
- Fresh Windows machine bootstrap: `scripts/windows/Bootstrap-TGGWorldMachine.ps1`.
- Lower-level runner installer: `scripts/windows/Install-TGGWorldRunner.ps1`.
- Runtime launcher: `scripts/windows/Start-TGGWorldRuntime.ps1`.
- Bootstrap/launcher contracts: PASS on GitHub-hosted Windows.
- Runner validation requires no registration token; full registration can auto-request a short-lived token through authenticated GitHub CLI.
- Runtime launcher verifies GitHub sees an online runner with all required labels before workflow watch.

## Core runtime boundary

The Unreal runtime job requires a compatible GitHub Actions runner with all four labels:

- `self-hosted`
- `Windows`
- `X64`
- `tgg-ue58`

The dedicated `tgg-ue58` label prevents generic self-hosted jobs from accidentally claiming the Unreal workstation. The machine must have Unreal Engine 5.8 and Visual Studio 2022 with the MSVC x64 C++ toolchain. Until such a runner is online, package/boot and packaged gameplay cannot produce real evidence.

Current runtime workflow run `35031348778` has a successful hosted preflight and a queued `ue58-runtime-evidence` job with no steps started yet.

## Credential-dependent gates

### Authenticated backend (+6%)

Requires a short-lived test-user access token in `TGG_SUPABASE_TEST_ACCESS_TOKEN`.

Live Auth readiness is known without account mutation:

- anonymous sign-in: disabled
- email auth: enabled
- signup: enabled
- email auto-confirm: disabled

Therefore no disposable anonymous-session shortcut is available, and generated email/password QA users cannot obtain immediate sessions without confirmation. Existing production users remain untouched.

### Two-user EOS + voice (+6%)

Requires two distinct Supabase test-user access tokens, EOS product/deployment/client configuration, and two distinct EOS test identities. These values stay in GitHub Actions secrets or the local runner environment and are never committed.

The server witness is `tgg_world_v11_7_multiplayer_proof()`. It passes only when the server observes two distinct authenticated users with active characters in the same live instance with fresh presence heartbeats. Synthetic client presence is not accepted as proof.

### Observability (+6%)

PostHog provider delivery is independently verified, but this does **not** earn the runtime gate. The packaged game still must emit its own PostHog runtime marker, and `TGG_SENTRY_UNREAL_ENDPOINT` is still required. The gate remains pending until the unique Sentry crash ID is observed remotely and a matching proof marker exists.

## Live database readiness

- Auth users present: 3
- Accounts explicitly tagged QA/test: 0
- Users with active World characters: 0
- Active/draining World instances: 0
- Fresh presence users: 0
- World workers present: 11
- Current World worker condition: healthy/idle; latest worker statuses observed as `ok`
- Passed `tgg_world_v14_playtest_observe` captures: 0

Existing production RPCs already cover the required lifecycle:

- `tgg_world_create_character(...)`
- `tgg_world_v11_6_presence_bootstrap()`
- `tgg_world_presence_heartbeat_full(...)`
- `tgg_world_instance_roster()`
- `tgg_world_v11_7_multiplayer_proof()`
- `tgg_world_v14_playtest_observe(...)`

Existing user accounts are intentionally not modified automatically because none are marked as disposable QA identities.

## Completion rule

Do not advance the percentage from 70% merely because configuration, provider reachability, or source code exists. Each of the five remaining gates contributes 6% only after its real packaged-runtime evidence marker passes.
