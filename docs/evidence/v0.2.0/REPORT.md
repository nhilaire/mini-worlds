# Verification report: Bric-à-Jeux v0.2.0

Overall: PASS
Commit: 737acd0
Date: 2026-11-13 21:28 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.2.0-universal.apk (135.9 MB)
SHA-256: 1d26672e7ab1fcc242eddf71d724ab1ae7740fe2a14022a5107ffe74b5f3c0d4

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit 737acd0 |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       465 passed, 465 total |
| 5 | expo-doctor | PASS | all checks passed |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.2.0-universal.apk, 135.9 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | PASS | median 2793 ms of 4929 / 2793 / 2615 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 9/9 flows passed, 44 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
