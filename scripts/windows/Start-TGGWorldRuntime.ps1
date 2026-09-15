[CmdletBinding()]
param(
  [switch]$ValidateOnly,
  [switch]$NoWatch
)

$ErrorActionPreference = 'Stop'

$repositoryUrl = 'https://github.com/olandusgood-byte/tru-go-getta-mixtape'
$repositorySlug = 'olandusgood-byte/tru-go-getta-mixtape'
$workflowName = 'TGG World Unreal Runtime Evidence'
$branchName = 'tgg-world-unreal-fastlane'
$targetJobName = 'ue58-runtime-evidence'
$bootstrap = Join-Path $PSScriptRoot 'Install-TGGWorldRunner.ps1'

if ($env:OS -ne 'Windows_NT') {
  throw 'TGG World runtime launcher requires Windows x64.'
}
if (-not (Test-Path -LiteralPath $bootstrap)) {
  throw "Runner bootstrap is missing: $bootstrap"
}

if ($ValidateOnly) {
  & $bootstrap -RepositoryUrl $repositoryUrl -ValidateOnly
  if ($LASTEXITCODE -ne 0) {
    throw "Runner validation failed with exit code $LASTEXITCODE."
  }
  Write-Host 'TGG_WORLD_RUNTIME_LAUNCHER: READY (validation only)'
  exit 0
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
  throw 'GitHub CLI (gh) is required for the one-command runtime launcher. Install gh and authenticate, or run Install-TGGWorldRunner.ps1 with an explicit registration token.'
}

# Equivalent command: gh auth status --hostname github.com
& $gh.Source auth status --hostname github.com
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI is not authenticated. Run gh auth login, then rerun this launcher.'
}

Write-Host 'Starting or repairing the dedicated tgg-ue58 Windows runner...'
& $bootstrap -RepositoryUrl $repositoryUrl
if ($LASTEXITCODE -ne 0) {
  throw "Runner bootstrap failed with exit code $LASTEXITCODE."
}

Write-Host 'Verifying GitHub sees the dedicated UE runner online with every required label...'
# Equivalent command: gh api repos/olandusgood-byte/tru-go-getta-mixtape/actions/runners
$runnerJson = & $gh.Source api "repos/$repositorySlug/actions/runners"
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub runner inventory query failed. The authenticated gh identity needs repository Administration read access.'
}

$runnerPayload = $runnerJson | ConvertFrom-Json
$requiredLabels = @('self-hosted', 'Windows', 'X64', 'tgg-ue58')
$matchingRunner = $null
foreach ($runner in @($runnerPayload.runners)) {
  $labelNames = @($runner.labels | ForEach-Object { [string]$_.name })
  $hasAllLabels = $true
  foreach ($requiredLabel in $requiredLabels) {
    if (-not ($labelNames -contains $requiredLabel)) {
      $hasAllLabels = $false
      break
    }
  }
  if ($hasAllLabels -and [string]$runner.status -eq 'online') {
    $matchingRunner = $runner
    break
  }
}

if (-not $matchingRunner) {
  foreach ($runner in @($runnerPayload.runners)) {
    $labelNames = @($runner.labels | ForEach-Object { [string]$_.name })
    Write-Host "RUNNER_DIAGNOSTIC: name=$($runner.name) status=$($runner.status) busy=$($runner.busy) labels=$($labelNames -join ',')"
  }
  throw "No online GitHub Actions runner currently exposes all required labels: $($requiredLabels -join ', '). Confirm the Windows runner service is running, then rerun this launcher."
}

Write-Host "TGG_RUNNER_HEALTH: ONLINE name=$($matchingRunner.name) busy=$($matchingRunner.busy) labels=$((@($matchingRunner.labels | ForEach-Object { $_.name })) -join ',')"

Write-Host "Looking for the newest '$workflowName' run on '$branchName'..."
# Equivalent command: gh run list --workflow "TGG World Unreal Runtime Evidence" --branch tgg-world-unreal-fastlane
$runJson = & $gh.Source run list --workflow $workflowName --branch $branchName --limit 1 --json databaseId,status,conclusion,name,headSha
if ($LASTEXITCODE -ne 0) {
  throw 'gh run list failed while resolving the existing Unreal runtime evidence run.'
}

$runs = @($runJson | ConvertFrom-Json)
if ($runs.Count -eq 0) {
  throw "No existing '$workflowName' run was found on branch '$branchName'. This launcher intentionally does not dispatch duplicate evidence runs."
}

$run = $runs[0]
$runId = [string]$run.databaseId
Write-Host "Runtime run: $runId status=$($run.status) conclusion=$($run.conclusion) head=$($run.headSha)"
Write-Host "Target job: $targetJobName"
Write-Host 'TGG_WORLD_RUNTIME_LAUNCHER: READY'

if ($NoWatch) {
  Write-Host 'Runner is online. Existing runtime run was resolved; watch mode was skipped by request.'
  exit 0
}

Write-Host "Watching runtime run $runId. The existing queued job will be claimed when the tgg-ue58 runner matches."
# Equivalent command: gh run watch <run-id> --exit-status
& $gh.Source run watch $runId --exit-status
if ($LASTEXITCODE -ne 0) {
  throw "gh run watch reported a non-successful workflow result for run $runId. Inspect the runtime evidence logs/artifact before changing readiness."
}

Write-Host 'TGG_WORLD_RUNTIME_LAUNCHER: COMPLETE'
