# ==============================================================================
# scripts/chaos.ps1 — LocalPill Resilience & Chaos Testing Harness
# Simulates mid-session process terminations and verifies supervisor auto-recovery
# ==============================================================================

[CmdletBinding()]
param(
    [int]$TimeoutSeconds = 25
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " LocalPill Chaos & Fault-Tolerance Test" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

function Test-PortListening {
    param([int]$Port, [string]$HostName = "127.0.0.1")
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect($HostName, $Port, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(800, $false)
        if ($wait) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
        return $false
    } catch {
        return $false
    }
}

function Wait-ForPort {
    param([int]$Port, [int]$MaxSeconds = 15)
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $MaxSeconds) {
        if (Test-PortListening -Port $Port) { return $true }
        Start-Sleep -Milliseconds 300
    }
    return $false
}

function Get-ListeningPid {
    param([int]$Port)
    try {
        $netstat = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($netstat) { return $netstat.OwningProcess }
    } catch {}
    return $null
}

# 1. Check if supervisor is running
$gwAPort = 8085
$gwBPort = 8095
$sttPort = 7777

Write-Host "[1/4] Checking active services status..." -ForegroundColor Yellow

$gwARunning = Test-PortListening -Port $gwAPort
$gwBRunning = Test-PortListening -Port $gwBPort
$sttRunning = Test-PortListening -Port $sttPort

Write-Host "  Gateway A (Port $gwAPort): $(if ($gwARunning) {'ONLINE'} else {'OFFLINE'})"
Write-Host "  Gateway B (Port $gwBPort): $(if ($gwBRunning) {'ONLINE'} else {'OFFLINE'})"
Write-Host "  Python STT (Port $sttPort): $(if ($sttRunning) {'ONLINE'} else {'OFFLINE'})"

# If not running, launch supervisor test harness
$supHarness = $null
if (-not ($gwARunning -and $gwBRunning -and $sttRunning)) {
    Write-Host "`nStarting services under test supervisor..." -ForegroundColor Yellow
    $harnessScript = @"
import { supervisor } from './src/main/supervisor.js';
supervisor.startRestServer(7777);
supervisor.startGatewayA(8085, 8086);
supervisor.startGatewayB(8095, 8096);
console.log('[HARNESS] Supervisor active.');
setInterval(() => {}, 1000);
"@
    $harnessFile = Join-Path $ProjectRoot "scratch_chaos_harness.mjs"
    Set-Content -Path $harnessFile -Value $harnessScript -Encoding utf8

    $supHarness = Start-Process node -ArgumentList $harnessFile -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden
    Write-Host "  Spawned supervisor test harness PID: $($supHarness.Id)"

    Write-Host "  Waiting for ports to open..."
    Wait-ForPort -Port $gwAPort -MaxSeconds 15 | Out-Null
    Wait-ForPort -Port $gwBPort -MaxSeconds 15 | Out-Null
    Wait-ForPort -Port $sttPort -MaxSeconds 15 | Out-Null
}

$results = [ordered]@{}

try {
    # ── Test 1: Kill Gateway A ──────────────────────────────────────────────
    Write-Host "`n[2/4] Chaos Test 1: Terminating Gateway A (Port $gwAPort)..." -ForegroundColor Yellow
    $pidA = Get-ListeningPid -Port $gwAPort
    if ($pidA) {
        Write-Host "  Killing Gateway A (PID: $pidA)..."
        Stop-Process -Id $pidA -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 600

        $dead = -not (Test-PortListening -Port $gwAPort)
        Write-Host "  Gateway A terminated: $dead"

        Write-Host "  Waiting for Supervisor to auto-restart Gateway A..."
        $restarted = Wait-ForPort -Port $gwAPort -MaxSeconds 15
        if ($restarted) {
            $newPidA = Get-ListeningPid -Port $gwAPort
            Write-Host "  [OK] Gateway A successfully recovered! New PID: $newPidA" -ForegroundColor Green
            $results["Gateway_A_Recovery"] = "PASSED (New PID: $newPidA)"
        } else {
            Write-Host "  [FAIL] Gateway A failed to recover within timeout." -ForegroundColor Red
            $results["Gateway_A_Recovery"] = "FAILED"
        }
    } else {
        Write-Host "  [SKIP] Could not find PID for Gateway A." -ForegroundColor DarkGray
        $results["Gateway_A_Recovery"] = "SKIPPED"
    }

    # ── Test 2: Kill Gateway B ──────────────────────────────────────────────
    Write-Host "`n[3/4] Chaos Test 2: Terminating Gateway B (Port $gwBPort)..." -ForegroundColor Yellow
    $pidB = Get-ListeningPid -Port $gwBPort
    if ($pidB) {
        Write-Host "  Killing Gateway B (PID: $pidB)..."
        Stop-Process -Id $pidB -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 600

        $dead = -not (Test-PortListening -Port $gwBPort)
        Write-Host "  Gateway B terminated: $dead"

        Write-Host "  Waiting for Supervisor to auto-restart Gateway B..."
        $restarted = Wait-ForPort -Port $gwBPort -MaxSeconds 15
        if ($restarted) {
            $newPidB = Get-ListeningPid -Port $gwBPort
            Write-Host "  [OK] Gateway B successfully recovered! New PID: $newPidB" -ForegroundColor Green
            $results["Gateway_B_Recovery"] = "PASSED (New PID: $newPidB)"
        } else {
            Write-Host "  [FAIL] Gateway B failed to recover within timeout." -ForegroundColor Red
            $results["Gateway_B_Recovery"] = "FAILED"
        }
    } else {
        Write-Host "  [SKIP] Could not find PID for Gateway B." -ForegroundColor DarkGray
        $results["Gateway_B_Recovery"] = "SKIPPED"
    }

    # ── Test 3: Kill Python STT Server ──────────────────────────────────────
    Write-Host "`n[4/4] Chaos Test 3: Terminating Python STT (Port $sttPort)..." -ForegroundColor Yellow
    $pidSTT = Get-ListeningPid -Port $sttPort
    if ($pidSTT) {
        Write-Host "  Killing Python STT (PID: $pidSTT)..."
        Stop-Process -Id $pidSTT -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 600

        $dead = -not (Test-PortListening -Port $sttPort)
        Write-Host "  Python STT terminated: $dead"

        Write-Host "  Waiting for Supervisor to auto-restart Python STT..."
        $restarted = Wait-ForPort -Port $sttPort -MaxSeconds 15
        if ($restarted) {
            $newPidSTT = Get-ListeningPid -Port $sttPort
            Write-Host "  [OK] Python STT successfully recovered! New PID: $newPidSTT" -ForegroundColor Green
            $results["Python_STT_Recovery"] = "PASSED (New PID: $newPidSTT)"
        } else {
            Write-Host "  [FAIL] Python STT failed to recover within timeout." -ForegroundColor Red
            $results["Python_STT_Recovery"] = "FAILED"
        }
    } else {
        Write-Host "  [SKIP] Could not find PID for Python STT." -ForegroundColor DarkGray
        $results["Python_STT_Recovery"] = "SKIPPED"
    }

} finally {
    if ($supHarness -and (-not $supHarness.HasExited)) {
        Write-Host "`nCleaning up supervisor test harness..." -ForegroundColor DarkGray
        Stop-Process -Id $supHarness.Id -Force -ErrorAction SilentlyContinue
        $harnessFile = Join-Path $ProjectRoot "scratch_chaos_harness.mjs"
        if (Test-Path $harnessFile) { Remove-Item -Path $harnessFile -Force -ErrorAction SilentlyContinue }
    }
}

Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host " Chaos Testing Summary" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
$results.GetEnumerator() | ForEach-Object {
    $color = if ($_.Value.StartsWith("PASSED")) { "Green" } else { "Red" }
    Write-Host ("  {0,-25} : {1}" -f $_.Key, $_.Value) -ForegroundColor $color
}
Write-Host "====================================================`n" -ForegroundColor Cyan
