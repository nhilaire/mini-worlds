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
- [x] T-38 Pixel font: Jersey 20 replaces Press Start 2P (Pixelify Sans tried first, its 5 reads as an S) in titles, HUD and buttons; licences and README (AC-48, AC-45) - proof: unit
- [x] T-39 Fall speed-up with the pieces locked (−25 ms per 5 pieces) in addition to the lines (AC-49, AC-19) - proof: unit
- [x] T-40 Coin economy: upgrades 250 / 600 / 1 200, level-up 25 × level, challenges 25-50 and all-done bonus 50; first-session budget test (AC-07, AC-10, AC-13, AC-50) - proof: unit
- [x] T-41 Potager Fou replay: match events carry their board, pure replay plan (slide, flash + points, pop, fall), animated canvas with inputs locked (AC-51, AC-45) - proof: unit
- [x] T-42 Launcher icon and splash: generated pixel toy box (scripts/generate-icons.mjs), adaptive icon layers, expo-splash-screen config; generator and config tests (AC-52, AC-53) - proof: unit + device
- [x] T-43 Bulles en Folie replay: pure replay plan (flight along the engine path, glow + points of the popped group, pop, fall of the dropped bubbles, row slide), animated canvas with inputs locked (AC-54, AC-45) - proof: unit

v0.2.0: ten more mini-games (concept test, PRD amended 2026-11-13)

- [x] T-44 Catalogue v0.2.0: 13 games in 6 worlds, stars, upgrades, world conditions, game unlocks inside a world, Result « Nouveau jeu », locked game card, score challenges, achievements, /unlocked opens every game, telemetry enums, fr + en copy (AC-55, AC-56, AC-57, AC-58) - proof: unit
- [x] T-45 Tour Bancale engine + screen (AC-59, AC-69) - proof: unit
- [x] T-46 Saute-Lapin engine + screen (AC-60, AC-69) - proof: unit
- [x] T-47 Lucioles engine + screen (AC-61, AC-69) - proof: unit
- [x] T-48 Plombier Express engine + screen (AC-62, AC-69) - proof: unit
- [x] T-49 Raz-de-Couleurs engine + screen (AC-63, AC-69) - proof: unit
- [x] T-50 Chaussettes Perdues engine + screen (AC-64, AC-69) - proof: unit
- [x] T-51 Vingt-et-Un engine + screen (AC-65, AC-69) - proof: unit
- [x] T-52 Bougies Folles engine + screen (AC-66, AC-69) - proof: unit
- [x] T-53 Perroquet Copieur engine + screen (AC-67, AC-69) - proof: unit
- [x] T-54 Champ de Taupes engine + screen (AC-68, AC-69) - proof: unit
- [x] T-55 Maestro smoke flow of the ten new games through /unlocked, one capture each (AC-70, AC-71) - proof: e2e

After the first phone test of v0.2.0 (2026-11-13, RELEASE.md notes)

- [x] T-56 Tour Bancale stars 150 / 300 / 500 and its score challenge at 150 (AC-55, AC-57) - proof: unit
- [x] T-57 Bougies Folles: 250 ms throw cooldown, 1 s still pause with a « Gâteau n » banner between cakes, no flight for an ignored throw (AC-72, AC-66) - proof: unit
- [x] T-59 Saute-Lapin variety: speed-up 0.35 per obstacle up to 15, gaps 0.8-1.8 s, hedge and bird obstacles (AC-60) - proof: unit
- [x] T-60 Perroquet show restarted for ever on the phone: stable round clock, show decoupled from dispatch identity, frame-by-frame screen test (AC-74) - proof: unit
- [x] T-61 Lucioles easier: par 1 + k, grids 1-2 in 4 × 4 (AC-61) - proof: unit
- [x] T-58 Saute-Lapin smoothness: bunny and fences on Animated values, React renders only on changes (AC-73, AC-90) - proof: unit (AC-73) + device (AC-90)

v0.3.0: ten more games, worlds Stratégie and Exploration (PRD amended 2026-11-13)

- [x] T-62 Catalogue v0.3.0: 23 games in 8 worlds, stars, upgrades, world conditions, score challenges, Ciel étoilé 69, telemetry enums, fr + en copy, placeholder screens and icons (AC-75) - proof: unit
- [x] T-63 Fruits en Fusion engine + screen + casual bot (AC-76, AC-86) - proof: unit
- [x] T-64 Bloc Glissant engine + screen + casual bot (AC-77, AC-86) - proof: unit
- [x] T-65 Suite de Cartes engine + screen + casual bot (AC-78, AC-86) - proof: unit
- [x] T-66 Tri de Billes engine + screen + casual bot (AC-79, AC-86) - proof: unit
- [x] T-67 Calcul Éclair engine + screen + casual bot (AC-80, AC-86) - proof: unit
- [x] T-68 Armée de Poche engine + screen + casual bot (AC-81, AC-86) - proof: unit
- [x] T-69 Fusion de Guerriers engine + screen + casual bot (AC-82, AC-86) - proof: unit
- [x] T-70 Labyrinthe Express engine + screen + casual bot (AC-83, AC-86) - proof: unit
- [x] T-71 Fil d'Ariane engine + screen + casual bot (AC-84, AC-86) - proof: unit
- [x] T-72 Chasse au Trésor engine + screen + casual bot (AC-85, AC-86) - proof: unit
- [x] T-73 Plombier Express: solved grid shown 1 s with the water running, inputs locked (AC-88) - proof: unit
- [x] T-74 Maestro smoke flow of the ten v0.3.0 games through /unlocked (AC-87, AC-89) - proof: e2e

v0.3.0 phone test fixes (2026-11-16):

- [x] T-75 Armée de Poche engine: lane, timed approach per run (3 000 → 2 000 ms), gate of the lane on arrival, no walk guard; bot and stars re-checked (AC-81, AC-92) - proof: unit
- [x] T-76 Armée de Poche screen: neutral gates, two lane halves, army walking to the gates on an Animated value, tutorial copy (AC-92, AC-94) - proof: unit + device (AC-94)
- [x] T-77 Champ de Taupes: cleared board held 1 200 ms with a green check and « Gagné ! », inputs ignored, then the next board (AC-68, AC-93, AC-94) - proof: unit + device (AC-94)
- [x] T-78 Fruits en Fusion engine: merge/vanish steps carry their board, replay plan, guard 300 + 680 ms per step (AC-76, AC-91) - proof: unit
- [x] T-79 Fruits en Fusion screen: replay of the drop and each merge (frame, flash, +points, shrink, grow, fall) (AC-91, AC-94) - proof: unit + device (AC-94)

v0.4.0 (twelve more games, world Défis opens)

- [x] T-80 Catalogue v0.4.0: 12 game ids in their worlds, Défis unlock (30 stars AND level 10), new upgrades, copy fr/en, icons, telemetry ids, v0.3.0 save still loads (AC-95) - proof: unit
- [x] T-81 Couleur Éclair engine + casual bot + stars (AC-96, AC-108) - proof: unit
- [x] T-82 Glisse-Fusion engine + casual bot + stars (AC-97, AC-108) - proof: unit
- [x] T-83 Bataille de Nombres engine + casual bot + stars (AC-98, AC-108) - proof: unit
- [x] T-84 Mini Défense engine + casual bot + stars (AC-99, AC-108) - proof: unit
- [x] T-85 Mains de Cartes engine + casual bot + stars (AC-100, AC-108) - proof: unit
- [x] T-86 Réussite Express engine + casual bot + stars (AC-101, AC-108) - proof: unit
- [x] T-87 Lancer de Cible engine + casual bot + stars (AC-102, AC-108) - proof: unit
- [x] T-88 Tir Parfait engine + casual bot + stars (AC-103, AC-108) - proof: unit
- [x] T-89 Suite Logique engine + casual bot + stars (AC-104, AC-108) - proof: unit
- [x] T-90 Chaîne de Nombres engine + casual bot + stars (AC-105, AC-108) - proof: unit
- [x] T-91 Miroirs et Laser engine + casual bot + stars (AC-106, AC-108) - proof: unit
- [x] T-92 Duo Synchro engine + casual bot + stars (AC-107, AC-108) - proof: unit
- [x] T-93 Screens of the 12 v0.4.0 games: tutorial bubble, HUD, input guards, Pause → Quitter (AC-108) - proof: unit
- [x] T-94 Maestro smoke flow of the twelve v0.4.0 games through /unlocked (AC-109, AC-110) - proof: e2e + device (AC-110)

v0.4.0 phone test changes (PRD amendment 4e3bbd3, approved 2026-11-23)

- [x] T-95 Daily reward: any missed day resets the calendar to day 1 (AC-11) - proof: unit
- [ ] T-96 Game of the day core: draw among playable games, saved {date, gameId}, coins x2 at settlement, round_end daily_game, Result line (AC-111, AC-40) - proof: unit
- [ ] T-97 Home « Jeu du jour » card and game sheet badge, Maestro flow (AC-112) - proof: unit + e2e
- [ ] T-98 Couleur Éclair endless: approach formula past gate 44, no gate limit, bot reaction time, stars recomputed (AC-96, AC-115) - proof: unit
- [ ] T-99 Fruits en Fusion until overflow: draws 0-3 / 0-4 / 0-5, red line, HUD fruits dropped, stars recomputed (AC-76, AC-91, AC-115) - proof: unit
- [ ] T-100 Plombier Express endless: growing grids, allowed taps and timer per grid, HUD, stars recomputed (AC-62, AC-88, AC-115) - proof: unit
- [ ] T-101 Bataille de Nombres engine: training map, no move onto own territory, enemy rule, outcome preview, 4 battles, stars recomputed (AC-98, AC-115) - proof: unit
- [ ] T-102 Bataille de Nombres screen: preview labels, 3 tutorial bubbles, own-territory reselect (AC-113) - proof: unit
- [ ] T-103 Mini Défense engine: 3 turrets, 3 enemies, endless waves, economy, stars recomputed (AC-99, AC-115) - proof: unit
- [ ] T-104 Mini Défense screen: turret picker, HUD « Vague k » (AC-114) - proof: unit
- [ ] T-105 Ciel étoilé copy for every star (105), catalogue check (AC-14, AC-95) - proof: unit
- [ ] T-106 Phone test of the reworked games and the game of the day (AC-116) - proof: device

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
