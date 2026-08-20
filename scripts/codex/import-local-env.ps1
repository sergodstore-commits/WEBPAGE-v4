param(
  [Parameter(Mandatory)][string]$SourcePath,
  [switch]$Overwrite
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TargetPath = Join-Path $RepositoryRoot '.env'
$ExamplePath = Join-Path $RepositoryRoot '.env.example'

if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
  throw "Source .env does not exist: $SourcePath"
}
if (-not (Test-Path -LiteralPath $ExamplePath -PathType Leaf)) {
  throw '.env.example is missing.'
}
if ((Test-Path -LiteralPath $TargetPath) -and -not $Overwrite) {
  throw '.env already exists. Use -Overwrite only if replacement is intentional.'
}

function Parse-Env {
  param([string]$Path)
  $map = [ordered]@{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) { continue }
    $index = $trimmed.IndexOf('=')
    if ($index -lt 1) { continue }
    $key = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1)
    $map[$key] = $value
  }
  return $map
}

$allowed = Parse-Env $ExamplePath
$source = Parse-Env $SourcePath
$output = New-Object System.Collections.Generic.List[string]

foreach ($line in Get-Content -LiteralPath $ExamplePath) {
  $trimmed = $line.Trim()
  if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) {
    $output.Add($line)
    continue
  }
  $index = $line.IndexOf('=')
  $key = $line.Substring(0, $index).Trim()
  if ($source.Contains($key)) {
    $output.Add("$key=$($source[$key])")
  } else {
    $output.Add($line)
  }
}

Set-Content -LiteralPath $TargetPath -Encoding utf8 -Value $output
$copied = @($source.Keys | Where-Object { $allowed.Contains($_) }).Count
$ignored = @($source.Keys | Where-Object { -not $allowed.Contains($_) }).Count
Write-Output "ENV_IMPORT=PASS :: copied $copied approved key(s); ignored $ignored unknown key(s); secret values were not printed."
