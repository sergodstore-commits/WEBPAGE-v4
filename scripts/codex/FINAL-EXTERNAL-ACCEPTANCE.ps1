# This command is the final guard over externally accepted capabilities. Concrete
# acceptance procedures record their evidence before removing each deferred item.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$root=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$statePath=Join-Path $root '.codex-mission\STATE.json'
if (-not (Test-Path $statePath)) { throw 'Mission state not found.' }
$state=Get-Content -Raw $statePath | ConvertFrom-Json
Write-Output 'SERGOD STORE - FINAL EXTERNAL ACCEPTANCE'
$deferred=@($state.deferredExternal)
Write-Output "Deferred items: $($deferred.Count)"
if ($deferred.Count -gt 0) {
  foreach ($item in $deferred) {
    Write-Output ("- {0}: {1}" -f $item.capability, $item.reason)
  }
  Write-Output 'FINAL_EXTERNAL_ACCEPTANCE=DEFERRED_EXTERNAL'
  Write-Output 'Outstanding external capabilities remain; completed evidence is preserved in docs/CURRENT/IMPLEMENTATION-STATUS.md.'
  exit 2
}
Write-Output 'FINAL_EXTERNAL_ACCEPTANCE=PASS'
Write-Output 'No deferred external capability remains in mission state.'
