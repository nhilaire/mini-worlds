# Device checks v0.2.0

Checks that `verify.mjs` does not run, done on the emulator (sdk_gphone64_x86_64, Android 16, API 36) against the
APK of the verified commit (v0.2.0: ten more mini-games).

- Verified commit: 78caed9
- APK: `dist/mini-worlds-0.2.0-universal.apk` (release build of verify.mjs, package `io.github.nhilaire.miniworlds`)
- APK SHA-256: a8d45fa73f5e1d75a4622c59769b861df35c44480c3f59ac5d796587a8362ab4
- Tools: aapt (Android SDK build-tools), adb (`-s emulator-5554`)

| Check | Command | Result | Raw output |
|---|---|---|---|
| Launcher label per language (AC-04) | `aapt dump badging <apk>` filtered on `application-label` | PASS: default `Game Grab-Bag` (fallback English), `fr` `Bric-à-Jeux`, `en` `Game Grab-Bag` | `raw/device-labels.txt` |
| Manifest permissions (AC-42) | `aapt dump permissions <apk>` | PASS: INTERNET, VIBRATE, ACCESS_NETWORK_STATE, WAKE_LOCK, MODIFY_AUDIO_SETTINGS, `<package>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; no `AD_ID`, no `RECORD_AUDIO`, no location permission (same set as v0.1.0: the ten games added no permission) | `raw/device-permissions.txt` |
| Permissions of the installed app (AC-42) | `adb -s emulator-5554 shell dumpsys package io.github.nhilaire.miniworlds` (requested permissions) | PASS: the same 6 permissions, none dangerous | `raw/device-installed-permissions.txt` |
| Cold start and no crash (AC-43) | verify.mjs rows 10, 11 and 13 | PASS: alive after 8 s, median cold start 913 ms (1 272 / 913 / 873 ms, target < 3 000 ms), 0 fatal log line during the 9 flows | `REPORT.md`, `raw/logcat-smoke.txt`, `raw/logcat-e2e.txt` |
| Launcher icon (AC-53) | `aapt dump badging <apk>` (`application-icon-*`), then the emulator app drawer captured with `adb exec-out screencap` | PASS: the icon resource is the adaptive `res/BW.xml` (not the template PNG); the drawer shows the cream toy-box tile with the four pieces on the orange circle, labelled « Game Grab-… » (emulator in English) | `raw/device-labels.txt`, `raw/device-launcher.png`, crop `screens/device-launcher-icon.png` |
| Splash screen (AC-53) | `am force-stop`, `am start -n <package>/.MainActivity`, `screencap` 350 ms later | PASS: the four pieces centred on the light background before Home | `raw/device-splash.png`, copy `screens/device-splash.png` |
| Ten new game screens (AC-70, look) | captures `screens/newgame-*.png` of `.maestro/new-games.yaml` | PASS: each game shows its board, HUD and tutorial bubble without truncated text; Saute-Lapin's field is small on screen (to judge on the phone) | `screens/` |
| Telemetry events in logcat after consent (AC-41) | not run | DEFERRED (firebase): `"firebase": "deferred"`, build with Firebase off, `.maestro/telemetry-consent.yaml` excluded (tag `telemetry`) | - |

Notes: the feel of the ten games and whether the collection concept holds (AC-71), and the name under the icon on
the phone itself, are checked at release on the user's phone (`/release-apk`, RELEASE.md).
