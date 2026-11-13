# Release: Bric-à-Jeux v0.2.0

Phone install: PASS
User acceptance: confirmed (2026-11-13)
Date: 2026-11-13
Commit: 7564234
APK: mini-worlds-0.2.0-arm64-v8a.apk (49.6 MB, arm64-v8a)
SHA-256: e73dfb70dec8721843b5633a8d2fe56fef44545719d53880664fa00b44d9630b
Signature: release signature valid
Phone: Android 11 (API 30, arm64-v8a)
Launch check: alive after 10 s, no fatal error

## Notes from the user test

1. Tour Bancale was too hard for its stars: 26 floors gave one star. Decision: stars 150 / 300 / 500, rules unchanged
   (T-56).
2. Saute-Lapin lagged on the phone (not because of the USB cable): the screen re-rendered React on every frame.
   Decision: bunny and fences on Animated values, React renders only on changes (T-58, AC-73).
3. Saute-Lapin gets boring fast; the user wants it to speed up visibly and to vary distances and obstacles.
   Decision: + 0.35 per obstacle up to 15, gaps from 0.8 to 1.8 s of run, hedges and (from the 10th obstacle) birds
   to pass under (T-59, AC-60).
4. Bougies Folles: tapping fast loses the round (two candles before the cake turns 14 degrees). Decision: a 250 ms
   cooldown between throws (T-57, AC-72).
5. Bougies Folles: a pause without throws is needed between two cakes. Decision: the new cake stands still 1 s with
   a « Gâteau n » banner, throws ignored (T-57, AC-72).
6. (second install) Saute-Lapin is good now (smooth, faster, varied).
7. Lucioles is far too hard. Decision: par 1 + k instead of 3 + k, grids 1 and 2 in 4 × 4 (T-61, AC-61).
8. Perroquet Copieur did not work: no pad could be tapped. Cause: the round clock was a new object on every render,
   so every lit pad re-rendered the screen and restarted the show from zero; the player's turn never came (Jest
   jumped the clock past the whole show and hid it). Fix: stable round clock, show decoupled from dispatch, test
   moving the clock frame by frame (T-60, AC-74).
9. (third install) Perroquet Copieur and Lucioles are good now (« c'est bien »).
10. Plombier Express: when a grid is solved, the next one appears at once and the filled pipe is never seen.
    Known issue, deferred by the user to v0.3.0: keep the solved grid about 1 s with the water flowing from the
    entry to the exit, inputs locked.
11. The user validated the concept (« le principe me va ») and asked for about ten more games: v0.3.0.
