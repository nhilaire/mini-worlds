# Device checks v0.4.0

Checks that `verify.mjs` does not run, done on the emulator (Medium_Phone_API_36.0, Android 16, API 36) against the
APK of the verified commit (v0.4.0 after its first phone test: daily reward reset, game of the day, Couleur Éclair,
Fruits en Fusion, Plombier Express, Mini Défense and Bataille de Nombres reworked).

- Verified commit: e9bc770 (b9a2402 plus the AC-62 test of the clock behind the tutorial bubble and the pause)
- APK: `dist/mini-worlds-0.4.0-universal.apk` (release build of verify.mjs, package `io.github.nhilaire.miniworlds`,
  installed versionName 0.4.0, versionCode 400)
- APK SHA-256: 94281f25e5490ea5db77b6c032aaea7dc38830f82b193f7b7dd47e7c83a3961f
- Tools: aapt 36.0.0 (Android SDK build-tools), adb (`-s emulator-5554`)

| Check | Command | Result | Raw output |
|---|---|---|---|
| Launcher label per language (AC-04) | `aapt dump badging <apk>` filtered on `application-label` | PASS: default `Game Grab-Bag`, `fr` and `fr-CA` `Bric-à-Jeux`, `en` `Game Grab-Bag` | `raw/device-labels.txt` |
| Manifest permissions (AC-42) | `aapt dump permissions <apk>`, `diff` of the sorted output with the one of 9e6dac8 (empty at the b9a2402 check), then the same 8 lines read again on e9bc770 | PASS: identical: INTERNET, VIBRATE, ACCESS_NETWORK_STATE, WAKE_LOCK, MODIFY_AUDIO_SETTINGS, the dynamic receiver permission; no AD_ID, no RECORD_AUDIO, no location | `raw/device-permissions.txt` |
| Permissions of the installed app (AC-42) | `adb -s emulator-5554 shell dumpsys package io.github.nhilaire.miniworlds` | PASS: versionName 0.4.0, the same 6 permissions, none dangerous | `raw/device-installed-permissions.txt` |
| Cold start and no crash (AC-43) | verify.mjs rows 10, 11 and 13 | PASS: alive after 8 s, median cold start 1 231 ms (1 375 / 1 231 / 982 ms, target < 3 000 ms), 0 fatal log line during the 12 flows | `REPORT.md`, `raw/logcat-e2e.txt` |
| Launcher icon (AC-53) | `aapt dump badging` (`application-icon-160`); `git diff --stat 9e6dac8 e9bc770 -- assets scripts/generate-icons.mjs app.json` | PASS: adaptive `res/BW.xml`; icon sources unchanged since the drawer capture of 9e6dac8 (empty diff) | `raw/device-labels.txt`, `screens/device-launcher-icon.png` |
| Splash screen (AC-53) | `am force-stop`, `am start -n <package>/.MainActivity`, `screencap` 350 ms later | PASS: the four pieces on the light background before Home | `raw/device-splash.png`, `screens/device-splash.png` |
| Game of the day card (AC-112, look) | captures `screens/daily-game-0{1,2,3}-*.png` (flow `daily-game.yaml`) | PASS: « Jeu du jour », « Pluie de Blocs », « Pièces ×2 aujourd'hui » and its « Jouer » under the daily reward card, above the main « Jouer »; no truncated text | `screens/` |
| Reworked game screens (look) | captures `screens/newgame-{dash,fruit,pipes,conquest,defense}.png` | PASS: Mini Défense shows « Vague 1 » without a total and its new bubble; Bataille de Nombres opens on the training map (10 / 3 / 6) with « Bataille 1 / 4 » and its first bubble; the bubble still covers the top edge of the Mini Défense board while it is shown (to judge on the phone, AC-116) | `screens/` |
| Telemetry events in logcat after consent (AC-41) | not run | DEFERRED (firebase): `"firebase": "deferred"`, build with Firebase off | - |

Notes: the feel of the reworked games and of the game of the day on the phone (AC-110, AC-116) is checked at release on
the user's phone (`/release-apk`, RELEASE.md).
