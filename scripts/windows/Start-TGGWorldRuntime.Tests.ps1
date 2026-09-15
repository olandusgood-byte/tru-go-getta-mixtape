$ErrorActionPreference = 'Stop'

$launcherPath = Join-Path $PSScriptRoot 'Start-TGGWorldRuntime.ps1'
if (-not (Test-Path -LiteralPath $launcherPath)) {
  throw "One-command runtime launcher is missing: $launcherPath"
}

$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($launcherPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) {
  $messages = ($parseErrors | ForEach-Object { $_.Message }) -join '; '
  throw "Runtime launcher PowerShell parse failed: $messages"
}

$text = Get-Content -LiteralPath $launcherPath -Raw
$requiredFragments = @(
  'Install-TGGWorldRunner.ps1',
  'https://github.com/olandusgood-byte/tru-go-getta-mixtape',
  'gh auth status',
  'TGG World Unreal Runtime Evidence',
  'tgg-world-unreal-fastlane',
  'ue58-runtime-evidence',
  'gh run list',
  'gh run watch',
  'api repos/olandusgood-byte/tru-go-getta-mixtape/actions/runners',
  'TGG_RUNNER_HEALTH: ONLINE',
  'TGG_WORLD_RUNTIME_LAUNCHER: READY'
)

foreach ($fragment in $requiredFragments) {
  if (-not $text.Contains($fragment)) {
    throw "Runtime launcher contract missing required fragment: $fragment"
  }
}

if ($text -match 'TGG_EOS_CLIENT_SECRET\s*=\s*["''][^"'']+["'']') {
  throw 'Runtime launcher must not embed EOS client secrets.'
}
if ($text -match 'TGG_SUPABASE_TEST_ACCESS_TOKEN\s*=\s*["''][^"'']+["'']') {
  throw 'Runtime launcher must not embed Supabase access tokens.'
}
if ($text -match 'TGG_SENTRY_UNREAL_ENDPOINT\s*=\s*["''][^"'']+["'']') {
  throw 'Runtime launcher must not embed a Sentry endpoint.'
}

Write-Host 'TGG_RUNTIME_LAUNCHER_CONTRACT: PASS'
