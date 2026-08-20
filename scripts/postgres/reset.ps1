. (Join-Path $PSScriptRoot 'common.ps1')

Stop-LocalPostgres
$resolvedRepository = (Resolve-Path -LiteralPath $script:RepositoryRoot).Path
$resolvedRuntime = (Resolve-Path -LiteralPath $script:RuntimeRoot).Path
if (-not $resolvedRuntime.StartsWith(
  $resolvedRepository + [IO.Path]::DirectorySeparatorChar,
  [StringComparison]::OrdinalIgnoreCase
)) {
  throw 'Refusing to reset a data directory outside the project workspace.'
}
if (Test-Path -LiteralPath $script:DataDirectory) {
  Remove-Item -Recurse -Force -LiteralPath $script:DataDirectory
}
if (Test-Path -LiteralPath $script:ProvisionedMarker) {
  Remove-Item -Force -LiteralPath $script:ProvisionedMarker
}

& (Join-Path $PSScriptRoot 'prepare.ps1')
