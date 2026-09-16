[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RepoRoot,[string]$WorkspaceRoot='C:\TGGWorld\damage-r4-runtime')
$ErrorActionPreference='Stop'; $resolvedRepo=(Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path
$validator=Join-Path $resolvedRepo 'scripts\windows\Install-TGGWorldRunner.ps1'; if(-not(Test-Path -LiteralPath $validator -PathType Leaf)){throw "DAMAGE R4 runtime requires runner validator: $validator"}
$git=Get-Command git.exe -ErrorAction SilentlyContinue; if(-not $git){throw 'DAMAGE R4 runtime requires Git for repository origin discovery.'}; $repositoryUrl=(& $git.Source -C $resolvedRepo remote get-url origin).Trim(); if(-not $repositoryUrl){throw 'DAMAGE R4 runtime could not resolve the repository origin URL.'}
& $validator -RepositoryUrl $repositoryUrl -ValidateOnly; if(-not $?){throw 'DAMAGE R4 machine validation failed.'}; Write-Host 'TGG_DAMAGE_R4_MACHINE_READY: PASS'
$runtime=Join-Path $PSScriptRoot 'Start-TGGDamageR3Runtime.ps1'; if(-not(Test-Path -LiteralPath $runtime -PathType Leaf)){throw "DAMAGE R4 runtime launcher missing: $runtime"}; & $runtime -RepoRoot $resolvedRepo -WorkspaceRoot $WorkspaceRoot; if(-not $?){throw 'DAMAGE R4 runtime evidence launcher failed.'}; Write-Host "TGG_DAMAGE_R4_RUNTIME: PASS repo=$resolvedRepo workspace=$WorkspaceRoot"
