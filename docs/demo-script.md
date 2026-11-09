# LocalPill: Live Walkthrough and Demonstration Script

This script provides a step-by-step walkthrough for demonstrating LocalPill to reviewers, users, and prospective developers. It showcases offline speech recognition, cross-language Graftcode RPC, multimodal visual memory, and the Model Context Protocol (MCP) server endpoints.

---

## 1. Setup and Pre-flight Verification

### Prerequisites
* Windows 10 or 11 (x64)
* Python 3.10-3.13 (x64) and Node.js v18+ installed
* `gg.exe` (Graftcode Gateway v1.4.11) in the project root directory
* Working microphone and screen capture permissions

### Initialization
1. Open PowerShell in the project directory:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
   ```
2. Launch the application:
   ```powershell
   npm start
   ```
3. Observe the startup sequence:
   * Supervisor launches Gateway A (Python SpeechService on port 8085 / HTTP 8086).
   * Supervisor launches Gateway B (Node.js TextPipelineService on port 8095 / HTTP 8096).
   * Supervisor warms up Whisper models in memory.
   * The floating pill UI appears in the bottom right corner of the screen.

---

## 2. Walkthrough Segment A: Voice Dictation & Text Normalization

### Goal
Demonstrate sub-second speech transcription and offline text normalization via Graftcode cross-language RPC.

### Steps
1. Open any text editor or messaging app (Notepad, VS Code, Slack, or Word).
2. Click into the editor to ensure cursor focus.
3. Press `Ctrl+Shift+Space` (or click the microphone icon on the pill).
4. Speak clearly:
   > "LocalPill connects Electron to native Python Whisper using Graftcode cross language RPC period That means zero cloud latency and total privacy exclamation mark"
5. Press `Ctrl+Shift+Space` again (or pause for auto-silence detection).
6. **Expected Result**:
   * The pill pulses during audio processing.
   * Transcribed audio is passed to Gateway A over WebSocket (`ws://localhost:8085/ws`).
   * Raw text is normalized by Gateway B (`ws://localhost:8095/ws`), converting spoken punctuation ("period", "exclamation mark") into punctuation symbols.
   * Clean text is pasted directly at your cursor via the Windows `SendInput` subsystem:
     `LocalPill connects Electron to native Python Whisper using Graftcode cross-language RPC. That means zero cloud latency and total privacy!`

---

## 3. Walkthrough Segment B: Visual Memory & Contextual Follow-up

### Goal
Demonstrate intentional screen capture, visual memory indexing, and cross-application contextual query answering.

### Scenario: Capturing Code or Reference Data
1. Open a browser window or editor displaying a code snippet, architectural diagram, or database schema (for example, a Python sorting algorithm or an API definition).
2. Press `Ctrl+Shift+Space` and say:
   > "Hey Pill, remember this screen"
3. **Expected Result**:
   * The pill recognizes the intentional capture command.
   * LocalPill takes a high-resolution snapshot via `desktopCapturer`.
   * The image is analyzed and indexed into the local vector store (`index.json`).
   * The active context is updated to point to this captured screen.
   * Pill displays confirmation: "Remembered current screen".

### Scenario: Answering Questions in an External Application
1. Switch to a completely different application (such as WhatsApp, Microsoft Teams, or an email compose window).
2. Place your cursor in the message box.
3. Press `Ctrl+Shift+Space` and say:
   > "Explain the steps of the program that I asked you to remember"
4. **Expected Result**:
   * Intent router classifies the command as `query_memory`.
   * LocalPill retrieves the active visual memory context without capturing the current blank WhatsApp/email window.
   * Gemini multimodal reasoning analyzes the remembered code screenshot and formulates a concise, step-by-step breakdown.
   * The structured response is pasted directly into your message draft.

### Scenario: Multi-turn Follow-up
1. Immediately press `Ctrl+Shift+Space` again and say:
   > "Summarize the edge cases for that same code"
2. **Expected Result**:
   * LocalPill preserves conversational continuity across turns.
   * The response focuses specifically on edge cases derived from the previously remembered screen.

---

## 4. Walkthrough Segment C: Dynamic Speech Engine Switching

### Goal
Demonstrate live swapping between offline local models and cloud engines without application restarts.

### Steps
1. Right-click the LocalPill system tray icon (or click the Settings gear icon on the pill).
2. In the **Settings Dashboard**, navigate to **Engine Selection**:
   * Default: `whisper-base` (Balanced accuracy and speed, running locally).
   * Switch to: `whisper-tiny` (Ultra-low latency, running locally).
3. Test dictation with `whisper-tiny`:
   * Notice immediate reduction in transcription latency (~200ms on modern CPUs).
4. (Optional) Provide a `GROQ_API_KEY` in Settings and select `groq-whisper`:
   * Dictation now routes to Groq cloud Whisper Large V3 Turbo with zero local CPU load.
5. Switch back to `whisper-base`:
   * Notice that the RPC layer swaps the in-process engine dynamically without interrupting active sessions.

---

## 5. Walkthrough Segment D: External AI Agent Integration via MCP

### Goal
Demonstrate how external tools (such as Claude Desktop or custom agents) can access LocalPill voice and text services using the Model Context Protocol (MCP).

### Steps
1. Verify that Gateway A and Gateway B are running:
   * Gateway A MCP Endpoint: `http://localhost:8085/mcp`
   * Gateway B MCP Endpoint: `http://localhost:8095/mcp`
2. Test Gateway B MCP tool listing via cURL or PowerShell:
   ```powershell
   $body = @{
       jsonrpc = "2.0"
       method = "tools/list"
       params = @{}
       id = 1
   } | ConvertTo-Json

   Invoke-RestMethod -Uri "http://localhost:8095/mcp" -Method Post -ContentType "application/json" -Body $body
   ```
3. Test Gateway A MCP Audio File Transcription:
   * Save an audio recording into the allowed recordings folder (`%USERPROFILE%\LocalPillRecordings\sample.wav`).
   * Trigger the `TranscribeFileJson` tool via MCP:
     ```powershell
     $body = @{
         jsonrpc = "2.0"
         method = "tools/call"
         params = @{
             name = "TranscribeFileJson"
             arguments = @{
                 filePath = "$env:USERPROFILE\LocalPillRecordings\sample.wav"
                 prompt = "meeting transcription"
             }
         }
         id = 2
     } | ConvertTo-Json

     Invoke-RestMethod -Uri "http://localhost:8085/mcp" -Method Post -ContentType "application/json" -Body $body
     ```
4. Verify Security Enforcement:
   * Attempting to access paths outside `%USERPROFILE%\LocalPillRecordings` (e.g. `C:\Windows\win.ini` or relative traversal `..\..\secret.wav`) immediately returns `PathNotAllowedException`.

