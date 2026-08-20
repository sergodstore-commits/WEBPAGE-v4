$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $Root
try {
    Write-Host 'SERGOD_CODEX_PREPARE=START'
    node .\codex-system\tools\validate-codex-system.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Codex system validation failed.' }
    node .\codex-system\tools\build-context-index.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Context index generation failed.' }
    Write-Host 'SERGOD_CODEX_PREPARE=PASS'
} finally {
    Pop-Location
}
