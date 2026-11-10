# Bolo: Multilingual Screen-Explaining Voice Agent

> An ambient, screen-aware voice assistant for Indian-language speakers on Windows, powered by **Gnani AI Vachana Speech Services (Prisma STT & Timbre TTS)**.

[![Tests](https://img.shields.io/badge/tests-17%20passed-brightgreen.svg)]()
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-blue.svg)]()
[![Gnani AI](https://img.shields.io/badge/Powered%20by-Gnani.ai-orange.svg)]()

---

## 1. What It Is

Many digital interfaces—such as net-banking portals, government compliance forms, e-commerce checkouts, and enterprise tools—are presented only in English, filled with confusing technical jargon and validation errors. 

**Bolo** is an unobtrusive floating Windows desktop "pill" that bridges this language barrier. With a single global hotkey (`Ctrl+Shift+Space`), Bolo:
1. **Captures** the user's active window purely in memory.
2. **Extracts** visible text, form fields, and error banners using fast vision OCR.
3. **Listens** to the user's spoken question in their preferred language (or uses an intelligent default prompt like *"Explain this screen"*).
4. **Transcribes** the question using **Gnani Prisma STT**.
5. **Explains** what is happening on screen in 3–4 concise, plain-spoken sentences in **Hindi/Hinglish, Tamil, or Bengali**, pointing out specific fields and buttons.
6. **Speaks** the explanation aloud using **Gnani Timbre TTS** while displaying the text in the pill.
7. **Supports instant follow-ups** ("What does this PAN box want?") without recapturing the screen.

---

## 2. Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │               Windows Desktop                │
                    │         (Banking App, Portal, Form)          │
                    └──────────────────────┬───────────────────────┘
                                           │ Global Hotkey (Ctrl+Shift+Space)
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                Bolo Desktop App                                  │
│                                                                                  │
│   ┌─────────────────────┐   In-Memory JPEG   ┌───────────────────────────────┐   │
│   │   Screen Capture    │ ─────────────────► │      Gemini Vision OCR        │   │
│   │  (desktopCapturer)  │                    │   (Structured Text Extract)   │   │
│   └─────────────────────┘                    └───────────────┬───────────────┘   │
│                                                              │ Text              │
│                                                              ▼                   │
│                                              ┌───────────────────────────────┐   │
│                                              │      Screen Text Cache        │   │
│                                              │    (Multi-Turn Session)       │   │
│                                              └───────────────┬───────────────┘   │
│                                                              │                   │
│   ┌─────────────────────┐    16kHz WAV Audio                 │ Screen Text       │
│   │   Web Audio (Mic)   │ ──────────────────┐                │ + History         │
│   └─────────────────────┘                   ▼                │                   │
│                                   ┌──────────────────┐       │                   │
│                                   │ Gnani Prisma STT │       │                   │
│                                   │  (POST /stt/v3)  │       │                   │
│                                   └─────────┬────────┘       │                   │
│                                             │ Question       │                   │
│                                             └───────┐ ┌──────┘                   │
│                                                     ▼ ▼                          │
│                                          ┌───────────────────────┐               │
│                                          │     LLM Explainer     │               │
│                                          │  (Groq Cloud / Gemini)│               │
│                                          └──────────┬────────────┘               │
│                                                     │ Explanation                │
│                                                     ▼                            │
│                                          ┌───────────────────────┐               │
│                                          │  normalizeForSpeech   │               │
│                                          │ (Currency, Num, Pct)  │               │
│                                          └──────────┬────────────┘               │
│                                                     │ Normalized Text            │
│                                                     ▼                            │
│                                          ┌───────────────────────┐               │
│                                          │   Gnani Timbre TTS    │               │
│                                          │ (/tts/inference POST) │               │
│                                          └──────────┬────────────┘               │
│                                                     │ Binary WAV                 │
│                                                     ▼                            │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │                               Pill UI                                    │   │
│   │  • Audio Playback (HTML5 Audio)       • Replay & Copy Buttons            │   │
│   │  • Language Selector (hi, ta, bn)    • Provider Attribution Footer      │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │   Gnani Serial Request Queue: 1-flight concurrency + 429 backoff retry   │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Supported Indian Languages & Gnani Models

Bolo provides explicit language selection directly in the pill UI (no unreliable auto-detection):

| Language | Locale Code | Prisma STT Code | Timbre TTS Voice | Speech Normalization | Conversational Default Prompt |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hinglish / Hindi** | `hi-IN` | `hi-IN` | `Poorvi` (`hi-en`) | Numerals & Hinglish (e.g. ₹500 -> paanch sau rupaye / पाँच सौ रुपये) | Is screen par kya karna hai, explain karo |
| **Tanglish / Tamil** | `ta-IN` | `ta-IN` | `Trisha` (`ta-IN`) | Tamil numerals, ₹ -> ரூபாய், % -> சதவீதம் | Intha screen-la enna pannanum nu explain pannunga |
| **Benglish / Bengali** | `bn-IN` | `bn-IN` | `Kirra` (`bn-IN`) | Bengali numerals, ₹ -> টাকা, % -> শতাংশ | Ei screen-e ki korte hobe ektu explain koro |

### How Gnani Models Are Used:
1. **Gnani Prisma STT (`POST https://api.vachana.ai/stt/v3`):**
   - Receives high-fidelity 16 kHz mono WAV audio recorded in-memory from the user's microphone.
   - Synchronously transcribes the question in the selected Indic language.
2. **Gnani Timbre TTS (`POST https://api.vachana.ai/api/v1/tts/inference`):**
   - Synthesizes natural spoken explanations using Gnani's verified voice catalog (`Poorvi`, `Trisha`, `Kirra`).
   - Returns binary WAV audio streamed directly to HTML5 Audio for instant playback.
3. **Serial Request Queue & 429 Guard (`src/services/gnani/queue.js`):**
   - Enforces strict serial request execution to comply with single-stream account concurrency limits.
   - Automatically handles HTTP 429 with exponential backoff (1s, 2s, 4s + jitter) up to 3 retries.
4. **Speech Normalizer (`src/services/gnani/normalizer.js`):**
   - Converts raw numerals (0–9999999), currencies (`₹500` -> "पाँच सौ रुपये"), and percentages into native spoken words before sending to TTS.
   - Truncates explanations at sentence boundaries (`।`, `.`, `?`, `!`) to <= 300 characters to prevent TTS HTTP 500 errors.

---

## 4. Honest Disclosure on LLMs Used

- **Hearing & Speaking (Gnani AI):** Gnani AI Vachana models exclusively power hearing via **Prisma STT v3** and speaking via **Timbre TTS v2.5** across Hindi/Hinglish, Tamil, and Bengali.
- **LLM Reasoning & Reply Drafting:** Bolo routes reasoning through **Groq Cloud (`qwen/qwen3.8-27b`)** or **Google Gemini (`gemini-3-flash-preview`)** behind a unified interface (`src/services/llm/index.js`).
- **Honest Attribution:** The pill footer and console logs **always explicitly display the real provider and model that generated the answer** (e.g. `Answered by Groq (qwen/qwen3.8-27b)` or `Answered by Gemini (gemini-3-flash-preview)`). We never label output under false attribution.

---

## 5. Privacy & Security

- **Triggered on Demand Only:** Screenshots are captured **only** when the user explicitly presses `Ctrl+Shift+Space`. There is zero background screenshot capture or indexing.
- **Zero Disk Writes:** Captured screenshots are processed strictly in RAM as JPEG buffers and cleared immediately after text extraction.
- **No Telemetry / No Ad Trackers:** Audio and screen text are sent only to the configured APIs (`api.vachana.ai`, `googleapis.com`, or `api.groq.com`).
- **Instant Cancellation:** Pressing `Esc` at any moment immediately halts audio recording, aborts HTTP requests, stops speech playback, and resets the session to `IDLE`.

---

## 6. Setup & Installation

### Prerequisites
- Windows 10 or 11
- Node.js v18+ (tested on Node.js v22)
- npm v10+

### Step 1: Clone and Install
```powershell
git clone https://github.com/Jagritii05/LocalPill_Graftcode.git
cd LocalPill_Graftcode
npm install
```

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```powershell
cp .env.example .env
```

Open `.env` and fill in your keys:
```env
# Gnani AI API Key for Prisma STT and Timbre TTS
GNANI_API_KEY=your_gnani_api_key

# Google Gemini API Key for screen text extraction
GEMINI_API_KEY=your_gemini_api_key

# LLM Provider: 'groq' (recommended) or 'gemini'
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key

# Default Language ('hi-IN', 'ta-IN', 'bn-IN')
DEFAULT_LANGUAGE=hi-IN

# Debug logging
DEBUG=false
```

### Step 3: Run the App
```powershell
npm start
```
The Bolo floating bar will appear at the bottom-center of your screen.

---

## 7. Demo Walkthrough: Banking Re-KYC Form

Bolo includes a realistic test form at `demo/mock-kyc-form.html` (synthetic, harmless data).

1. Open `demo/mock-kyc-form.html` in Chrome or Edge.
2. Notice the red error banner: *"Your Aadhaar-PAN linking is pending in the central registry. Please upload a clear photo of your physical PAN Card before submitting this form."*
3. With the KYC tab open, press **`Ctrl+Shift+Space`** on your keyboard.
4. Bolo captures the screen, extracts the text, and turns red (*"Listening in Hinglish..."*).
5. Stay silent (or ask *"Is form mein kya error hai?"*).
6. Bolo transcribes the question with Gnani Prisma, reasons with the LLM using real conversational Hinglish, and speaks the answer via Gnani Timbre (voice `Poorvi`):
   > *"Screen par error dikh raha hai ki aapka Aadhaar aur PAN link nahi hai. Submit button dabane se pehle PAN card ki clear photo upload karni hogi."*
7. **Switch Language:** Select **தமிழ் (Tamil)** in the dropdown and press the hotkey. Bolo explains the same screen in conversational Tanglish using voice `Trisha`:
   > *"Screen-la error irukku, Aadhaar-um PAN-um link aagala. Submit button click panrathukku munnadi PAN card photo upload pannunga."*
8. **Test Follow-Up:** Within 30 seconds, press the hotkey and ask: *"Ye PAN wala box kya maang raha hai?"*. Bolo answers using the cached screen text without recapturing the screen!

---

## 8. Testing

### Run Unit Tests (17 tests):
```powershell
npm test
```
Tests speech normalization (number-to-words for Hindi, Tamil, Bengali; currency symbols; percentage conversion), serial queue backoff and concurrency control, and language config mappings.

### Run Smoke Tests (Isolation Harness):
```powershell
npm run smoke
```
Executes isolated tests against Gnani Timbre TTS, Gnani Prisma STT, the LLM Explainer, and Gemini Vision OCR, reporting pass/fail and latency per service.

---

## 9. Built On

Bolo evolved from our earlier hackathon submission (which utilized an on-device Python Whisper engine and a cross-language RPC bridge). 

For the **Gnani AI Hackathon**, the project was completely re-architected:
- **Removed external runtime dependencies:** Eliminated the legacy gateway binaries, Python virtual environment requirements, and proprietary RPC packages in favor of clean, native Node.js REST services.
- **Core Hearing & Speaking with Gnani:** Replaced local Whisper with **Gnani Prisma STT** and integrated **Gnani Timbre TTS** with multi-language voice catalog mappings.
- **Indic Normalization Engine:** Built a custom number-to-words and currency normalizer supporting Hindi, Tamil, and Bengali to ensure crisp pronunciation.
- **Serial Concurrency Guard:** Engineered a zero-dependency serial queue with exponential 429 retry backoff.
- **Ambient Screen Explainer Workflow:** Replaced vector screenshot search and dictation with an interactive screen-explaining assistant that supports multi-turn follow-ups with screen text caching.
