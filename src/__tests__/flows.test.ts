import fs from 'node:fs';
import path from 'node:path';

import { aimAngle } from '../screens/game/BubblesGame';
import { createBubbles, reduceBubbles, LAUNCHER } from '../game/bubbles/engine';
import { createGarden, findValidMoves, reduceGarden } from '../game/garden/engine';

// The seed flows (garden.yaml, bubbles.yaml) script one move whose outcome the engine predicts for a session seed
// (first round of the session = seed + 1). The seed is the first one whose straight-up shot pops a group, so that
// the predicted score is not 0. This test generates the flows and fails on drift; UPDATE_FLOWS=1 rewrites them.
function pickSessionSeed(): number {
  for (let seed = 1; seed < 500; seed++) {
    const shot = reduceBubbles(createBubbles(seed + 1, {}), { type: 'shoot', angle: 90 });
    if (shot.score > 0 && shot.status === 'playing') return seed;
  }
  throw new Error('no seed with a scoring straight shot');
}
const SESSION_SEED = pickSessionSeed();
const ROUND_SEED = SESSION_SEED + 1;
const MAESTRO = path.join(__dirname, '..', '..', '.maestro');

const header = (name: string, tag: string) => `appId: io.github.nhilaire.miniworlds
name: ${name}
tags:
  - ${tag}
---
- launchApp:
    clearState: true
- extendedWaitUntil:
    visible:
      id: "consent-screen"
    timeout: 30000
- tapOn:
    id: "consent-refuse"
- runFlow: helpers/french.yaml
# The test link fixes the seed and opens every world for the session (nothing is written to the save).
- openLink: miniworlds://seed/${SESSION_SEED}/unlocked
- extendedWaitUntil:
    visible:
      id: "home-screen"
    timeout: 30000
- tapOn:
    id: "tab-games"
`;

function gardenFlow(): string {
  const state = createGarden(ROUND_SEED, {});
  const move = findValidMoves(state.board)[0];
  const after = reduceGarden(state, { type: 'swap', from: move.from, to: move.to });
  const direction = move.to.col > move.from.col ? 'RIGHT' : move.to.col < move.from.col ? 'LEFT' : move.to.row > move.from.row ? 'DOWN' : 'UP';
  return `${header(`Potager Fou (seed ${SESSION_SEED}) - the scripted first swap scores as the engine predicts, then Pause and Quitter`, 'garden')}- scrollUntilVisible:
    element:
      id: "world-puzzle"
    direction: DOWN
    timeout: 30000
- tapOn:
    id: "world-puzzle"
- tapOn:
    id: "game-garden"
- assertVisible:
    id: "game-sheet-screen"
- tapOn:
    id: "sheet-play"
- extendedWaitUntil:
    visible:
      id: "garden-screen"
    timeout: 15000
- assertVisible:
    id: "tutorial-swap"
- assertVisible:
    id: "hud-moves"
    text: "20"
- takeScreenshot: garden-01-start
# Scripted swap for round seed ${ROUND_SEED}: cell (${move.from.col},${move.from.row}) towards ${direction}.
- swipe:
    from:
      id: "garden-cell-${move.from.col}-${move.from.row}"
    direction: ${direction}
    duration: 400
- assertNotVisible:
    id: "tutorial-bubble"
- assertVisible:
    id: "hud-score"
    text: "${after.score}"
- assertVisible:
    id: "hud-moves"
    text: "${after.movesLeft}"
- takeScreenshot: garden-02-after-swap
- tapOn:
    id: "game-pause"
- tapOn:
    id: "pause-quit"
- extendedWaitUntil:
    visible:
      id: "result-screen"
    timeout: 10000
- takeScreenshot: garden-03-result
`;
}

function bubblesFlow(): string {
  const angle = aimAngle({ x: LAUNCHER.x, y: LAUNCHER.y - 5 });
  const after = reduceBubbles(createBubbles(ROUND_SEED, {}), { type: 'shoot', angle });
  return `${header(`Bulles en Folie (seed ${SESSION_SEED}) - one scripted shot straight up scores as the engine predicts, then Pause and Quitter`, 'bubbles')}- scrollUntilVisible:
    element:
      id: "world-bubbles"
    direction: DOWN
    timeout: 30000
- tapOn:
    id: "world-bubbles"
- tapOn:
    id: "game-bubbles"
- assertVisible:
    id: "game-sheet-screen"
- tapOn:
    id: "sheet-play"
- extendedWaitUntil:
    visible:
      id: "bubbles-screen"
    timeout: 15000
- assertVisible:
    id: "tutorial-aim"
- takeScreenshot: bubbles-01-start
# A slow vertical swipe from the launcher: the hold dismisses the aim bubble, the release shoots at ${angle}°.
- swipe:
    from:
      id: "bubbles-launcher"
    direction: UP
    duration: 1200
- assertNotVisible:
    id: "tutorial-bubble"
- assertVisible:
    id: "hud-shots"
    text: "1"
- assertVisible:
    id: "hud-score"
    text: "${after.score}"
- takeScreenshot: bubbles-02-after-shot
- tapOn:
    id: "game-pause"
- tapOn:
    id: "pause-quit"
- extendedWaitUntil:
    visible:
      id: "result-screen"
    timeout: 10000
- takeScreenshot: bubbles-03-result
`;
}

describe('seed flows match the engines (AC-26, AC-30)', () => {
  it.each([
    ['garden.yaml', gardenFlow],
    ['bubbles.yaml', bubblesFlow],
  ])('%s is generated from the engine prediction', (file, make) => {
    const expected = make();
    const target = path.join(MAESTRO, file);
    if (process.env.UPDATE_FLOWS === '1' || !fs.existsSync(target)) fs.writeFileSync(target, expected);
    expect(fs.readFileSync(target, 'utf8')).toBe(expected);
  });

  it('the garden swap scores and the straight shot pops a group', () => {
    const state = createGarden(ROUND_SEED, {});
    const move = findValidMoves(state.board)[0];
    expect(reduceGarden(state, { type: 'swap', from: move.from, to: move.to }).score).toBeGreaterThan(0);
    const shot = reduceBubbles(createBubbles(ROUND_SEED, {}), { type: 'shoot', angle: 90 });
    expect(shot.shotsFired).toBe(1);
    expect(shot.score).toBeGreaterThan(0);
    expect(shot.events.some((e) => e.kind === 'pop')).toBe(true);
  });
});
