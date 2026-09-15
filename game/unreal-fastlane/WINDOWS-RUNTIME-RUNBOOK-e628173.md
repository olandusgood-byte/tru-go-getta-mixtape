# TRU GO GETTA WORLD — Windows Runtime Fast-Lane Runbook

Checkpoint: `e628173`  
Evidence baseline: **70%**  
Recovery base: verified `90457ba` archive + rebuilt two-client EOS/voice proof layer.
Goal: earn the final 30% only from real UE 5.8 runtime evidence.

## Required local tools

- Unreal Engine 5.8 (`UE_ROOT` may point to a non-default install)
- Visual Studio 2022 with MSVC x64 C++
- EOS product configured for lobbies + voice

## Secret/runtime environment

Keep values in the current PowerShell session, GitHub Actions secrets, or another secret store. Do not commit values.

EOS product staging:
- `TGG_EOS_ARTIFACT_NAME`
- `TGG_EOS_PRODUCT_ID`
- `TGG_EOS_SANDBOX_ID`
- `TGG_EOS_DEPLOYMENT_ID`
- `TGG_EOS_CLIENT_ID`
- `TGG_EOS_CLIENT_SECRET`
- `TGG_EOS_CLIENT_ENCRYPTION_KEY`

Supabase backend smoke:
- `TGG_SUPABASE_URL`
- `TGG_SUPABASE_PUBLISHABLE_KEY`
- `TGG_SUPABASE_TEST_ACCESS_TOKEN`

Two real users:
- `TGG_SUPABASE_TEST_ACCESS_TOKEN_A`
- `TGG_SUPABASE_TEST_ACCESS_TOKEN_B`
- `TGG_EOS_AUTH_TYPE_A`
- `TGG_EOS_AUTH_LOGIN_A`
- `TGG_EOS_AUTH_PASSWORD_A`
- `TGG_EOS_AUTH_TYPE_B`
- `TGG_EOS_AUTH_LOGIN_B`
- `TGG_EOS_AUTH_PASSWORD_B`

Observability:
- `TGG_POSTHOG_PROJECT_TOKEN`
- `TGG_SENTRY_UNREAL_ENDPOINT`

The proof harness creates a unique `TGG_MULTIPLAYER_PROOF_ID` internally and passes credentials to child clients through per-process environment variables. EOS passwords and Supabase access tokens are not placed in process command-line arguments.

## One-command evidence run

```powershell
.\scripts\windows\TGG_FASTLANE_PREFLIGHT.ps1
.\scripts\windows\TGG_FASTLANE_FINAL_QA.ps1
```

The orchestrator compiles/cooks/packages, runs boot + gameplay + backend smokes, launches two real EOS clients when both identities are configured, requires each client to join an actual EOS voice channel, requires the live Supabase two-player witness, runs PostHog delivery smoke, and triggers the Sentry crash smoke.

Runtime evidence: `Builds\Win64-Development\_smoke\`.

**100% is not allowed until every runtime gate has real evidence.**
