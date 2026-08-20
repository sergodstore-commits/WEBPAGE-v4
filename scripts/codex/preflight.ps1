Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $RepositoryRoot
$script:Failed = $false

function Result([string]$Name, [bool]$Ok, [string]$Detail) {
  $state = if ($Ok) { 'PASS' } else { 'FAIL' }
  Write-Output ("{0}={1} :: {2}" -f $Name, $state, $Detail)
  if (-not $Ok) { $script:Failed = $true }
}

function CommandPath([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $cmd) { return $null }
  return $cmd.Source
}

$git = CommandPath 'git'; $node = CommandPath 'node'; $npm = CommandPath 'npm'
Result 'TOOL_GIT' ($null -ne $git) ($(if ($git) { $git } else { 'missing' }))
Result 'TOOL_NODE' ($null -ne $node) ($(if ($node) { $node } else { 'missing' }))
Result 'TOOL_NPM' ($null -ne $npm) ($(if ($npm) { $npm } else { 'missing' }))

if ($node) { $v=(& node --version).Trim(); Result 'NODE_MAJOR_24' ($v -match '^v24\.') $v }
if ($npm) { $v=(& npm --version).Trim(); Result 'NPM_MAJOR_11' ($v -match '^11\.') $v }

if ($git) {
  $inside=(& git rev-parse --is-inside-work-tree 2>$null).Trim()
  Result 'GIT_REPOSITORY' ($inside -eq 'true') $inside
  if ($inside -eq 'true') {
    $branch=(& git branch --show-current).Trim(); Result 'GIT_BRANCH_MAIN' ($branch -eq 'main') $branch
    $dirty=@(& git status --porcelain); Result 'GIT_WORKTREE_CLEAN' ($dirty.Count -eq 0) ($(if ($dirty.Count -eq 0) {'clean'} else {"$($dirty.Count) changed path(s)"}))
    $remotes=@(& git remote); Result 'GIT_REMOTE_NONE_INITIAL' ($remotes.Count -eq 0) ($(if ($remotes.Count -eq 0) {'none'} else {($remotes -join ',')}))
  }
}

$targets=Join-Path $RepositoryRoot 'ops\project-targets.json'
Result 'TARGETS_FILE' (Test-Path -LiteralPath $targets -PathType Leaf) ($(if (Test-Path $targets) {'present'} else {'missing'}))
Result 'CURRENT_INDEX' (Test-Path -LiteralPath (Join-Path $RepositoryRoot 'docs\CURRENT\INDEX.md') -PathType Leaf) 'docs/CURRENT/INDEX.md'
Result 'MISSION_STATE' (Test-Path -LiteralPath (Join-Path $RepositoryRoot '.codex-mission\STATE.json') -PathType Leaf) '.codex-mission/STATE.json'

if (Test-Path -LiteralPath (Join-Path $RepositoryRoot '.env')) {
  Write-Output 'LOCAL_ENV_PRESENT=WARN :: .env exists locally and must remain git-ignored; values were not printed.'
} else {
  Write-Output 'LOCAL_ENV_PRESENT=INFO :: absent, expected in clean delivery.'
}

foreach ($optional in @('docker','supabase','vercel','render')) {
  $p=CommandPath $optional
  Write-Output ("OPTIONAL_TOOL_{0}={1}" -f $optional.ToUpperInvariant(), $(if($p){'AVAILABLE'}else{'ABSENT'}))
}

if ($script:Failed) { exit 1 }
Write-Output 'PREFLIGHT=PASS'
