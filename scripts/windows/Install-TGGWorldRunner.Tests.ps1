$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'Install-TGGWorldRunner.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Runner bootstrap script is missing: $scriptPath"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runtimeWorkflowPath = Join-Path $repoRoot '.github\workflows\tgg-world-unreal-runtime.yml'
if (-not (Test-Path -LiteralPath $runtimeWorkflowPath)) {
  throw "Runtime workflow is missing: $runtimeWorkflowPath"
}

$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) {
  $messages = ($parseErrors | ForEach-Object { $_.Message }) -join '; '
  throw "Runner bootstrap PowerShell parse failed: $messages"
}

$text = Get-Content -LiteralPath $scriptPath -Raw
$requiredFragments = @(
  '[Parameter(Mandatory = $true)]',
  '[string]$RepositoryUrl',
  '[string]$RegistrationToken = ''''',
  '[switch]$ValidateOnly',
  'UE_5.8',
  'vswhere.exe',
  'actions/runner/releases/latest',
  'config.cmd',
  'svc.cmd',
  '--unattended',
  '--url',
  '--token',
  '--labels',
  'tgg-ue58',
  'function Get-RunnerRegistrationToken',
  'function Ensure-GitHubRunnerLabel',
  'Get-Command gh',
  'actions/runners/registration-token',
  'actions/runners?per_page=100',
  '/labels',
  '--method POST',
  '--jq .token',
  '$RegistrationToken = Get-RunnerRegistrationToken',
  'TGG_RUNNER_LABEL_RECONCILED'
)

foreach ($fragment in $requiredFragments) {
  if (-not $text.Contains($fragment)) {
    throw "Runner bootstrap contract missing required fragment: $fragment"
  }
}

if ($text -match '(?s)\[Parameter\(Mandatory\s*=\s*\$true\)\]\s*\r?\n\s*\[string\]\$RegistrationToken') {
  throw 'RegistrationToken must be optional so -ValidateOnly can run without a token.'
}

$validateIndex = $text.IndexOf('if ($ValidateOnly)')
$tokenResolveIndex = $text.IndexOf('$RegistrationToken = Get-RunnerRegistrationToken')
if ($validateIndex -lt 0 -or $tokenResolveIndex -lt 0 -or $validateIndex -gt $tokenResolveIndex) {
  throw 'ValidateOnly must exit before any registration-token acquisition is attempted.'
}

$existingRunnerPattern = '(?s)if\s*\(Test-Path\s+-LiteralPath\s+\$settings\)\s*\{.*?Ensure-GitHubRunnerLabel\s+-Url\s+\$RepositoryUrl.*?return\s*\}'
if ($text -notmatch $existingRunnerPattern) {
  throw 'An already-configured runner must reconcile the dedicated tgg-ue58 label before registration is skipped.'
}

$runtimeText = Get-Content -LiteralPath $runtimeWorkflowPath -Raw
if (-not $runtimeText.Contains('runs-on: [self-hosted, Windows, X64, tgg-ue58]')) {
  throw 'UE runtime workflow must target the dedicated tgg-ue58 runner label.'
}
if (-not $runtimeText.Contains("- 'scripts/windows/**'")) {
  throw 'UE runtime workflow must retrigger when Windows runner/bootstrap scripts change.'
}

if ($text -match 'TGG_EOS_CLIENT_SECRET\s*=\s*["''][^"'']+["'']') {
  throw 'Runner bootstrap must not embed EOS client secrets.'
}
if ($text -match 'TGG_SUPABASE_TEST_ACCESS_TOKEN\s*=\s*["''][^"'']+["'']') {
  throw 'Runner bootstrap must not embed Supabase access tokens.'
}

Write-Host 'TGG_RUNNER_BOOTSTRAP_CONTRACT: PASS'
