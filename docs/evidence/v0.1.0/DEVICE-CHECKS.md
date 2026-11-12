# Device checks v0.1.0

Checks that `verify.mjs` does not run, done on the emulator (sdk_gphone64_x86_64, Android 16, API 36) against the
APK of the verified commit. Redone after every re-verification (this is the run after the first phone test fixes).

- Verified commit: deed8a3
- APK: `dist/mini-worlds-0.1.0-universal.apk` (release build of verify.mjs, package `io.github.nhilaire.miniworlds`)
- APK SHA-256: 0be02d9b8d5137df1a670338d2e1ee3027552995b86742534871a58244f1890a
- Tools: aapt 36.0.0 (Android SDK build-tools), adb

| Check | Command | Result | Raw output |
|---|---|---|---|
| Launcher label per language (AC-04) | `aapt dump badging <apk>` filtered on `application-label` | PASS: default `Game Grab-Bag` (fallback English), `fr` and `fr-CA` `Bric-à-Jeux`, `en` (+ en-AU/CA/GB/IN) `Game Grab-Bag`, every other locale `Game Grab-Bag` (89 label lines) | `raw/device-labels.txt` |
| Manifest permissions (AC-42) | `aapt dump permissions <apk>` | PASS: INTERNET, VIBRATE, ACCESS_NETWORK_STATE, WAKE_LOCK, MODIFY_AUDIO_SETTINGS, `<package>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; no `AD_ID` / `ACCESS_ADSERVICES_AD_ID`, no `RECORD_AUDIO`, no location permission | `raw/device-permissions.txt` |
| Permissions of the installed app (AC-42) | `adb shell dumpsys package io.github.nhilaire.miniworlds` (requested permissions) | PASS: the same 6 permissions, none dangerous, none granted at runtime | `raw/device-installed-permissions.txt` |
| Cold start and no crash (AC-43) | verify.mjs rows 10, 11 and 13 | PASS: alive after 8 s, median cold start 2 662 ms (1 342 / 2 662 / 2 669 ms, target < 3 000 ms; the previous runs of the day measured 488-635 ms on an idle emulator, the phone test launched instantly), 0 fatal log line during the 8 flows | `REPORT.md`, `raw/logcat-smoke.txt`, `raw/logcat-e2e.txt` |
| Telemetry events in logcat after consent (AC-41) | not run | DEFERRED (firebase): `factory-app.json` has `"firebase": "deferred"`, the build runs with Firebase off (REPORT.md row 7) and `.maestro/telemetry-consent.yaml` is excluded (tag `telemetry`). To redo when a Firebase project is attached (`/setup-firebase`) | - |
| Pixel font legibility (AC-48, screen side) | emulator captures `screens/worlds-06-upgrades.png`, `readme-1-home.png`, `readme-2-game.png` | PASS: Jersey 20 renders « 250 pièces », « 0 / 5 », « Étoile à 1 000 » with distinct digits (Pixelify Sans drew the 5 like an S in the 10:19 run) | `screens/` |

Notes:
- INTERNET and ACCESS_NETWORK_STATE come from the React Native / Expo framework (same set as every factory app);
  the game makes no network call of its own and the APK embeds no Firebase configuration.
- VIBRATE serves the haptic feedback (expo-haptics), MODIFY_AUDIO_SETTINGS and WAKE_LOCK come from expo-audio.
- The name under the icon on the phone itself and the feel of the three games (AC-45) are checked at release on
  the user's phone (`/release-apk`, recorded in RELEASE.md).
