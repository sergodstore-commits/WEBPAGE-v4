. (Join-Path $PSScriptRoot 'common.ps1')

Start-LocalPostgres
if (-not (Test-LocalPostgresReady)) {
  throw 'PostgreSQL started but the project test database is unavailable.'
}
Write-Output 'The project PostgreSQL test instance is ready.'
