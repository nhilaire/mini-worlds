# Plan: Bric-à-Jeux v0.1.0

Each task is small (one commit), references the acceptance criteria it serves, and names its proof.
Format: `- [ ] T-01 Title (AC-01, AC-02) - proof: unit|e2e|device`. Check the box only when the proof passes.

## Tasks

Foundations

- [x] T-01 Dependencies (Skia, Reanimated, worklets, Gesture Handler, expo-audio, expo-asset, expo-haptics, expo-font, expo-linking, safe-area) and their Jest mocks; existing tests stay green - proof: unit
- [x] T-02 Seeded random generator and session seed from the deep link `miniworlds://seed/<n>` (AC-16) - proof: unit
- [x] T-03 Content catalogue: worlds, games, star thresholds, upgrades, challenges, achievements as typed data; stars rule (AC-08) - proof: unit

Core meta engine (src/game/core)

- [x] T-04 Round settlement: XP, level, level-up coins, coins with bonus upgrade, short rounds (AC-06, AC-07) - proof: unit
- [x] T-05 World unlocks with announcements (AC-09) - proof: unit
- [x] T-06 Upgrade purchase rules and effects (AC-10) - proof: unit
- [x] T-07 Daily reward calendar (AC-11) - proof: unit
- [x] T-08 Daily challenges: deterministic draw and progress from settled rounds (AC-12, AC-13) - proof: unit
- [x] T-09 Achievements with rewards (AC-14) - proof: unit
- [x] T-10 Save model: schema v1, defaults, unknown fields kept, read-only on newer schema, reset keeps settings and consent (AC-15) - proof: unit

Mini-game engines (src/game/<game>)

- [x] T-11 Block Rain: 7-bag, board, move, rotate with wall kicks, hard drop (AC-17, AC-18) - proof: unit
- [x] T-12 Block Rain: lock, line clear, scoring, back-to-back, gravity interval, end, determinism (AC-19, AC-20, AC-16) - proof: unit
- [x] T-13 Crazy Patch: seeded board without lines, valid-move detection, shuffle invariants (AC-22) - proof: unit
- [x] T-14 Crazy Patch: swaps, line scoring, cascades with multiplier and combos, sixth type from move 11, end, determinism (AC-23, AC-24, AC-25, AC-16) - proof: unit
- [x] T-15 Bubble Frenzy: hex grid, trajectory with wall bounces, snapping, minimum angle (AC-27) - proof: unit
- [x] T-16 Bubble Frenzy: pops, drops, colour draw, pressure rows, end on row 12, empty-board refill, determinism (AC-28, AC-29, AC-16) - proof: unit

Pixel art and text

- [x] T-17 Pixel sprites: palette, sprite grids for every piece, bubble, vegetable, world icon and UI frames, validation tests (AC-44) - proof: unit
- [x] T-18 Dictionaries fr/en with the whole PRD player copy, tu tone, French typography (AC-02, AC-05) - proof: unit

Screens (React, thin)

- [x] T-19 App shell: route state, 3 tabs, Home (level, XP, coins, Play, challenges, next unlock, recent games), theme light/dark (AC-01, AC-03) - proof: unit
- [x] T-20 Worlds map, World detail, Game sheet (AC-31) - proof: unit
- [x] T-21 Upgrades screen (AC-32) - proof: unit
- [x] T-22 Skia board renderer, Block Rain screen: gestures, HUD, pause overlay, background pause, tutorial bubbles (AC-21, AC-39) - proof: unit
- [x] T-23 Crazy Patch screen: swipe swaps, cascade animation, HUD, tutorial bubble (AC-26) - proof: unit
- [x] T-24 Bubble Frenzy screen: aim guide, shot animation, HUD, tutorial bubbles (AC-30) - proof: unit
- [x] T-25 Result screen: score, new best, stars, coins, XP, level-up, unlock, challenges done, three actions (AC-33) - proof: unit
- [x] T-26 Daily reward screen and Home card (AC-34) - proof: unit
- [x] T-27 Daily challenges card on Home with live progress (AC-35) - proof: unit
- [x] T-28 Profile (stats, achievements grid, toast), Settings (sound, vibrations, theme, language, stats, reset with confirmation), About with the story (AC-36, AC-37, AC-38) - proof: unit

Persistence, telemetry, feel

- [x] T-29 Persistence wiring: load at start, debounced save after every change, reset, days played (AC-15) - proof: unit
- [x] T-30 Telemetry calls for the 10 PRD events at the right moments, nothing without consent (AC-40, AC-41) - proof: unit
- [x] T-31 Sound effects (generated WAV, header test) and haptics behind the settings toggles (AC-36) - proof: unit
- [x] T-32 Polish: result count-up and star animation, coins flying, level-up banner, world unlock reveal, piece and pop effects (AC-45) - proof: manual

Proof on the emulator and the phone

- [x] T-33 Maestro flows: smoke with readme captures, worlds and sheet, upgrades, each game through the seed link, daily reward, challenges, settings and reset, about, language, telemetry consent (AC-01, AC-03, AC-21, AC-26, AC-30, AC-31, AC-32, AC-34, AC-35, AC-36, AC-37, AC-38, AC-41) - proof: e2e
- [x] T-34 Device checks: launcher label per language, manifest permissions, cold start (AC-04, AC-42, AC-43) - proof: device

After the first phone test (2026-11-12, RELEASE.md notes)

- [x] T-35 Blocks scoring and stars: hard drop 1 point per row, star thresholds 1 000 / 2 500 / 5 000 (AC-08, AC-18) - proof: unit
- [x] T-36 Tutorial fall: slow tick (one row per 2 s) while a bubble is shown instead of a frozen piece (AC-47, AC-21) - proof: unit
- [x] T-37 Ghost piece for the first 5 locked pieces of each round only (AC-46) - proof: unit
- [ ] T-38 Pixel font: Pixelify Sans (Regular, Bold) replaces Press Start 2P in titles, HUD and buttons; licences and README (AC-48, AC-45) - proof: unit
- [x] T-39 Fall speed-up with the pieces locked (−25 ms per 5 pieces) in addition to the lines (AC-49, AC-19) - proof: unit

## Notes

- Order: foundations and engines first (pure TypeScript, Jest), then screens on top of the engines, then wiring.
  The template placeholder game (src/game/engine.ts, GameScreen) is removed in T-19.
- Rendering: game boards in a Skia `Canvas`; sprites rasterised once per palette into Skia images and drawn with
  nearest sampling. Drawing code is not unit-tested (Maestro screenshots prove it); everything else is.
- Real-time engines take `tick(dt)` from a frame callback; Reanimated shared values carry animation state, React
  re-renders on game events only. Pause on background through `AppState`.
- Short rounds (< 20 s) are a core rule: every screen path that ends a round goes through the same settlement.
- Daily logic depends on an injectable clock (`now()` and local date) so Jest and the seed link control it.
- Firebase is deferred: telemetry calls are unit-tested; `[device]` delivery proof is DEFERRED in this version.
- Risk: Skia + Reanimated + worklets must be installed together (ganja-farmer lesson); clear the Metro cache if a
  build bundles Skia without worklets.
- Risk: Maestro cannot see Skia-drawn text; every HUD value is a React Native `Text` with a testID.
