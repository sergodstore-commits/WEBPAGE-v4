param(
  [string]$ApiBaseUrl = '',
  [string]$ExpectedHost = 'sergod-store-api-v4.onrender.com',
  [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$environmentPath = Join-Path $repositoryRoot '.env'

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

$configuration = Read-DotEnv -Path $environmentPath
if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) { $ApiBaseUrl = [string]$configuration.API_PUBLIC_URL }
$apiUri = [Uri]$ApiBaseUrl
if ($apiUri.Scheme -ne 'https' -or $apiUri.Host -ne $ExpectedHost) {
  throw "Remote POS acceptance is restricted to the expected HTTPS staging host."
}
$apiRoot = $ApiBaseUrl.TrimEnd('/')
$adminEmail = [string]$configuration.SERGOD_ADMIN_EMAIL
$adminPassword = [string]$configuration.SERGOD_ADMIN_PASSWORD
if ([string]::IsNullOrWhiteSpace($adminEmail) -or [string]::IsNullOrWhiteSpace($adminPassword)) {
  throw 'SERGOD_ADMIN_EMAIL and SERGOD_ADMIN_PASSWORD are required in .env.'
}

function Invoke-Api {
  param(
    [ValidateSet('GET', 'POST', 'PATCH', 'PUT')][string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$AccessToken = '',
    [string]$IdempotencyKey = ''
  )
  $headers = @{}
  if (-not [string]::IsNullOrWhiteSpace($AccessToken)) {
    $headers.Authorization = "Bearer $AccessToken"
  }
  if (-not [string]::IsNullOrWhiteSpace($IdempotencyKey)) {
    $headers['idempotency-key'] = $IdempotencyKey
  }
  $parameters = @{
    Headers = $headers
    Method = $Method
    Uri = $apiRoot + $Path
  }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json'
    $parameters.Body = $Body | ConvertTo-Json -Compress -Depth 20
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

function Select-ExactItem {
  param([object[]]$Items, [string]$Name, [string]$Kind)
  $matches = @($Items | Where-Object { [string]$_.name -eq $Name })
  if ($matches.Count -ne 1) { throw "Expected exactly one $Kind named '$Name'; found $($matches.Count)." }
  return $matches[0]
}

$session = Invoke-Api -Method POST -Path '/api/v1/identity/sessions' -Body @{
  email = $adminEmail
  password = $adminPassword
}
$accessToken = [string]$session.accessToken
if ([string]::IsNullOrWhiteSpace($accessToken)) { throw 'Admin login did not return an access token.' }

$fixtureSuffix = '94bcf7403ad64419b360d927d2a7ae1b'
$gameName = "Phase 3F Game $fixtureSuffix"
$categoryName = "Phase 3F Category $fixtureSuffix"
$collectionName = "Phase 3F Collection $fixtureSuffix"
$productName = "Phase 3F Main Product $fixtureSuffix"

$games = Invoke-Api -Method GET -Path '/api/v1/admin/catalog/tcg-games?limit=25' -AccessToken $accessToken
$categories = Invoke-Api -Method GET -Path '/api/v1/admin/catalog/categories?limit=25' -AccessToken $accessToken
$collections = Invoke-Api -Method GET -Path '/api/v1/admin/catalog/collections?limit=25' -AccessToken $accessToken
$products = Invoke-Api -Method GET -Path '/api/v1/admin/catalog/products?limit=25' -AccessToken $accessToken
$game = Select-ExactItem -Items @($games.items) -Name $gameName -Kind 'game'
$category = Select-ExactItem -Items @($categories.items) -Name $categoryName -Kind 'category'
$collection = Select-ExactItem -Items @($collections.items) -Name $collectionName -Kind 'collection'
$product = Select-ExactItem -Items @($products.items) -Name $productName -Kind 'product'

$entities = @(
  [pscustomobject]@{ Id = [string]$game.gameId; Kind = 'game'; Segment = 'tcg-games'; Status = [string]$game.publicationStatus },
  [pscustomobject]@{ Id = [string]$category.categoryId; Kind = 'category'; Segment = 'categories'; Status = [string]$category.publicationStatus },
  [pscustomobject]@{ Id = [string]$collection.collectionId; Kind = 'collection'; Segment = 'collections'; Status = [string]$collection.publicationStatus },
  [pscustomobject]@{ Id = [string]$product.productId; Kind = 'product'; Segment = 'products'; Status = [string]$product.publicationStatus }
)
foreach ($entity in $entities) {
  if ($entity.Status -ne 'UNPUBLISHED') {
    throw "The selected $($entity.Kind) must start UNPUBLISHED; found $($entity.Status)."
  }
}
if ([string]$product.saleType -ne 'REGULAR') { throw 'The selected product is not REGULAR.' }

$positionBefore = Invoke-Api -Method GET -Path "/api/v1/admin/inventory/products/$($product.productId)" -AccessToken $accessToken
$originalOnHand = [long]$positionBefore.item.onHand
$originalReserved = [long]$positionBefore.item.reserved
$moneyMethods = Invoke-Api -Method GET -Path '/api/v1/admin/pos/external-money-methods' -AccessToken $accessToken
$activeMethods = @($moneyMethods.items | Where-Object { $_.state -eq 'ACTIVE' })
if ($activeMethods.Count -lt 1) { throw 'No ACTIVE external money method is available.' }
$moneyMethod = $activeMethods[0]

Write-Output 'POS_ACCEPTANCE_PREFLIGHT=PASS'
Write-Output "API_HOST=$($apiUri.Host)"
Write-Output "PRODUCT_SKU=$($product.sku)"
Write-Output "ORIGINAL_ON_HAND=$originalOnHand"
Write-Output "ORIGINAL_RESERVED=$originalReserved"
if (-not $Execute) {
  Write-Output 'POS_ACCEPTANCE=READY_NOT_EXECUTED'
  exit 0
}

$runId = 'ACCEPT-POS-E2E-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
$published = [System.Collections.Generic.List[object]]::new()
$saleId = ''
$saleCompleted = $false
$primaryFailure = $null
$cleanupFailures = [System.Collections.Generic.List[string]]::new()

try {
  foreach ($entity in $entities) {
    Invoke-Api -Method POST -Path "/api/v1/admin/catalog/$($entity.Segment)/$($entity.Id)/publication-transitions" `
      -AccessToken $accessToken -IdempotencyKey "${runId}:publish:$($entity.Kind)" -Body @{ nextStatus = 'PUBLISHED' } | Out-Null
    $published.Add($entity)
  }

  $entry = Invoke-Api -Method POST -Path "/api/v1/admin/inventory/products/$($product.productId)/stock-entries" `
    -AccessToken $accessToken -IdempotencyKey "${runId}:stock-entry" -Body @{
      quantity = 1
      reason = 'Remote Pseudo-POS acceptance'
      reference = $runId
    }
  if ([long]$entry.position.onHand -ne $originalOnHand + 1) { throw 'Stock entry did not add exactly one unit.' }

  $created = Invoke-Api -Method POST -Path '/api/v1/admin/pos/sales' -AccessToken $accessToken `
    -IdempotencyKey "${runId}:sale-create" -Body @{
      branchId = [string]$positionBefore.item.branchId
      saleType = 'REGULAR'
    }
  $saleId = [string]$created.id
  Invoke-Api -Method POST -Path "/api/v1/admin/pos/sales/$saleId/lines" -AccessToken $accessToken `
    -IdempotencyKey "${runId}:line-add" -Body @{ productId = [string]$product.productId; quantity = 1 } | Out-Null
  Invoke-Api -Method POST -Path "/api/v1/admin/pos/sales/$saleId/prepare" -AccessToken $accessToken `
    -IdempotencyKey "${runId}:prepare" -Body @{} | Out-Null
  $prepared = Invoke-Api -Method GET -Path "/api/v1/admin/pos/sales/$saleId" -AccessToken $accessToken
  $total = [long]$prepared.item.total_amount_clp
  $completionBody = if ($total -eq 0) { @{} } else {
    @{
      amountClp = $total
      externalMoneyMethodId = [string]$moneyMethod.external_money_method_id
      note = "Automated staging acceptance $runId"
      reference = $runId
    }
  }
  Invoke-Api -Method POST -Path "/api/v1/admin/pos/sales/$saleId/complete" -AccessToken $accessToken `
    -IdempotencyKey "${runId}:complete" -Body $completionBody | Out-Null
  $completed = Invoke-Api -Method GET -Path "/api/v1/admin/pos/sales/$saleId" -AccessToken $accessToken
  if ([string]$completed.item.state -ne 'COMPLETED') { throw 'The POS sale did not reach COMPLETED.' }
  if ([long]$completed.item.total_amount_clp -ne $total) { throw 'The completed total changed unexpectedly.' }
  if ($total -gt 0 -and [string]$completed.settlements[0].external_reference -ne $runId) {
    throw 'The acceptance reference was not preserved in the settlement.'
  }
  $saleCompleted = $true

  $positionAfter = Invoke-Api -Method GET -Path "/api/v1/admin/inventory/products/$($product.productId)" -AccessToken $accessToken
  if ([long]$positionAfter.item.onHand -ne $originalOnHand -or [long]$positionAfter.item.reserved -ne $originalReserved) {
    throw 'Inventory did not return to its original projection after completion.'
  }

  $movements = Invoke-Api -Method GET -Path "/api/v1/admin/inventory/products/$($product.productId)/movements?limit=100" -AccessToken $accessToken
  $consumption = @($movements.items | Where-Object {
    $_.movementType -eq 'POS_SALE_CONSUMED' -and [string]$_.sourceId -eq $saleId
  })
  if ($consumption.Count -ne 1 -or [long]$consumption[0].quantity -ne 1) {
    throw 'The immutable POS inventory consumption was not found exactly once.'
  }
} catch {
  $primaryFailure = $_
} finally {
  try {
    $positionForCleanup = Invoke-Api -Method GET -Path "/api/v1/admin/inventory/products/$($product.productId)" -AccessToken $accessToken
    $surplus = [long]$positionForCleanup.item.onHand - $originalOnHand
    if ($surplus -gt 0) {
      Invoke-Api -Method POST -Path "/api/v1/admin/inventory/products/$($product.productId)/adjustments" `
        -AccessToken $accessToken -IdempotencyKey "${runId}:cleanup-stock" -Body @{
          direction = 'NEGATIVE'
          investigationReference = $runId
          quantity = $surplus
          reason = 'Restore stock after remote acceptance interruption'
        } | Out-Null
    } elseif ($surplus -lt 0) {
      $cleanupFailures.Add('Inventory is below its original on-hand projection.')
    }
  } catch { $cleanupFailures.Add("Stock cleanup failed: $($_.Exception.Message)") }

  for ($index = $published.Count - 1; $index -ge 0; $index--) {
    $entity = $published[$index]
    try {
      Invoke-Api -Method POST -Path "/api/v1/admin/catalog/$($entity.Segment)/$($entity.Id)/publication-transitions" `
        -AccessToken $accessToken -IdempotencyKey "${runId}:unpublish:$($entity.Kind)" -Body @{ nextStatus = 'UNPUBLISHED' } | Out-Null
    } catch { $cleanupFailures.Add("Could not unpublish $($entity.Kind): $($_.Exception.Message)") }
  }
}

$positionFinal = Invoke-Api -Method GET -Path "/api/v1/admin/inventory/products/$($product.productId)" -AccessToken $accessToken
if ([long]$positionFinal.item.onHand -ne $originalOnHand -or [long]$positionFinal.item.reserved -ne $originalReserved) {
  $cleanupFailures.Add('Final inventory projection does not match the original projection.')
}
if ($cleanupFailures.Count -gt 0) {
  throw "REMOTE_POS_CLEANUP=FAIL :: $($cleanupFailures -join ' | ')"
}
Write-Output 'REMOTE_POS_CLEANUP=PASS'
if ($null -ne $primaryFailure) { throw $primaryFailure }
if (-not $saleCompleted) { throw 'The remote POS sale was not completed.' }
Write-Output "ACCEPTANCE_RUN_ID=$runId"
Write-Output 'REMOTE_POS_ACCEPTANCE=PASS'
