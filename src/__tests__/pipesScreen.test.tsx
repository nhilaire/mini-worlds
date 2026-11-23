import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { createPipes, filledCells, PipesState, reducePipes, SOLVED_SHOW_MS, turnsToFit, wateredCells } from '../game/pipes/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { PipesGame } from '../screens/game/PipesGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save from
// AsyncStorage first, as in the app where the game only opens once the store is loaded.
const SEED = 2026;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <PipesGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(hintLevel = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'puzzle'];
  if (hintLevel > 0) save.games.pipes.upgrades = { hint: hintLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('pipes-screen')).toBeTruthy();
  return onFinish;
}

/** Moves the injectable clock and lets the frame loop (requestAnimationFrame) run. */
async function advance(ms: number) {
  nowMs += ms;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

/** Grids 1 to 3 are 4 × 4 (the tests play grids 1 and 2). */
const SIZE = 4;
const pos = (cell: number) => `${cell % SIZE}-${Math.floor(cell / SIZE)}`;
const rotationOf = (cell: number) => {
  const style = [screen.getByTestId(`pipes-piece-${pos(cell)}`).props.style].flat(3);
  return style.find((s) => s && s.transform)?.transform[0].rotate;
};
const waterOnScreen = (state: PipesState) => state.pieces.map((_, i) => screen.getByTestId(`pipes-cell-${pos(i)}`).props.accessibilityValue.text === 'water');

describe('Plombier Express screen (AC-69)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-62: the grid clock does not run while the tutorial bubble or the pause is shown, and runs while the grid is played', async () => {
    /** 50 ms frames of the injectable clock (the frame loop counts at most 50 ms per frame). */
    const frames = async (count: number) => {
      for (let k = 0; k < count; k++) await advance(50);
    };
    await start();
    expect(screen.getByTestId('tutorial-turn')).toBeTruthy();
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^60 s$/);
    await frames(60); // 3 s behind the bubble
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^60 s$/);

    // The first tap dismisses the bubble: the clock runs.
    const engine = createPipes(SEED, {});
    const first = engine.path.find((p) => turnsToFit(engine.pieces[p.cell], p.need) !== 0)!.cell;
    await fireEvent.press(screen.getByTestId(`pipes-cell-${pos(first)}`));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    await frames(41); // a little over 2 s
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^58 s$/);

    // Paused: 3 s more change nothing; after « Reprendre » it runs again.
    await fireEvent.press(screen.getByTestId('game-pause'));
    await frames(60);
    await fireEvent.press(await screen.findByTestId('pause-resume'));
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^58 s$/);
    await frames(21);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^57 s$/);
  });

  it('AC-69: a first round shows the tutorial bubble; a tap turns the piece and updates the HUD and water as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-turn')).toHaveTextContent(/Touche un tuyau pour le tourner/);
    const engine = createPipes(SEED, {});
    expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^0 \/ \d+$/);
    expect(screen.getByTestId('pipes-btn-hint')).toHaveTextContent(/Indice \(0\)/);
    expect(screen.getByTestId('pipes-btn-hint')).toBeDisabled();
    expect(waterOnScreen(engine)).toEqual(wateredCells(engine.pieces, engine.entryRow));

    // Turn the first wrong path cell once.
    const first = engine.path.find((p) => turnsToFit(engine.pieces[p.cell], p.need) !== 0)!.cell;
    const afterTap = reducePipes(engine, { type: 'tap', cell: first });
    expect(rotationOf(first)).toBe(`${engine.pieces[first].rot * 90}deg`);
    await fireEvent.press(screen.getByTestId(`pipes-cell-${pos(first)}`));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^1 \/ \d+$/);
    expect(rotationOf(first)).toBe(`${afterTap.pieces[first].rot * 90}deg`);
    expect(waterOnScreen(afterTap)).toEqual(wateredCells(afterTap.pieces, afterTap.entryRow));

    // Turning the rest of the path right solves grid 1 as the engine predicts.
    let expected = afterTap;
    for (const p of afterTap.path) {
      const n = turnsToFit(expected.pieces[p.cell], p.need) as number;
      for (let i = 0; i < n && expected.solvedMs === 0; i++) {
        expected = reducePipes(expected, { type: 'tap', cell: p.cell });
        await fireEvent.press(screen.getByTestId(`pipes-cell-${pos(p.cell)}`));
      }
    }
    // The solved grid stays shown (AC-88) until 1 s of frames has run.
    expect(expected.grid).toBe(1);
    expect(expected.solvedMs).toBe(SOLVED_SHOW_MS);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('pipes-last')).toHaveTextContent(new RegExp(`^\\+${expected.score}$`));
    for (let t = 0; t < SOLVED_SHOW_MS + 100; t += 50) await advance(50);
    expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^2$/);
    expect(screen.queryByTestId('pipes-points')).toBeNull();
  }, 60_000);

  it('AC-88: the solved grid stays 1 s, its water runs in path order, its points pop and taps are ignored; then the next grid', async () => {
    await start();
    let expected = createPipes(SEED, {});
    for (const p of expected.path) {
      const n = turnsToFit(expected.pieces[p.cell], p.need) as number;
      for (let i = 0; i < n && expected.solvedMs === 0; i++) {
        expected = reducePipes(expected, { type: 'tap', cell: p.cell });
        await fireEvent.press(screen.getByTestId(`pipes-cell-${pos(p.cell)}`));
      }
    }
    expect(expected.solvedMs).toBe(SOLVED_SHOW_MS);
    const points = expected.score;
    expect(screen.getByTestId('pipes-points')).toHaveTextContent(new RegExp(`^\\+${points}$`));
    // The water starts again from the entry cell alone.
    expect(waterOnScreen(expected)).toEqual(filledCells(expected));
    expect(waterOnScreen(expected).filter(Boolean)).toHaveLength(1);
    const solvedRotations = expected.pieces.map((_, i) => rotationOf(i));

    // A double tap during the pause turns nothing and counts no tap.
    await fireEvent.press(screen.getByTestId(`pipes-cell-${pos(expected.path[0].cell)}`));
    await fireEvent.press(screen.getByTestId(`pipes-cell-${pos(expected.path[0].cell)}`));
    expect(expected.pieces.map((_, i) => rotationOf(i))).toEqual(solvedRotations);
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(new RegExp(`^${expected.taps} / ${expected.maxTaps}$`));

    // Frame by frame (50 ms): the filled cells only grow, as the engine predicts, until the whole pipe is full.
    let engine = expected;
    let count = 1;
    for (let t = 50; t < SOLVED_SHOW_MS; t += 50) {
      await advance(50);
      engine = reducePipes(engine, { type: 'tick', dt: 50 });
      const shown = waterOnScreen(engine);
      expect(shown).toEqual(filledCells(engine));
      const filled = shown.filter(Boolean).length;
      expect(filled).toBeGreaterThanOrEqual(count);
      count = filled;
      expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^1$/);
      expect(screen.getByTestId('pipes-points')).toBeTruthy();
    }
    expect(count).toBe(wateredCells(expected.pieces, expected.entryRow).filter(Boolean).length);
    expect(count).toBeGreaterThan(1);
    await advance(50);
    await advance(50);
    expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^2$/);
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^0 \/ \d+$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${points}$`));
    expect(screen.queryByTestId('pipes-points')).toBeNull();
  }, 60_000);

  it('AC-69: the hint button highlights a path cell not yet turned right and counts down', async () => {
    await start(1);
    expect(screen.getByTestId('pipes-btn-hint')).toHaveTextContent(/Indice \(1\)/);
    await fireEvent.press(screen.getByTestId('pipes-btn-hint'));
    const expected = reducePipes(createPipes(SEED, { hint: 1 }), { type: 'hint' });
    expect(screen.getByTestId('pipes-btn-hint')).toHaveTextContent(/Indice \(0\)/);
    expect(screen.getByTestId('pipes-btn-hint')).toBeDisabled();
    expect(screen.getByTestId(`pipes-cell-${pos(expected.hint as number)}`)).toHaveStyle({ borderWidth: 3 });
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^0 \/ \d+$/);
  });

  it('AC-69: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'pipes', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
