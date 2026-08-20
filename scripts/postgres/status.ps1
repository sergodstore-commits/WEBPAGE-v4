. (Join-Path $PSScriptRoot 'common.ps1')

$config = Get-LocalPostgresConfig
$postgres = Get-PostgresExecutable -Name 'postgres'
$reportedVersion = & $postgres --version
if (Test-LocalPostgresReady) {
  Write-Output "$reportedVersion is ready at 127.0.0.1:$($config.port)."
  exit 0
}
Write-Output "$reportedVersion is not ready."
exit 1
