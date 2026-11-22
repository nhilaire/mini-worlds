import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { createLaser, isSolved, LASER_FLIP_MS, LASER_SIZE, LaserState, otherLean, puzzleScore, reduceLaser, shortestSolution, SOLVED_SHOW_MS, traceBeam } from '../game/laser/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { LaserGame } from '../screens/game/LaserGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save from
// AsyncStorage first, as in the app where the game only opens once the store is loaded.
const SEED = 2026;
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <LaserGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(hintLevel = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'challenges'];
  if (hintLevel > 0) save.games.laser.upgrades = { hint: hintLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('laser-screen')).toBeTruthy();
  return onFinish;
}

/** Moves the injectable clock and lets the frame loop (requestAnimationFrame) run. */
async function advance(ms: number) {
  nowMs += ms;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

/** Lets the 120 ms flip run out (frames of 50 ms at most). */
async function endFlip() {
  for (let t = 0; t < LASER_FLIP_MS + 50; t += 50) await advance(50);
}

const pos = (cell: number) => `${cell % LASER_SIZE}-${Math.floor(cell / LASER_SIZE)}`;
const mirrorId = (state: LaserState, mirror: number) => `laser-mirror-${pos(state.board.mirrors[mirror])}`;
const leansOnScreen = (state: LaserState) => state.board.mirrors.map((_, m) => screen.getByTestId(mirrorId(state, m)).props.accessibilityValue.text);
/** Cells where a piece of beam is drawn, sorted (a cell crossed twice shows twice). */
const beamOnScreen = () =>
  screen
    .queryAllByTestId(/^laser-beam-/)
    .map((node) => node.props.testID as string)
    .sort();
const beamOf = (state: LaserState) =>
  traceBeam(state.board, state.leans)
    .cells.map((cell) => `laser-beam-${pos(cell)}`)
    .sort();
/** One flip then its 120 ms, as the screen lives it. */
const flipped = (state: LaserState, mirror: number) => reduceLaser(reduceLaser(state, { type: 'flip', mirror }), { type: 'tick', dt: LASER_FLIP_MS });

describe('Miroirs et Laser screen (AC-108)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 22, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-108: a first round shows the tutorial bubble; a flip updates the mirror, the beam, the HUD and the score as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-flip')).toHaveTextContent(/Touche les miroirs pour guider le rayon jusqu'à la cible/);
    const engine = createLaser(SEED, {});
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^1 \/ 5$/);
    expect(screen.getByTestId('hud-flips')).toHaveTextContent(/^0$/);
    expect(screen.queryByTestId('laser-hint')).toBeNull(); // « Indice » is not owned
    expect(screen.getByTestId('laser-emitter')).toBeTruthy();
    expect(screen.getByTestId('laser-target').props.accessibilityValue.text).toBe('dark');
    expect(leansOnScreen(engine)).toEqual(engine.leans);
    expect(beamOnScreen()).toEqual(beamOf(engine));

    // Flip a mirror that does not solve the puzzle alone.
    const idle = engine.leans.findIndex((_, m) => !isSolved(engine.board, engine.leans.map((lean, i) => (i === m ? otherLean(lean) : lean))));
    expect(idle).toBeGreaterThanOrEqual(0);
    let expected = reduceLaser(engine, { type: 'flip', mirror: idle });
    await fireEvent.press(screen.getByTestId(mirrorId(engine, idle)));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-flips')).toHaveTextContent(/^1$/);
    expect(leansOnScreen(expected)).toEqual(expected.leans);
    expect(beamOnScreen()).toEqual(beamOf(expected));

    // A second tap during the 120 ms of the flip changes nothing (input guard).
    await fireEvent.press(screen.getByTestId(mirrorId(engine, idle)));
    expect(screen.getByTestId('hud-flips')).toHaveTextContent(/^1$/);
    expect(leansOnScreen(expected)).toEqual(expected.leans);
    await endFlip();
    expected = reduceLaser(expected, { type: 'tick', dt: LASER_FLIP_MS });

    // Flipping a shortest solution, one mirror per 120 ms, solves puzzle 1 as the engine predicts.
    const solution = shortestSolution(expected.board, expected.leans) as number[];
    for (const mirror of solution) {
      await fireEvent.press(screen.getByTestId(mirrorId(expected, mirror)));
      expected = reduceLaser(expected, { type: 'flip', mirror });
      expect(leansOnScreen(expected)).toEqual(expected.leans);
      expect(beamOnScreen()).toEqual(beamOf(expected));
      expect(screen.getByTestId('hud-flips')).toHaveTextContent(new RegExp(`^${expected.flips}$`));
      if (expected.solvedMs === 0) {
        await endFlip();
        expected = reduceLaser(expected, { type: 'tick', dt: LASER_FLIP_MS });
      }
    }
    // The solved puzzle stays shown, the beam on the lit target, until 800 ms of frames have run.
    const points = puzzleScore(1 + solution.length, engine.par);
    expect(expected.puzzle).toBe(1);
    expect(expected.solvedMs).toBe(SOLVED_SHOW_MS);
    expect(expected.score).toBe(points);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${points}$`));
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^1 \/ 5$/);
    expect(screen.getByTestId('laser-target').props.accessibilityValue.text).toBe('lit');
    expect(screen.getByTestId('laser-points')).toHaveTextContent(new RegExp(`^\\+${points}$`));
    expect(screen.getByTestId('laser-last')).toHaveTextContent(new RegExp(`Résolu.*\\+${points}$`));
    for (let t = 50; t < SOLVED_SHOW_MS; t += 50) {
      await advance(50);
      expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^1 \/ 5$/);
    }
    await advance(50);
    await advance(50);
    // Puzzle 2 is on the board, as the engine generates it.
    expected = reduceLaser(expected, { type: 'tick', dt: SOLVED_SHOW_MS });
    expect(expected.puzzle).toBe(2);
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^2 \/ 5$/);
    expect(screen.getByTestId('hud-flips')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${points}$`));
    expect(screen.queryByTestId('laser-points')).toBeNull();
    expect(leansOnScreen(expected)).toEqual(expected.leans);
    expect(beamOnScreen()).toEqual(beamOf(expected));
    expect(screen.getByTestId('laser-target').props.accessibilityValue.text).toBe('dark');
  }, 60_000);

  it('AC-108: the hint button highlights a mirror of a shortest solution and counts down', async () => {
    await start(1);
    expect(screen.getByTestId('laser-hint')).toHaveTextContent(/Indice \(1\)/);
    await fireEvent.press(screen.getByTestId('laser-hint'));
    const engine = createLaser(SEED, { hint: 1 });
    const expected = reduceLaser(engine, { type: 'hint' });
    expect(expected.hint).not.toBeNull();
    expect(screen.getByTestId('laser-hint')).toHaveTextContent(/Indice \(0\)/);
    expect(screen.getByTestId('laser-hint')).toBeDisabled();
    expect(screen.getByTestId(mirrorId(expected, expected.hint as number))).toHaveStyle({ borderWidth: 3 });
    expect(screen.getByTestId('hud-flips')).toHaveTextContent(/^0$/);
    // Flipping the hinted mirror spends the highlight.
    await fireEvent.press(screen.getByTestId(mirrorId(expected, expected.hint as number)));
    const after = flipped(expected, expected.hint as number);
    expect(leansOnScreen(after)).toEqual(after.leans);
    expect(screen.getByTestId(mirrorId(expected, expected.hint as number))).toHaveStyle({ borderWidth: 0.5 });
  });

  it('AC-108: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'laser', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
