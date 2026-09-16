[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$RepositoryUrl,

  [string]$RegistrationToken = '',

  [string]$RunnerRoot = 'C:\tgg-actions-runner',

  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from an elevated PowerShell session (Run as Administrator).'
  }
}

function Find-UnrealEngine58 {
  $candidates = @()
  if ($env:UE_ROOT) { $candidates += $env:UE_ROOT }
  $candidates += 'C:\Program Files\Epic Games\UE_5.8'

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      $editor = Join-Path $candidate 'Engine\Binaries\Win64\UnrealEditor.exe'
      if (Test-Path -LiteralPath $editor) {
        return (Resolve-Path -LiteralPath $candidate).Path
      }
    }
  }

  throw 'Unreal Engine 5.8 was not found. Install UE 5.8 or set UE_ROOT to its installation directory.'
}

function Find-VsWhere {
  $paths = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft Visual Studio\Installer\vswhere.exe')
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($path in $paths) {
    if (Test-Path -LiteralPath $path) { return $path }
  }
  throw 'vswhere.exe was not found. Install Visual Studio 2022 with the Desktop development with C++ workload.'
}

function Assert-VisualStudio2022Cpp {
  $vswhere = Find-VsWhere
  $installationPath = & $vswhere -latest -products * -version '[17.0,18.0)' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ([string]::IsNullOrWhiteSpace($installationPath)) {
    throw 'Visual Studio 2022 with MSVC x64 C++ tools was not found.'
  }
  return $installationPath.Trim()
}

function Get-LatestRunnerAsset {
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/actions/runner/releases/latest' -Headers @{ 'User-Agent' = 'TGG-World-Runner-Bootstrap' }
  $asset = $release.assets | Where-Object { $_.name -match '^actions-runner-win-x64-.*\.zip$' } | Select-Object -First 1
  if (-not $asset) { throw 'Could not locate the latest GitHub Actions Windows x64 runner asset.' }
  [pscustomobject]@{
    Name = $asset.name
    Url = $asset.browser_download_url
    Version = $release.tag_name
  }
}

function Get-RepositoryCoordinates {
  param([Parameter(Mandatory = $true)][string]$Url)

  try {
    $uri = [Uri]$Url
  }
  catch {
    throw "RepositoryUrl is not a valid URL: $Url"
  }

  if ($uri.Host -ne 'github.com') {
    throw 'Automatic GitHub runner management currently supports github.com repository URLs only.'
  }

  $parts = @($uri.AbsolutePath.Trim('/').Split('/') | Where-Object { $_ })
  if ($parts.Count -lt 2) {
    throw "Could not derive OWNER/REPO from RepositoryUrl: $Url"
  }

  [pscustomobject]@{
    Owner = $parts[0]
    Repo = ($parts[1] -replace '\.git$','')
  }
}

function Get-GitHubCli {
  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $gh) {
    throw 'GitHub CLI (gh) is required for automatic runner registration or label reconciliation.'
  }

  & $gh.Source auth status --hostname github.com 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI is installed but not authenticated. Run gh auth login with repository Administration write access.'
  }

  return $gh
}

function Get-RunnerRegistrationToken {
  param([Parameter(Mandatory = $true)][string]$Url)

  if (-not [string]::IsNullOrWhiteSpace($RegistrationToken)) {
    return $RegistrationToken.Trim()
  }

  $gh = Get-GitHubCli
  $coordinates = Get-RepositoryCoordinates -Url $Url
  $endpoint = "repos/$($coordinates.Owner)/$($coordinates.Repo)/actions/runners/registration-token"
  $token = & $gh.Source api $endpoint --method POST --jq .token
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
    throw 'GitHub CLI could not create a repository runner registration token. The authenticated GitHub identity needs repository Administration write access.'
  }

  return ([string]$token).Trim()
}

function Ensure-GitHubRunnerLabel {
  param([Parameter(Mandatory = $true)][string]$Url)

  $gh = Get-GitHubCli
  $coordinates = Get-RepositoryCoordinates -Url $Url
  $runnerName = "TGG-UE58-$env:COMPUTERNAME"
  $listEndpoint = "repos/$($coordinates.Owner)/$($coordinates.Repo)/actions/runners?per_page=100"
  $runnerJson = & $gh.Source api $listEndpoint
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($runnerJson)) {
    throw 'GitHub CLI could not list repository self-hosted runners. Repository Administration read access is required.'
  }

  $runnerList = $runnerJson | ConvertFrom-Json
  $runner = @($runnerList.runners) | Where-Object { $_.name -eq $runnerName } | Select-Object -First 1
  if (-not $runner) {
    throw "The local runner is configured but GitHub has no runner named '$runnerName'. Remove the stale local runner registration or re-register it."
  }

  $labelNames = @($runner.labels | ForEach-Object { $_.name })
  if ($labelNames -contains 'tgg-ue58') {
    Write-Host "Dedicated runner label already present on $runnerName."
    Write-Host 'TGG_RUNNER_LABEL_RECONCILED: PASS'
    return
  }

  $labelsEndpoint = "repos/$($coordinates.Owner)/$($coordinates.Repo)/actions/runners/$($runner.id)/labels"
  & $gh.Source api $labelsEndpoint --method POST -f 'labels[]=tgg-ue58' 1>$null
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI could not add the tgg-ue58 label to runner '$runnerName'."
  }

  Write-Host "Added dedicated tgg-ue58 label to existing runner $runnerName."
  Write-Host 'TGG_RUNNER_LABEL_RECONCILED: PASS'
}

function Install-GitHubRunnerFiles {
  param([Parameter(Mandatory = $true)]$Asset)

  if (Test-Path -LiteralPath (Join-Path $RunnerRoot 'config.cmd')) {
    return
  }

  New-Item -ItemType Directory -Force -Path $RunnerRoot | Out-Null
  $zipPath = Join-Path $env:TEMP $Asset.Name
  Invoke-WebRequest -Uri $Asset.Url -OutFile $zipPath -UseBasicParsing
  Expand-Archive -LiteralPath $zipPath -DestinationPath $RunnerRoot -Force
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
}

function Register-GitHubRunner {
  $config = Join-Path $RunnerRoot 'config.cmd'
  if (-not (Test-Path -LiteralPath $config)) { throw 'config.cmd is missing from the runner directory.' }

  $settings = Join-Path $RunnerRoot '.runner'
  if (Test-Path -LiteralPath $settings) {
    Write-Host 'GitHub Actions runner is already configured. Reconciling required custom labels before skipping registration.'
    Ensure-GitHubRunnerLabel -Url $RepositoryUrl
    return
  }

  Push-Location $RunnerRoot
  try {
    & $config --unattended --url $RepositoryUrl --token $RegistrationToken --name "TGG-UE58-$env:COMPUTERNAME" --work '_work' --labels 'tgg-ue58'
    if ($LASTEXITCODE -ne 0) { throw "GitHub runner registration failed with exit code $LASTEXITCODE." }
  }
  finally {
    Pop-Location
  }
}

function Start-GitHubRunnerService {
  $svc = Join-Path $RunnerRoot 'svc.cmd'
  if (-not (Test-Path -LiteralPath $svc)) { throw 'svc.cmd is missing from the runner directory.' }

  Push-Location $RunnerRoot
  try {
    & $svc install
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) { throw "Runner service install failed with exit code $LASTEXITCODE." }
    & $svc start
    if ($LASTEXITCODE -ne 0) { throw "Runner service start failed with exit code $LASTEXITCODE." }
  }
  finally {
    Pop-Location
  }
}

if ($env:OS -ne 'Windows_NT') {
  throw 'This bootstrap is intended for Windows x64 only.'
}

Assert-Administrator
$ueRoot = Find-UnrealEngine58
$vsRoot = Assert-VisualStudio2022Cpp

Write-Host "UE 5.8: $ueRoot"
Write-Host "Visual Studio 2022: $vsRoot"
Write-Host "Runner root: $RunnerRoot"
Write-Host 'Required workflow labels: self-hosted, Windows, X64 plus dedicated custom label tgg-ue58.'

if ($ValidateOnly) {
  Write-Host 'TGG_WORLD_RUNNER_VALIDATE: PASS'
  exit 0
}

$RegistrationToken = Get-RunnerRegistrationToken -Url $RepositoryUrl
$asset = Get-LatestRunnerAsset
Write-Host "GitHub Actions runner: $($asset.Version) / $($asset.Name)"
Install-GitHubRunnerFiles -Asset $asset
Register-GitHubRunner
Start-GitHubRunnerService

Write-Host 'TGG_WORLD_RUNNER_BOOTSTRAP: PASS'
Write-Host 'The existing TGG World Unreal Runtime Evidence workflow can now claim this dedicated Windows X64 tgg-ue58 runner.'
