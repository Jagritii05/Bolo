# Phase 0 Audit: LocalPill Codebase & Graftcode Dependencies

## 1. Runtime & Framework Architecture
- **Framework:** Electron (v28.3.3)
- **Runtime:** Node.js (ES Modules `"type": "module"` in `package.json`, CommonJS `.cjs` for preload)
- **Package Manager:** `npm`
- **Entry Points:**
  - Main Process: `src/main/index.js`
  - Preload Script: `src/preload/preload.cjs` (context isolation enabled, exposing `window.localPill`)
  - Renderer Windows:
    - Floating Pill UI: `src/renderer/pill/index.html`, `src/renderer/pill/renderer.js`, `styles.css`
    - Settings Window: `src/renderer/settings/index.html`, `src/renderer/settings/renderer.js`, `styles.css`
- **Build / Run Scripts:**
  - `npm start`: Runs `electron src/main/index.js`
  - `npm run setup`: PowerShell setup script managing Python venv & `gg.exe`
  - `npm test`: Various pipeline and integration test runners

---

## 2. Graftcode Footprint Inventory

| File / Component | What It Does / Graftcode Usage | Replacement Plan |
| :--- | :--- | :--- |
| `package.json`, `package-lock.json` | Dependencies on `@graft/npm-text-gateway` & `@graft/pypi-speech-gateway` | Remove both packages completely. Clean lockfile and node_modules. |
| `src/main/supervisor.js` | Manages external `gg.exe` processes for Gateway A (Python) and Gateway B (Node), TCP/WS port checks, Python venv and DLL discovery | Remove `supervisor.js` and external process manager. All new services run in-process or via standard HTTPS REST. |
| `src/main/graft/adapter.js` | Maps Graftcode RPC error strings to domain kinds (`GATEWAY_DIED`, `RPC_TIMEOUT`, etc.) | Delete. Replace with clean HTTP status and network error handling in `src/services/`. |
| `src/main/graft/graft-speech-client.js` | Connects over WebSocket RPC to `@graft/pypi-speech-gateway` | Replace with `src/services/gnani/stt.js` (Prisma REST API). |
| `src/main/graft/graft-text-client.js` | Connects over WebSocket RPC to `@graft/npm-text-gateway` | Direct in-process JavaScript calls and TTS text normalizer. |
| `src/main/speech-client.js` | Factory instantiating `GraftSpeechClient` | Replace with Gnani STT client instance. |
| `src/main/text-client.js` | Dispatches between Graft client and baseline text pipeline | Replace with speech normalizer module. |
| `src/main/index.js` | Calls `supervisor.startGatewayA()`, `startGatewayB()`, `waitForAllReady('graft')` | Remove supervisor calls; app starts immediately without background binaries. |
| `src/main/ipc.js` | Handles RPC errors, retry loops for dead gateways, and MCP server paths | Refactor IPC to route between Pill UI and new Gnani/LLM/Vision session coordinator. |
| `services/speech/` | Full Python speech service (faster-whisper, pyproject.toml, requirements.txt) | Move to `legacy/` or remove from active build path. STT is now handled by Gnani Prisma cloud API. |
| `services/speech_gateway/`, `services/text_gateway/` | Gateway bridge entry points for `gg.exe` | Move to `legacy/` or remove. |
| `scripts/benchmark.mjs`, `scripts/setup.ps1`, `scripts/chaos.ps1` | Benchmark and chaos tests explicitly evaluating Graftcode RPC | Retire or move to legacy. |
| `.env.example`, `settings-store.js`, `tray.js` | `TRANSPORT=graft` settings and tray toggles | Remove `transport` config; standardize on direct REST services. |

---

## 3. Location of Core Capabilities

- **Screen Capture:** `src/main/assistant/screen-capture.js`
  - Native Electron `desktopCapturer.getSources({ types: ['screen'] })`
  - Already in-memory JPEG base64 capture; zero disk writes.
- **Vision Extraction:** `src/main/assistant/gemini.js`
  - Uses Google Gemini API (`models/gemini-3-flash-preview:generateContent` / `gemini-3.5-flash` / `gemini-flash-latest`) via native `fetch`.
  - Prompts will be updated for pure structured screen text extraction (Phase 2.5).
- **Global Hotkey:** `src/main/shortcuts.js`
  - Electron `globalShortcut.register` (`CommandOrControl+Shift+Space`).
- **Pill UI:** `src/renderer/pill/`
  - Floating transparent always-on-top window.
  - Web Audio recording via `MediaRecorder`.
- **Paste at Cursor:** `src/main/paste.js`
  - Electron `clipboard.writeText` + PowerShell `SendKeys("^v")`.
- **Settings Store:** `src/main/settings-store.js`
  - JSON file storage in Electron `app.getPath('userData')`.
- **Out-of-Scope Features (to be decoupled/removed from active path):**
  - MCP servers (`:8085/mcp`, `:8095/mcp`)
  - Screenshot watcher & vector similarity search (`src/main/assistant/screenshot-watcher.js`, `memory-store.js`)
  - "Summarize my day" & saved screen memory queries

---

## 4. Replacement Plan Per Module

1. **STT (Speech-to-Text):**
   - **Replacement:** `src/services/gnani/stt.js`
   - **Endpoint:** `POST https://api.vachana.ai/stt/v3`
   - **Auth:** `X-API-Key-ID: <GNANI_API_KEY>`
   - **Payload:** Multipart/form-data (`audio_file`, `language_code`: `hi-IN` / `ta-IN` / `bn-IN`)
   - **Recording format:** 16 kHz mono WAV recorded directly in renderer or converted to WAV before sending.

2. **TTS (Text-to-Speech):**
   - **Replacement:** `src/services/gnani/tts.js`
   - **Endpoint:** `POST https://api.vachana.ai/api/v1/tts/inference`
   - **Auth:** `X-API-Key-ID: <GNANI_API_KEY>`
   - **Payload:** JSON `{ "text": "...", "voice": "...", "model": "timbre-v2.5", "language": "...", "speed": 1.0 }`
   - **Text Normalization:** `normalizeForSpeech(text, lang)` converting digits, currency, and symbols to Indic words.

3. **Concurrency / Serial Queue:**
   - **Replacement:** `src/services/gnani/queue.js`
   - Serial execution queue with exponential backoff on HTTP 429 (max 3 retries) ensuring STT and TTS never run concurrently on restricted accounts.

4. **LLM Explainer:**
   - **Replacement:** `src/services/llm/index.js`
   - Clean interface: `explain({ screenText, question, language, history }) -> { text, provider, model }`
   - Providers: `evon` (OpenAI-compatible REST endpoint if configured via `EVON_BASE_URL`), fallback `groq` (Groq REST API), or `gemini`. UI footer explicitly displays the model used.

5. **Screen Extraction & Session Caching:**
   - **Replacement:** `src/services/vision/screenToText.js`
   - Reuses Gemini vision to output raw visible text, labels, and layout.
   - Screen text cached in session state for follow-up turns without re-capture.

6. **Orchestrator & State Machine:**
   - **Replacement:** `src/core/session.js`
   - Explicit state machine: `IDLE -> CAPTURING -> EXTRACTING -> LISTENING -> TRANSCRIBING -> THINKING -> SPEAKING -> IDLE` (with `ERROR` and `ESC` cancellation).
