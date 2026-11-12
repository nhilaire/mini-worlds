# Release: Bric-à-Jeux v0.1.0

Phone install: PASS
User acceptance: pending
Date: 2026-11-12
Commit: 3fb1a55
APK: mini-worlds-0.1.0-arm64-v8a.apk (49.8 MB, arm64-v8a)
SHA-256: ceceb8162509e1f06a34b95a2d42b262cf7f15aac58e75fa04f2d308eab3d044
Signature: release signature valid
Phone: Android 11 (API 30, arm64-v8a)
Launch check: alive after 10 s, no fatal error

## Notes from the user test

First phone test (2026-11-12, OnePlus BE2029, Android 11, APK ceceb816..., play log
`raw/phone-logcat-play.txt`: 2747 lines, 0 fatal): not accepted. Four points raised, with the decisions taken
with the user (PRD amendment, fixed through /build-game, then re-verify and re-release):

1. Pixel font too harsh (Press Start 2P on titles and HUD): replace it with a softer pixel font (Pixelify Sans,
   OFL); body text keeps the system font.
2. Pluie de Blocs does not fall while the tutorial bubbles are shown: fall slowly instead (one row every 2 s
   while a bubble is shown, normal interval once the last bubble is dismissed).
3. The ghost piece (destination shadow) stays all round long: show it for the first 5 locked pieces of each
   round only, then hide it.
4. The Puzzle world unlocked after a mediocre first round (2 stars = 1500 points, inflated by the hard drop at
   2 points per row): hard drop = 1 point per row, blocks star thresholds 1000 / 2500 / 5000; the unlock
   conditions do not change.
