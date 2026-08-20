. (Join-Path $PSScriptRoot 'common.ps1')

New-Item -ItemType Directory -Force -Path $script:DownloadsDirectory, $script:RuntimeRoot | Out-Null

if (-not (Test-Path -LiteralPath $script:ArchivePath -PathType Leaf)) {
  Invoke-WebRequest -Uri $script:ArchiveUrl -OutFile $script:ArchivePath
}

$stream = [System.IO.File]::OpenRead($script:ArchivePath)
try {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $actualHash = ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
  }
  finally {
    $sha256.Dispose()
  }
}
finally {
  $stream.Dispose()
}
if ($actualHash -ne $script:ArchiveSha256) {
  throw "PostgreSQL archive checksum mismatch. Expected $script:ArchiveSha256."
}

$postgres = Get-PostgresExecutable -Name 'postgres'
if (-not (Test-Path -LiteralPath $postgres -PathType Leaf)) {
  $extractRoot = Split-Path -Parent $script:PostgresRoot
  New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
  & tar.exe -xf $script:ArchivePath -C $extractRoot
  if ($LASTEXITCODE -ne 0) {
    throw 'The PostgreSQL archive could not be extracted.'
  }
}

$reportedVersion = (& $postgres --version)
if ($reportedVersion -ne "postgres (PostgreSQL) $script:PostgresVersion") {
  throw "Unexpected PostgreSQL executable version: $reportedVersion"
}

$manifest = [ordered]@{
  archive = $script:ArchiveName
  origin = $script:ArchiveUrl
  postgresVersion = $script:PostgresVersion
  sha256 = $script:ArchiveSha256
}
$manifest | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath (Join-Path $script:RuntimeRoot 'manifest.json')

if (-not (Test-Path -LiteralPath $script:CredentialPath -PathType Leaf)) {
  $port = Get-FreeTcpPort
  $adminPassword = New-UrlSafeSecret
  $appPassword = New-UrlSafeSecret
  $database = 'sergod_phase1_test'
  $appUser = 'sergod_phase1_app'
  $credentials = [ordered]@{
    adminPassword = $adminPassword
    adminUser = 'sergod_phase1_admin'
    appPassword = $appPassword
    appUser = $appUser
    database = $database
    databaseUrl = "postgresql://${appUser}:${appPassword}@127.0.0.1:${port}/${database}"
    host = '127.0.0.1'
    port = $port
  }
  $credentials | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath $script:CredentialPath
}

$config = Get-LocalPostgresConfig
if (-not (Test-Path -LiteralPath (Join-Path $script:DataDirectory 'PG_VERSION') -PathType Leaf)) {
  New-Item -ItemType Directory -Force -Path $script:DataDirectory | Out-Null
  $passwordFile = Join-Path $script:RuntimeRoot 'init-password.tmp'
  try {
    Set-Content -NoNewline -Encoding utf8 -LiteralPath $passwordFile -Value $config.adminPassword
    $initdb = Get-PostgresExecutable -Name 'initdb'
    & $initdb -D $script:DataDirectory -U $config.adminUser --pwfile=$passwordFile --auth-local=scram-sha-256 --auth-host=scram-sha-256 --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) {
      throw 'PostgreSQL cluster initialization failed.'
    }
  }
  finally {
    if (Test-Path -LiteralPath $passwordFile) {
      Remove-Item -Force -LiteralPath $passwordFile
    }
  }

  Add-Content -LiteralPath (Join-Path $script:DataDirectory 'postgresql.conf') -Value @"
listen_addresses = '127.0.0.1'
port = $($config.port)
password_encryption = 'scram-sha-256'
timezone = 'UTC'
log_timezone = 'UTC'
"@
}

Start-LocalPostgres

if (-not (Test-Path -LiteralPath $script:ProvisionedMarker -PathType Leaf)) {
  $provisionSql = Join-Path $script:RuntimeRoot 'provision.sql'
  try {
    Set-Content -Encoding utf8 -LiteralPath $provisionSql -Value @"
CREATE ROLE $($config.appUser) LOGIN PASSWORD '$($config.appPassword)';
CREATE DATABASE $($config.database) OWNER $($config.appUser);
"@
    $env:PGPASSWORD = $config.adminPassword
    $psql = Get-PostgresExecutable -Name 'psql'
    & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $config.port -U $config.adminUser -d postgres -f $provisionSql
    if ($LASTEXITCODE -ne 0) {
      throw 'The exclusive test role and database could not be provisioned.'
    }
    Set-Content -NoNewline -Encoding ascii -LiteralPath $script:ProvisionedMarker -Value 'SERGOD_PHASE1_TEST_DATABASE'
  }
  finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $provisionSql) {
      Remove-Item -Force -LiteralPath $provisionSql
    }
  }
}

if (-not (Test-LocalPostgresReady)) {
  throw 'The exclusive PostgreSQL test database is not accepting connections.'
}

Write-Output "PostgreSQL $script:PostgresVersion is ready on 127.0.0.1:$($config.port) for the exclusive test database."
