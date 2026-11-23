# Release: Bric-à-Jeux v0.4.0

Phone install: PASS
User acceptance: pending
Date: 2026-11-23
Commit: 1ca3efd
APK: mini-worlds-0.4.0-arm64-v8a.apk (49.9 MB, arm64-v8a)
SHA-256: a06855adf00b398dba1c20f3cf714768b8606196c2ad3f3ffa20369e92a3c73e
Signature: release signature valid
Phone: Android 11 (API 30, arm64-v8a)
Launch check: alive after 10 s, no fatal error

## Notes from the user test

First phone test, 2026-11-23 (OnePlus BE2029, Android 11), partial: the user is still testing the other games.
Not accepted yet. Points raised:

1. Daily reward: missing a single day must reset the calendar to day 1, to make players come back every day (today a
   gap of one missed day keeps the calendar day, two or more reset it).
2. New feature wished: a « jeu du jour » (game of the day) playable straight from Home, maybe with a boost of x %.
3. Couleur Éclair: the end came very fast and the round stops (after gate 60); the user expects to play until the
   last life is lost.
4. Fruits en Fusion: the round ends too fast (40 fruits) and gave only one star although nothing could be built; it
   is not long enough.
5. Plombier Express: same impression as Fruits en Fusion, the round ends too fast (5 grids of 5 × 5, maximum 1 500
   points).
6. Mini Défense: lacks strategy (you get gold, you build and it works); it also ends too fast (6 waves) and gave
   only one star.
7. Bataille de Nombres: looks very complicated, or the strategy was not understood.

Decisions taken with the user after the test (2026-11-23), to amend in the PRD:
- Daily reward: any missed day resets the calendar to day 1.
- Game of the day: one unlocked game drawn per local date (same for every player on a date), Home card with « Jouer »; coins ×2 on every round of that game until midnight.
- Couleur Éclair: no gate limit, the round ends at the 3rd life lost; the gates keep speeding up slowly after gate 44 down to a very fast cap; star thresholds recomputed.
- Fruits en Fusion: no fruit limit, the round ends when a fruit overflows the jar; star thresholds recomputed (first star early).
- Plombier Express: endless grids growing 4 × 4, 5 × 5, then 6 × 6; the round ends at the first failed grid; star thresholds recomputed.
- Mini Défense: 3 turrets (Rapide: low damage, fast; Canon: high damage, slow, area; Givre: slows), 3 enemies (normal, fast, armoured), less gold, endless waves until the last life.
- Bataille de Nombres: outcome preview on each neighbour before an attack, a 3-bubble tutorial, a first training map of 3 territories with a passive enemy, and moves only onto other territories (no reinforcing one's own).
- Other games with a fixed end: unchanged for now (only the 5 games cited).
The play log was not saved: the phone was unplugged before `playlog save`; it will be taken at the next install.
