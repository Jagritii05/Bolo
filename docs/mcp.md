# LocalPill: Model Context Protocol (MCP) Integration

LocalPill exposes local-first speech-to-text and deterministic text normalization directly to AI agents via the **Model Context Protocol (MCP)**. This enables AI desktop clients—such as Claude Desktop and Google Antigravity—to transcribe audio recordings and redact sensitive data with zero external API calls or custom glue code.

---

## 1. Architectural Overview

LocalPill's cross-language gateways (`gg.exe` v1.4.11) automatically expose all hosted public static methods as standard MCP tools over Streamable HTTP and Server-Sent Events (SSE):

| Gateway | Port | Protocol | Exposed MCP Tools |
| :--- | :--- | :--- | :--- |
| **Gateway A (Speech)** | `http://localhost:8085/mcp` | JSON-RPC 2.0 (Streamable HTTP / SSE) | `TranscribeFileJson` |
| **Gateway B (Text)** | `http://localhost:8095/mcp` | JSON-RPC 2.0 (Streamable HTTP / SSE) | `CleanTextJson` |

Both gateways run locally on Windows, bound to the host, and interact with the local whisper models and deterministic sanitization pipelines.

---

## 2. MCP Tool Specifications

### Tool 1: `TranscribeFileJson`
Transcribes an audio file located inside the designated local recordings folder (`MCP_ALLOWED_DIR`) using the currently active Whisper engine (e.g., `whisper-base`, `whisper-tiny`, or `whisper-small`).

- **Declaring Service:** `SpeechService` (Gateway A)
- **Signature:** `TranscribeFileJson(filePath: string, prompt: string): string`
- **Parameters:**
  - `filePath` *(string, required)*: Path to the target audio file inside `%USERPROFILE%\LocalPillRecordings`.
  - `prompt` *(string, optional)*: Contextual prompt or vocabulary hint to guide the transcription model.
- **Return Value:** JSON string containing:
  ```json
  {
    "text": "Meeting notes for Monday standup...",
    "language": "en",
    "duration": 14.8,
    "words": [
      { "word": "Meeting", "start": 0.0, "end": 0.4 },
      { "word": "notes", "start": 0.42, "end": 0.8 }
    ],
    "ready": true
  }
  ```

---

### Tool 2: `CleanTextJson`
Applies deterministic formatting, spoken punctuation conversion, filler word removal, and cryptographic checksum masking for sensitive tokens (Credit Cards, Aadhaar, PAN, API Keys).

- **Declaring Service:** `TextPipelineService` (Gateway B)
- **Signature:** `CleanTextJson(text: string, styleOrOptionsJson: string): string`
- **Parameters:**
  - `text` *(string, required)*: Raw transcription or dictated text.
  - `styleOrOptionsJson` *(string, optional)*: Preset style (`"FORMAL"`, `"CASUAL"`) or JSON options string:
    ```json
    {
      "spokenPunctuation": true,
      "fillerRemoval": true,
      "casing": true,
      "maskSensitiveData": true,
      "snippets": { ":email": "user@example.com" }
    }
    ```
- **Return Value:** Normalized, masked string (e.g. `"My card is [CARD-MASKED]."`).

---

## 3. Mandatory Security & Boundary Policy

To prevent arbitrary local file disclosure when invoked by autonomous AI agents, LocalPill enforces a strict **Sandboxed Boundary Policy**:

```
+-------------------------------------------------------------+
|              Host File System (Windows NT)                  |
|                                                             |
|   C:\Windows\                                [BLOCKED]      |
|   C:\Users\<user>\Documents\                 [BLOCKED]      |
|                                                             |
|   C:\Users\<user>\LocalPillRecordings\        [ALLOWED]      |
|       |                                                     |
|       +-- standup.m4a                        [PERMITTED]    |
|       +-- secret_junction -> C:\Windows\      [BLOCKED]      |
|       +-- evil_traversal\..\..\System32       [BLOCKED]      |
|       +-- password.kdbx                      [BLOCKED]      |
+-------------------------------------------------------------+
```

1. **Dedicated Directory:** Files must reside within `MCP_ALLOWED_DIR` (defaults to `%USERPROFILE%\LocalPillRecordings`).
2. **Canonical Path Resolution (`fs.realpathSync`):** Resolves Windows NTFS directory junctions, symlinks, and relative `..` sequences. If a symlink inside the recordings folder points outside, it is immediately denied.
3. **Strict Exception Typing:** Attempts to access files outside the boundary raise:
   `PathNotAllowedException: Access denied: Path '...' is outside allowed directory '...'`
4. **Extension Allowlist:** Only audio formats are accepted:
   `.wav`, `.mp3`, `.m4a`, `.webm`, `.ogg`, `.flac`. All other extensions raise `InvalidAudioException`.
5. **Size & Duration Caps:** Empty files (0 bytes) and files exceeding 50 MB raise `InvalidAudioException` or `AudioTooLongException`.

---

## 4. Client Configuration Guides

### A. Claude Desktop
Add LocalPill to your Claude Desktop configuration file located at:  
`%APPDATA%\Claude\claude_desktop_config.json`

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

> **Note:** When using native SSE-compatible MCP clients, you can configure the HTTP endpoint directly:
> `http://localhost:8085/mcp` and `http://localhost:8095/mcp`.

---

### B. Google Antigravity
Add LocalPill to your global Antigravity MCP configuration at:  
`~/.gemini/config/mcp_config.json` (or workspace `.agents/mcp_config.json`):

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

---

## 5. Demonstration Walkthrough

### Step 1: Place an audio file in the recordings folder
Save an audio file (e.g. `standup.m4a`) in:
```powershell
%USERPROFILE%\LocalPillRecordings\standup.m4a
```

### Step 2: Prompt Claude Desktop or Antigravity
Send the following prompt to the AI assistant:
> *"Transcribe the file in my LocalPillRecordings folder called standup.m4a and give me action items."*

### Step 3: Tool Execution Flow
1. The AI client calls tool `TranscribeFileJson` on `localpill-speech`:
   ```json
   {
     "name": "TranscribeFileJson",
     "arguments": {
       "filePath": "C:\\Users\\<user>\\LocalPillRecordings\\standup.m4a"
     }
   }
   ```
2. Gateway A validates the canonical boundary and transcribes the file locally via Whisper.
3. The AI client optionally cleans or summarizes the resulting text using `CleanTextJson` on `localpill-text`.
4. The assistant formats and presents the extracted action items.

---

## 6. Verification & Automated Test Suite

Run the automated MCP test suite:
```powershell
npm run test:mcp
```

The test validates:
1. `initialize`, `notifications/initialized`, and `tools/list` over HTTP `/mcp`.
2. Execution of `CleanTextJson` tool over MCP.
3. Execution of `TranscribeFileJson` tool on valid audio.
4. Security boundary enforcement against:
   - Absolute paths outside folder (`C:\Windows\win.ini`)
   - Traversal escapes (`LocalPillRecordings\..\..\`)
   - Junction escapes (directory junction pointing to `C:\Windows`)
   - Disallowed extensions (`.txt`, `.exe`)
   - Empty audio files (0 bytes)
