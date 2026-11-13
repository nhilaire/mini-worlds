# Verification report: Bric-à-Jeux v0.2.0

Overall: PASS
Commit: 2b63461
Date: 2026-11-13 09:45 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.2.0-universal.apk (135.9 MB)
SHA-256: a910035d9aa7ca65044e4ae0ec413cc03dd124055c7fda56f05c3b19543e0ed7

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit 2b63461 |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       454 passed, 454 total |
| 5 | expo-doctor | PASS | all checks passed |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.2.0-universal.apk, 135.9 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | PASS | median 1040 ms of 1634 / 1040 / 1032 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 9/9 flows passed, 44 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
