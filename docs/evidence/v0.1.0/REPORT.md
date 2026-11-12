# Verification report: Bric-à-Jeux v0.1.0

Overall: PASS
Commit: 1b7ee38
Date: 2026-11-12 10:19 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.1.0-universal.apk (136.2 MB)
SHA-256: d7e6be84c558a238061a95ee7550d3bba7c7e3a48f5a503ba78a3932abf38b97

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit 1b7ee38 |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       280 passed, 280 total |
| 5 | expo-doctor | PASS | all checks passed |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.1.0-universal.apk, 136.2 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | PASS | median 503 ms of 503 / 450 / 628 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 8/8 flows passed, 32 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
