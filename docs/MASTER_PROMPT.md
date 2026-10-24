# LocalPill: Master Specification & Plan

## PART A: MISSION AND RULES

### 1. Mission
Turn the existing macOS-only "Granite Pill" (an Electron floating speech-to-text pill with a hand-written Python HTTP server) into LocalPill: a private voice layer for Windows apps and AI agents, where all cross-language communication runs through Graftcode instead of hand-written REST.

What the finished product does:
- Dictation anywhere on Windows. Press a global hotkey, speak, press again, and clean text appears at the cursor of whatever app you were using.
- Local-first speech-to-text with swappable engines (local Whisper models by default; optional cloud engine; the original Granite/MLX engine kept for macOS only).
- Deterministic text pipeline in .NET that cleans transcripts (filler words, spoken punctuation, casing, snippets) and masks sensitive data (card numbers, Aadhaar, PAN, API keys, optionally emails and phone numbers) before pasting.
- MCP tools so an MCP client (Claude Desktop, or Antigravity if it supports MCP) can transcribe a local audio file privately through the same speech module.
- A measured before/after comparison of the old REST plumbing versus Graftcode.

### 2. Rules for the Agent
#### 2.1 Honesty about Graftcode (most important)
- Never invent a Graftcode API, flag, package name, or behavior. Everything listed in Section 3 as UNVERIFIED must be confirmed in Phase 0 by reading the official docs/rules and by running it on Windows.
- Install the official Graftcode AI rules for your IDE agent (Section 2.4) and follow them. If they conflict with this document, follow the rules and record the conflict in docs/decisions.md.
- All Graftcode-specific code lives in one adapter file (src/main/graft/adapter.js). A wrong assumption must change one file, not the codebase.
- The benchmark must be fair and reproducible. Report what was measured, with caveats. No cherry-picking.

#### 2.2 Engineering
- Before changing anything: git status must be clean; create a tag rest-baseline on the current commit and a branch graftcode-windows.
- Small commits with clear messages; never leave the branch broken. Each phase ends with passing tests and a note in docs/progress.md.
- Record every deviation from this document in docs/decisions.md.
- Keep business logic free of transport code. Transport (Graft or REST) is a thin layer behind an interface.
- No secrets in the repo; use .env.example. Pin dependency versions.
- Ask before deleting any file that is not in the approved removal list in Section 11.
- Do not add native Node modules unless truly necessary.

#### 2.3 Windows-first rules
- Use path.join/os APIs; never hard-code `/` paths or `bin/python3`.
- Spawn child processes with `windowsHide: true` and kill them as a process tree on exit (`taskkill /pid <pid> /T /F`).
- Bind every local server to `127.0.0.1`.
- Store user data under `%APPDATA%\LocalPill\` and temp audio under `%TEMP%\LocalPill\`.
- All scripts are PowerShell (`.ps1`). Keep `setup.sh` only as a macOS convenience.
- Handle spaces and non-ASCII characters in user profile paths everywhere.

#### 2.4 Antigravity setup
- Rules file at `.agents/rules/localpill.md`.
- Document findings and decisions.
- Terminal safety: ask before installing system-wide software, editing registry/PATH, or deleting files outside repo.

### 3. What is Known and Unknown about Graftcode
UNVERIFIED Phase 0 items to resolve on Windows:
1. gg runs on Windows from PowerShell; where it installs; how to run it hidden; startup time; how to choose and bind a port (loopback only).
2. How a Python module is hosted, and how a Node client installs and calls it.
3. How a .NET module is hosted and called from the same Node client.
4. Type support: strings, ints, doubles, booleans, enums, lists of objects, nested objects, nullable fields, maps, ~1 MB strings, 60-second calls.
5. Exceptions: are custom exception types and messages preserved from Python and .NET to Node?
6. Failure behavior: what happens when a Gateway dies mid-call or is down at startup; reconnect behavior.
7. Electron compatibility: does the Node Graft work inside Electron's main process without native rebuilds or bundling problems?
8. Network behavior: does the Gateway or Graft contact any external host at runtime (telemetry, licensing)?
9. MCP on Windows: exposing a static string method from Python and .NET and calling it from Claude Desktop or Antigravity.
10. Versioning: what a consumer sees after the module's API changes.
11. Metrics: whether the Gateway exposes call/latency data.
12. Shutdown: clean stop of a Gateway on Windows and whether children are left behind.
