# Verification report: Bric-à-Jeux v0.4.0

Overall: PASS
Commit: e9bc770
Date: 2026-11-23 18:48 UTC
Stack: expo
Target: emulator sdk_gphone64_x86_64, Android 16 (API 36, x86_64)
APK: mini-worlds-0.4.0-universal.apk (136.2 MB)
SHA-256: 94281f25e5490ea5db77b6c032aaea7dc38830f82b193f7b7dd47e7c83a3961f

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | clean working tree | PASS | commit e9bc770 |
| 2 | typecheck | PASS | `tsc --noEmit` exit 0 |
| 3 | lint | PASS | `npm run lint` exit 0 |
| 4 | unit tests (Jest) | PASS | Tests:       964 passed, 964 total |
| 5 | expo-doctor | WARN | issues reported (see raw/expo-doctor.txt) |
| 6 | secrets & personal data scan | PASS | secret-scan (worktree): clean |
| 7 | release build | PASS | mini-worlds-0.4.0-universal.apk, 136.2 MB, Firebase off |
| 8 | release signature | PASS | release signature valid; cert SHA-256 54da35e17c99b321... |
| 9 | install (adb) | PASS | Performing Streamed Install Success |
| 10 | launch, alive after 8 s, no fatal error | PASS | process alive, 0 fatal log lines |
| 11 | cold start time | PASS | median 1231 ms of 1375 / 1231 / 982 ms after a warm-up launch (target < 3000 ms) |
| 12 | Maestro E2E flows | PASS | 12/12 flows passed, 69 screenshots in screens/ |
| 13 | no crash during e2e flows | PASS | 0 fatal log lines (crash buffer + errors, raw/logcat-e2e.txt) |

Screenshots: `screens/` (emulator only, no personal data). Raw logs: `raw/` (local, git-ignored).
