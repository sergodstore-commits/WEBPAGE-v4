param(
  [string]$ApiBaseUrl = 'http://127.0.0.1:3000'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RuntimeDir = Join-Path $RepositoryRoot '.runtime\codex'
$SessionPath = Join-Path $RuntimeDir 'admin-session.json'

$email = $env:SERGOD_ADMIN_EMAIL
$password = $env:SERGOD_ADMIN_PASSWORD
if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
  throw 'Set SERGOD_ADMIN_EMAIL and SERGOD_ADMIN_PASSWORD in the process environment. They are intentionally not stored in the repository.'
}

$body = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$response = Invoke-RestMethod -Method Post -Uri ($ApiBaseUrl.TrimEnd('/') + '/api/v1/identity/sessions') -ContentType 'application/json' -Body $body
if ([string]::IsNullOrWhiteSpace([string]$response.accessToken)) {
  throw 'The login endpoint did not return an access token.'
}

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
$response | ConvertTo-Json | Set-Content -LiteralPath $SessionPath -Encoding utf8
Write-Output "ADMIN_SESSION=PASS :: fresh session stored only in .runtime/codex/admin-session.json; token value not printed."
