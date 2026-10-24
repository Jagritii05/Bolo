# LocalPill: Architectural and Implementation Decisions

## 1. Workspace and Repo Structure
- **Decision:** Moved contents of cloned `wispr-parody` to the root of `GraftCode project` so the workspace and repo root match 1:1.
- **Rationale:** Ensures Antigravity workspace discovery (`.agents/`), git operations, and project paths align cleanly without nested folder confusion. Confirmed with user via prompt selection.

## 2. Antigravity Rules Configuration
- **Decision:** Placed rules in `.agents/rules/localpill.md`.
- **Rationale:** Confirmed via Antigravity's `agy-customizations` built-in skill that `.agents/rules/*.md` are discovered hierarchical workspace rules.
- **Graftcode AI Rules:** The official Graftcode installer (`grft get rules`) supports `cursor`, `claude`, `copilot`, `cline`, `windsurf`, `continue`, and `aider`, but does not list `antigravity`. Per Section 2.4 of the specification ("If Antigravity is not listed, do not guess: tell the human, and place the Graftcode rule text in the workspace rules location"), we downloaded the official Graftcode rules from `github.com/grft-dev/graftcode` for Python, .NET, and TypeScript/Node and placed them into `.agents/rules/graftcode-python.md`, `.agents/rules/graftcode-dotnet.md`, and `.agents/rules/graftcode-typescript-node.md`.

## 3. Graftcode Gateway Installation (Windows)
- **Decision:** `gg.exe` (v1.4.11, Windows amd64) is placed in the workspace root.
- **Rationale:** Fetched directly via `grft-dev/graftcode-gateway` latest releases using the logic in official `https://grft.dev/get` installer script.

## 4. Phase 0 Findings & Runtimes Architecture
- **.NET Runtime Fallback:** `dotnet` is not installed on this developer system. Per Section 5.2 of the specification ("If Phase 0 shows .NET hosting is not workable, fall back to Node or Go for the text module and record it. The demo only needs a third runtime"), we tested and confirmed Node.js module hosting on `gg.exe` works 100%. `TextPipelineService` will be built as a high-performance Node module hosted on Gateway B.
- **Python Runtime on Windows:** `gg.exe` 1.4.11 has an issue with Python 3.13 on Windows due to unescaped path literals in `sys.path.insert` when running from `C:\Users\...` paths. For `SpeechService`, we will host the service on `gg.exe` with a clean adapter bridge to the local faster-whisper Python engine.
- **Loopback & Privacy:** `gg.exe` binds to `0.0.0.0` by default as it lacks a `--host` parameter. Local safety and external network contact (UGM upload to `grft.dev`, Azure App Insights in SDK) are documented in `docs/phase0-findings.md` and will be reflected accurately in `docs/privacy-check.md`.
