param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPath,

    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Decode-Utf8Message {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Value))
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$templateRoot = Join-Path $repoRoot "templates\\project-starter"
$resolvedTarget = [System.IO.Path]::GetFullPath($TargetPath)

if (-not (Test-Path -LiteralPath $templateRoot)) {
    throw ((Decode-Utf8Message "U3RhcnRlciB0ZW1wbGF0ZSDQvdC1INC90LDQudC00LXQvTog") + $templateRoot)
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
            Write-Host ((Decode-Utf8Message "0L/RgNC+0L/Rg9GB0Log") + $relative)
            continue
        }

        Copy-Item -LiteralPath $item.FullName -Destination $destination -Force
        Write-Host ((Decode-Utf8Message "0LrQvtC/0LjRjyA=") + $relative)
    }
}

Copy-StarterTree -SourceRoot $templateRoot -DestinationRoot $resolvedTarget -Overwrite:$Force

Write-Host ""
Write-Host ((Decode-Utf8Message "U3RhcnRlciDRgdC60L7Qv9C40YDQvtCy0LDQvSDQsjog") + $resolvedTarget)
Write-Host (Decode-Utf8Message "0JTQsNC70YzRiNC1Og==")
Write-Host (Decode-Utf8Message "MS4g0JfQsNC/0L7Qu9C90LjRgtGMIG1lbW9yeVxNRU1PUlkubWQ=")
Write-Host (Decode-Utf8Message "Mi4g0JfQsNC/0L7Qu9C90LjRgtGMIGRldmVsb3BcSU1QTEVNRU5UQVRJT05fUExBTi5tZCDQuCBkZXZlbG9wXExPQ0FMX1JVTkJPT0subWQ=")
Write-Host (Decode-Utf8Message "My4g0JfQsNC/0L7Qu9C90LjRgtGMIGRldmVsb3BcVE9ETy5tZCDQuCBkZXZlbG9wXENIRUNLUE9JTlQubWQ=")
Write-Host (Decode-Utf8Message "NC4g0JTQvtCx0LDQstC40YLRjCDQv9C10YDQstGL0LkgY2hlY2twb2ludCBzcGVjINC/0L7QtCBkZXZlbG9wXHN0YWdlc1w=")
Write-Host (Decode-Utf8Message "NS4g0J7QsdC90L7QstC40YLRjCBBR0VOVFMubWQg0L/QvtC0INC60L7QvdC60YDQtdGC0L3Ri9C5INC/0YDQvtC10LrRgg==")
Write-Host (Decode-Utf8Message "Ni4g0J/RgNC+0LLQtdGA0LjRgtGMIC5jbGF1ZGVccnVsZXNccHJvamVjdC1jaGVja2xpc3QubWQg0LggLmN1cnNvclxydWxlc1xwcm9qZWN0LWNhbm9uLm1kYw==")
