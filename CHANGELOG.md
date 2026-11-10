# Changelog

All notable changes to the Bolo codebase are documented in this file.

## [2.0.0-gnani] - 2026-11-10

### Rebuilt for Gnani AI Hackathon as "Bolo"

#### 1. Removal of Legacy RPC Framework & Gateways
- Completely uninstalled legacy Python dependencies, gateways, and supervisor processes.
- Native Node.js REST services for all integrations.

#### 2. Native Gnani AI Speech Platform Integration
- **Gnani Prisma STT (`src/services/gnani/stt.js`):** Direct REST integration with `POST https://api.vachana.ai/stt/v3` supporting multipart WAV audio across `hi-IN`, `ta-IN`, and `bn-IN`.
- **Gnani Timbre TTS (`src/services/gnani/tts.js`):** Direct REST integration with `POST https://api.vachana.ai/api/v1/tts/inference` with voice catalog mappings (`Poorvi`, `Trisha`, `Kirra`).
- **Serial Request Queue (`src/services/gnani/queue.js`):** Enforces single-flight Gnani requests with automatic 429 exponential backoff retry.
- **Indic Speech Normalizer (`src/services/gnani/normalizer.js`):** Number-to-words, currency symbol, and percentage conversions for Hindi, Tamil, and Bengali with sentence boundary truncation.

#### 3. LLM Screen Explainer & Session Orchestration
- **Universal LLM Interface (`src/services/llm/index.js`):** Ultra-fast Groq Cloud reasoning (`qwen/qwen3.8-27b`) with Gemini (`gemini-3-flash-preview`) fallback. Honest model attribution in UI footer.
- **Screen-to-Text Vision Extraction (`src/services/vision/screenToText.js`):** Gemini Vision OCR with thinking disabled (`thinkingBudget: 0`) and in-memory screen session caching for multi-turn follow-ups.
- **Interactive Modes:**
  - `explain`: Explains what is on screen in conversational Hindi/Hinglish, Tamil, or Bengali.
  - `reply`: Screen-aware drafting of replies to emails/chats pasted at cursor.
  - `dictate`: Speech-to-text voice typing with Indic-to-Romanized transliteration pasted directly at the cursor.
- **Session Coordinator (`src/core/session.js`):** Robust state machine with global hotkey (`Ctrl+Shift+Space`) and `Esc` cancellation.

#### 4. UI & Demo Support
- **Compact Obsidian Charcoal Pill UI:** Non-intrusive floating pill (340x50) with popover settings for mode and language.
- **Crash-free Audio Engine:** Pure JS `AudioWorkletProcessor` streaming 16kHz mono PCM directly to Gnani STT.
- **Mock KYC Form (`demo/mock-kyc-form.html`):** Test banking form with validation errors.
- **Automated Unit Tests (`tests/unit/`):** 17 unit tests verifying speech normalization, queue concurrency, dictation formatting, and language mappings.

