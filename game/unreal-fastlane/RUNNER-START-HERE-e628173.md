# TRU GO GETTA WORLD — Windows Runner Start Here

Checkpoint: `e628173`  
Branch: `tgg-world-unreal-fastlane`  
Runtime workflow: `TGG World Unreal Runtime Evidence`

This is the shortest path from a Windows UE workstation to real runtime evidence. It does not change the game checkpoint.

## 1. Workstation prerequisites

The Windows x64 machine must have:

- Unreal Engine 5.8
- Visual Studio 2022 with MSVC x64 C++ tools
- Git/network access to GitHub
- Administrator PowerShell for installing the runner service
- Optional but recommended: GitHub CLI (`gh`) already authenticated to an identity with repository Administration write access. This lets the bootstrap request its own short-lived runner registration token instead of requiring copy/paste.

If UE 5.8 is not installed at `C:\Program Files\Epic Games\UE_5.8`, set `UE_ROOT` to the actual UE 5.8 installation directory before running the bootstrap.

## 2. Validate the workstation first — no token needed

From an elevated PowerShell session in the repository checkout:

```powershell
.\scripts\windows\Install-TGGWorldRunner.ps1 `
  -RepositoryUrl 'https://github.com/olandusgood-byte/tru-go-getta-mixtape' `
  -ValidateOnly
```

`-ValidateOnly` checks Windows, UE 5.8, and the Visual Studio 2022 C++ toolchain. It exits before any runner registration-token lookup, download, registration, or service change.

## 3. Register and start the runner

### Fast path — authenticated GitHub CLI

If `gh auth status` succeeds for an identity with repository Administration write access, run:

```powershell
.\scripts\windows\Install-TGGWorldRunner.ps1 `
  -RepositoryUrl 'https://github.com/olandusgood-byte/tru-go-getta-mixtape'
```

The bootstrap requests the repository runner registration token with the GitHub API through `gh`, downloads the current GitHub Actions Windows x64 runner, configures it unattended, and starts it as a Windows service. The registration token is short-lived and is never written to the repository.

### Fallback — explicit one-time token

If GitHub CLI is unavailable or not authenticated with sufficient permission, pass a fresh repository runner registration token explicitly:

```powershell
.\scripts\windows\Install-TGGWorldRunner.ps1 `
  -RepositoryUrl 'https://github.com/olandusgood-byte/tru-go-getta-mixtape' `
  -RegistrationToken '<ONE_TIME_GITHUB_RUNNER_TOKEN>'
```

Standard runner registration supplies the required labels:

- `self-hosted`
- `Windows`
- `X64`

Do not commit registration tokens or private runtime credentials.

## 4. Runtime job behavior

The latest runtime workflow already performs a GitHub-hosted preflight before the self-hosted UE job. It verifies the 19-piece checkpoint transport and pinned SHA-256, then reports optional credential capabilities.

Once the compatible Windows runner is online, the queued `ue58-runtime-evidence` job can claim it automatically.

The job reconstructs the pinned archive, runs `TGG_FASTLANE_PREFLIGHT.ps1`, runs `TGG_FASTLANE_FINAL_QA.ps1`, classifies real smoke markers, and uploads the `_smoke` evidence artifact even when an optional credential-dependent sub-smoke is unavailable.

## 5. Credential groups

The core package/boot and deterministic packaged gameplay gates do not need private EOS/Supabase test-user/Sentry credentials to be attempted.

Authenticated backend requires a short-lived test-user token. Multiplayer/voice requires two distinct Supabase test users plus two distinct EOS test identities and EOS product staging credentials. Observability already has PostHog client configuration; remote Sentry proof still requires the Sentry Unreal endpoint.

All private values belong in GitHub Actions secrets or the local runner environment. Never commit them.

## 6. Evidence rule

The project remains at **70% evidence-weighted completion** until actual runtime markers pass. Package/boot and final packaged gameplay can each add 6%. Backend, two-user EOS/voice, and combined PostHog/Sentry can each add another 6% only after their real evidence exists.
