# LocalPill: Windows Manual QA Checklist & Verification Matrix

This document provides step-by-step procedures to manually verify every error state, UI condition (Section 6.5), target app paste behavior, and Windows hardware/system edge cases.

---

## 1. Section 6.5 Error Mapping Verification Matrix

| # | Condition | Exact Pill Message | Action / Behavior | Reproduction Steps | Expected Result | Verified |
|---|---|---|---|---|---|:---:|
| 1 | **Gateway not up yet** | `"Starting services…"` | Pill shows loading state while supervisor retries connection | Stop Gateways; launch app; observe initial pill UI before services bind ports | Pill displays `"Starting services…"` with animated loading dot until ready | [x] |
| 2 | **Model loading** | `"Loading speech model…"` | Pill waits while Whisper model weights load into RAM/VRAM | Trigger cold load of model or switch to a large engine (`whisper-small`) | Status shows `"Loading speech model…"` until loaded, then transitions to `"Press Ctrl+Shift+Space to speak"` | [x] |
| 3 | **Invalid / empty audio** | `"Didn't catch any audio. Try again."` | Pill stays idle and returns to Ready after 2.5s | Press hotkey, immediately press hotkey again without speaking (< 800 bytes) | Pill shows `"Didn't catch any audio. Try again."` and returns to Ready | [x] |
| 4 | **Audio too long** | `"Recording too long (max 10 min)."` | Pill rejects file and returns to Ready | Pass an audio file exceeding 600s/10min to transcription endpoint | Pill displays `"Recording too long (max 10 min)."` | [x] |
| 5 | **Engine unavailable** | `"Engine unavailable: <reason>. Switched to <fallback>."` | Auto fallback to `whisper-base` or `whisper-tiny` | Request unavailable engine (e.g. `mlx-granite` on Windows or missing CUDA) | System catches `EngineUnavailableException`, auto-switches to `whisper-base`, and informs user | [x] |
| 6 | **Transcription failed** | `"Transcription failed. Details in log."` | Pill shows error state and logs diagnostic info | Provide corrupted or unreadable audio bytes to speech service | Pill displays `"Transcription failed. Details in log."` with red status dot | [x] |
| 7 | **Gateway died mid-call** | `"Service restarted, please retry."` | Supervisor restarts gateway; auto-retries once; returns actionable message if second attempt fails | Kill Gateway A PID mid-transcription | Supervisor detects unexpected death, auto-restarts gateway, and pill reports `"Service restarted, please retry."` | [x] |
| 8 | **Elevated (Admin) Window** | `"Copied. Couldn't paste into an admin window."` | Text copied to clipboard; keystroke suppressed to prevent UIPI violation | Focus an elevated Command Prompt or PowerShell (Run as Administrator), speak, and press hotkey | Pill shows `"Copied. Couldn't paste into an admin window."`. Text is on clipboard (`Ctrl+V` pastes manually) | [x] |
| 9 | **Microphone permission denied** | `"Allow microphone access in Windows Settings > Privacy."` | Clickable link opens `ms-settings:privacy-microphone` | Revoke microphone permission in Windows Settings or block in browser | Pill displays clickable error message. Clicking opens Windows Privacy Settings | [x] |
| 10 | **Masked items badge** | `"Done · N items masked"` | Pill shows count badge of masked sensitive entities | Speak text containing card/Aadhaar/PAN (e.g. `"card 4532... period"`) | Pill displays `"Done · 1 item masked"`, text pasted has `[CARD-MASKED]` | [x] |

---

## 2. Target Application Paste Checklist

Verify auto-paste keystroke injection into the following Windows applications:

- [ ] **Windows Notepad (`notepad.exe`)**:
  - Focus Notepad editor, speak `"Testing LocalPill dictation period"`.
  - Verify clean text `"Testing LocalPill dictation."` is injected at caret.
- [ ] **Google Chrome / Microsoft Edge**:
  - Focus address bar or a web text input (e.g., Google search or Google Docs).
  - Verify text is pasted cleanly without double characters.
- [ ] **Visual Studio Code (`code.exe`)**:
  - Focus an active code file or terminal pane.
  - Verify indentation and line breaks are preserved when speaking `"new line"`.
- [ ] **Microsoft Word / WordPad**:
  - Focus Word document, speak paragraph with spoken punctuation.
  - Verify formatting and capitalization.
- [ ] **Slack / Discord**:
  - Focus message input box, speak sentence, verify text appears without sending message prematurely.
- [ ] **Windows Terminal (`wt.exe` / `powershell.exe`)**:
  - In a standard (non-elevated) terminal tab, verify text pastes cleanly at the shell prompt.

---

## 3. Windows System & Hardware Edge Cases

- [ ] **Elevated Admin Window Handling**:
  - Launch PowerShell as Administrator.
  - Press `Ctrl+Shift+Space`, speak `"admin test"`, press again.
  - Verify UIPI block is handled gracefully: Pill displays `"Copied. Couldn't paste into an admin window."` and text is available on clipboard.
- [ ] **Multi-Monitor & DPI Scaling**:
  - Position Pill window on secondary monitor with 125% or 150% DPI display scaling.
  - Verify text rendering, pill dimensions, and tray positioning remain sharp with zero blurry textures.
- [ ] **Sleep and Resume**:
  - Put Windows machine to sleep (or trigger lock screen `Win+L`).
  - Wake system and unlock.
  - Verify supervisor processes remain alive and global shortcut `Ctrl+Shift+Space` remains responsive.
- [ ] **Global Hotkey Conflict**:
  - If another application reserves `Ctrl+Shift+Space`, verify LocalPill logs a descriptive warning without crashing, and system tray menu allows triggering dictation.
- [ ] **Non-ASCII Windows User Path**:
  - Test on a Windows account path containing spaces or non-ASCII unicode characters (e.g., `C:\Users\José García`).
  - Verify temporary audio files and model paths resolve properly.
- [ ] **First Run Offline (No Internet)**:
  - Disconnect Wi-Fi / Ethernet after models have been downloaded via `scripts/setup.ps1`.
  - Verify local Whisper transcription operates completely offline with zero network requests.
