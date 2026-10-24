# LocalPill Project Rules

These rules apply to all work on LocalPill in this workspace.

- **Source of truth:** `docs/MASTER_PROMPT.md`. Work one phase at a time and stop at checkpoints.
- **Never invent Graftcode APIs:** Verify all behaviors in `docs/phase0-findings.md`. All Graftcode code goes through `src/main/graft/adapter.js` only.
- **Windows is the primary target:** PowerShell scripts (.ps1), `windowsHide: true`, process-tree kill (`taskkill /pid <pid> /T /F`), loopback binding (`127.0.0.1`).
- **Keep transport out of business logic:** `SpeechClient` and `TextClient` are interfaces with `graft` and `rest` implementations.
- **Privacy & Safety:** Never log transcripts or audio unless `settings.logTranscripts` is true. Never send audio off-device unless the cloud engine is explicitly enabled.
- **File safety:** Ask before deleting files not on the approved removal list in Section 11.
- **Tracking:** Record deviations in `docs/decisions.md` and progress in `docs/progress.md`.
