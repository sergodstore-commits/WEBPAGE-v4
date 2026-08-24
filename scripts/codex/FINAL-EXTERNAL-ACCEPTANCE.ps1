# This command is intentionally non-accepting until concrete provider and staging
# procedures exist. It reports the deferred scope once and never mutates mission state.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$root=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$statePath=Join-Path $root '.codex-mission\STATE.json'
if (-not (Test-Path $statePath)) { throw 'Mission state not found.' }
$state=Get-Content -Raw $statePath | ConvertFrom-Json
Write-Output 'SERGOD STORE - FINAL EXTERNAL ACCEPTANCE'
Write-Output "Deferred items: $(@($state.deferredExternal).Count)"
foreach ($item in @($state.deferredExternal)) {
  Write-Output ("- {0}: {1}" -f $item.capability, $item.reason)
}
Write-Output 'FINAL_EXTERNAL_ACCEPTANCE=DEFERRED_EXTERNAL'
Write-Output 'No provider, staging, production, DNS, backup/restore, rollback or remote E2E acceptance was executed.'
Write-Output 'This command does not clear deferredExternal and cannot produce a false PASS.'
exit 2
