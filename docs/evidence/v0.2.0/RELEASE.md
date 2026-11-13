# Release: Bric-à-Jeux v0.2.0

Phone install: PASS
User acceptance: pending
Date: 2026-11-13
Commit: 287d097
APK: mini-worlds-0.2.0-arm64-v8a.apk (49.6 MB, arm64-v8a)
SHA-256: b5394ada3bdad292cb7de2d4e3cd85d620e415b395dfa009628eedb4aa20b343
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
