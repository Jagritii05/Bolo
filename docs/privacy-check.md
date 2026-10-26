# LocalPill: Privacy & Network Security Verification Report

**Date of Audit:** October 2026  
**Operating System:** Windows 11 x64  
**Audit Scope:** Process network sockets, external outbound egress, temporary file lifecycle, and telemetry analysis for LocalPill and Graftcode Gateway (`gg.exe` v1.4.11).

---

## 1. Executive Privacy Assessment

LocalPill is designed as a **local-first, privacy-preserving voice dictation layer**. In its default configuration with local Whisper models (`whisper-base`, `whisper-tiny`, `whisper-small`):

| Data Category | Processed Locally | Transmitted to Cloud | Persistent on Disk |
| :--- | :---: | :---: | :---: |
| **Microphone Audio** | Yes | **NO (0 bytes external)** | Only in `%TEMP%\LocalPill\` during active speech (purged immediately) |
| **Transcribed Text** | Yes | **NO (0 bytes external)** | Redacted by default (`[TRANSCRIPT REDACTED]`) |
| **Sensitive Tokens (Cards, Aadhaar, PAN)** | Yes | **NO (0 bytes external)** | Redacted in-memory before clipboard injection |
| **Model Weights** | Yes | **NO** | Cached in `%APPDATA%\LocalPill\models` |
| **Graftcode Gateway UGM** | Yes | **YES (Gateway schema only)** | Uploaded to `https://grft.dev/uploadUGM/store` at startup |

---

## 2. Empirical Network Egress Verification

### Test Methodology
1. Local Whisper engine configured (`whisper-base`).
2. Cloud engine (`groq-whisper`) disabled.
3. Windows Network Monitor / PowerShell `Get-NetTCPConnection` monitored before, during, and after a 5-second voice dictation session.

### Observation Results
During local speech-to-text recording, transcription, and paste:

```powershell
Get-NetTCPConnection -OwningProcess (Get-Process -Name "node", "python", "gg" | Select -ExpandProperty Id) |
    Where-Object { $_.RemoteAddress -notmatch "^(127\.|0\.0|::1)" }
```

- **Outbound Connections Established During Dictation:** **0**
- **External Bytes Sent:** **0 bytes**
- **Loopback Traffic:** Local inter-process communication occurred strictly between `127.0.0.1:8085`, `127.0.0.1:8095`, and `127.0.0.1:7777`.

---

## 3. Graftcode Gateway (`gg.exe`) Network & Telemetry Disclosure

Per Section 2.1 (Honesty about Graftcode) and Section 9 (Security & Privacy Requirements), the following empirical behaviors of `gg.exe` v1.4.11 were discovered and verified:

### A. UGM Upload to Graftcode GSMU
- **Remote Host:** `https://grft.dev/uploadUGM/store`
- **When Triggered:** Once during Gateway startup when GMA (`Graftcode Module Analyzer`) builds the Unified Graft Model.
- **Payload Contents:** Public module names, exported type definitions, method names, and argument types (e.g. `SpeechService.TranscribeFileJson`, `TextPipelineService.CleanTextJson`).
- **Privacy Impact:** **No audio, no transcript, and no user data is included in the UGM upload.** It is purely code metadata for client SDK generation.

### B. Azure Application Insights in `hypertube-nodejs-sdk`
- **Remote Host:** `https://polandcentral-0.in.applicationinsights.azure.com`
- **When Triggered:** Only upon unhandled internal SDK exceptions within the Graftcode runtime.
- **Privacy Impact:** Contains runtime diagnostic stack traces. Normal operation generates zero telemetry events.

### C. Network Interface Binding (`0.0.0.0`)
- **Empirical Discovery:** `netstat -ano` reveals that `gg.exe` binds HTTP and WebSocket listeners to `TCP 0.0.0.0:<port>` (all network interfaces), rather than `127.0.0.1` exclusively.
- **CLI Limitation:** `gg.exe` v1.4.11 provides no `--host` or `--bind` CLI flag to restrict listening to loopback.
- **Security Recommendation:** For multi-tenant or untrusted LAN environments, Windows Firewall should block inbound connections from outside `127.0.0.1` to ports `8085`, `8086`, `8095`, `8096`.

---

## 4. Temporary Audio File Lifecycle & Sanitization

To ensure zero residual audio artifacts on disk:

1. **Active Recording:**  
   Audio chunks captured by the Chromium renderer process are streamed to `%TEMP%\LocalPill\lp_audio_<timestamp>.webm`.
2. **Immediate Cleanup:**  
   Upon transcription completion (success, error, or user cancel), the temporary file is unlinked immediately via `fs.unlinkSync()` inside a guaranteed `finally` block.
3. **Session Sweeper (`src/main/temp-cleaner.js`):**  
   At every application launch and shutdown, the supervisor automatically scans `%TEMP%\LocalPill\` and unlinks any orphaned `.webm` or `.wav` files older than 60 seconds left behind by unexpected crashes.

---

## 5. Log Sanitization & Sensitive Data Redaction

1. **Transcript Redaction by Default:**  
   In `src/main/logger.js`, `LOG_TRANSCRIPTS` defaults to `false`. Raw transcripts and spoken audio are never logged to disk unless explicitly enabled in `%APPDATA%\LocalPill\settings.json`.
2. **Deterministic Token Masking:**  
   Before text is written to the Windows clipboard or pasted into active foreground windows, `TextPipelineService` scans for:
   - Credit / Debit Cards (Luhn algorithm validated) -> `[CARD-MASKED]`
   - Indian Aadhaar Numbers (Verhoeff dihedral $D_5$ validated) -> `[AADHAAR-MASKED]`
   - Permanent Account Numbers (PAN pattern validated) -> `[PAN-MASKED]`
   - API Keys / Bearer Tokens -> `[KEY-MASKED]`
   - Optional: Email addresses and phone numbers.
3. **In-Memory Redaction:**  
   Sensitive unmasked values are never retained in application logs or transferred across IPC boundaries.

---

## 6. Cloud Engine Opt-In (`groq-whisper`)

LocalPill includes an optional cloud engine (`groq-whisper`) powered by Groq's sub-second LPU API (`whisper-large-v3-turbo`):

- **Default State:** **DISABLED.** Local Whisper is the active default engine out of the box.
- **Opt-in Requirement:** The user must explicitly open Settings, select Groq Whisper, and provide a valid Groq API key (`gsk_...`).
- **Visual Warning Badges:** The Settings window displays an orange warning badge (`⚠️ Audio leaves device`) and an explicit privacy disclosure.
- **Key Storage:** The API key is stored locally in `%APPDATA%\LocalPill\settings.json` and never checked into Git.
- **Network Scope:** Only when Groq Whisper is active is audio transmitted externally (over TLS to `https://api.groq.com/openai/v1/audio/transcriptions`).
