$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'Install-TGGWorldRunner.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Runner bootstrap script is missing: $scriptPath"
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
  '[string]$RegistrationToken',
  '[switch]$ValidateOnly',
  'UE_5.8',
  'vswhere.exe',
  'actions/runner/releases/latest',
  'config.cmd',
  'svc.cmd',
  '--unattended',
  '--url',
  '--token'
)

foreach ($fragment in $requiredFragments) {
  if (-not $text.Contains($fragment)) {
    throw "Runner bootstrap contract missing required fragment: $fragment"
  }
}

if ($text -match 'TGG_EOS_CLIENT_SECRET\s*=\s*["''][^"'']+["'']') {
  throw 'Runner bootstrap must not embed EOS client secrets.'
}
if ($text -match 'TGG_SUPABASE_TEST_ACCESS_TOKEN\s*=\s*["''][^"'']+["'']') {
  throw 'Runner bootstrap must not embed Supabase access tokens.'
}

Write-Host 'TGG_RUNNER_BOOTSTRAP_CONTRACT: PASS'
