param(
    [Parameter(Mandatory=$true)][string]$Name
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$RegistryPath = Join-Path $Root 'codex-system\EXTERNAL-SKILLS.json'
$StatePath = Join-Path $Root '.codex-mission\STATE.json'
$Registry = Get-Content -Raw $RegistryPath | ConvertFrom-Json
$State = Get-Content -Raw $StatePath | ConvertFrom-Json
$Skill = $Registry.skills | Where-Object { $_.name -eq $Name } | Select-Object -First 1
if (-not $Skill) { throw "External skill '$Name' is not registered." }
if ($Skill.status -ne 'APPROVED_ON_DEMAND') { throw "External skill '$Name' is not approved on demand (status=$($Skill.status))." }
if ($Skill.allowedStages -and ($Skill.allowedStages -notcontains $State.currentStageId)) { throw "External skill '$Name' is not allowed in stage $($State.currentStageId)." }
$Runtime = Join-Path $Root '.runtime\codex'
$Cache = Join-Path $Runtime 'awesome-codex-skills'
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
if (Test-Path $Cache) { Remove-Item -Recurse -Force $Cache }
git clone --quiet --no-checkout --filter=blob:none $Registry.source.repository $Cache
if ($LASTEXITCODE -ne 0) { throw 'Unable to clone external skill source.' }
git -C $Cache fetch --quiet --depth 1 origin $Registry.source.pinnedCommit
if ($LASTEXITCODE -ne 0) { throw 'Unable to fetch pinned external skill commit.' }
git -C $Cache checkout --quiet --detach $Registry.source.pinnedCommit
if ($LASTEXITCODE -ne 0) { throw 'Unable to checkout pinned external skill commit.' }
$Head = (git -C $Cache rev-parse HEAD).Trim()
if ($Head -ne $Registry.source.pinnedCommit) { throw "Pinned commit mismatch: $Head" }
$Source = Join-Path $Cache ($Skill.path -replace '/', '\')
if (-not (Test-Path (Join-Path $Source 'SKILL.md'))) { throw 'Registered external skill has no SKILL.md at pinned commit.' }
foreach ($Prop in $Skill.expectedBlobs.PSObject.Properties) {
    $Rel = $Prop.Name
    $Expected = [string]$Prop.Value
    $File = Join-Path $Source ($Rel -replace '/', '\')
    if (-not (Test-Path $File)) { throw "Missing pinned skill file: $Rel" }
    $Actual = (git -C $Cache hash-object ($File)).Trim()
    if ($Actual -ne $Expected) { throw "Blob mismatch for $Rel. expected=$Expected actual=$Actual" }
}
$Scan = Get-ChildItem -Recurse -File $Source | Where-Object { $_.Extension -in '.md','.ps1','.py','.js','.mjs','.ts','.json','.sh' }
$Blocked = @('Invoke-Expression','Remove-Item\s+-Recurse\s+-Force\s+[^$]','rm\s+-rf\s+/','curl[^\r\n]*\|\s*(bash|sh)','composio\s+login','gh\s+auth\s+login')
foreach ($File in $Scan) {
    $Text = Get-Content -Raw $File.FullName
    foreach ($Pattern in $Blocked) {
        if ($Text -match $Pattern) { throw "Safety scan blocked $($File.FullName) pattern=$Pattern" }
    }
}
$DestRoot = Join-Path $Root '.agents\skills'
$Dest = Join-Path $DestRoot $Name
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
New-Item -ItemType Directory -Force -Path $DestRoot | Out-Null
Copy-Item -Recurse -Force $Source $Dest
$Provenance = [ordered]@{ repository=$Registry.source.repository; pinnedCommit=$Registry.source.pinnedCommit; sourcePath=$Skill.path; installedAt=(Get-Date).ToString('o') }
$Provenance | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $Dest '.sergod-external-source.json')
Write-Host "EXTERNAL_SKILL=PASS name=$Name commit=$Head"
Write-Host 'Codex may read the installed SKILL.md explicitly now; automatic discovery depends on the running Codex version.'
