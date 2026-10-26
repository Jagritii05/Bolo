# LocalPill: LOC Benchmark Script
# Measures non-blank, non-comment lines of code for REST baseline vs. Graftcode integration

param(
    [switch]$JsonOnly
)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Count-Loc {
    param(
        [string]$FilePath
    )

    if (-not (Test-Path $FilePath)) {
        return @{ Total = 0; Blank = 0; Comment = 0; Code = 0 }
    }

    $lines = Get-Content $FilePath
    $total = $lines.Count
    $blank = 0
    $comment = 0
    $code = 0
    $inBlockComment = $false
    $ext = [System.IO.Path]::GetExtension($FilePath).ToLower()

    foreach ($line in $lines) {
        $trimmed = $line.Trim()

        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            $blank++
            continue
        }

        # Python block comments
        if ($ext -eq ".py") {
            if ($trimmed.StartsWith('"""') -or $trimmed.StartsWith("'''")) {
                if ($trimmed.Length -gt 3 -and ($trimmed.EndsWith('"""') -or $trimmed.EndsWith("'''")) -and $trimmed.Substring(3).Contains($trimmed.Substring(0, 3))) {
                    $comment++
                    continue
                }
                $inBlockComment = -not $inBlockComment
                $comment++
                continue
            }
            if ($inBlockComment) {
                $comment++
                continue
            }
            if ($trimmed.StartsWith("#")) {
                $comment++
                continue
            }
        }

        # JavaScript block comments
        if ($ext -eq ".js" -or $ext -eq ".cjs" -or $ext -eq ".mjs") {
            if ($trimmed.StartsWith("/*")) {
                if ($trimmed.EndsWith("*/") -and $trimmed.Length -gt 2) {
                    $comment++
                    continue
                }
                $inBlockComment = $true
                $comment++
                continue
            }
            if ($inBlockComment) {
                if ($trimmed.EndsWith("*/") -or $trimmed.Contains("*/")) {
                    $inBlockComment = $false
                }
                $comment++
                continue
            }
            if ($trimmed.StartsWith("//")) {
                $comment++
                continue
            }
        }

        $code++
    }

    return @{
        Total   = $total
        Blank   = $blank
        Comment = $comment
        Code    = $code
    }
}

$restFiles = @(
    "legacy-rest/asr_server_rest.py",
    "src/main/rest/rest-speech-client.js"
)

$graftFiles = @(
    "services/speech_gateway/index.js",
    "src/main/graft/adapter.js",
    "src/main/graft/graft-speech-client.js"
)

$restDetails = @()
$restTotalCode = 0
foreach ($rel in $restFiles) {
    $full = Join-Path $ProjectRoot $rel
    $stats = Count-Loc -FilePath $full
    $restTotalCode += $stats.Code
    $restDetails += [PSCustomObject]@{
        File    = $rel
        Total   = $stats.Total
        Code    = $stats.Code
        Comment = $stats.Comment
        Blank   = $stats.Blank
    }
}

$graftDetails = @()
$graftTotalCode = 0
foreach ($rel in $graftFiles) {
    $full = Join-Path $ProjectRoot $rel
    $stats = Count-Loc -FilePath $full
    $graftTotalCode += $stats.Code
    $graftDetails += [PSCustomObject]@{
        File    = $rel
        Total   = $stats.Total
        Code    = $stats.Code
        Comment = $stats.Comment
        Blank   = $stats.Blank
    }
}

$locDiff = $restTotalCode - $graftTotalCode
$pctReduction = 0
if ($restTotalCode -gt 0) {
    $pctReduction = [Math]::Round((($restTotalCode - $graftTotalCode) / $restTotalCode) * 100, 1)
}

$result = [PSCustomObject]@{
    rest = [PSCustomObject]@{
        files = $restDetails
        totalCodeLoc = $restTotalCode
    }
    graft = [PSCustomObject]@{
        files = $graftDetails
        totalCodeLoc = $graftTotalCode
    }
    comparison = [PSCustomObject]@{
        restLoc = $restTotalCode
        graftLoc = $graftTotalCode
        delta = $locDiff
        reductionPct = $pctReduction
    }
}

if ($JsonOnly) {
    $result | ConvertTo-Json -Depth 5
} else {
    Write-Host "`n=======================================================" -ForegroundColor Cyan
    Write-Host "           LOCALPILL INTEGRATION LOC BENCHMARK          " -ForegroundColor Cyan
    Write-Host "=======================================================" -ForegroundColor Cyan

    Write-Host "`n[1] REST Baseline Files (Hand-written HTTP plumbing):" -ForegroundColor Yellow
    $restDetails | Format-Table -AutoSize

    Write-Host "[2] Graftcode Integration Files (RPC adapter & facade):" -ForegroundColor Green
    $graftDetails | Format-Table -AutoSize

    Write-Host "-------------------------------------------------------"
    Write-Host "REST Total Code LOC:      $restTotalCode" -ForegroundColor Yellow
    Write-Host "Graftcode Total Code LOC: $graftTotalCode" -ForegroundColor Green
    Write-Host "LOC Difference (Delta):   $locDiff lines eliminated" -ForegroundColor Cyan
    Write-Host "Plumbing Reduction:       $pctReduction%" -ForegroundColor Cyan
    Write-Host "=======================================================`n"
}
