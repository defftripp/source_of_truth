param(
    [string]$CodexHome,
    [string]$RepoRoot
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

$registryPath = Join-Path $RepoRoot "registries\capabilities.json"
if (-not (Test-Path -LiteralPath $registryPath)) {
    throw "Capability registry not found: $registryPath"
}

$registry = Get-Content -Encoding UTF8 -Raw -LiteralPath $registryPath | ConvertFrom-Json
$configPath = Join-Path $CodexHome "config.toml"
$configText = ""
if (Test-Path -LiteralPath $configPath) {
    $configText = Get-Content -Encoding UTF8 -Raw -LiteralPath $configPath
}

$agentsHome = Join-Path $env:USERPROFILE ".agents"

function Test-FileExists {
    param([string]$Path)
    return (Test-Path -LiteralPath $Path -PathType Leaf)
}

function Test-ConfigSection {
    param(
        [string]$Text,
        [string]$SectionRegex,
        [switch]$RequireEnabled
    )

    if (-not $Text) {
        return $false
    }

    $match = [regex]::Match($Text, "(?ms)^$SectionRegex\s*`$([\s\S]*?)(?=^\[|\z)")
    if (-not $match.Success) {
        return $false
    }

    if ($RequireEnabled) {
        return ($match.Value -match '(?m)^\s*enabled\s*=\s*true\s*$')
    }

    return $true
}

function Test-CapabilityCheck {
    param($Check)

    switch ($Check.kind) {
        "repo_path" {
            return Test-FileExists (Join-Path $RepoRoot $Check.path)
        }
        "installed_skill" {
            return Test-FileExists (Join-Path $CodexHome "skills\$($Check.name)\SKILL.md")
        }
        "skill_dir" {
            return Test-FileExists (Join-Path $CodexHome "skills\$($Check.name)\SKILL.md")
        }
        "agent_skill" {
            return Test-FileExists (Join-Path $agentsHome "skills\$($Check.name)\SKILL.md")
        }
        "system_skill" {
            return Test-FileExists (Join-Path $CodexHome "skills\.system\$($Check.name)\SKILL.md")
        }
        "mcp_server" {
            $name = [regex]::Escape([string]$Check.name)
            return Test-ConfigSection -Text $configText -SectionRegex "\[mcp_servers\.$name\]"
        }
        "plugin_config" {
            $name = [regex]::Escape([string]$Check.name)
            return Test-ConfigSection -Text $configText -SectionRegex "\[plugins\.`"$name`"\]" -RequireEnabled
        }
        default {
            throw "Unknown capability check kind: $($Check.kind)"
        }
    }
}

function Get-CheckLabel {
    param($Check)

    switch ($Check.kind) {
        "repo_path" { return "repo_path:$($Check.path)" }
        "installed_skill" { return "installed_skill:$($Check.name)" }
        "skill_dir" { return "skill:$($Check.name)" }
        "agent_skill" { return "agent_skill:$($Check.name)" }
        "system_skill" { return "system_skill:$($Check.name)" }
        "mcp_server" { return "mcp:$($Check.name)" }
        "plugin_config" { return "plugin:$($Check.name)" }
        default { return "$($Check.kind)" }
    }
}

$results = @()

foreach ($capability in $registry.capabilities) {
    $missing = @()

    foreach ($check in $capability.checks) {
        if (-not (Test-CapabilityCheck -Check $check)) {
            $missing += (Get-CheckLabel -Check $check)
        }
    }

    $status = "PASS"
    if ($missing.Count -gt 0) {
        if ($capability.tier -eq "required" -and $capability.lifecycle -eq "active") {
            $status = "BLOCKED"
        } else {
            $status = "WARN"
        }
    }

    $results += [PSCustomObject]@{
        Status = $status
        Tier = $capability.tier
        Id = $capability.id
        Lifecycle = $capability.lifecycle
        Missing = ($missing -join ", ")
        Reason = $capability.reason
    }
}

$blocked = @($results | Where-Object { $_.Status -eq "BLOCKED" })
$warn = @($results | Where-Object { $_.Status -eq "WARN" })
$pass = @($results | Where-Object { $_.Status -eq "PASS" })

Write-Output "Codex capability audit"
Write-Output "RepoRoot: $RepoRoot"
Write-Output "CodexHome: $CodexHome"
Write-Output "Registry: $registryPath"
Write-Output ""

$results | Sort-Object Status, Tier, Id | Format-Table Status, Tier, Id, Lifecycle, Missing -AutoSize | Out-String -Width 220 | Write-Output

Write-Output "Summary: PASS=$($pass.Count) WARN=$($warn.Count) BLOCKED=$($blocked.Count)"

if ($blocked.Count -gt 0) {
    Write-Output ""
    Write-Output "Blocked capabilities:"
    foreach ($item in $blocked) {
        Write-Output "- $($item.Id): missing $($item.Missing)"
    }
    exit 2
}

exit 0
