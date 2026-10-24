# Phase 0: Graftcode Spike on Windows — Findings & Evidence

**Date:** 2026-10-25  
**Platform:** Windows 10/11 x64 (PowerShell)  
**Gateway Version:** Graftcode Gateway (`gg.exe`) v1.4.11  
**Runtime Versions Tested:** Node.js v22.14.0 (host system) / Node 22.18 (embedded), Python 3.13.14  

---

## Executive Summary

Phase 0 investigated all 12 UNVERIFIED questions from Section 3 of the project specification through empirical execution on Windows. 
A complete end-to-end integration was successfully built and tested:
1. `gg.exe` running a Node.js module (`NodeCalculator`).
2. Type serialization, 1 MB payload transfer in **14 ms**, delay calls, and custom error propagation.
3. An Electron main process script importing the auto-generated `@graft/npm-node-calculator` package and calling remote methods over `ws://localhost:8088/ws` with zero native rebuilds.
4. MCP protocol execution over `http://localhost:8088/mcp` with `initialize`, `tools/list`, and `tools/call`.
5. Process lifecycle, clean shutdown, and absence of orphaned processes.

Key gotchas discovered:
- `gg.exe` binds to `0.0.0.0` by default (no `--host` flag).
- `gg.exe` Python runtime launcher on Windows has an issue resolving `hypertube.core.receiver.Receiver` with Python 3.13 when run from directories containing `\U` escapes (like `C:\Users\...`).
- `.NET` SDK is not installed on this machine; fallback to Node.js for the text pipeline service is ready and verified.
- Arbitrary untyped JavaScript object literals (`{}`) cannot be passed directly as method arguments; primitives, plain arrays (`T[]`), registered DTOs, or JSON strings must be used.
- The Gateway uploads UGM to `https://grft.dev/uploadUGM/store` on startup, and `hypertube-nodejs-sdk` references Azure Application Insights for SDK errors.

---

## Detailed Findings: The 12 UNVERIFIED Items

### Item 1: `gg` on Windows, Startup, Hidden Run, and Port Binding
- **Execution & Location:** `gg.exe` downloaded via official installer logic into workspace root.
- **Hidden Execution:** Verified via Node `child_process.spawn('gg.exe', [...], { windowsHide: true })` and PowerShell `-WindowStyle Hidden`.
- **Startup Time:** ~1.2s – 2.5s once GMA cache (`GMA.zip`) exists. First run builds GMA in ~10s.
- **Port Selection:** Configurable via `--port <number>` (WebSocket / Vision) and `--httpPort <number>`.
- **Binding Interface:** **Crucial Finding:** `netstat -ano | findstr 8088` proved `gg.exe` listens on `TCP 0.0.0.0:8088` and `[::]:8088`, NOT `127.0.0.1` exclusively. There is no `--bind` or `--host` CLI flag in `gg.exe`. To ensure local-only safety, Windows Firewall rules should block external inbound traffic to these ports.
- **Status:** **Confirmed (with 0.0.0.0 caveat).**

### Item 2: Python Module Hosting & Calling from Node
- **Findings:** `gg.exe` embeds `HypertubePythonRuntimeNative.dll` which attempts to load `python*.dll`.
  - Required setting `HYPERTUBE_PYTHON_RUNTIME_PATH` to the full path of `python313.dll`.
  - On Windows, `HypertubePythonRuntimeNative.dll` encountered `Exception code 012. Reinstall Hypertube package` during `Receiver` lookup in Python 3.13.
  - Decompilation and disassembly of `HypertubePythonRuntimeNative.dll` revealed unescaped path string insertion in `import sys; sys.path.insert(0, 'C:\Users...')` which triggers Python `SyntaxError: (unicode error) 'unicodeescape' codec can't decode bytes in position 2-3: truncated \UXXXXXXXX escape`.
- **Status:** **Partial / Bug Identified.**
- **Proposed Fallback:** Run `SpeechService` using Python via a clean local subprocess bridge to Node, or run Python with a dedicated venv in a root path (e.g. `C:\LocalPill\`).

### Item 3: .NET Module Hosting
- **Findings:** `dotnet` is not installed on this machine (`The term 'dotnet' is not recognized`).
- **Status:** **Denied on this machine.**
- **Proposed Fallback:** Per Section 5.2 of the specification, fall back to Node.js for `TextPipelineService`. Node.js hosting was verified 100% functional on `gg.exe`.

### Item 4: Type Support & Stress Testing
- **Primitives:** `string`, `int`, `double`, `boolean`, `null`, `undefined` work seamlessly.
- **Arrays:** Plain arrays (`string[]`, `number[]`) work seamlessly.
- **Objects/Maps:** Arbitrary untyped JavaScript objects (`{}`) fail with:
  `Error: Unsupported payload item type: Object for payload item: [object Object]` in `hypertube-nodejs-sdk/lib/sdk/InvocationContext.js:951`. Collections must be plain arrays (`T[]`) or JSON strings.
- **Large Payload:** Tested `generateLargeString(1024)` (1,048,576 characters). Round-trip completed in **14 ms**.
- **Long/Delayed Calls:** Methods must be synchronous. Returning an un-awaited `Promise` from an async method returns `[object Object]` instead of resolving.
- **Status:** **Confirmed (with type constraint rules).**

### Item 5: Exception Preservation
- **Findings:** Thrown exceptions in hosted methods propagate across WebSocket into the consumer as a standard `Error`.
- **Evidence:** Calling `throwError("Custom sensitive error occurred!")` threw:
  ```
  Error class: Error
  Error message: CustomException: Custom sensitive error occurred!
  Has custom message substring: true
  ```
- **Status:** **Confirmed.**

### Item 6: Failure & Reconnect Behavior
- **Offline Gateway:** Calling an offline Gateway (port 8999) failed in **155 ms** with:
  `WebSocket send to ws://localhost:8999/ws failed after 2 attempts. Last error: WebSocket connection to ws://... failed`.
- **Gateway Death:** Connection drops immediately. The Node supervisor can detect child exit and restart the gateway with backoff (1s, 2s, 5s, 10s).
- **Status:** **Confirmed.**

### Item 7: Electron Main Process Compatibility
- **Findings:** Verified inside Electron main process (`test_electron_graft.js` via `electron.cmd`).
- **Evidence:**
  ```
  [Electron Main] Testing Graftcode call inside Electron...
  [Electron Main] NodeCalculator.add(40, 2) = 42
  [Electron Main] NodeCalculator.echo = Electron Graft success!
  ELECTRON_GRAFT_TEST_PASSED
  ```
- No native module rebuilds or bundling issues required.
- **Status:** **Confirmed 100%.**

### Item 8: Network & Telemetry Behavior
- **Findings:**
  - `gg.exe` uploads the UGM to `https://grft.dev/uploadUGM/store` and contacts GSMU backend at startup.
  - `hypertube-nodejs-sdk` contains an Azure Application Insights telemetry endpoint: `https://polandcentral-0.in.applicationinsights.azure.com` for SDK exceptions.
  - Runtime method calls over `GraftConfig.host = 'ws://localhost:<port>/ws'` are local.
- **Privacy Impact:** Audio and transcripts remain local on device in local engine mode; however, gateway metadata and SDK exception telemetry contact external servers.
- **Status:** **Discovered & Documented.**

### Item 9: MCP on Windows
- **Findings:**
  - `gg.exe` provides a Streamable HTTP / SSE MCP server on `http://localhost:<port>/mcp`.
  - Protocol: JSON-RPC 2.0 with `Mcp-Session-Id` header.
  - Tested: `initialize`, `notifications/initialized`, `tools/list`, and `tools/call`. All static methods are automatically exposed as MCP tools.
  - Antigravity configures MCP via `~/.gemini/config/mcp_config.json` using SSE transport (`serverUrl`).
  - Claude Desktop configures MCP via `%APPDATA%\Claude\claude_desktop_config.json`.
- **Status:** **Confirmed 100%.**

### Item 10: Versioning & API Evolution
- **Findings:**
  - Without a portal `--projectKey`, the registry GUID changes on each Gateway restart.
  - **Crucial Discovery:** At runtime, the client communicates with the WebSocket server (`ws://localhost:<port>/ws`). Existing client code continues to work across Gateway restarts without reinstalling. Reinstallation is only needed when new methods are added to update typings.
- **Status:** **Confirmed.**

### Item 11: Gateway Metrics & Health Endpoints
- **Findings:**
  - `GET /status` returns HTTP 200 `OK`.
  - `GET /metrics` returns HTTP 404.
  - `GET /health` returns HTTP 404.
  - `GET /libraries` returns the UGM JSON.
  - `GET /npm` returns the npm install command.
- **Status:** **Confirmed (No built-in metrics/latency endpoint; use /status for health).**

### Item 12: Shutdown & Process Cleanup
- **Findings:**
  - `gg.exe` embeds runtime native DLLs directly and spawns **no child processes** (verified with WMI `Win32_Process`).
  - Killing `gg.exe` terminates all threads and releases all network ports cleanly.
- **Status:** **Confirmed 100%.**
