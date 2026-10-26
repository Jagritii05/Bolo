# LocalPill: Video Demonstration Script (~100 Seconds)

This script provides the exact beat-by-beat timeline, screen actions, narration, and commands for recording the official video demonstration.

---

## Timeline & Scene Breakdown

| Timestamp | Beat | On-Screen Action | Narration / Voiceover | Exact Command / Hotkey |
| :--- | :--- | :--- | :--- | :--- |
| **00:00 – 00:08** | **Hook** | Title card: "LocalPill: Private voice dictation for Windows and AI agents. Zero API layer." | *"This is LocalPill—a private, local-first voice dictation layer for Windows and AI agents, built with Graftcode instead of hand-written REST."* | — |
| **00:08 – 00:22** | **Before & After** | Side-by-side terminal: VS Code showing `legacy-rest/asr_server_rest.py` (156 LOC) vs `src/main/graft/adapter.js`. Run `.\bench\loc.ps1`. | *"Before, cross-language bridges meant writing custom HTTP servers, serializing payloads, and handling CORS. With Graftcode, two gateways host Python STT and .NET/Node normalization with typed auto-generated clients."* | `powershell -File .\bench\loc.ps1` |
| **00:22 – 00:45** | **Live Dictation & Redaction** | Open Notepad. Press `Ctrl+Shift+Space`. Floating pill appears. Speak: *"Please charge my credit card 4242 4242 4242 4242 comma expiration 12 28 period"*. Press hotkey again. Text pastes: `"Please charge my credit card [CARD-MASKED], expiration 12 28."` Pill shows badge `[1 item masked]`. | *"Press Ctrl+Shift+Space, speak anywhere, press again. Local Whisper transcribes in-memory, our deterministic pipeline converts spoken punctuation, removes filler words, and masks credit card numbers before pasting."* | `Ctrl+Shift+Space` |
| **00:45 – 01:02** | **Live Engine Swap** | Right-click tray -> Open Settings. Show telemetry card (CPU int8, load latency). Switch radio from `whisper-base` to `whisper-tiny`. Click **Save Changes**. Show load latency update in real time (~1000 ms). Dictate immediately. | *"Need instant speed on low-power hardware? Switch engines live in Settings from Whisper Base to Whisper Tiny. The model swaps in one second with zero client restarts."* | Click **Save Changes** |
| **01:02 – 01:20** | **Chaos Recovery** | Trigger `scripts/chaos.ps1` in a PowerShell window while the pill is visible. Gateway A (port 8085) is killed with `taskkill /F`. Supervisor detects child exit, pill displays "Service restarted", backoff reconnects in ~1 second. Perform another dictation: it succeeds immediately. | *"What happens when a background gateway dies? LocalPill's supervisor catches process termination, executes an exponential backoff reconnect, and recovers without user interruption."* | `powershell -File .\scripts\chaos.ps1` |
| **01:20 – 01:35** | **MCP Integration** | Switch to Claude Desktop or Antigravity chat. Show MCP tools `TranscribeFileJson` and `CleanTextJson`. Prompt: *"Transcribe the file in my LocalPillRecordings folder called standup.wav and give me action items."* AI agent calls `localpill-speech`, returns transcript and bulleted summary. | *"LocalPill also exposes built-in Model Context Protocol tools. AI agents like Claude Desktop or Antigravity can transcribe local voice recordings privately inside an allowed security boundary."* | Send prompt to Claude / Antigravity |
| **01:35 – 01:45** | **The Numbers** | Display benchmark summary graphic from `docs/benchmark.md`. Highlight p50 latency and RTF numbers. | *"In benchmarks, model inference completely dominates execution time, while Graftcode gives us full type safety and automatic MCP tool exposure."* | `powershell -File .\scripts\bench.ps1` |
| **01:45 – 01:50** | **CTA & Disclosure** | GitHub repo link on screen with final disclosure line. | *"LocalPill is open source on GitHub. This project is part of the Graftcode Impact Programme; I may receive a reward from Graftcode S.A."* | — |

---

## Fixtures & Test Setup

### 1. Audio Fixture for MCP Demo
To populate the test audio file for the MCP demonstration:
```powershell
# Create sample in allowed folder
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');
const userProfile = process.env.USERPROFILE || os.homedir();
const recDir = path.join(userProfile, 'LocalPillRecordings');
if (!fs.existsSync(recDir)) fs.mkdirSync(recDir, { recursive: true });
const target = path.join(recDir, 'standup.wav');
// Copy sample fixture or recording
console.log('Created standup fixture at:', target);
"
```

### 2. Live Dictation Utterance
- Text to speak:
  > *"Send the project report to team colon my card number is 4242 4242 4242 4242 um period"*
- Expected output pasted into Notepad:
  > `"Send the project report to team: my card number is [CARD-MASKED]."`

### 3. Mandatory Video Disclosure
Display prominently at the end of the video:
> **Disclosure:** Part of the Graftcode Impact Programme; I may receive a reward from Graftcode S.A.
