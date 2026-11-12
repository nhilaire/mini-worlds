# Verification report: Bric-à-Jeux v0.1.0

Overall: PASS
Commit: c59f57e
Date: 2026-11-12 17:27 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.1.0-universal.apk (135.7 MB)
SHA-256: b9a3891d41cfd8a5b45af305cf2cb04644a23014ea4450db24c18c850744d90e

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit c59f57e |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       289 passed, 289 total |
| 5 | expo-doctor | PASS | all checks passed |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.1.0-universal.apk, 135.7 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | PASS | median 1122 ms of 1548 / 1122 / 813 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 8/8 flows passed, 34 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
