[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$RepoRoot,[string]$WorkspaceRoot = 'C:\TGGWorld\damage-r3-runtime')
$ErrorActionPreference='Stop'
$resolvedRepo=(Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path
$checkpointRoot=Join-Path $resolvedRepo 'game\unreal-fastlane\checkpoints\e628173'
if(-not(Test-Path -LiteralPath $checkpointRoot -PathType Container)){throw "DAMAGE R3 runtime requires checkpoint e628173 at $checkpointRoot"}
$chunks=@(Get-ChildItem -LiteralPath $checkpointRoot -Filter 'TGG_WORLD_UNREAL_FASTLANE_e628173.tar.gz.b64.chunk*' -File|Sort-Object Name)
if($chunks.Count -ne 19){throw "DAMAGE R3 runtime expected 19 e628173 checkpoint chunks but found $($chunks.Count)"}
$expectedArchiveSha256='d9873c842d66b0508d0b8e447de8e2cdb95362c5d15e4486e50cbb5e3f51bd58'
$timestamp=Get-Date -Format 'yyyyMMdd-HHmmss'; $stageRoot=Join-Path $WorkspaceRoot "candidate-e628173-damage-r3-$timestamp"; $extractRoot=Join-Path $stageRoot 'source'; $archivePath=Join-Path $stageRoot 'TGG_WORLD_UNREAL_FASTLANE_e628173.tar.gz'; $evidenceExport=Join-Path $stageRoot 'evidence'
$normalizedCheckpoint=$checkpointRoot.Replace('/','\').TrimEnd('\').ToLowerInvariant(); $normalizedStage=[System.IO.Path]::GetFullPath($stageRoot).Replace('/','\').TrimEnd('\').ToLowerInvariant(); if($normalizedStage.StartsWith($normalizedCheckpoint+'\')){throw "DAMAGE R3 runtime refused workspace inside canonical checkpoint: $stageRoot"}
New-Item -ItemType Directory -Force -Path $extractRoot|Out-Null
$base64=(($chunks|ForEach-Object{Get-Content -LiteralPath $_.FullName -Raw})-join '')-replace '\s',''; $archiveBytes=[Convert]::FromBase64String($base64); [System.IO.File]::WriteAllBytes($archivePath,$archiveBytes)
$actualArchiveSha256=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant(); if($actualArchiveSha256 -ne $expectedArchiveSha256){throw "DAMAGE R3 runtime checkpoint SHA mismatch. expected=$expectedArchiveSha256 actual=$actualArchiveSha256"}; Write-Host "TGG_DAMAGE_R3_CHECKPOINT_SHA: PASS sha256=$actualArchiveSha256"
$tar=Get-Command tar.exe -ErrorAction SilentlyContinue; if(-not $tar){throw 'DAMAGE R3 runtime requires tar.exe on Windows.'}; & $tar.Source -xzf $archivePath -C $extractRoot; if($LASTEXITCODE -ne 0){throw "DAMAGE R3 runtime checkpoint extraction failed with exit code $LASTEXITCODE"}
$projectFile=Get-ChildItem -LiteralPath $extractRoot -Filter 'TGGWorld.uproject' -File -Recurse|Select-Object -First 1; if(-not $projectFile){throw "DAMAGE R3 runtime could not find TGGWorld.uproject under $extractRoot"}; $projectRoot=$projectFile.Directory.FullName
$candidateQa=Join-Path $PSScriptRoot 'Start-TGGDamageCandidateQA.ps1'; if(-not(Test-Path -LiteralPath $candidateQa -PathType Leaf)){throw "DAMAGE R3 candidate QA launcher missing: $candidateQa"}; & $candidateQa -TargetRoot $projectRoot
$smokeRoot=Join-Path $projectRoot 'Builds\Win64-Development\_smoke'; if(-not(Test-Path -LiteralPath $smokeRoot -PathType Container)){throw "DAMAGE R3 runtime smoke evidence missing: $smokeRoot"}; New-Item -ItemType Directory -Force -Path $evidenceExport|Out-Null; Copy-Item -Path (Join-Path $smokeRoot '*') -Destination $evidenceExport -Recurse -Force
Write-Host "TGG_DAMAGE_R3_RUNTIME: PASS project=$projectRoot evidence=$evidenceExport"
