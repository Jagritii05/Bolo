# LocalPill Windows Setup Script
# Usage: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LocalPill Windows Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$RootDir = Split-Path -Parent $PSScriptRoot

# 1. Environment file
$EnvFile = Join-Path $RootDir ".env"
$EnvExample = Join-Path $RootDir ".env.example"
if (-not (Test-Path $EnvFile) -and (Test-Path $EnvExample)) {
    Write-Host "[1/5] Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item $EnvExample $EnvFile
} else {
    Write-Host "[1/5] .env already present." -ForegroundColor Green
}

# 2. Python Virtual Environment
$VenvDir = Join-Path $RootDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[2/5] Creating Python virtual environment in .venv..." -ForegroundColor Yellow
    python -m venv $VenvDir
} else {
    Write-Host "[2/5] Virtual environment (.venv) already exists." -ForegroundColor Green
}

# 3. Pip Requirements
Write-Host "[3/5] Installing Python dependencies (faster-whisper, PyAV, requests)..." -ForegroundColor Yellow
$ReqFile = Join-Path $RootDir "services\speech\requirements.txt"
& $VenvPython -m pip install -r $ReqFile --quiet

# 4. Pre-download whisper-base model
Write-Host "[4/5] Pre-downloading Whisper base model..." -ForegroundColor Yellow
$DownloadScript = @"
import os
from faster_whisper import WhisperModel
user_profile = os.environ.get('USERPROFILE', os.path.expanduser('~'))
app_data = os.environ.get('APPDATA', os.path.join(user_profile, 'AppData', 'Roaming'))
models_dir = os.path.join(app_data, 'LocalPill', 'models')
os.makedirs(models_dir, exist_ok=True)
print('Checking whisper-base in ' + models_dir + '...')
WhisperModel('base', device='cpu', compute_type='int8', download_root=models_dir)
print('Model ready.')
"@

& $VenvPython -c $DownloadScript

# 5. Node dependencies
Write-Host "[5/5] Ensuring Node.js dependencies are installed..." -ForegroundColor Yellow
Push-Location $RootDir
npm install --silent
Pop-Location

Write-Host "`nLocalPill setup completed successfully!" -ForegroundColor Green
Write-Host "Run 'npm start' to launch LocalPill." -ForegroundColor Cyan
