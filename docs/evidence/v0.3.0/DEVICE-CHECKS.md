# Device checks v0.3.0

Checks that `verify.mjs` does not run, done on the emulator (Medium_Phone_API_36.0, Android 16, API 36) against the
APK of the verified commit (v0.3.0: ten more games, worlds Stratégie and Exploration, Plombier solved grid).

- Verified commit: ba93936
- APK: `dist/mini-worlds-0.3.0-universal.apk` (release build of verify.mjs, package `io.github.nhilaire.miniworlds`)
- APK SHA-256: a0e1e2496491203b48f66c7ab24d9ee518396c47c71303cca8a441e357508dd6
- Tools: aapt (Android SDK build-tools), adb (`-s emulator-5554`)

| Check | Command | Result | Raw output |
|---|---|---|---|
| Launcher label per language (AC-04) | `aapt dump badging <apk>` filtered on `application-label` | PASS: default `Game Grab-Bag`, `fr` `Bric-à-Jeux`, `en` `Game Grab-Bag` | `raw/device-labels.txt` |
| Manifest permissions (AC-42) | `aapt dump permissions <apk>` | PASS: identical to v0.2.0 (INTERNET, VIBRATE, ACCESS_NETWORK_STATE, WAKE_LOCK, MODIFY_AUDIO_SETTINGS, the dynamic receiver permission); no AD_ID, no RECORD_AUDIO, no location: the ten games added no permission | `raw/device-permissions.txt` |
| Permissions of the installed app (AC-42) | `adb -s emulator-5554 shell dumpsys package io.github.nhilaire.miniworlds` | PASS: the same 6 permissions, none dangerous | `raw/device-installed-permissions.txt` |
| Cold start and no crash (AC-43) | verify.mjs rows 10, 11 and 13 | PASS: alive after 8 s, median cold start 870 ms (870 / 926 / 738 ms, target < 3 000 ms), 0 fatal log line during the 10 flows | `REPORT.md`, `raw/logcat-e2e.txt` |
| Launcher icon (AC-53) | `aapt dump badging` (`application-icon-*`), app drawer captured with `adb exec-out screencap` | PASS: adaptive `res/BW.xml`; the drawer shows the toy-box tile on the orange circle, « Game Grab-… » | `raw/device-launcher.png`, crop `screens/device-launcher-icon.png` |
| Splash screen (AC-53) | `am force-stop`, `am start -n <package>/.MainActivity`, `screencap` 350 ms later | PASS: the four pieces on the light background before Home | `raw/device-splash.png`, `screens/device-splash.png` |
| Ten v0.3.0 game screens (AC-87, look) | captures `screens/newgame-{fruit,slide,army,merge,cardline,marbles,maze,trail,treasure,quicksum}.png` | PASS: each shows its board, HUD and tutorial bubble without truncated text | `screens/` |
| Telemetry events in logcat after consent (AC-41) | not run | DEFERRED (firebase): `"firebase": "deferred"`, build with Firebase off | - |

Notes: the feel of the ten v0.3.0 games and the Plombier solved grid on the phone (AC-89, AC-45) are checked at
release on the user's phone (`/release-apk`, RELEASE.md).
