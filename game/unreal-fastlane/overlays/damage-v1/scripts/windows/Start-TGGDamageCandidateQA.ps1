[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetRoot
)

$ErrorActionPreference = 'Stop'

$resolvedTarget = (Resolve-Path -LiteralPath $TargetRoot -ErrorAction Stop).Path
$normalizedTarget = $resolvedTarget.Replace('/', '\').ToLowerInvariant()
if ($normalizedTarget -match '\\checkpoints\\e628173(?:\\|$)') {
  throw "DAMAGE candidate QA refused canonical checkpoint path: $resolvedTarget"
}

$projectFile = Join-Path $resolvedTarget 'TGGWorld.uproject'
if (-not (Test-Path -LiteralPath $projectFile -PathType Leaf)) {
  throw "DAMAGE candidate QA requires TGGWorld.uproject at $projectFile"
}

$apply = Join-Path $PSScriptRoot 'Apply-TGGDamageOverlay.ps1'
if (-not (Test-Path -LiteralPath $apply -PathType Leaf)) {
  throw "DAMAGE overlay applicator missing: $apply"
}

$preflight = Join-Path $resolvedTarget 'scripts\windows\TGG_FASTLANE_PREFLIGHT.ps1'
$finalQa = Join-Path $resolvedTarget 'scripts\windows\TGG_FASTLANE_FINAL_QA.ps1'
if (-not (Test-Path -LiteralPath $preflight -PathType Leaf)) {
  throw "Fast-lane preflight missing: $preflight"
}
if (-not (Test-Path -LiteralPath $finalQa -PathType Leaf)) {
  throw "Fast-lane final QA missing: $finalQa"
}

& $apply -TargetRoot $resolvedTarget
Push-Location $resolvedTarget
try {
  & $preflight
  & $finalQa
} finally {
  Pop-Location
}

$smokeRoot = Join-Path $resolvedTarget 'Builds\Win64-Development\_smoke'
function Require-Marker([string]$FileName, [string]$Marker) {
  $path = Join-Path $smokeRoot $FileName
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "DAMAGE candidate QA evidence file missing: $path"
  }
  if (-not (Select-String -LiteralPath $path -SimpleMatch $Marker -Quiet)) {
    throw "DAMAGE candidate QA marker missing: $Marker in $path"
  }
}

Require-Marker 'TGGFastlaneSmoke.log' 'TGG_FASTLANE_SMOKE: PASS'
Require-Marker 'TGGFastlaneFinalGameplayQA.log' 'TGG_FASTLANE_FINAL_GAMEPLAY_QA: PASS'
Write-Host "TGG_DAMAGE_CANDIDATE_QA: PASS target=$resolvedTarget"
