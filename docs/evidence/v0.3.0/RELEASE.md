# Release: Bric-à-Jeux v0.3.0

Phone install: PASS
User acceptance: pending
Date: 2026-11-16
Commit: 6007278
APK: mini-worlds-0.3.0-arm64-v8a.apk (49.7 MB, arm64-v8a)
SHA-256: 79a04efd4195548c71be8063084aece103b6a325725382054ff1ca0157193650
Signature: release signature valid
Phone: Android 11 (API 30, arm64-v8a)
Launch check: alive after 10 s, no fatal error

## Notes from the user test

First phone test (2026-11-16, OnePlus BE2029; the play log was not recorded: the screen was locked at playlog start).
Not accepted yet; the user has not tested everything.

1. Fruits en Fusion: merges are not visible enough when same fruits touch. Decision: animate the merge (the merged
   fruits flash and join the lowest cell, the new fruit pops, « +points » shows), chains step by step as in Potager.
2. Armée de Poche: red negative gates make the choice too easy. Decision: every gate has the same neutral colour.
3. Armée de Poche: the choice must be timed. Decision: the army walks on its own to each gate pair and stays in its
   lane unless the player taps the other half of the screen; on arrival it takes the gate of its lane. 3 s to the
   first pair, a little less each run, 2 s at the 8th.
4. Champ de Taupes: a cleared board is replaced at once, the win is not seen. Decision: the cleared board stays with
   a green check and « Gagné ! » before the next board, taps ignored meanwhile.
5. Wish: a 2048-like game. Decision: first game of v0.4.0 (not in this release).
