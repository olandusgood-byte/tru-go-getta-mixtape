$ErrorActionPreference = 'Stop'

$bootstrapPath = Join-Path $PSScriptRoot 'Bootstrap-TGGWorldMachine.ps1'
if (-not (Test-Path -LiteralPath $bootstrapPath)) {
  throw "Fresh-machine bootstrap is missing: $bootstrapPath"
}

$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($bootstrapPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) {
  $messages = ($parseErrors | ForEach-Object { $_.Message }) -join '; '
  throw "Fresh-machine bootstrap PowerShell parse failed: $messages"
}

$text = Get-Content -LiteralPath $bootstrapPath -Raw
$requiredFragments = @(
  'Git.Git',
  'GitHub.cli',
  'winget',
  'gh auth status',
  'gh auth login',
  'https://github.com/olandusgood-byte/tru-go-getta-mixtape',
  'tgg-world-unreal-fastlane',
  'git clone',
  'git fetch',
  'git switch',
  'git pull',
  'Start-TGGWorldRuntime.ps1',
  'TGG_WORLD_MACHINE_BOOTSTRAP: READY'
)

foreach ($fragment in $requiredFragments) {
  if (-not $text.Contains($fragment)) {
    throw "Fresh-machine bootstrap contract missing required fragment: $fragment"
  }
}

if ($text -notmatch 'status --porcelain') {
  throw 'Fresh-machine bootstrap must protect local changes before updating an existing checkout.'
}
if ($text -notmatch '--ff-only') {
  throw 'Fresh-machine bootstrap must update the fast-lane branch with fast-forward-only semantics.'
}
if ($text -match 'TGG_EOS_CLIENT_SECRET\s*=\s*["''][^"'']+["'']') {
  throw 'Fresh-machine bootstrap must not embed EOS client secrets.'
}
if ($text -match 'TGG_SUPABASE_TEST_ACCESS_TOKEN\s*=\s*["''][^"'']+["'']') {
  throw 'Fresh-machine bootstrap must not embed Supabase access tokens.'
}
if ($text -match 'TGG_SENTRY_UNREAL_ENDPOINT\s*=\s*["''][^"'']+["'']') {
  throw 'Fresh-machine bootstrap must not embed a Sentry endpoint.'
}

Write-Host 'TGG_MACHINE_BOOTSTRAP_CONTRACT: PASS'
