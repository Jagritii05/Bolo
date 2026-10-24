# LocalPill: Progress Tracking

## Milestones
- [x] Initial Repository Inspection & Baseline Tag (`rest-baseline`)
- [x] Branch Creation (`graftcode-windows`)
- [x] Antigravity Workspace Rules Configuration (`.agents/rules/localpill.md`)
- [x] Official Graftcode Rules Download & Setup (`.agents/rules/graftcode-*.md`)
- [x] Download & Verification of `gg.exe` on Windows (v1.4.11)
- [x] Phase 0: Graftcode Spike on Windows (completed with empirical findings in `docs/phase0-findings.md`)
- [x] Phase 1: Windows port of existing app (REST baseline)
  - Modular directory layout (`src/main`, `src/preload`, `src/renderer/pill`, `src/renderer/settings`, `services/speech`, `legacy-rest`)
  - Speech service engine abstraction with FasterWhisperEngine (CPU int8 / CUDA fallback), GroqEngine (cloud opt-in), and MlxGraniteEngine (macOS)
  - PyAV 14+ / PyAV 19 compatibility patch (`metadata_errors` deprecation fix) & direct 16kHz WAV-to-float32 numpy loader
  - Windows SendKeys paste injection via WScript.Shell
  - System Tray icon & context menu (Show/Hide, Settings, Engine switch, Logs, Settings file, Quit)
  - Global hotkey `Ctrl+Shift+Space` (CommandOrControl+Shift+Space)
  - Background process supervisor with Windows tree termination (`taskkill /pid <PID> /T /F`)
  - One-command setup (`scripts/setup.ps1`) and `.env.example`
  - Automated tests passing: pytest 7/7 passed, REST baseline server test passed, Electron smoke test passed
- [ ] Phase 2: Speech service as Graftcode module
- [ ] Phase 3: Text pipeline service (.NET / Gateway B)
- [ ] Phase 4: Reliability and error UX
- [ ] Phase 5: Engine swap and Settings
- [ ] Phase 6: MCP
- [ ] Phase 7: Benchmark and privacy check
- [ ] Phase 8: Polish and docs
