param(
  [Parameter(Mandatory)][ValidateSet('PASS','PASS_LOCAL','DEFERRED_EXTERNAL')][string]$Status,
  [string]$Evidence = '',
  [string]$DeferredCapability = '',
  [string]$DeferredReason = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$statePath=Join-Path $root '.codex-mission\STATE.json'
if (-not (Test-Path $statePath)) { throw 'Mission state is missing.' }
$state=Get-Content -Raw $statePath | ConvertFrom-Json
$currentId=[string]$state.currentStageId
$currentFile=[string]$state.currentStageFile
if ([string]::IsNullOrWhiteSpace($currentId)) { throw 'No current stage.' }
if ($Status -eq 'DEFERRED_EXTERNAL') {
  if ([string]::IsNullOrWhiteSpace($DeferredCapability) -or [string]::IsNullOrWhiteSpace($DeferredReason)) {
    throw 'DEFERRED_EXTERNAL requires -DeferredCapability and -DeferredReason.'
  }
}

# Require a clean committed state before moving the mission pointer.
$gitSafety="safe.directory=$root"
$dirty=@(& git -c $gitSafety -C $root status --porcelain)
if ($dirty.Count -ne 0) { throw 'Commit/stabilize all stage changes before complete-stage; working tree is not clean.' }

$entry=[ordered]@{ id=$currentId; status=$Status; completedAtUtc=(Get-Date).ToUniversalTime().ToString('o'); evidence=$Evidence; commit=(& git -c $gitSafety -C $root rev-parse HEAD).Trim() }
$completed=@($state.completedStages) + [pscustomobject]$entry
$deferred=@($state.deferredExternal)
if ($Status -eq 'DEFERRED_EXTERNAL') {
  $deferred += [pscustomobject]([ordered]@{ stageId=$currentId; capability=$DeferredCapability; reason=$DeferredReason; recordedAtUtc=(Get-Date).ToUniversalTime().ToString('o') })
}

$queue=@($state.queue)
$index=-1
for ($i=0; $i -lt $queue.Count; $i++) { if ([string]$queue[$i].id -eq $currentId) { $index=$i; break } }
if ($index -lt 0) { throw "Current stage $currentId is not in queue." }

$stagePath=Join-Path $root ($currentFile -replace '/', '\\')
if (Test-Path $stagePath) { Remove-Item -Force $stagePath }

if ($index + 1 -lt $queue.Count) {
  $next=$queue[$index+1]
  $state.currentStageId=[string]$next.id
  $state.currentStageFile=[string]$next.file
  $state.status='ACTIVE'
} else {
  $state.currentStageId=$null
  $state.currentStageFile=$null
  $state.status='READY_TO_FINALIZE'
}
$state.completedStages=$completed
$state.deferredExternal=$deferred
$stateJson=($state | ConvertTo-Json -Depth 12) + [Environment]::NewLine
[System.IO.File]::WriteAllText($statePath,$stateJson,[System.Text.UTF8Encoding]::new($false))

& npx.cmd prettier $statePath --write
if ($LASTEXITCODE -ne 0) { throw 'Mission state formatting failed.' }

& node (Join-Path $root 'codex-system\tools\validate-codex-system.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Mission bookkeeping validation failed.' }

& git -c $gitSafety -C $root add -- '.codex-mission'
if ($LASTEXITCODE -ne 0) { throw 'Could not stage mission bookkeeping.' }
& git -c $gitSafety -C $root commit -m "chore(mission): close stage $currentId"
if ($LASTEXITCODE -ne 0) { throw 'Could not commit mission bookkeeping.' }

Write-Output "STAGE_COMPLETED=$currentId::$Status"
Write-Output "NEXT_STAGE=$($state.currentStageId)"
Write-Output 'MISSION_BOOKKEEPING=COMMITTED'
