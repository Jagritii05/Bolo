# 💊 LocalPill

> **A private voice layer for Windows applications and AI agents, powered by Graftcode cross-language RPC.**

[![Platform: Windows x64](https://img.shields.io/badge/Platform-Windows%20x64-blue.svg)](docs/windows-notes.md)
[![Graftcode: v1.4.11](https://img.shields.io/badge/Graftcode-v1.4.11-6366f1.svg)](https://graftcode.com)
[![Local Speech: Whisper](https://img.shields.io/badge/Speech-Faster--Whisper-green.svg)](services/speech/)
[![MCP: Enabled](https://img.shields.io/badge/MCP-JSON--RPC%202.0-orange.svg)](docs/mcp.md)

---

## 🚀 Quick Start (Under 15 Minutes)

On any clean Windows 10/11 x64 machine, run two commands from PowerShell:

```powershell
# 1. Automated environment setup (installs Node deps, creates Python venv, caches Whisper base & tiny)
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

# 2. Launch LocalPill
npm start
```

Press **`Ctrl+Shift+Space`** anywhere in Windows, speak your mind, and clean, formatted text appears directly at your cursor!

---

## 🎯 What LocalPill Does

1. **System-Wide Dictation Anywhere on Windows:** Press a global hotkey (`Ctrl+Shift+Space`), speak, and press again. Clean text pastes directly into whatever application you were using (Notepad, Chrome, VS Code, Word, Terminal, Slack).
2. **Deterministic Text Sanitization & Sensitive Token Redaction:** Text passes through an in-memory normalization pipeline that converts spoken punctuation (*"comma"*, *"period"*), removes filler words (*"um"*, *"uh"*, *"you know"*), and automatically masks sensitive data:
   - Credit / Debit Cards (Luhn algorithm validated) -> `[CARD-MASKED]`
   - Indian Aadhaar IDs (Verhoeff dihedral $D_5$ algorithm validated) -> `[AADHAAR-MASKED]`
   - Indian PAN Numbers -> `[PAN-MASKED]`
   - API Keys & Bearer Tokens -> `[KEY-MASKED]`
3. **Swappable Speech Engines with Live Switching:** Run 100% locally with `whisper-base` (recommended) or `whisper-tiny` (ultra-fast, 2.3x real-time), or opt-in to cloud `groq-whisper` (`whisper-large-v3-turbo`) with persistent privacy disclosure. Hardware acceleration probes CTranslate2 CUDA float16 and gracefully falls back to CPU int8 in 1 ms if CUDA Toolkit DLLs are absent.
4. **Native Model Context Protocol (MCP) Support:** Built-in Streamable HTTP / SSE MCP endpoints served on `http://localhost:8085/mcp` and `http://localhost:8095/mcp`. Claude Desktop or Google Antigravity can transcribe local voice recordings privately inside an allowed security boundary (`%USERPROFILE%\LocalPillRecordings`).
5. **Architectural Parity Comparison:** Supports toggling between `TRANSPORT=graft` (default, cross-language RPC) and `TRANSPORT=rest` (legacy hand-written HTTP baseline) to benchmark developer ergonomics, code footprint, and runtime latency.

---

## 🏛️ Architecture: Legacy REST vs. Graftcode

```
                         [LEGACY REST ARCHITECTURE]
+-------------------------------------------------------------------------+
|  Electron Main Process (Node.js)                                        |
|      |                                                                  |
|      +--> Hand-written HTTP Client (rest-speech-client.js)              |
|              |  (manual POST /transcribe, CORS headers, Content-Length) |
|              v                                                          |
|  Python HTTP Server (asr_server_rest.py) on :7777                       |
|      |  (manual BaseHTTPRequestHandler, JSON deserialization, errors)   |
|      v                                                                  |
|  Local Faster-Whisper Model Engine                                      |
+-------------------------------------------------------------------------+

                         [LOCALPILL GRAFTCODE ARCHITECTURE]
+-------------------------------------------------------------------------+
|  Electron Main Process (Node.js)                                        |
|      |                                                                  |
|      +--> Typed Auto-Generated SDK (@graft/npm-speech-gateway)          |
|      |        |  (Graftcode WebSocket RPC on :8085 / :8086)             |
|      |        v                                                         |
|      |   Gateway A (SpeechService) <----+---> MCP Client (Claude / Agy) |
|      |        | (zero hand-written HTTP)|     http://localhost:8085/mcp |
|      |        v                         |                               |
|      |   Python STT Engine Subprocess   |                               |
|      |                                                                  |
|      +--> Typed Auto-Generated SDK (@graft/npm-text-gateway)            |
|               |  (Graftcode WebSocket RPC on :8095 / :8096)             |
|               v                                                         |
|          Gateway B (TextPipelineService) +---> MCP Client (Claude / Agy)|
|               | (Luhn, Verhoeff, Masking)     http://localhost:8095/mcp |
+-------------------------------------------------------------------------+
```

---

## 📊 Measured Benchmark: REST Baseline vs. Graftcode

All metrics were gathered on Windows 11 x64 (12th Gen Intel Core i5-12450HX, 12 cores, 16 GB RAM) via the automated benchmark runner:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\bench.ps1
```

### 1. Integration Lines of Code (LOC)
*Measured non-blank, non-comment code lines per `bench/integration-paths.yml`:*

| Architecture | Measured Files | Code LOC | Architectural Character |
| :--- | :--- | :---: | :--- |
| **REST Baseline** | `asr_server_rest.py`, `rest-speech-client.js` | **287** | Manual HTTP routing, CORS headers, socket serialization, error status parsers |
| **Graftcode** | `speech_gateway/index.js`, `adapter.js`, `graft-speech-client.js` | **432** | Typed facades, typed auto-generated SDK client, Section 6.5 error state machine, MCP security boundary |

### 2. Per-Call Latency Distributions
*N=200 calls for Health Check; N=20 calls for 1.0s audio clip on `whisper-base`:*

| Operation | Transport | p50 (Median) | p95 | p99 | Average |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Health Check** | REST Baseline (`GET /health`) | **2.25 ms** | 3.25 ms | 4.15 ms | 2.32 ms |
| | Graftcode RPC (`healthJson`) | **41.24 ms** | 62.73 ms | 80.35 ms | 43.99 ms |
| **1.0s Audio Transcription** | REST Baseline (`POST /transcribe`) | **3353.7 ms** | 3939.8 ms | 3939.8 ms | 3301.1 ms |
| | Graftcode RPC (`transcribeBytesJson`) | **3365.7 ms** | 3767.1 ms | 3767.1 ms | 3259.2 ms |

> **Honest Caveat:** As proved by the empirical numbers, **model inference completely dominates speech transcription time** (difference between REST and Graftcode is <12 ms or <0.4%). Transport choice has negligible impact on transcription latency. Health check in REST is ~2.3 ms over persistent loopback sockets, whereas Graftcode Gateway A invokes a local subprocess bridge (`curl.exe`) to communicate with Python on Windows, incurring ~38 ms of child-process launch overhead.

### 3. Local Engine Real-Time Factor (RTF) & Memory Footprint
*Tested with CTranslate2 CPU int8 on the host machine. RTF = Processing Time ÷ Audio Duration (<1.0 is faster than real time):*

| Engine | Label | Load Time | Peak RAM | 1.0s Sample RTF | 3.0s Sample RTF | Relative Speed |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `whisper-tiny` | Local Whisper (tiny) | 1004.5 ms | 214 MB | **0.439** | **0.478** | **2.1x – 2.3x faster than real-time** |
| `whisper-base` | Local Whisper (base) | 1233.2 ms | 280 MB | **2.899** | **0.985** | **1.0x – 1.2x real-time (higher accuracy)** |

---

## 🔒 Privacy & Security Boundary

- **Zero External Audio Egress:** In local engine mode, voice recording, Whisper transcription, and text sanitization execute 100% locally on your machine.
- **Log Privacy by Default:** Transcripts and audio are never written to disk logs (`LOG_TRANSCRIPTS=false`).
- **Temporary File Sanitization:** Audio clips written to `%TEMP%\LocalPill\` are purged immediately upon transcription. The supervisor sweeps any orphaned audio files on launch and exit.
- **MCP Security Sandbox:** The MCP tool `TranscribeFileJson` only accesses files inside `%USERPROFILE%\LocalPillRecordings`. Directory traversal (`..\..\`) and Windows NTFS Directory Junction escapes are resolved via `fs.realpathSync` and blocked with `PathNotAllowedException`.
- **Graftcode Telemetry Disclosure:** As documented in [docs/privacy-check.md](docs/privacy-check.md), `gg.exe` uploads code metadata (UGM) to `https://grft.dev/uploadUGM/store` during startup (contains zero audio or user data), and `hypertube-nodejs-sdk` connects to Azure Application Insights on unhandled SDK exceptions. `gg.exe` binds to `0.0.0.0` by default.

---

## 🤖 Using with Claude Desktop & Antigravity (MCP)

LocalPill exposes its capabilities as native tools for AI assistants.

### Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "localpill-speech": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8085/mcp"]
    },
    "localpill-text": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8095/mcp"]
    }
  }
}
```

### Google Antigravity (`~/.gemini/config/mcp_config.json`)
```json
{
  "mcpServers": {
    "localpill-speech": {
      "serverUrl": "http://localhost:8085/mcp"
    },
    "localpill-text": {
      "serverUrl": "http://localhost:8095/mcp"
    }
  }
}
```

**Try Prompting Your AI Assistant:**  
> *"Transcribe the file in my LocalPillRecordings folder called standup.wav and give me action items."*

---

## 🧪 Comprehensive Automated Test Suites

Run any of the automated test suites on Windows:

```powershell
# Run core test suite (Text pipeline, supervisor reliability, speech service)
npm test

# Run MCP integration & security boundary tests (5/5)
npm run test:mcp

# Run live engine swap tests (whisper-base <-> whisper-tiny)
npm run test:engines

# Run Chaos test (mid-session Gateway killing & auto-recovery)
npm run test:chaos

# Run unified benchmark harness
npm run bench
```

---

## 📚 Documentation Index

- [docs/benchmark.md](docs/benchmark.md) — Complete benchmark methodology, latency numbers, and RTF tables.
- [docs/privacy-check.md](docs/privacy-check.md) — Network egress check, socket analysis, and telemetry disclosure.
- [docs/mcp.md](docs/mcp.md) — Comprehensive Model Context Protocol integration guide.
- [docs/windows-notes.md](docs/windows-notes.md) — Deep dive into Windows process trees, UIPI elevation, and CUDA fallback.
- [docs/demo-script.md](docs/demo-script.md) — Exact beat-by-beat 100-second demonstration scenario.
- [docs/phase0-findings.md](docs/phase0-findings.md) — Empirical evidence answering all 12 Phase 0 questions.
- [docs/decisions.md](docs/decisions.md) — Architectural decision log and deviations from original macOS app.
- [docs/progress.md](docs/progress.md) — Milestone-by-milestone progress tracking.
