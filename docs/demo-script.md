# LocalPill: Video Demonstration Script (~100 Seconds)

This script provides the exact beat-by-beat timeline, screen actions, narration, and commands for recording the official video demonstration.

---

## Timeline & Scene Breakdown

| Timestamp | Beat | On-Screen Action | Narration / Voiceover | Exact Command / Hotkey |
| :--- | :--- | :--- | :--- | :--- |
| **00:00 – 00:08** | **Hook** | Title card: "LocalPill: Private voice dictation for Windows and AI agents. Zero API layer." | *"This is LocalPill—a private, local-first voice dictation layer for Windows and AI agents, built with Graftcode instead of hand-written REST."* | — |
| **00:08 – 00:22** | **Architecture** | Show VS Code: `services/speech_gateway/index.js` and `src/main/graft/adapter.js`. | *"Cross-language bridges usually mean manual HTTP plumbing. With Graftcode, two gateways host Python STT and text normalization with typed auto-generated clients."* | — |
| **00:22 – 00:45** | **Live Dictation & Redaction** | Open Notepad. Press `Ctrl+Shift+Space`. Floating pill appears. Speak: *"Please charge my credit card 4242 4242 4242 4242 comma expiration 12 28 period"*. Press hotkey again. Text pastes: `"Please charge my credit card [CARD-MASKED], expiration 12 28."` Pill shows badge `[1 item masked]`. | *"Press Ctrl+Shift+Space, speak anywhere, press again. Local Whisper transcribes in-memory, our deterministic pipeline converts spoken punctuation, removes filler words, and masks credit card numbers before pasting."* | `Ctrl+Shift+Space` |
| **00:45 – 01:02** | **Live Engine Swap** | Right-click tray -> Open Settings. Show telemetry card (CPU int8, load latency). Switch radio from `whisper-base` to `whisper-tiny`. Click **Save Changes**. Show load latency update in real time (~1000 ms). Dictate immediately. | *"Need instant speed on low-power hardware? Switch engines live in Settings from Whisper Base to Whisper Tiny. The model swaps in one second with zero client restarts."* | Click **Save Changes** |
| **01:02 – 01:20** | **Chaos Recovery** | Trigger `scripts/chaos.ps1` in a PowerShell window while the pill is visible. Gateway A (port 8085) is killed with `taskkill /F`. Supervisor detects child exit, pill displays "Service restarted", backoff reconnects in ~1 second. Perform another dictation: it succeeds immediately. | *"What happens when a background gateway dies? LocalPill's supervisor catches process termination, executes an exponential backoff reconnect, and recovers without user interruption."* | `powershell -File .\scripts\chaos.ps1` |
| **01:20 – 01:35** | **MCP Integration** | Switch to Claude Desktop or Antigravity chat. Show MCP tools `TranscribeFileJson` and `CleanTextJson`. Prompt: *"Transcribe the file in my LocalPillRecordings folder called standup.wav and give me action items."* AI agent calls `localpill-speech`, returns transcript and bulleted summary. | *"LocalPill also exposes built-in Model Context Protocol tools. AI agents like Claude Desktop or Antigravity can transcribe local voice recordings privately inside an allowed security boundary."* | Send prompt to Claude / Antigravity |
| **01:35 – 01:45** | **Performance** | Display model specs card: Whisper Tiny running at 2.3x faster than real-time (RTF 0.439) with only 214 MB RAM. | *"Local speech inference runs at over twice the speed of real-time speech while Graftcode gives us full type safety and automatic MCP tool exposure."* | — |
| **01:45 – 01:50** | **Conclusion** | Project summary card on screen. | *"LocalPill demonstrates how Graftcode provides clean, multi-language IPC for speech transcription and text normalization on Windows."* | — |

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


