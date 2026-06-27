param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPath,

    [switch]$Json
)

$ErrorActionPreference = "Stop"

function Test-RelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,

        [Parameter(Mandatory = $true)]
        [string]$RelativePath,

        [ValidateSet("File", "Directory")]
        [string]$Kind = "File"
    )

    $path = Join-Path $Root $RelativePath
    if ($Kind -eq "Directory") {
        return (Test-Path -LiteralPath $path -PathType Container)
    }

    return (Test-Path -LiteralPath $path -PathType Leaf)
}

function Read-TextIfExists {
    param(
        [string]$Root,
        [string]$RelativePath
    )

    $path = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        return ""
    }

    return Get-Content -Encoding UTF8 -Raw -LiteralPath $path
}

$targetFull = [System.IO.Path]::GetFullPath($TargetPath)

if (-not (Test-Path -LiteralPath $targetFull -PathType Container)) {
    Write-Output "BLOCKED: target project does not exist: $targetFull"
    exit 2
}

$requiredFiles = @(
    "AGENTS.md",
    "docs/DECISIONS.md",
    "docs/ARCHITECTURE.md",
    "memory/MEMORY.md",
    "memory/SESSION-HANDOFF.md",
    "memory/QUESTIONS.md",
    "memory/LESSONS.md",
    "develop/README.md",
    "develop/IMPLEMENTATION_PLAN.md",
    "develop/LOCAL_RUNBOOK.md",
    "develop/TODO.md",
    "develop/CHECKPOINT.md",
    "rules/agent-workflow.mdc",
    "rules/project-structure.mdc",
    "rules/testing-and-evidence.mdc",
    "rules/skill-installation.mdc",
    "rules/no-overcoding.mdc",
    "hooks/README.md",
    "hooks/session-start.md",
    "hooks/pre-implementation-check.md",
    "hooks/fix-to-rule.md",
    "agents/README.md"
)

$requiredDirs = @(
    "develop/stages",
    "develop/artifacts",
    "work",
    "archive"
)

$alternativeFiles = @(
    [PSCustomObject]@{
        Id = "product-direction"
        Paths = @("docs/PRODUCT_DIRECTION.md", "docs/PRD.md")
    },
    [PSCustomObject]@{
        Id = "skills-registry"
        Paths = @("docs/SKILLS.md", "develop/SKILL_REGISTRY.md")
    }
)

$missing = @()
$present = @()

foreach ($relativePath in $requiredFiles) {
    if (Test-RelativePath -Root $targetFull -RelativePath $relativePath -Kind File) {
        $present += $relativePath
    } else {
        $missing += $relativePath
    }
}

foreach ($relativePath in $requiredDirs) {
    if (Test-RelativePath -Root $targetFull -RelativePath $relativePath -Kind Directory) {
        $present += "$relativePath/"
    } else {
        $missing += "$relativePath/"
    }
}

foreach ($group in $alternativeFiles) {
    $found = $false
    foreach ($relativePath in $group.Paths) {
        if (Test-RelativePath -Root $targetFull -RelativePath $relativePath -Kind File) {
            $found = $true
            $present += $relativePath
        }
    }

    if (-not $found) {
        $missing += "$($group.Id): one of [$($group.Paths -join ', ')]"
    }
}

$needsContext = @()
$placeholderPatterns = @(
    "заполнить",
    "YYYY-MM-DD",
    "TBD",
    "<initiative>",
    "<checkpoint",
    "Что должно стать правдой",
    "question:",
    "blocker:"
)

$contentFiles = @(
    "memory/MEMORY.md",
    "memory/SESSION-HANDOFF.md",
    "memory/QUESTIONS.md",
    "docs/PRODUCT_DIRECTION.md",
    "docs/PRD.md",
    "docs/ARCHITECTURE.md",
    "docs/SKILLS.md",
    "develop/IMPLEMENTATION_PLAN.md",
    "develop/CHECKPOINT.md",
    "develop/LOCAL_RUNBOOK.md"
)

foreach ($relativePath in $contentFiles) {
    $text = Read-TextIfExists -Root $targetFull -RelativePath $relativePath
    if (-not $text) {
        continue
    }

    foreach ($pattern in $placeholderPatterns) {
        if ($text -like "*$pattern*") {
            $needsContext += "$relativePath contains placeholder marker '$pattern'"
            break
        }
    }
}

$questions = Read-TextIfExists -Root $targetFull -RelativePath "memory/QUESTIONS.md"
if ($questions -match "(?im)blocking\s*:\s*yes") {
    $needsContext += "memory/QUESTIONS.md contains blocking questions"
}

$skillsRegistry = Read-TextIfExists -Root $targetFull -RelativePath "docs/SKILLS.md"
if (-not $skillsRegistry) {
    $skillsRegistry = Read-TextIfExists -Root $targetFull -RelativePath "develop/SKILL_REGISTRY.md"
}

if ($skillsRegistry -and $skillsRegistry -notmatch "(?im)source|provenance|источник") {
    $needsContext += "skills registry does not mention capability sources/provenance"
}

$warnings = @()
if (Test-RelativePath -Root $targetFull -RelativePath ".env" -Kind File) {
    $warnings += ".env exists; do not commit or quote secrets"
}

if (Test-RelativePath -Root $targetFull -RelativePath "public" -Kind Directory) {
    $warnings += "public/ exists; treat as generated unless project canon says otherwise"
}

$status = "READY_FOR_IMPLEMENTATION"
$exitCode = 0

if ($missing.Count -gt 0 -or $needsContext.Count -gt 0) {
    $status = "NEEDS_CONTEXT"
    $exitCode = 1
}

$result = [PSCustomObject]@{
    Status = $status
    TargetPath = $targetFull
    PresentCount = $present.Count
    Missing = $missing
    NeedsContext = $needsContext
    Warnings = $warnings
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
} else {
    Write-Output "Source-of-truth readiness audit"
    Write-Output "Target: $targetFull"
    Write-Output "Status: $status"
    Write-Output ""

    if ($missing.Count -gt 0) {
        Write-Output "Missing:"
        foreach ($item in $missing) {
            Write-Output "- $item"
        }
        Write-Output ""
    }

    if ($needsContext.Count -gt 0) {
        Write-Output "Needs context:"
        foreach ($item in $needsContext) {
            Write-Output "- $item"
        }
        Write-Output ""
    }

    if ($warnings.Count -gt 0) {
        Write-Output "Warnings:"
        foreach ($item in $warnings) {
            Write-Output "- $item"
        }
        Write-Output ""
    }

    if ($status -eq "READY_FOR_IMPLEMENTATION") {
        Write-Output "Ready: required operating files exist and no blocking placeholders were detected."
    }
}

exit $exitCode
