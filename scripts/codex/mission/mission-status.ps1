Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$statePath=Join-Path $root '.codex-mission\STATE.json'
if (-not (Test-Path $statePath)) { Write-Output 'MISSION=ABSENT_OR_COMPLETED'; exit 0 }
$state=Get-Content -Raw $statePath | ConvertFrom-Json
Write-Output "MISSION_STATUS=$($state.status)"
Write-Output "CURRENT_STAGE=$($state.currentStageId)"
Write-Output "CURRENT_STAGE_FILE=$($state.currentStageFile)"
Write-Output "COMPLETED_COUNT=$(@($state.completedStages).Count)"
Write-Output "DEFERRED_EXTERNAL_COUNT=$(@($state.deferredExternal).Count)"
