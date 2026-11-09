# LocalPill Windows Setup Script
# Usage: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LocalPill Windows Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$RootDir = Split-Path -Parent $PSScriptRoot

# 1. Graftcode Gateway Binary (gg.exe) Check
$GgExe = Join-Path $RootDir "gg.exe"
if (-not (Test-Path $GgExe)) {
    Write-Host "[1/6] Missing gg.exe in project root!" -ForegroundColor Red
    Write-Host "Please place Graftcode Gateway (gg.exe v1.4.11) in: $RootDir" -ForegroundColor Yellow
    Write-Host "Obtain gg.exe from your Graftcode release distribution or developer portal." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "[1/6] Graftcode Gateway binary (gg.exe v1.4.11) verified." -ForegroundColor Green
}

# Ensure python3.dll is present next to gg.exe for Limited ABI C-extensions (PyAV/ctranslate2)
$Python3Dll = Join-Path $RootDir "python3.dll"
if (-not (Test-Path $Python3Dll)) {
    $CandidateDll = Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python3.dll"
    if (Test-Path $CandidateDll) {
        Copy-Item $CandidateDll $Python3Dll
        Write-Host "  [OK] Copied python3.dll to project root for C-extension compatibility." -ForegroundColor Green
    }
}

# 2. Environment file
$EnvFile = Join-Path $RootDir ".env"
$EnvExample = Join-Path $RootDir ".env.example"
if (-not (Test-Path $EnvFile) -and (Test-Path $EnvExample)) {
    Write-Host "[2/6] Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item $EnvExample $EnvFile
} else {
    Write-Host "[2/6] .env already present." -ForegroundColor Green
}

# 3. Python Virtual Environment
$VenvDir = Join-Path $RootDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[3/6] Creating Python virtual environment in .venv..." -ForegroundColor Yellow
    python -m venv $VenvDir
} else {
    Write-Host "[3/6] Virtual environment (.venv) already exists." -ForegroundColor Green
}

# 4. Pip Requirements
Write-Host "[4/6] Installing Python dependencies (faster-whisper, PyAV, requests)..." -ForegroundColor Yellow
$ReqFile = Join-Path $RootDir "services\speech\requirements.txt"
& $VenvPython -m pip install -r $ReqFile --quiet

# 5. Pre-download whisper models (base & tiny)
Write-Host "[5/6] Pre-downloading Whisper models (base & tiny)..." -ForegroundColor Yellow
$DownloadScript = @"
import os
from faster_whisper import WhisperModel
user_profile = os.environ.get('USERPROFILE', os.path.expanduser('~'))
app_data = os.environ.get('APPDATA', os.path.join(user_profile, 'AppData', 'Roaming'))
models_dir = os.path.join(app_data, 'LocalPill', 'models')
os.makedirs(models_dir, exist_ok=True)
print('Pre-caching whisper-base in ' + models_dir + '...')
WhisperModel('base', device='cpu', compute_type='int8', download_root=models_dir)
print('Pre-caching whisper-tiny in ' + models_dir + '...')
WhisperModel('tiny', device='cpu', compute_type='int8', download_root=models_dir)
print('Whisper models ready.')
"@

& $VenvPython -c $DownloadScript

# 6. Node dependencies
Write-Host "[6/6] Ensuring Node.js dependencies are installed..." -ForegroundColor Yellow
Push-Location $RootDir
npm install --silent
Pop-Location

Write-Host "`nLocalPill setup completed successfully!" -ForegroundColor Green
Write-Host "Run 'npm start' to launch LocalPill." -ForegroundColor Cyan
