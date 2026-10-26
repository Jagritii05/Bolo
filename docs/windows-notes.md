# LocalPill: Windows Engineering Notes & Architecture Gotchas

This document details the low-level Windows NT engineering considerations, Win32 API interactions, and edge cases discovered and solved while building **LocalPill** on Windows 10/11.

---

## 1. Process Lifecycle & Process-Tree Termination

### The Problem
On POSIX platforms, sending `SIGTERM` or `SIGKILL` to a process group terminates the parent and its children. On Windows, child processes created by `child_process.spawn()` are not automatically killed when the parent exits. If the parent dies unexpectedly or is killed via `process.kill()`, background workers (`python.exe`, `gg.exe`) remain orphaned in memory, holding open ports (`7777`, `8085`, `8095`).

### The Solution: Process Supervisor with `taskkill /T /F`
In `src/main/supervisor.js`:
- Child processes are tracked by PID.
- Process termination uses native Windows tree termination:
  ```powershell
  taskkill /pid <PID> /T /F
  ```
  The `/T` flag walks the entire process tree recursively, ensuring all subprocesses (e.g., GMA analyzers, Python workers) are killed.
- All processes are spawned with `windowsHide: true` to prevent unsightly command prompt windows from popping up during startup or engine switches.

---

## 2. Global Hotkeys on Windows (Win32 RegisterHotKey)

### The Mechanism
In Electron on Windows, `globalShortcut.register` wraps the Win32 API function `RegisterHotKey`.
- **Modifier Translation:** While macOS uses `CommandOrControl` (mapping to the `Cmd` key), on Windows it maps to the `Ctrl` key. LocalPill uses `CommandOrControl+Shift+Space` (or explicitly `Ctrl+Shift+Space`).
- **Conflict Handling:** If another running application (such as an IDE or screen recorder) has already registered the same hotkey combination, `RegisterHotKey` fails and returns `0` (false). LocalPill logs a descriptive warning and preserves a fallback in the system tray menu (`Dictate Now` / context menu action).
- **Thread Affinity:** In Windows NT, hotkey messages (`WM_HOTKEY`) are dispatched to the thread message loop that registered them. Electron handles this transparently in the browser process main thread loop.

---

## 3. Audio Capture on Windows: Web Audio / WASAPI vs. PyAudio / Sox

### The Architectural Choice
The legacy macOS Granite Pill relied on Python-side recording or native macOS AVFoundation bindings. On Windows, third-party audio capture libraries introduce significant pain points:
- `PyAudio` requires PortAudio C headers and Visual C++ Build Tools or pre-built `.whl` files matching the exact Python ABI.
- `sox` or `ffmpeg` CLI tools require external binaries placed in PATH.

### The Solution: Electron Web Audio & WASAPI
LocalPill captures audio entirely within the Electron Renderer process using standard HTML5/W3C `navigator.mediaDevices.getUserMedia({ audio: true })`:
- **Under the Hood:** Chromium delegates directly to the Windows Audio Session API (**WASAPI**) and Windows Media Foundation (WMF).
- **Zero Native Build Dependencies:** Zero `node-gyp` compiling, zero C++ toolchains, and zero PortAudio DLLs.
- **Microphone Permissions:** Windows 10/11 system privacy settings (`ms-settings:privacy-microphone`) govern microphone access. If the user has disabled microphone access globally, `getUserMedia()` rejects with `NotAllowedError`. LocalPill detects this and offers a one-click link to launch the Windows Settings page directly.

---

## 4. Paste Injection: WScript.Shell SendKeys, Win32 SendInput & UIPI

### Injection Techniques on Windows
To paste text into any arbitrary active application at the current cursor position, multiple approaches exist:
1. **`SendInput` via Native C++ Addon (`node-gyp`):** Highest fidelity, but requires Python, Visual Studio C++ compiler, and MSBuild on the user's machine during `npm install`.
2. **`WScript.Shell SendKeys` via PowerShell:** LocalPill writes the sanitized text to the Windows Clipboard using Electron's `clipboard.writeText(text)`, restores focus to the previously active window via Win32 `SetForegroundWindow`, and emits a synthetic `Ctrl+V` keystroke using `WScript.Shell.SendKeys("^v")`. This requires zero native compilation and runs out of the box on any Windows system.

### User Interface Privilege Isolation (UIPI) & Admin Windows
Windows enforces **User Interface Privilege Isolation (UIPI)**. A standard-integrity process (such as LocalPill running as normal user) is strictly blocked by the Win32 subsystem from sending keystrokes or synthetic input messages (`SendKeys`, `keybd_event`, `SendInput`) to an elevated high-integrity window (e.g., Administrator PowerShell, Registry Editor, or Task Manager). Attempting to paste text into an admin window results in silent failure.

#### Win32 TokenElevation Detection
In `src/main/paste.js`:
1. LocalPill queries the foreground window using Win32 API calls (`GetForegroundWindow` -> `GetWindowThreadProcessId` -> `OpenProcessToken`).
2. Checks `TokenElevation`:
   ```powershell
   Get-Process -Id $fgPid | Select-Object -ExpandProperty Path
   # Inspect elevation token
   ```
3. If the active window is running with Administrator elevation:
   - LocalPill **copies the sanitized transcript to the Windows Clipboard**.
   - Displays a non-intrusive warning on the pill:  
     `"Copied. Couldn't paste into an admin window."`
   - The user can simply press `Ctrl+V` manually inside the elevated window.

---

## 5. CTranslate2 CUDA Auto-Detection on Windows

### The Problem
Many Windows laptops feature an NVIDIA discrete GPU (e.g., RTX 3050/4060) alongside an Intel/AMD CPU. When `faster-whisper` initializes `WhisperModel(..., device="cuda")`, CTranslate2's C++ runtime dynamically attempts to link `cublas64_12.dll` and `cudnn_ops64_9.dll`.  
If the machine has NVIDIA graphics drivers installed but lacks the full **NVIDIA CUDA Toolkit v12.x DLLs**, CTranslate2 throws a fatal C++ loader exception or deadlocks, crashing the Python process before Python catch blocks can run.

### The Solution: Pre-Flight DLL Probing via `ctypes`
In `services/speech/speech_service/engines/faster_whisper_engine.py`:
```python
def _detect_hardware():
    if not torch_cuda_available():
        return "cpu", "int8"
    
    # Pre-flight probe for CUDA Toolkit runtime libraries
    try:
        import ctypes
        ctypes.CDLL("cublas64_12.dll")
    except Exception:
        # CUDA drivers exist, but Toolkit DLLs are absent -> safe CPU fallback
        return "cpu", "int8"
        
    return "cuda", "float16"
```
This check executes in under 1 millisecond and ensures that LocalPill selects CPU `int8` without risking loader crashes on standard Windows installations.

---

## 6. Security Boundary & Windows NTFS Directory Junctions

### The Problem
Windows NTFS supports **Directory Junctions** (`mklink /J`) and symbolic links. A standard non-admin user can create a junction pointing from an allowed directory to sensitive system directories:
```powershell
mklink /J "%USERPROFILE%\LocalPillRecordings\evil_junction" "C:\Windows"
```
If an MCP tool checks paths using naive string operations (e.g. `filePath.startsWith(allowedDir)`), an AI agent could read or transcribe arbitrary files through the junction.

### The Solution: Canonical Resolution (`fs.realpathSync`)
In `services/speech_gateway/index.js` (`TranscribeFileJson`):
1. Expands all symlinks, junctions, and relative `..` traversals using `fs.realpathSync()` on both the target file and the boundary folder:
   ```javascript
   const canonicalFile = fs.realpathSync(resolvedPath);
   const canonicalAllowed = fs.realpathSync(rawAllowed);
   ```
2. Performs case-insensitive prefix comparison (since Windows file systems are case-insensitive by default):
   ```javascript
   const normFile = path.normalize(canonicalFile).toLowerCase();
   const normAllowed = path.normalize(canonicalAllowed).toLowerCase();
   const allowedPrefix = normAllowed.endsWith(path.sep) ? normAllowed : normAllowed + path.sep;

   if (!normFile.startsWith(allowedPrefix) && normFile !== normAllowed) {
     throw new Error(`PathNotAllowedException: Access denied: Path '${trimmedPath}' is outside allowed directory`);
   }
   ```
This completely defeats path traversal, junction escapes, and case-mismatch tricks.

---

## 7. Network Interface Binding (`0.0.0.0`) in `gg.exe`

### Empirical Finding
Graftcode Gateway (`gg.exe` v1.4.11) binds to `TCP 0.0.0.0:<port>` (all network interfaces). Because `gg.exe` lacks a `--bind` CLI argument, listeners on ports 8085, 8086, 8095, 8096 are accessible from other machines on the same local area network (LAN) if Windows Firewall permits it.

### Recommended Windows Firewall Rule
To lock down Gateways strictly to localhost, run PowerShell as Administrator:
```powershell
New-NetFirewallRule -DisplayName "LocalPill Gateway Block External" `
    -Direction Inbound `
    -LocalPort 8085, 8086, 8095, 8096 `
    -Protocol TCP `
    -RemoteAddress "LocalSubnet, Internet" `
    -Action Block
```

---

## 8. PyAV 14+ / 19 Audio Demuxing on Windows

### The Problem
PyAV versions 14 through 19 deprecated the `metadata_errors` keyword argument in `av.open()`, causing `faster-whisper`'s internal audio loader to crash with:
`TypeError: open() got an unexpected keyword argument 'metadata_errors'`

### The Solution
1. Applied runtime patch in `faster_whisper_engine.py` stripping `metadata_errors` before forwarding to `av.open`.
2. Implemented direct 16 kHz mono WAV parsing using Python's standard `wave` module, reading raw PCM int16 frames directly into `np.float32` arrays in memory without external process calls.
