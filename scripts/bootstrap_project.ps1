param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPath,

    [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$templateRoot = Join-Path $repoRoot "templates\\project-starter"
$resolvedTarget = [System.IO.Path]::GetFullPath($TargetPath)

if (-not (Test-Path -LiteralPath $templateRoot)) {
    throw "Starter template not found: $templateRoot"
}

if (-not (Test-Path -LiteralPath $resolvedTarget)) {
    New-Item -ItemType Directory -Path $resolvedTarget | Out-Null
}

function Copy-StarterTree {
    param(
        [string]$SourceRoot,
        [string]$DestinationRoot,
        [switch]$Overwrite
    )

    $items = Get-ChildItem -LiteralPath $SourceRoot -Recurse -Force

    foreach ($item in $items) {
        $relative = $item.FullName.Substring($SourceRoot.Length).TrimStart('\')
        $destination = Join-Path $DestinationRoot $relative

        if ($item.PSIsContainer) {
            if (-not (Test-Path -LiteralPath $destination)) {
                New-Item -ItemType Directory -Path $destination | Out-Null
            }
            continue
        }

        $destinationDir = Split-Path -Parent $destination
        if (-not (Test-Path -LiteralPath $destinationDir)) {
            New-Item -ItemType Directory -Path $destinationDir | Out-Null
        }

        if ((Test-Path -LiteralPath $destination) -and (-not $Overwrite)) {
            Write-Host "skip $relative"
            continue
        }

        Copy-Item -LiteralPath $item.FullName -Destination $destination -Force
        Write-Host "copy $relative"
    }
}

Copy-StarterTree -SourceRoot $templateRoot -DestinationRoot $resolvedTarget -Overwrite:$Force

Write-Host ""
Write-Host "Starter copied into: $resolvedTarget"
Write-Host "Next:"
Write-Host "1. Fill in memory\\MEMORY.md"
Write-Host "2. Update AGENTS.md for the project"
Write-Host "3. Review .claude\\rules\\project-checklist.md"
