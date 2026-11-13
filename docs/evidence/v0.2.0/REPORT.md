# Verification report: Bric-à-Jeux v0.2.0

Overall: FAIL
Commit: debd77e
Date: 2026-11-13 07:34 UTC
Stack: expo
Target: emulator
APK: not built


| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit debd77e |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | FAIL | Tests:       2 failed, 451 passed, 453 total |
| 5 | expo-doctor | PASS | all checks passed |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
