[CmdletBinding()]
param(
  [string]$WorkspaceRoot = 'C:\TGGWorld',
  [switch]$NoWatch
)

$ErrorActionPreference = 'Stop'

$repositoryUrl = 'https://github.com/olandusgood-byte/tru-go-getta-mixtape'
$branchName = 'tgg-world-unreal-fastlane'
$repoRoot = Join-Path $WorkspaceRoot 'tru-go-getta-mixtape'

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this bootstrap from an elevated PowerShell session (Run as Administrator).'
  }
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = @($machinePath, $userPath) -join ';'
}

function Resolve-CommandPath {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string[]]$FallbackPaths = @()
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  foreach ($candidate in $FallbackPaths) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Get-WinGetPath {
  $winget = Resolve-CommandPath -Name 'winget'
  if (-not $winget) {
    throw 'Windows Package Manager (winget) was not found. Install Microsoft App Installer, then rerun this bootstrap.'
  }
  return $winget
}

function Ensure-WinGetPackage {
  param(
    [Parameter(Mandatory = $true)][string]$CommandName,
    [Parameter(Mandatory = $true)][string]$PackageId,
    [string[]]$FallbackPaths = @()
  )

  $resolved = Resolve-CommandPath -Name $CommandName -FallbackPaths $FallbackPaths
  if ($resolved) { return $resolved }

  $winget = Get-WinGetPath
  Write-Host "Installing $PackageId with winget..."
  & $winget install --id $PackageId --exact --source winget --silent --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "winget failed to install $PackageId with exit code $LASTEXITCODE."
  }

  Refresh-ProcessPath
  $resolved = Resolve-CommandPath -Name $CommandName -FallbackPaths $FallbackPaths
  if (-not $resolved) {
    throw "$PackageId installation completed but '$CommandName' is still unavailable in this PowerShell session. Open a new elevated PowerShell window and rerun the bootstrap."
  }
  return $resolved
}

function Assert-GitHubAuthentication {
  param([Parameter(Mandatory = $true)][string]$GhPath)

  # Equivalent command: gh auth status --hostname github.com
  & $GhPath auth status --hostname github.com 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) { return }

  Write-Host 'GitHub CLI is not authenticated. Opening the secure GitHub web login flow...'
  # Equivalent command: gh auth login --hostname github.com --web --git-protocol https
  & $GhPath auth login --hostname github.com --web --git-protocol https
  if ($LASTEXITCODE -ne 0) {
    throw "gh auth login failed with exit code $LASTEXITCODE."
  }

  & $GhPath auth status --hostname github.com 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI authentication was not confirmed after login.'
  }
}

function Normalize-RepositoryUrl {
  param([Parameter(Mandatory = $true)][string]$Url)
  return (($Url.Trim().TrimEnd('/')) -replace '\.git$','').ToLowerInvariant()
}

function Sync-FastLaneCheckout {
  param([Parameter(Mandatory = $true)][string]$GitPath)

  New-Item -ItemType Directory -Force -Path $WorkspaceRoot | Out-Null

  if (-not (Test-Path -LiteralPath $repoRoot)) {
    Write-Host "Cloning $branchName into $repoRoot..."
    # Equivalent command: git clone --branch tgg-world-unreal-fastlane --single-branch <repo> <dir>
    & $GitPath clone --branch $branchName --single-branch $repositoryUrl $repoRoot
    if ($LASTEXITCODE -ne 0) {
      throw "git clone failed with exit code $LASTEXITCODE."
    }
    return
  }

  $gitDir = Join-Path $repoRoot '.git'
  if (-not (Test-Path -LiteralPath $gitDir)) {
    throw "Existing path is not the TGG Git checkout: $repoRoot"
  }

  Push-Location $repoRoot
  try {
    # Equivalent command: git status --porcelain
    $dirty = @(& $GitPath status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw 'git status failed.' }
    if ($dirty.Count -gt 0) {
      throw 'Existing TGG checkout has local changes. Commit/stash them before the bootstrap updates the branch; no files were overwritten.'
    }

    $origin = (& $GitPath remote get-url origin).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the existing checkout origin URL.' }
    if ((Normalize-RepositoryUrl $origin) -ne (Normalize-RepositoryUrl $repositoryUrl)) {
      throw "Existing checkout points to a different origin: $origin"
    }

    # Equivalent command: git fetch origin tgg-world-unreal-fastlane
    & $GitPath fetch origin $branchName
    if ($LASTEXITCODE -ne 0) { throw 'git fetch failed.' }

    # Equivalent command: git switch tgg-world-unreal-fastlane
    & $GitPath switch $branchName
    if ($LASTEXITCODE -ne 0) { throw 'git switch failed.' }

    # Equivalent command: git pull --ff-only origin tgg-world-unreal-fastlane
    & $GitPath pull --ff-only origin $branchName
    if ($LASTEXITCODE -ne 0) { throw 'git pull --ff-only failed.' }
  }
  finally {
    Pop-Location
  }
}

if ($env:OS -ne 'Windows_NT') {
  throw 'TGG World fresh-machine bootstrap requires Windows x64.'
}
if (-not [Environment]::Is64BitOperatingSystem) {
  throw 'TGG World fresh-machine bootstrap requires a 64-bit Windows installation.'
}

Assert-Administrator

$git = Ensure-WinGetPackage -CommandName 'git' -PackageId 'Git.Git' -FallbackPaths @(
  'C:\Program Files\Git\cmd\git.exe',
  'C:\Program Files\Git\bin\git.exe'
)
$gh = Ensure-WinGetPackage -CommandName 'gh' -PackageId 'GitHub.cli' -FallbackPaths @(
  'C:\Program Files\GitHub CLI\gh.exe'
)

Write-Host "Git: $git"
Write-Host "GitHub CLI: $gh"
Assert-GitHubAuthentication -GhPath $gh
Sync-FastLaneCheckout -GitPath $git

$launcher = Join-Path $repoRoot 'scripts\windows\Start-TGGWorldRuntime.ps1'
if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Runtime launcher is missing after checkout sync: $launcher"
}

Write-Host "Fast-lane checkout: $repoRoot"
Write-Host 'TGG_WORLD_MACHINE_BOOTSTRAP: READY'
Write-Host 'Handing off to Start-TGGWorldRuntime.ps1; it will validate UE 5.8, Visual Studio C++, runner registration, labels, and the existing workflow run.'

if ($NoWatch) {
  & $launcher -NoWatch
}
else {
  & $launcher
}

if ($LASTEXITCODE -ne 0) {
  throw "Start-TGGWorldRuntime.ps1 failed with exit code $LASTEXITCODE."
}

Write-Host 'TGG_WORLD_MACHINE_BOOTSTRAP: COMPLETE'
