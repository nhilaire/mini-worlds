# Verification report: Bric-à-Jeux v0.4.0

Overall: PASS
Commit: b9a2402
Date: 2026-11-23 17:58 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.4.0-universal.apk (136.2 MB)
SHA-256: a6a9e9152b950e7014aac851d46696bbf73e955ac23c444d283d0d8850b3eca7

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit b9a2402 |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       963 passed, 963 total |
| 5 | expo-doctor | WARN | issues reported (see raw/expo-doctor.txt) |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.4.0-universal.apk, 136.2 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | PASS | median 1392 ms of 1392 / 1574 / 1020 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 12/12 flows passed, 69 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
