param([switch]$ConfirmReleasePass)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if (-not $ConfirmReleasePass) { throw 'Use -ConfirmReleasePass only after Release gates and smoke tests are PASS.' }
$root=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$statePath=Join-Path $root '.codex-mission\STATE.json'
if (-not (Test-Path $statePath)) { throw 'Mission is already absent.' }
$state=Get-Content -Raw $statePath | ConvertFrom-Json
if ([string]$state.status -ne 'READY_TO_FINALIZE') { throw "Mission status is $($state.status), not READY_TO_FINALIZE." }
if (@($state.deferredExternal).Count -gt 0) { throw 'Deferred external items remain in STATE.json. Resolve/clear them during final acceptance before finalizing.' }
Remove-Item -Recurse -Force (Join-Path $root '.codex-mission')
$finalAcceptance=Join-Path $root 'scripts\codex\FINAL-EXTERNAL-ACCEPTANCE.ps1'
if (Test-Path $finalAcceptance) { Remove-Item -Force $finalAcceptance }
$missionHelpers=Join-Path $root 'scripts\codex\mission'
if (Test-Path $missionHelpers) { Remove-Item -Recurse -Force $missionHelpers }
Write-Output 'MISSION_FINALIZED=PASS :: temporary mission files removed. Run final gates and commit the deletions.'
