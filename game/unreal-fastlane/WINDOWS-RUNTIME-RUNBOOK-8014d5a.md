# TRU GO GETTA WORLD — Windows Runtime Fast-Lane Runbook

Checkpoint: `8014d5a`  
Evidence baseline: **70%**  
Goal: earn the final 30% only from real UE 5.8 runtime evidence.

## 1. Required local tools

- Unreal Engine 5.8 (`UE_ROOT` can point to a non-default install)
- Visual Studio 2022 with the MSVC x64 C++ toolchain
- EOS product configured for lobbies + voice

## 2. Keep credentials out of the source tree

Set the following only in the current PowerShell session or another local secret store. Do not commit their values.

### EOS product staging

- `TGG_EOS_ARTIFACT_NAME`
- `TGG_EOS_PRODUCT_ID`
- `TGG_EOS_SANDBOX_ID`
- `TGG_EOS_DEPLOYMENT_ID`
- `TGG_EOS_CLIENT_ID`
- `TGG_EOS_CLIENT_SECRET`
- `TGG_EOS_CLIENT_ENCRYPTION_KEY`

### Supabase packaged backend smoke

- `TGG_SUPABASE_URL`
- `TGG_SUPABASE_PUBLISHABLE_KEY`
- `TGG_SUPABASE_TEST_ACCESS_TOKEN`

Use a short-lived test access token. Never use a service-role key in the client.

### Real two-user EOS + voice proof

Use two distinct real test users:

- `TGG_SUPABASE_TEST_ACCESS_TOKEN_A`
- `TGG_SUPABASE_TEST_ACCESS_TOKEN_B`
- `TGG_EOS_AUTH_TYPE_A`
- `TGG_EOS_AUTH_LOGIN_A`
- `TGG_EOS_AUTH_PASSWORD_A`
- `TGG_EOS_AUTH_TYPE_B`
- `TGG_EOS_AUTH_LOGIN_B`
- `TGG_EOS_AUTH_PASSWORD_B`

The proof harness fails if the two Supabase tokens or EOS identities are the same. It passes only when both packaged clients join the same EOS voice room and the live server reports a current same-instance population of at least two authenticated users.

### Observability

- `TGG_POSTHOG_PROJECT_TOKEN`
- `TGG_SENTRY_UNREAL_ENDPOINT`

## 3. One-command evidence run

From the extracted `TGG_WORLD_UNREAL_FASTLANE_8014d5a` source folder:

```powershell
.\scripts\windows\TGG_FASTLANE_PREFLIGHT.ps1
.\scripts\windows\TGG_FASTLANE_FINAL_QA.ps1
```

The final QA orchestrator performs the compile/cook/package, packaged boot smoke, deterministic gameplay QA, optional authenticated backend smoke, optional real two-user EOS + voice proof, PostHog delivery smoke, and Sentry crash trigger.

## 4. Evidence files

Runtime evidence is written under:

`Builds\Win64-Development\_smoke\`

Expected markers:

- `TGGFastlaneSmoke.log` → `TGG_FASTLANE_SMOKE: PASS`
- `TGGFastlaneBackendSmoke.log` → `TGG_FASTLANE_BACKEND_SMOKE: PASS`
- `TGGFastlaneMultiplayerProof.log` → `TGG_FASTLANE_MULTIPLAYER_PROOF: PASS`
- `TGGFastlaneTelemetrySmoke.log` → `TGG_FASTLANE_TELEMETRY_SMOKE: PASS`
- `TGGFastlaneFinalGameplayQA.log` → `TGG_FASTLANE_FINAL_GAMEPLAY_QA: PASS`
- `TGGFastlaneSentryCrashTrigger.log` contains the unique Sentry smoke ID. Sentry remains PENDING until that same ID is observed remotely and a `TGGFastlaneSentryCrashProof.log` PASS record is created from verified remote evidence.

The orchestrator also writes:

- `TGG_FASTLANE_RUNTIME_EVIDENCE.json`
- `TGG_FASTLANE_FINAL_QA.md`

## 5. Evidence-weighted completion

- 70% — verified source baseline
- +6% — packaged build + boot smoke
- +6% — authenticated backend smoke
- +6% — two real EOS users + same voice room + current server witness
- +6% — PostHog delivery + remote Sentry delivery
- +6% — packaged gameplay QA

**100% is not allowed until every runtime gate has real evidence.**
