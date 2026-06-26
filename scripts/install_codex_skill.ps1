param(
    [string]$SkillName = "source-of-truth-onboarding",
    [string]$CodexHome,
    [string]$RepoRoot,
    [switch]$Force,
    [switch]$WhatIfOnly
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

if (-not $CodexHome) {
    if ($env:CODEX_HOME) {
        $CodexHome = $env:CODEX_HOME
    } else {
        $CodexHome = Join-Path $env:USERPROFILE ".codex"
    }
}

$repoRootFull = [System.IO.Path]::GetFullPath($RepoRoot)
$codexHomeFull = [System.IO.Path]::GetFullPath($CodexHome)
$sourceSkill = Join-Path $repoRootFull "skills\$SkillName"
$sourceSkillMd = Join-Path $sourceSkill "SKILL.md"
$targetSkillsRoot = Join-Path $codexHomeFull "skills"
$targetSkill = Join-Path $targetSkillsRoot $SkillName
$backupRoot = Join-Path $codexHomeFull "backups\source-of-truth-skills"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupRoot "$SkillName-$timestamp"
$evidenceRoot = Join-Path $repoRootFull "output\install-evidence"
$evidencePath = Join-Path $evidenceRoot "$timestamp-$SkillName.md"

if (-not (Test-Path -LiteralPath $sourceSkillMd -PathType Leaf)) {
    throw "Source skill not found: $sourceSkillMd"
}

$targetSkillsRootFull = [System.IO.Path]::GetFullPath($targetSkillsRoot)
$targetSkillFull = [System.IO.Path]::GetFullPath($targetSkill)

if (-not $targetSkillFull.StartsWith($targetSkillsRootFull + [System.IO.Path]::DirectorySeparatorChar)) {
    throw "Refusing to install outside Codex skills root: $targetSkillFull"
}

$exists = Test-Path -LiteralPath $targetSkill

Write-Output "Codex skill install"
Write-Output "Skill: $SkillName"
Write-Output "Source: $sourceSkill"
Write-Output "Target: $targetSkill"
Write-Output "Backup: $(if ($exists) { $backupPath } else { 'not needed' })"

if ($WhatIfOnly) {
    Write-Output "WhatIfOnly: no files written"
    exit 0
}

if ($exists -and (-not $Force)) {
    Write-Output "Target already exists. Re-run with -Force to update after reviewing the target."
    exit 1
}

if (-not (Test-Path -LiteralPath $targetSkillsRoot)) {
    New-Item -ItemType Directory -Path $targetSkillsRoot | Out-Null
}

if ($exists) {
    if (-not (Test-Path -LiteralPath $backupRoot)) {
        New-Item -ItemType Directory -Path $backupRoot | Out-Null
    }

    Copy-Item -LiteralPath $targetSkill -Destination $backupPath -Recurse -Force
    Remove-Item -LiteralPath $targetSkill -Recurse -Force
}

Copy-Item -LiteralPath $sourceSkill -Destination $targetSkill -Recurse -Force

$installedReferences = Join-Path $targetSkill "references"
if (-not (Test-Path -LiteralPath $installedReferences)) {
    New-Item -ItemType Directory -Path $installedReferences | Out-Null
}

$installStatePath = Join-Path $installedReferences "install-state.md"
$installState = @"
# Install State

- skill: $SkillName
- source_repo: $repoRootFull
- source_skill: $sourceSkill
- installed_to: $targetSkillFull
- installed_at: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")
- backup_path: $(if ($exists) { $backupPath } else { "none" })

"@

Set-Content -Encoding UTF8 -LiteralPath $installStatePath -Value $installState

if (-not (Test-Path -LiteralPath $evidenceRoot)) {
    New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
}

$evidence = @"
# Skill Install Evidence

Status: DONE
Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")

## Input

- skill: $SkillName
- source: $sourceSkill
- target: $targetSkill
- force: $Force

## Backup

- path: $(if ($exists) { $backupPath } else { "none" })

## Verification

- source SKILL.md exists: yes
- installed SKILL.md exists: $(if (Test-Path -LiteralPath (Join-Path $targetSkill "SKILL.md") -PathType Leaf) { "yes" } else { "no" })
- install state exists: $(if (Test-Path -LiteralPath $installStatePath -PathType Leaf) { "yes" } else { "no" })

"@

Set-Content -Encoding UTF8 -LiteralPath $evidencePath -Value $evidence

Write-Output "Installed: $targetSkill"
Write-Output "Evidence: $evidencePath"
exit 0
