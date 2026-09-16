[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetRoot
)

$ErrorActionPreference = 'Stop'

$resolvedTarget = (Resolve-Path -LiteralPath $TargetRoot -ErrorAction Stop).Path
$normalizedTarget = $resolvedTarget.Replace('/', '\').ToLowerInvariant()
if ($normalizedTarget -match '\\checkpoints\\e628173(?:\\|$)') {
  throw "DAMAGE overlay refused canonical checkpoint path: $resolvedTarget"
}
$projectFile = Join-Path $resolvedTarget 'TGGWorld.uproject'
$targetModule = Join-Path $resolvedTarget 'Source\TGGWorld'
$overlayRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$overlayModule = Join-Path $overlayRoot 'Source\TGGWorld'

if (-not (Test-Path -LiteralPath $projectFile -PathType Leaf)) {
  throw "DAMAGE overlay refused target: TGGWorld.uproject was not found at $projectFile"
}
if (-not (Test-Path -LiteralPath $targetModule -PathType Container)) {
  throw "DAMAGE overlay refused target: Unreal module Source\TGGWorld was not found at $targetModule"
}
if (-not (Test-Path -LiteralPath $overlayModule -PathType Container)) {
  throw "DAMAGE overlay source is missing: $overlayModule"
}

$files = @(Get-ChildItem -LiteralPath $overlayModule -File -Recurse)
if ($files.Count -eq 0) {
  throw 'DAMAGE overlay contains no source files.'
}

foreach ($file in $files) {
  $relative = $file.FullName.Substring($overlayModule.Length).TrimStart('\','/')
  $destination = Join-Path $targetModule $relative
  $destinationDir = Split-Path -Parent $destination
  if (-not (Test-Path -LiteralPath $destinationDir)) {
    New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
  }

  if ($PSCmdlet.ShouldProcess($destination, "Apply DAMAGE overlay file $relative")) {
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  }
}

Write-Host "TGG_DAMAGE_OVERLAY_APPLY: PASS files=$($files.Count) target=$resolvedTarget"
