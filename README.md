# 🎤 Granite Pill

A floating, always-on-top speech-to-text pill using **IBM granite-4.0-1b-speech-8bit** — running completely locally on your Mac.

---

## Requirements
- **Apple Silicon Mac** (M1/M2/M3/M4) — required for `mlx-audio`
- **Node.js** (v18+)
- **Python 3.10+**
- ~3 GB free disk space for the model

---

## Quick Start

### 1. Setup (one-time)

```bash
cd granite-pill
bash setup.sh
```

This will:
- Create a Python virtual environment (`.venv`)
- Install `mlx-audio` and dependencies
- Download `granite-4.0-1b-speech-8bit` (~2-3 GB)

### 2. Install Electron

```bash
npm install
```

### 3. Launch

```bash
npm start
```

The pill will appear at the bottom-center of your screen.

---

## Usage

| Action | What happens |
|--------|-------------|
| **`Shift+X`** | Toggle recording ON (first press shows pill + starts recording) |
| **`Shift+X`** again | Stop recording → transcription starts |
| **`Shift+X`** again | Hide the pill |
| **Click mic button** | Same as Shift+X |
| **Click ×** | Hide the pill |

After transcription, text is **automatically copied to your clipboard** 📋

---

## How it works

```
Shift+X pressed
    └─▶ Electron main registers GlobalShortcut
            └─▶ Renderer starts MediaRecorder (mic)
                    └─▶ Shift+X again → stop recording
                            └─▶ Audio blob → POST /transcribe → Python server
                                    └─▶ mlx-audio granite-4.0-1b-speech-8bit
                                            └─▶ {"text": "..."} → show in pill
```

---

## Files

| File | Purpose |
|------|---------|
| `main.js` | Electron main process, window, shortcut |
| `preload.js` | IPC bridge |
| `index.html` | Pill HTML |
| `styles.css` | Glassmorphism pill UI |
| `renderer.js` | Mic capture + ASR fetch |
| `asr_server.py` | Python HTTP server with granite model |
| `setup.sh` | One-time environment + model setup |
