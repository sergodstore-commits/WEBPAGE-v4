Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script:PostgresVersion = '18.4'
$script:ArchiveName = 'postgresql-18.4-1-windows-x64-binaries.zip'
$script:ArchiveSha256 = '7EFFE34C0BF89027B3F171447D351CBC460F4566C8D0F643DAEC67F140787858'
$script:ArchiveUrl = "https://get.enterprisedb.com/postgresql/$script:ArchiveName"
$script:DownloadsDirectory = Join-Path $script:RepositoryRoot '.tools\downloads'
$script:ArchivePath = Join-Path $script:DownloadsDirectory $script:ArchiveName
$script:PostgresRoot = Join-Path $script:RepositoryRoot '.tools\postgresql-18.4\pgsql'
$script:PostgresBin = Join-Path $script:PostgresRoot 'bin'
$script:RuntimeRoot = Join-Path $script:RepositoryRoot '.runtime\postgresql'
$script:DataDirectory = Join-Path $script:RuntimeRoot 'data'
$script:LogDirectory = Join-Path $script:RuntimeRoot 'logs'
$script:CredentialPath = Join-Path $script:RuntimeRoot 'credentials.json'
$script:ProvisionedMarker = Join-Path $script:RuntimeRoot 'provisioned'

function Get-PostgresExecutable {
  param([Parameter(Mandatory)][string]$Name)
  return Join-Path $script:PostgresBin "$Name.exe"
}

function Get-LocalPostgresConfig {
  if (-not (Test-Path -LiteralPath $script:CredentialPath -PathType Leaf)) {
    throw 'Local PostgreSQL credentials are absent. Run npm run postgres:prepare.'
  }
  return Get-Content -Raw -LiteralPath $script:CredentialPath | ConvertFrom-Json
}

function New-UrlSafeSecret {
  $bytes = [byte[]]::new(32)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Get-FreeTcpPort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try {
    return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
  }
  finally {
    $listener.Stop()
  }
}

function Start-LocalPostgres {
  $config = Get-LocalPostgresConfig
  New-Item -ItemType Directory -Force -Path $script:LogDirectory | Out-Null
  $pgCtl = Get-PostgresExecutable -Name 'pg_ctl'
  & $pgCtl status -D $script:DataDirectory *> $null
  if ($LASTEXITCODE -eq 0) {
    return
  }

  # The Codex Windows sandbox exposes PATH twice with different casing.
  # Normalizing it avoids a Start-Process dictionary error. Launching postgres
  # directly also avoids pg_ctl's restricted-token relaunch, unsupported by the sandbox.
  [Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
  $postgres = Get-PostgresExecutable -Name 'postgres'
  $stdoutPath = Join-Path $script:LogDirectory 'postgresql-stdout.log'
  $stderrPath = Join-Path $script:LogDirectory 'postgresql-stderr.log'
  $process = Start-Process `
    -FilePath $postgres `
    -ArgumentList @('-D', "`"$script:DataDirectory`"", '-p', $config.port, '-h', '127.0.0.1') `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru
  Set-Content -NoNewline -Encoding ascii -LiteralPath (Join-Path $script:RuntimeRoot 'postgres.pid') -Value $process.Id

  $pgIsReady = Get-PostgresExecutable -Name 'pg_isready'
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    & $pgIsReady -h 127.0.0.1 -p $config.port -d postgres -U $config.adminUser *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    if ($process.HasExited) {
      throw "PostgreSQL exited during startup. Review $stderrPath."
    }
    Start-Sleep -Milliseconds 250
  }
  throw "PostgreSQL did not become ready. Review $stderrPath."
}

function Stop-LocalPostgres {
  if (-not (Test-Path -LiteralPath $script:DataDirectory -PathType Container)) {
    return
  }
  $pgCtl = Get-PostgresExecutable -Name 'pg_ctl'
  & $pgCtl status -D $script:DataDirectory *> $null
  if ($LASTEXITCODE -eq 0) {
    & $pgCtl stop -D $script:DataDirectory -m fast -w
    if ($LASTEXITCODE -ne 0) {
      throw 'PostgreSQL did not stop cleanly.'
    }
  }
}

function Test-LocalPostgresReady {
  $config = Get-LocalPostgresConfig
  $pgIsReady = Get-PostgresExecutable -Name 'pg_isready'
  & $pgIsReady -h 127.0.0.1 -p $config.port -d $config.database -U $config.appUser *> $null
  return $LASTEXITCODE -eq 0
}
