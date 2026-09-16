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
$PACKAGE_BOOT_OK = Join-Path $smokeRoot 'TGGFastlaneSmoke.log'
$CREATOR_DISTRICT_GAMEPLAY_OK = Join-Path $smokeRoot 'TGGFastlaneFinalGameplayQA.log'

if (-not (Test-Path -LiteralPath $PACKAGE_BOOT_OK -PathType Leaf)) {
  throw "DAMAGE candidate QA package evidence missing: $PACKAGE_BOOT_OK"
}
if (-not (Select-String -LiteralPath $PACKAGE_BOOT_OK -SimpleMatch 'TGG_FASTLANE_SMOKE: PASS' -Quiet)) {
  throw "DAMAGE candidate QA package marker missing: TGG_FASTLANE_SMOKE: PASS"
}

if (-not (Test-Path -LiteralPath $CREATOR_DISTRICT_GAMEPLAY_OK -PathType Leaf)) {
  throw "DAMAGE candidate QA gameplay evidence missing: $CREATOR_DISTRICT_GAMEPLAY_OK"
}
if (-not (Select-String -LiteralPath $CREATOR_DISTRICT_GAMEPLAY_OK -SimpleMatch 'TGG_FASTLANE_FINAL_GAMEPLAY_QA: PASS' -Quiet)) {
  throw "DAMAGE candidate QA gameplay marker missing: TGG_FASTLANE_FINAL_GAMEPLAY_QA: PASS"
}

Write-Host "PACKAGE_BOOT_OK=$PACKAGE_BOOT_OK"
Write-Host "CREATOR_DISTRICT_GAMEPLAY_OK=$CREATOR_DISTRICT_GAMEPLAY_OK"
Write-Host "TGG_DAMAGE_CANDIDATE_QA: PASS target=$resolvedTarget"
