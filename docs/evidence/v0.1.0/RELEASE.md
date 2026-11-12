# Release: Bric-à-Jeux v0.1.0

Phone install: PASS
User acceptance: pending
Date: 2026-11-12
Commit: f858ae8
APK: mini-worlds-0.1.0-arm64-v8a.apk (49.4 MB, arm64-v8a)
SHA-256: 70f615d1d2da7967f5c683b829ebcb6bf64ce5c2cdd6733b6f7b80a6eb07d7d5
Signature: release signature valid
Phone: Android 11 (API 30, arm64-v8a)
Launch check: alive after 10 s, no fatal error

## Notes from the user test

First phone test (2026-11-12, OnePlus BE2029, Android 11, APK ceceb816..., play log
`raw/phone-logcat-play.txt`: 2747 lines, 0 fatal): not accepted. Four points raised, with the decisions taken
with the user (PRD amendment, fixed through /build-game, then re-verify and re-release):

1. Pixel font too harsh (Press Start 2P on titles and HUD): replace it with a softer pixel font; body text keeps
   the system font. Pixelify Sans was tried first: on the emulator captures its 5 reads as an S at every size
   (« 2S0 pièces »), so Jersey 20 (OFL, distinct digits, full French accents) was chosen instead.
2. Pluie de Blocs does not fall while the tutorial bubbles are shown: fall slowly instead (one row every 2 s
   while a bubble is shown, normal interval once the last bubble is dismissed).
3. The ghost piece (destination shadow) stays all round long: show it for the first 5 locked pieces of each
   round only, then hide it.
4. The Puzzle world unlocked after a mediocre first round (2 stars = 1500 points, inflated by the hard drop at
   2 points per row): hard drop = 1 point per row, blocks star thresholds 1000 / 2500 / 5000; the unlock
   conditions do not change.
5. (raised after the first fixes) Coins come too fast: a first session (three rounds, day-1 reward, three
   challenges, level 2) reached ~835 coins against an upgrade line of 850. Decision: upgrades 250 / 600 / 1 200,
   level-up 25 × level, challenges 25-50 coins, all-done bonus 50; round earnings unchanged (AC-50).
6. (raised during the fixes) The fall of Pluie de Blocs never felt faster in a round without lines: the interval
   now also shortens by 25 ms every 5 pieces locked (AC-49).
7. (raised during the fixes) Potager Fou looked like a new puzzle after each move: no transition between the
   board before the swap and the settled board, nothing showed which pieces were aligned. Decision: the screen
   replays the swap from the engine events (slide, frame + flash of the aligned pieces with the points, pop,
   fall of the pieces above and arrival of the new ones), inputs locked during the replay (AC-51).
8. (second phone test, 2026-11-12 afternoon) The launcher icon and the splash screen were still the Expo
   placeholders. Decision: a pixel « toy box » icon generated from the game sprites (adaptive layers, monochrome,
   legacy icon, favicon) and a splash image on the app background through expo-splash-screen (AC-52, AC-53).
9. (second phone test) Bulles en Folie had no movement: the shot bubble appeared at its cell and the popped
   group vanished at once, nothing showed what the shot destroyed. Decision: the screen replays the shot from the
   engine events (flight with bounces, glow and points of the popped group, pop, fall of the dropped bubbles,
   slide of a pushed row), inputs locked during the replay (AC-54).
