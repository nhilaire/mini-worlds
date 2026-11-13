import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { casualMergeMove, createMerge, MERGE_GUARD_MS, MERGE_SIZE, MergeState, reduceMerge } from '../game/merge/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { MergeGame } from '../screens/game/MergeGame';
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
  return loaded ? <MergeGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start() {
  await AsyncStorage.setItem('save', serializeSave(defaultSave()));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('merge-screen')).toBeTruthy();
  return onFinish;
}

const cellId = (cell: number) => `merge-cell-${cell % MERGE_SIZE}-${Math.floor(cell / MERGE_SIZE)}`;
function expectBoard(state: MergeState) {
  state.cells.forEach((level, i) => expect([i, screen.getByTestId(cellId(i)).props.accessibilityLabel]).toEqual([i, level === 0 ? 'empty' : String(level)]));
  expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${state.score}$`));
  expect(screen.getByTestId('hud-best')).toHaveTextContent(new RegExp(`^${state.best}$`));
}
const isSelected = (cell: number) => screen.getByTestId(cellId(cell)).props.accessibilityState?.selected === true;

describe('Fusion de Guerriers screen (AC-86)', () => {
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

  it('AC-86: a first round shows the tutorial bubble; select then merge updates the board, the score and the best level as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-merge')).toHaveTextContent(/Touche deux guerriers pareils/);
    const engine = createMerge(SEED, { veteran: 0 });
    expectBoard(engine);
    const [a, b] = casualMergeMove(engine.cells) as [number, number];

    await fireEvent.press(screen.getByTestId(cellId(a)));
    expect(isSelected(a)).toBe(true);
    expect(screen.getByTestId(cellId(a))).toHaveStyle({ borderWidth: 4 });
    expect(screen.getByTestId('tutorial-merge')).toBeTruthy(); // a selection is not yet a merge

    await fireEvent.press(screen.getByTestId(cellId(b)));
    const expected = reduceMerge(reduceMerge(engine, { type: 'tap', cell: a }), { type: 'tap', cell: b });
    expect(expected.score).toBe(20);
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(isSelected(a)).toBe(false);
    expectBoard(expected);
    const col = b % MERGE_SIZE;
    const row = Math.floor(b / MERGE_SIZE);
    expect(screen.getByTestId(`merge-level-${col}-${row}`)).toHaveTextContent(/^2$/);
  });

  it('AC-86: taps during the 200 ms merge are ignored on screen, then accepted', async () => {
    await start();
    const engine = createMerge(SEED, { veteran: 0 });
    const [a, b] = casualMergeMove(engine.cells) as [number, number];
    await fireEvent.press(screen.getByTestId(cellId(a)));
    await fireEvent.press(screen.getByTestId(cellId(b)));
    const merged = reduceMerge(reduceMerge(engine, { type: 'tap', cell: a }), { type: 'tap', cell: b });
    const target = merged.cells.findIndex((v) => v > 0);
    // 50 ms later (double tap): nothing is selected.
    await runFrames(1);
    await fireEvent.press(screen.getByTestId(cellId(target)));
    expect(isSelected(target)).toBe(false);
    expectBoard(merged);
    // After the guard, the same tap selects.
    await runFrames(MERGE_GUARD_MS / 50);
    expect(merged.status).toBe('playing');
    await fireEvent.press(screen.getByTestId(cellId(target)));
    expect(isSelected(target)).toBe(true);
  });

  it('AC-86: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'merge', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
