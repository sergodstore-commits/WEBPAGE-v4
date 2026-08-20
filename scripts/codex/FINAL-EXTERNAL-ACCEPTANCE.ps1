# This script is intentionally a safe orchestrator scaffold.
# Provider stages must create concrete scripts under scripts/codex/acceptance/ before this final stage.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$statePath=Join-Path $root '.codex-mission\STATE.json'
if (-not (Test-Path $statePath)) { throw 'Mission state not found.' }
$state=Get-Content -Raw $statePath | ConvertFrom-Json
Write-Output 'SERGOD STORE — FINAL EXTERNAL ACCEPTANCE'
Write-Output "Deferred items: $(@($state.deferredExternal).Count)"
foreach ($item in @($state.deferredExternal)) {
  Write-Output ("- {0}: {1}" -f $item.capability, $item.reason)
}
$acceptDir=Join-Path $root 'scripts\codex\acceptance'
if (-not (Test-Path $acceptDir -PathType Container)) {
  throw 'Concrete acceptance scripts are not present yet. The provider stages must create them before final external acceptance.'
}
$scripts=@(Get-ChildItem -LiteralPath $acceptDir -Filter '*.ps1' | Sort-Object Name)
if ($scripts.Count -eq 0) { throw 'No concrete external acceptance scripts found.' }
Write-Output 'Credentials must be requested interactively by each acceptance script and must never be printed or persisted in Git.'
foreach ($script in $scripts) {
  Write-Output "RUNNING=$($script.Name)"
  & $script.FullName
  if ($LASTEXITCODE -ne 0) { throw "External acceptance failed: $($script.Name)" }
}
$state.deferredExternal=@()
$state | Add-Member -NotePropertyName externalAcceptanceCompletedAtUtc -NotePropertyValue ((Get-Date).ToUniversalTime().ToString('o')) -Force
$state | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 $statePath
Write-Output 'FINAL_EXTERNAL_ACCEPTANCE=PASS'
Write-Output 'DEFERRED_EXTERNAL_CLEARED=PASS'
