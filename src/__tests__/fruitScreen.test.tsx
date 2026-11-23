import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { casualFruitMove, createFruit, FRUIT_COLS, FRUIT_GUARD_MS, FRUIT_ROWS, FruitState, reduceFruit } from '../game/fruit/engine';
import { buildFruitReplay, DROP_MS } from '../game/fruit/replay';
import type { OnFinish } from '../screens/game/GameFrame';
import { FruitGame } from '../screens/game/FruitGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save from
// AsyncStorage first, as in the app where the game only opens once the store is loaded.
const SEED = 2026;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

// The frame loop is driven by hand: each frame advances the injectable clock by `ms` and runs the queued callbacks.
let frames: FrameRequestCallback[] = [];
async function runFrames(count: number, ms = 50) {
  for (let i = 0; i < count; i++) {
    nowMs += ms;
    const queued = frames;
    frames = [];
    await act(async () => {
      for (const cb of queued) cb(nowMs);
    });
  }
}

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <FruitGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(sweep = 0) {
  const save = defaultSave();
  if (sweep > 0) save.games.fruit.upgrades = { sweep };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('fruit-screen')).toBeTruthy();
  return onFinish;
}

const label = (state: FruitState, i: number) => (state.cells[i] === null ? 'empty' : String(state.cells[i]));
function expectBoard(state: FruitState) {
  for (let row = 0; row < FRUIT_ROWS; row++) {
    for (let col = 0; col < FRUIT_COLS; col++) expect([col, row, screen.getByTestId(`fruit-cell-${col}-${row}`).props.accessibilityLabel]).toEqual([col, row, label(state, row * FRUIT_COLS + col)]);
  }
  expect(screen.getByTestId('hud-next').props.accessibilityLabel).toBe(String(state.next));
  expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${state.score}$`));
  expect(screen.getByTestId('hud-fruits')).toHaveTextContent(new RegExp(`^${state.drops}$`));
}

describe('Fruits en Fusion screen (AC-86, AC-91)', () => {
  let restore = () => {};
  const raf = globalThis.requestAnimationFrame;
  const caf = globalThis.cancelAnimationFrame;
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
    frames = [];
    globalThis.requestAnimationFrame = (cb) => {
      frames.push(cb);
      return frames.length;
    };
    globalThis.cancelAnimationFrame = () => {
      frames = [];
    };
  });
  afterEach(() => {
    restore();
    globalThis.requestAnimationFrame = raf;
    globalThis.cancelAnimationFrame = caf;
  });

  it('AC-86: a first round shows the tutorial bubble; scripted drops update the board, the next fruit and the score as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-drop')).toHaveTextContent(/Touche une colonne pour lâcher le fruit/);
    let expected = createFruit(SEED, { sweep: 0 });
    expectBoard(expected);
    expect(screen.getByTestId('fruit-btn-sweep')).toHaveTextContent(/Balai \(0\)/);
    expect(screen.getByTestId('fruit-btn-sweep')).toBeDisabled();

    // The casual policy until a merge scored (frame by frame between drops, 50 ms steps past the guard: the drop
    // and its merge replay).
    for (let i = 0; i < 40 && expected.score === 0; i++) {
      const col = casualFruitMove(expected);
      const next = reduceFruit(expected, { type: 'drop', col });
      await fireEvent.press(screen.getByTestId(`fruit-col-${col}`));
      await runFrames(next.busyMs / 50);
      expected = reduceFruit(next, { type: 'tick', dt: next.busyMs });
    }
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(expected.score).toBeGreaterThan(0);
    expectBoard(expected);
  });

  it('AC-86: a double tap during the 300 ms drop is ignored on screen', async () => {
    await start();
    await fireEvent.press(screen.getByTestId('fruit-col-0'));
    await runFrames(1);
    const afterOne = reduceFruit(createFruit(SEED, { sweep: 0 }), { type: 'drop', col: 0 });
    // Second tap 50 ms later, on another column: nothing changes.
    await fireEvent.press(screen.getByTestId('fruit-col-3'));
    expectBoard(afterOne);
    // 300 ms after the drop, a tap drops again.
    await runFrames(FRUIT_GUARD_MS / 50);
    await fireEvent.press(screen.getByTestId('fruit-col-3'));
    expectBoard(reduceFruit(reduceFruit(afterOne, { type: 'tick', dt: FRUIT_GUARD_MS }), { type: 'drop', col: 3 }));
  });

  it('AC-86: « Coup de balai » clears the bottom row and counts down to a disabled button', async () => {
    await start(1);
    expect(screen.getByTestId('fruit-btn-sweep')).toHaveTextContent(/Balai \(1\)/);
    let expected = createFruit(SEED, { sweep: 1 });
    for (const col of [0, 2, 4]) {
      const next = reduceFruit(expected, { type: 'drop', col });
      await fireEvent.press(screen.getByTestId(`fruit-col-${col}`));
      await runFrames(next.busyMs / 50);
      expected = reduceFruit(next, { type: 'tick', dt: next.busyMs });
    }
    expected = reduceFruit(expected, { type: 'sweep' });
    await fireEvent.press(screen.getByTestId('fruit-btn-sweep'));
    await runFrames(expected.busyMs / 50);
    expectBoard(expected);
    expect(screen.getByTestId('fruit-btn-sweep')).toHaveTextContent(/Balai \(0\)/);
    expect(screen.getByTestId('fruit-btn-sweep')).toBeDisabled();
  });

  it('AC-91: a merging drop replays on screen: the drop, the merged cells framed with « +points », then the final board', async () => {
    await start();
    // Casual drops (each replay waited out) until the next drop merges.
    let expected = createFruit(SEED, { sweep: 0 });
    let col = casualFruitMove(expected);
    let next = reduceFruit(expected, { type: 'drop', col });
    for (let i = 0; i < 40 && !next.events.some((e) => e.kind === 'merge'); i++) {
      await fireEvent.press(screen.getByTestId(`fruit-col-${col}`));
      await runFrames(next.busyMs / 50);
      expected = reduceFruit(next, { type: 'tick', dt: next.busyMs });
      col = casualFruitMove(expected);
      next = reduceFruit(expected, { type: 'drop', col });
    }
    const merge = next.events.find((e) => e.kind === 'merge');
    if (!merge || merge.kind !== 'merge') throw new Error('a merging drop is expected');
    const phases = buildFruitReplay(expected.cells, next);
    expectBoard(expected);

    await fireEvent.press(screen.getByTestId(`fruit-col-${col}`));
    // The drop phase: the fruit has landed, no merge shown yet.
    expect(screen.queryByTestId('fruit-points-pop')).toBeNull();
    const landed = phases[0].board;
    for (const c of merge.cells) expect(screen.getByTestId(`fruit-cell-${c % FRUIT_COLS}-${Math.floor(c / FRUIT_COLS)}`).props.accessibilityLabel).toBe(String(landed[c]));

    // 300 ms later: the flash frames every merged cell and pops the points.
    await runFrames(DROP_MS / 50);
    for (const c of merge.cells) expect(screen.getByTestId(`fruit-flash-${c % FRUIT_COLS}-${Math.floor(c / FRUIT_COLS)}`)).toBeTruthy();
    expect(screen.getByTestId('fruit-points-pop')).toHaveTextContent(new RegExp(`^\\+${merge.points}$`));

    // After the whole replay: no frame, no points, the engine's board.
    await runFrames((next.busyMs - DROP_MS) / 50);
    expect(screen.queryByTestId('fruit-points-pop')).toBeNull();
    for (const c of merge.cells) expect(screen.queryByTestId(`fruit-flash-${c % FRUIT_COLS}-${Math.floor(c / FRUIT_COLS)}`)).toBeNull();
    expectBoard(reduceFruit(next, { type: 'tick', dt: next.busyMs }));
  });

  it('AC-86: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'fruit', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
