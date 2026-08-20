. (Join-Path $PSScriptRoot 'common.ps1')

Stop-LocalPostgres
Write-Output 'The project PostgreSQL test instance is stopped.'
