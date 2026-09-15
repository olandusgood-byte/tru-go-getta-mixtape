# TRU GO GETTA WORLD — Windows Runner Start Here

Checkpoint: `e628173`  
Branch: `tgg-world-unreal-fastlane`  
Runtime workflow: `TGG World Unreal Runtime Evidence`

This is the shortest path from a Windows UE workstation to real runtime evidence. It does not change the game checkpoint.

## 1. Workstation prerequisites

The Windows x64 machine must have:

- Unreal Engine 5.8
- Visual Studio 2022 with MSVC x64 C++ tools
- Administrator PowerShell for installing the runner service
- Internet access to GitHub

If UE 5.8 is not installed at `C:\Program Files\Epic Games\UE_5.8`, set `UE_ROOT` to the actual UE 5.8 installation directory first.

## 2. Fresh-PC bootstrap path

From an elevated PowerShell session, no existing repository checkout is required:

```powershell
$u='https://raw.githubusercontent.com/olandusgood-byte/tru-go-getta-mixtape/tgg-world-unreal-fastlane/scripts/windows/Bootstrap-TGGWorldMachine.ps1'
$p="$env:TEMP\Bootstrap-TGGWorldMachine.ps1"
Invoke-WebRequest $u -OutFile $p
Set-ExecutionPolicy -Scope Process Bypass -Force
& $p
```

The fresh-machine bootstrap checks/installs Git and GitHub CLI with WinGet, authenticates GitHub CLI if needed, clones or safely fast-forwards `tgg-world-unreal-fastlane`, refuses to overwrite local changes, and hands off to `Start-TGGWorldRuntime.ps1`.

It does not embed or persist EOS, Supabase test-user, Sentry, or runner-registration secrets.

## 3. Existing-checkout one-command path

From an elevated PowerShell session in the repository checkout:

```powershell
.\scripts\windows\Start-TGGWorldRuntime.ps1
```

This launcher:

1. verifies authenticated GitHub CLI access;
2. reuses `Install-TGGWorldRunner.ps1` to validate UE 5.8 + Visual Studio 2022;
3. automatically requests a short-lived runner registration token through `gh` when needed;
4. registers/starts the Windows runner with `self-hosted`, `Windows`, `X64`, and dedicated `tgg-ue58` routing;
5. verifies GitHub sees an **online** runner exposing every required label;
6. resolves the existing `TGG World Unreal Runtime Evidence` run on `tgg-world-unreal-fastlane` instead of dispatching a duplicate;
7. watches that run to completion and returns a non-success exit if the evidence workflow fails.

To validate only, without runner registration or workflow watching:

```powershell
.\scripts\windows\Start-TGGWorldRuntime.ps1 -ValidateOnly
```

To start/repair the runner and resolve the existing run without keeping the console attached:

```powershell
.\scripts\windows\Start-TGGWorldRuntime.ps1 -NoWatch
```

## 4. Lower-level runner bootstrap

The lower-level bootstrap remains available when an explicit one-time registration token is preferred:

```powershell
.\scripts\windows\Install-TGGWorldRunner.ps1 `
  -RepositoryUrl 'https://github.com/olandusgood-byte/tru-go-getta-mixtape' `
  -RegistrationToken '<ONE_TIME_GITHUB_RUNNER_TOKEN>'
```

Never commit runner registration tokens or private runtime credentials.

## 5. Runtime job behavior

The runtime workflow performs a GitHub-hosted preflight before the self-hosted UE job. It verifies the 19-piece checkpoint transport and pinned SHA-256, then reports optional credential capabilities.

Once a compatible Windows runner with the dedicated `tgg-ue58` label is online, the already-queued `ue58-runtime-evidence` job can claim it automatically.

Current evidence run: `35031348778`.

The job reconstructs the pinned archive, runs `TGG_FASTLANE_PREFLIGHT.ps1`, runs `TGG_FASTLANE_FINAL_QA.ps1`, classifies real smoke markers, and uploads the `_smoke` evidence artifact even when an optional credential-dependent sub-smoke is unavailable.

## 6. Credential groups

The core package/boot and deterministic packaged gameplay gates do not need private EOS/Supabase test-user/Sentry credentials to be attempted.

Authenticated backend requires a short-lived test-user token. Multiplayer/voice requires two distinct Supabase test users plus two distinct EOS test identities and EOS product staging credentials.

PostHog provider delivery has been independently verified, but the packaged game must still emit its runtime marker. Remote Sentry proof requires `TGG_SENTRY_UNREAL_ENDPOINT`. Use the project client key's dedicated **Unreal ingestion URL** (the `/unreal/.../` endpoint), not a Sentry API bearer token. Store it only as a GitHub Actions secret or local runner environment value.

## 7. Evidence rule

The project remains at **70% evidence-weighted completion** until actual packaged-runtime markers pass. Package/boot and final packaged gameplay can each add 6%. Backend, two-user EOS/voice, and combined PostHog/Sentry can each add another 6% only after their real evidence exists.
