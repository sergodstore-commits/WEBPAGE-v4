param(
  [switch]$InstallDependencies,
  [switch]$PreparePostgres,
  [switch]$RunLocalIntegration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $RepositoryRoot

& (Join-Path $PSScriptRoot 'preflight.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed.' }

if ($InstallDependencies) {
  & npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
}

if ($PreparePostgres) {
  & npm run postgres:prepare
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL preparation failed.' }
}

$commands = @(
  @('npm','run','format:check'),
  @('npm','run','lint'),
  @('npm','run','typecheck'),
  @('npm','run','test:unit'),
  @('npm','run','test:application'),
  @('npm','run','test:contract'),
  @('npm','run','test:web'),
  @('npm','run','build')
)

foreach ($command in $commands) {
  Write-Output ('RUNNING :: ' + ($command -join ' '))
  & $command[0] $command[1..($command.Count - 1)]
  if ($LASTEXITCODE -ne 0) { throw "Gate failed: $($command -join ' ')" }
}

if ($RunLocalIntegration) {
  $credentialsPath = Join-Path $RepositoryRoot '.runtime\postgresql\credentials.json'
  if (-not (Test-Path -LiteralPath $credentialsPath -PathType Leaf)) {
    throw 'Local PostgreSQL credentials are absent. Use -PreparePostgres.'
  }
  $credentials = Get-Content -Raw -LiteralPath $credentialsPath | ConvertFrom-Json
  $previousDatabaseUrl = $env:DATABASE_URL
  try {
    $env:DATABASE_URL = $credentials.databaseUrl
    & npm run test:integration:local
    if ($LASTEXITCODE -ne 0) { throw 'Local integration tests failed.' }
  }
  finally {
    if ($null -eq $previousDatabaseUrl) { Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue }
    else { $env:DATABASE_URL = $previousDatabaseUrl }
  }
}

Write-Output 'LOCAL_VERIFICATION=PASS'
