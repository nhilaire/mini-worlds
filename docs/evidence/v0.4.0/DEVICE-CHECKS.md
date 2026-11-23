# Device checks v0.4.0

Checks that `verify.mjs` does not run, done on the emulator (Medium_Phone_API_36.0, Android 16, API 36) against the
APK of the verified commit (v0.4.0: twelve more games, 35 in total, world Défis opens).

- Verified commit: 9e6dac8
- APK: `dist/mini-worlds-0.4.0-universal.apk` (release build of verify.mjs, package `io.github.nhilaire.miniworlds`,
  installed versionName 0.4.0, versionCode 400)
- APK SHA-256: e411e2f18a869cea7f9eb5d0006a3f201f858c428a1c5f669817f482fca0596c
- Tools: aapt (Android SDK build-tools), adb (`-s emulator-5554`)

| Check | Command | Result | Raw output |
|---|---|---|---|
| Launcher label per language (AC-04) | `aapt dump badging <apk>` filtered on `application-label` | PASS: default `Game Grab-Bag`, `fr` `Bric-à-Jeux`, `en` `Game Grab-Bag` | `raw/device-labels.txt` |
| Manifest permissions (AC-42) | `aapt dump permissions <apk>` | PASS: identical to v0.3.0 (`diff` of the sorted outputs is empty): INTERNET, VIBRATE, ACCESS_NETWORK_STATE, WAKE_LOCK, MODIFY_AUDIO_SETTINGS, the dynamic receiver permission; no AD_ID, no RECORD_AUDIO, no location: the twelve games added no permission | `raw/device-permissions.txt` |
| Permissions of the installed app (AC-42) | `adb -s emulator-5554 shell dumpsys package io.github.nhilaire.miniworlds` | PASS: the same 6 permissions, none dangerous | `raw/device-installed-permissions.txt` |
| Cold start and no crash (AC-43) | verify.mjs rows 10, 11 and 13 | PASS: alive after 8 s, median cold start 839 ms (839 / 727 / 913 ms, target < 3 000 ms), 0 fatal log line during the 11 flows | `REPORT.md`, `raw/logcat-e2e.txt` |
| Launcher icon (AC-53) | `aapt dump badging` (`application-icon-*`), app drawer captured with `adb exec-out screencap` | PASS: adaptive `res/BW.xml`; the drawer shows the toy-box tile on the orange circle, « Game Grab-… » | `raw/device-launcher.png`, crop `screens/device-launcher-icon.png` |
| Splash screen (AC-53) | `am force-stop`, `am start -n <package>/.MainActivity`, `screencap` 350 ms later | PASS: the four pieces on the light background before Home | `raw/device-splash.png`, `screens/device-splash.png` |
| Twelve v0.4.0 game screens (AC-109, look) | captures `screens/newgame-{dash,tiles,conquest,defense,hands,patience,darts,shot,pattern,chain,laser,twins}.png` | PASS: each shows its board, HUD and tutorial bubble without truncated text. Seen: in Mini Défense the tutorial bubble covers the top edge of the board (top-right tower slot half hidden while the bubble is shown), in Lancer de Cible it covers the top edge of the play area; to judge on the phone (AC-110) | `screens/` |
| World map on a new save (v0.4.0) | capture `screens/worlds-02-map-bottom.png` (flow `worlds.yaml`) | PASS: Construction « Bientôt », Défis « Verrouillé » with « 30 étoiles au total » and « Niveau 10 », 2 / 5 jeux | `screens/` |
| Telemetry events in logcat after consent (AC-41) | not run | DEFERRED (firebase): `"firebase": "deferred"`, build with Firebase off | - |

Notes: the first run of verify.mjs on cf09c04 failed on one flow (`worlds.yaml` still expected « Bientôt » on Défis and
an empty fifth slot in Arcade); the flow was updated in 9e6dac8 (no application code changed) and the whole ladder was
run again on that commit. The feel of the twelve v0.4.0 games on the phone (AC-110) is checked at release on the
user's phone (`/release-apk`, RELEASE.md).
