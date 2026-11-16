# Verification report: Bric-à-Jeux v0.3.0

Overall: PASS
Commit: 676e07e
Date: 2026-11-16 09:31 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.3.0-universal.apk (136 MB)
SHA-256: 10d0d9bca78014cc6a9d84e230d330d88f70412824c9d8e7bf5d8672849494a0

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit 676e07e |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       654 passed, 654 total |
| 5 | expo-doctor | PASS | all checks passed |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.3.0-universal.apk, 136 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | PASS | median 698 ms of 868 / 695 / 698 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 10/10 flows passed, 54 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
