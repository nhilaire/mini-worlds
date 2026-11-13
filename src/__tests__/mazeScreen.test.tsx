import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { setClock } from '../game/clock';
import { bit, createMaze, Dir, DIRS, MazeState, neighbour, reduceMaze, secondsLeft } from '../game/maze/engine';
import { I18nProvider } from '../i18n/I18nProvider';
import { MazeGame } from '../screens/game/MazeGame';
import { GameStoreProvider } from '../state/GameStore';
import { ThemeProvider } from '../ui/ThemeProvider';

const SEED = 777;
const FRAME_MS = 50;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

let frames: FrameRequestCallback[] = [];
async function runFrames(count: number, ms: number) {
  for (let i = 0; i < count; i++) {
    nowMs += ms;
    const queued = frames;
    frames = [];
    await act(async () => {
      for (const cb of queued) cb(nowMs);
    });
  }
}

const TRANSLATION: Record<Dir, { x: number; y: number }> = { 0: { x: 0, y: -60 }, 1: { x: 60, y: 0 }, 2: { x: 0, y: 60 }, 3: { x: -60, y: 0 } };

async function swipe(dir: Dir) {
  const { x, y } = TRANSLATION[dir];
  await act(async () => {
    fireGestureHandler(getByGestureTestId('maze-pan'), [
      { x: 100, y: 100, translationX: 0, translationY: 0 },
      { x: 100 + x, y: 100 + y, translationX: x, translationY: y },
      { x: 100 + x, y: 100 + y, translationX: x, translationY: y },
    ]);
  });
}

/** First direction of the shortest path from the explorer to the exit (the run never leaves it: it stops at junctions). */
function towardsExit(s: MazeState): Dir {
  const prev = new Map<number, number>([[s.pos, -1]]);
  const queue = [s.pos];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    for (const d of DIRS) {
      if (!(s.open[c] & bit(d))) continue;
      const next = neighbour(s.size, c, d);
      if (!prev.has(next)) {
        prev.set(next, c);
        queue.push(next);
      }
    }
  }
  let cell = s.exit;
  while (prev.get(cell) !== s.pos) cell = prev.get(cell) as number;
  return DIRS.find((d) => s.open[s.pos] & bit(d) && neighbour(s.size, s.pos, d) === cell) as Dir;
}

async function renderMaze(onFinish = jest.fn()) {
  await render(
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider setting="auto">
        <I18nProvider setting="fr" onChange={() => {}}>
          <GameStoreProvider sessionSeed={null}>
            <MazeGame seed={SEED} onFinish={onFinish} />
          </GameStoreProvider>
        </I18nProvider>
      </ThemeProvider>
    </GestureHandlerRootView>,
  );
  expect(await screen.findByTestId('maze-screen')).toBeTruthy();
  return onFinish;
}

describe('Labyrinthe Express screen (AC-86)', () => {
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

  it('AC-86: the first round shows the tutorial bubble; the timer waits while it is shown', async () => {
    await renderMaze();
    expect(screen.getByTestId('tutorial-run')).toHaveTextContent(/Glisse pour courir jusqu'au prochain croisement/);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^60$/);
    expect(screen.getByTestId('hud-maze')).toHaveTextContent(/^1$/);
    await runFrames(20, FRAME_MS);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^60$/);
  });

  it('AC-86: scripted swipes solve maze 1; score, time and maze follow the engine frame by frame', async () => {
    await renderMaze();
    let expected = createMaze(SEED, {});
    let swipes = 0;
    while (expected.maze === 1) {
      const dir = towardsExit(expected);
      expected = reduceMaze(expected, { type: 'swipe', dir });
      await swipe(dir);
      swipes += 1;
      if (swipes === 1) expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
      // A second swipe during the run is ignored by the engine (input guard).
      await swipe(((dir + 2) % 4) as Dir);
      while (expected.run && expected.maze === 1) {
        await runFrames(1, FRAME_MS);
        expected = reduceMaze(expected, { type: 'tick', dt: FRAME_MS });
      }
      expect(swipes).toBeLessThan(60);
    }
    expect(expected.score).toBeGreaterThan(100);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-maze')).toHaveTextContent(/^2$/);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(new RegExp(`^${secondsLeft(expected)}$`));
  }, 60_000);

  it('AC-86: Pause → Quitter ends the round', async () => {
    const onFinish = await renderMaze();
    await swipe(towardsExit(createMaze(SEED, {})));
    await runFrames(4, FRAME_MS);
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'maze', score: 0, outcome: 'quit' }), 'result');
  });
});
