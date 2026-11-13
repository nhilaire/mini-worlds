# Verification report: Bric-à-Jeux v0.2.0

Overall: PASS
Commit: 78caed9
Date: 2026-11-13 09:08 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.2.0-universal.apk (135.9 MB)
SHA-256: a8d45fa73f5e1d75a4622c59769b861df35c44480c3f59ac5d796587a8362ab4

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit 78caed9 |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       453 passed, 453 total |
| 5 | expo-doctor | PASS | all checks passed |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.2.0-universal.apk, 135.9 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | PASS | median 913 ms of 1272 / 913 / 873 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 9/9 flows passed, 42 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
