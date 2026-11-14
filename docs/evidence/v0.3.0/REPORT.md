# Verification report: Bric-à-Jeux v0.3.0

Overall: PASS
Commit: f2a42f9
Date: 2026-11-14 18:16 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.3.0-universal.apk (136 MB)
SHA-256: 295787312c89b5fc0620e5492fe6428c73df4b56971573a0b7f1e99ed4f9a4f8

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit f2a42f9 |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       634 passed, 634 total |
| 5 | expo-doctor | PASS | all checks passed |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.3.0-universal.apk, 136 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | PASS | median 803 ms of 860 / 660 / 803 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 10/10 flows passed, 52 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
