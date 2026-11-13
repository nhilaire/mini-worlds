# Verification report: Bric-à-Jeux v0.2.0

Overall: PASS
Commit: 2646407
Date: 2026-11-13 19:50 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.2.0-universal.apk (135.9 MB)
SHA-256: bd77baccb31455706ba10a5ba27dab2096ffe9d981b1729c36753d4212ab933b

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit 2646407 |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       463 passed, 463 total |
| 5 | expo-doctor | PASS | all checks passed |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.2.0-universal.apk, 135.9 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | WARN | median 3828 ms of 14689 / 3828 / 3427 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 9/9 flows passed, 44 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
