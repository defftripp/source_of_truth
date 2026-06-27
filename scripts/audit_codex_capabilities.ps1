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
$pluginCacheRoot = Join-Path $CodexHome "plugins\cache"

function Test-FileExists {
    param([string]$Path)
    return (Test-Path -LiteralPath $Path -PathType Leaf)
}

function Test-ConfigSection {
    param(
        [string]$Text,
        [string]$SectionHeader,
        [switch]$RequireEnabled
    )

    if (-not $Text) {
        return $false
    }

    $escapedHeader = [regex]::Escape($SectionHeader)
    $match = [regex]::Match($Text, "(?ms)^\s*$escapedHeader\s*\r?\n(?<body>.*?)(?=^\s*\[|\z)")
    if (-not $match.Success) {
        return $false
    }

    if ($RequireEnabled) {
        return ($match.Groups["body"].Value -match '(?m)^\s*enabled\s*=\s*true\s*$')
    }

    return $true
}

function Test-PluginCache {
    param($Check)

    if (-not (Test-Path -LiteralPath $pluginCacheRoot -PathType Container)) {
        return $false
    }

    $marketplaces = @()
    if (Test-JsonValue -Object $Check -Name "marketplace") {
        $marketplaces = @([string]$Check.marketplace)
    } else {
        $marketplaces = @(Get-ChildItem -LiteralPath $pluginCacheRoot -Directory | ForEach-Object { $_.Name })
    }

    foreach ($marketplace in $marketplaces) {
        $pluginRoot = Join-Path $pluginCacheRoot (Join-Path $marketplace $Check.name)
        if (-not (Test-Path -LiteralPath $pluginRoot -PathType Container)) {
            continue
        }

        $pluginJson = Get-ChildItem -LiteralPath $pluginRoot -Recurse -File -Filter "plugin.json" |
            Where-Object { $_.FullName -like "*\.codex-plugin\plugin.json" } |
            Select-Object -First 1

        if ($pluginJson) {
            return $true
        }
    }

    return $false
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
            return Test-ConfigSection -Text $configText -SectionHeader "[mcp_servers.$($Check.name)]"
        }
        "plugin_config" {
            return Test-ConfigSection -Text $configText -SectionHeader "[plugins.`"$($Check.name)`"]" -RequireEnabled
        }
        "plugin_cache" {
            return Test-PluginCache -Check $Check
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
        "plugin_cache" {
            if (Test-JsonValue -Object $Check -Name "marketplace") {
                return "plugin_cache:$($Check.marketplace)/$($Check.name)"
            }
            return "plugin_cache:$($Check.name)"
        }
        default { return "$($Check.kind)" }
    }
}

function Test-JsonValue {
    param(
        $Object,
        [string]$Name
    )

    if (-not $Object.PSObject.Properties[$Name]) {
        return $false
    }

    $value = $Object.$Name
    if ($null -eq $value) {
        return $false
    }

    return (-not [string]::IsNullOrWhiteSpace([string]$value))
}

function Test-CapabilitySources {
    param($Capability)

    $problems = @()

    if (-not $Capability.PSObject.Properties["sources"]) {
        return @("source:sources[] missing")
    }

    if ($null -eq $Capability.sources) {
        return @("source:sources[] empty")
    }

    $sources = @($Capability.sources | Where-Object { $null -ne $_ })
    if ($sources.Count -eq 0) {
        return @("source:sources[] empty")
    }

    $index = 0
    foreach ($source in $sources) {
        $index += 1

        foreach ($requiredField in @("kind", "authority", "install_mode")) {
            if (-not (Test-JsonValue -Object $source -Name $requiredField)) {
                $problems += "source[$index]:missing $requiredField"
            }
        }

        $hasLocator = (Test-JsonValue -Object $source -Name "ref") -or
            (Test-JsonValue -Object $source -Name "url") -or
            (Test-JsonValue -Object $source -Name "package") -or
            (Test-JsonValue -Object $source -Name "target")

        if (-not $hasLocator) {
            $problems += "source[$index]:missing locator"
        }

        if ((Test-JsonValue -Object $source -Name "install_mode") -and $source.install_mode -eq "ad_hoc") {
            $problems += "source[$index]:ad_hoc install_mode forbidden"
        }
    }

    return $problems
}

$results = @()

foreach ($capability in $registry.capabilities) {
    $missing = @()
    $sourceProblems = @(Test-CapabilitySources -Capability $capability)

    foreach ($check in $capability.checks) {
        if (-not (Test-CapabilityCheck -Check $check)) {
            $missing += (Get-CheckLabel -Check $check)
        }
    }

    $allProblems = @($missing + $sourceProblems)
    $status = "PASS"
    if ($allProblems.Count -gt 0) {
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
        Missing = ($allProblems -join ", ")
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
