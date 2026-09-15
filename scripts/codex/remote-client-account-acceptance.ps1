param(
  [string]$ApiBaseUrl = '',
  [string]$EnvironmentPath = '',
  [string]$ExpectedHost = 'sergod-store-api-v4.onrender.com'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($EnvironmentPath)) {
  $EnvironmentPath = Join-Path $repositoryRoot '.env'
} elseif (-not [System.IO.Path]::IsPathRooted($EnvironmentPath)) {
  $EnvironmentPath = Join-Path $repositoryRoot $EnvironmentPath
}

function Read-DotEnv {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { throw '.env is required for remote acceptance.' }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) { continue }
    $separator = $trimmed.IndexOf('=')
    if ($separator -lt 1) { continue }
    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  return $values
}

function Invoke-Api {
  param(
    [ValidateSet('GET', 'POST')][string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$AccessToken = ''
  )
  $headers = @{}
  if (-not [string]::IsNullOrWhiteSpace($AccessToken)) {
    $headers.Authorization = "Bearer $AccessToken"
  }
  $parameters = @{
    Headers = $headers
    Method = $Method
    Uri = $apiRoot + $Path
  }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json'
    $parameters.Body = $Body | ConvertTo-Json -Compress -Depth 10
  }
  try {
    return Invoke-RestMethod @parameters
  } catch {
    $status = if ($null -ne $_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    $code = 'UNAVAILABLE'
    $details = if ($null -ne $_.ErrorDetails -and $null -ne $_.ErrorDetails.PSObject.Properties['Message']) {
      [string]$_.ErrorDetails.Message
    } else { '' }
    if (-not [string]::IsNullOrWhiteSpace($details)) {
      try {
        $errorBody = $details | ConvertFrom-Json
        if ($null -ne $errorBody.error.code) { $code = [string]$errorBody.error.code }
      } catch { }
    }
    throw "API request failed: $Method $Path :: HTTP $status :: $code"
  }
}

function Assert-Page {
  param([object]$Page, [string]$Kind)
  if ($null -eq $Page.PSObject.Properties['items']) { throw "$Kind did not return an items page." }
  if ($null -eq $Page.PSObject.Properties['nextCursor']) { throw "$Kind did not return nextCursor." }
}

$configuration = Read-DotEnv -Path $EnvironmentPath
if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) { $ApiBaseUrl = [string]$configuration.API_PUBLIC_URL }
$apiUri = [Uri]$ApiBaseUrl
if ($apiUri.Scheme -ne 'https' -or $apiUri.Host -ne $ExpectedHost) {
  throw 'Remote client account acceptance is restricted to the expected HTTPS staging host.'
}
$apiRoot = $ApiBaseUrl.TrimEnd('/')
$clientEmail = [string]$configuration['SERGOD_CLIENT_EMAIL']
$clientPassword = [string]$configuration['SERGOD_CLIENT_PASSWORD']
if ([string]::IsNullOrWhiteSpace($clientEmail) -or [string]::IsNullOrWhiteSpace($clientPassword)) {
  Write-Output 'CLIENT_ACCOUNT_ACCEPTANCE=DEFERRED_EXTERNAL'
  Write-Output 'REASON=SERGOD_CLIENT_EMAIL and SERGOD_CLIENT_PASSWORD are not configured.'
  exit 2
}

$session = Invoke-Api -Method POST -Path '/api/v1/identity/sessions' -Body @{
  email = $clientEmail
  password = $clientPassword
}
$accessToken = [string]$session.accessToken
if ([string]::IsNullOrWhiteSpace($accessToken)) { throw 'Client login did not return an access token.' }

$accountResponse = Invoke-Api -Method GET -Path '/api/v1/account' -AccessToken $accessToken
if ($null -eq $accountResponse.PSObject.Properties['account']) {
  throw 'Account endpoint did not return the account envelope.'
}
$account = $accountResponse.account
if ([string]$account.role -ne 'CLIENTE') { throw 'Acceptance identity is not a CLIENTE account.' }
if ([string]$account.status -ne 'ACTIVE') { throw 'Acceptance CLIENTE account is not ACTIVE.' }
if ([string]$account.emailVerificationStatus -ne 'VERIFIED') {
  throw 'Acceptance CLIENTE email is not VERIFIED.'
}

$preferences = Invoke-Api -Method GET -Path '/api/v1/account/delivery-preferences' -AccessToken $accessToken
if ($null -eq $preferences.PSObject.Properties['item']) {
  throw 'Delivery preferences did not return the item envelope.'
}
$regular = Invoke-Api -Method GET -Path '/api/v1/orders?limit=25&orderType=REGULAR' -AccessToken $accessToken
$preorders = Invoke-Api -Method GET -Path '/api/v1/orders?limit=25&orderType=PREORDER' -AccessToken $accessToken
$loyalty = Invoke-Api -Method GET -Path '/api/v1/loyalty/account' -AccessToken $accessToken
$movements = Invoke-Api -Method GET -Path '/api/v1/loyalty/movements?limit=25' -AccessToken $accessToken
Assert-Page -Page $regular -Kind 'Regular orders'
Assert-Page -Page $preorders -Kind 'Preorders'
Assert-Page -Page $movements -Kind 'Loyalty movements'
if ($null -eq $loyalty.PSObject.Properties['item']) {
  throw 'Loyalty account did not return the item envelope.'
}

Write-Output 'CLIENT_ACCOUNT_ACCEPTANCE=PASS'
Write-Output "API_HOST=$($apiUri.Host)"
Write-Output "REGULAR_ORDER_COUNT=$(@($regular.items).Count)"
Write-Output "PREORDER_COUNT=$(@($preorders.items).Count)"
Write-Output "LOYALTY_MOVEMENT_COUNT=$(@($movements.items).Count)"
Write-Output 'DELIVERY_PREFERENCES_READ=PASS'
