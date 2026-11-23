# Verification report: Bric-à-Jeux v0.4.0

Overall: PASS
Commit: 9e6dac8
Date: 2026-11-23 07:31 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.4.0-universal.apk (136.2 MB)
SHA-256: e411e2f18a869cea7f9eb5d0006a3f201f858c428a1c5f669817f482fca0596c

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit 9e6dac8 |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       940 passed, 940 total |
| 5 | expo-doctor | PASS | all checks passed |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.4.0-universal.apk, 136.2 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | PASS | median 839 ms of 839 / 727 / 913 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 11/11 flows passed, 64 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
