import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { colOf, createTwins, Direction, DIRECTIONS, reduceTwins, rowOf, solve, step, TWINS_MOVE_MS, TWINS_SHOW_MS, TwinsState } from '../game/twins/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { TwinsGame } from '../screens/game/TwinsGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

const SEED = 2026;
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

// The counter loop is driven by hand: each frame advances the injectable clock by `ms` and runs the queued callbacks.
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
  return loaded ? <TwinsGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(hintLevel = 0) {
  const save = defaultSave();
  if (hintLevel > 0) save.games.twins.upgrades = { hint: hintLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('twins-screen')).toBeTruthy();
  return onFinish;
}

/** A swipe of 40 px on the grid. */
async function swipe(direction: Direction) {
  const dx = direction === 'left' ? -40 : direction === 'right' ? 40 : 0;
  const dy = direction === 'up' ? -40 : direction === 'down' ? 40 : 0;
  await act(async () => {
    fireGestureHandler(getByGestureTestId('twins-pan'), [
      { x: 100, y: 100, translationX: 0, translationY: 0 },
      { x: 100 + dx, y: 100 + dy, translationX: dx, translationY: dy },
      { x: 100 + dx, y: 100 + dy, translationX: dx, translationY: dy },
    ]);
  });
}

const tap = (direction: Direction) => fireEvent.press(screen.getByTestId(`twins-${direction}`));
const shown = (testID: string) => screen.getByTestId(testID).props.accessibilityValue.text as string;
const text = (cell: number) => `${colOf(cell)},${rowOf(cell)}`;
/** The characters and the HUD show this engine state. */
function expectShown(state: TwinsState) {
  expect(shown('twins-a')).toBe(text(state.positions.a));
  expect(shown('twins-b')).toBe(text(state.positions.b));
  expect(screen.getByTestId('hud-moves')).toHaveTextContent(new RegExp(`^${state.moves}$`));
  expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${state.score}$`));
}
/** The engine after a move and its 120 ms animation. */
const after = (state: TwinsState, direction: Direction) => reduceTwins(reduceTwins(state, { type: 'move', direction }), { type: 'tick', dt: TWINS_MOVE_MS });
const guardFrames = Math.ceil(TWINS_MOVE_MS / 50) + 1;

describe('Duo Synchro screen (AC-108)', () => {
  let restore = () => {};
  const raf = globalThis.requestAnimationFrame;
  const caf = globalThis.cancelAnimationFrame;
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 22, 10, 0).getTime();
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

  it('AC-108: a first round shows the tutorial bubble; scripted moves update the characters, the HUD and the score exactly as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-move')).toHaveTextContent(/Les deux bougent ensemble\s: amène chacun sur sa sortie\s!/);
    const engine = createTwins(SEED, {});
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^1 \/ 5$/);
    expectShown(engine);
    // The grid: the walls of the puzzle and the two hollow exits on their cells.
    for (const wall of engine.board.walls) expect(screen.getByTestId(`twins-wall-${colOf(wall)}-${rowOf(wall)}`)).toBeTruthy();
    expect(screen.queryAllByTestId(/^twins-wall-/)).toHaveLength(engine.board.walls.length);
    expect(shown('twins-exit-a')).toBe(text(engine.board.exits.a));
    expect(shown('twins-exit-b')).toBe(text(engine.board.exits.b));
    expect(screen.queryByTestId('twins-hint')).toBeNull(); // « Indice » is not owned

    // First move of the shortest solution, with its arrow.
    const path = solve(engine.board, engine.positions) as Direction[];
    expect(path).toHaveLength(engine.par);
    await tap(path[0]);
    const first = reduceTwins(engine, { type: 'move', direction: path[0] });
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(first.moves).toBe(1);
    expectShown(first);

    // A second move inside the 120 ms animation is ignored (arrow and swipe); after it (frames of 50 ms), a swipe is taken.
    await tap(path[1]);
    await swipe(path[1]);
    expectShown(first);
    await runFrames(guardFrames);
    await swipe(path[1]);
    let expected = after(after(engine, path[0]), path[1]);
    expect(expected.moves).toBe(2);
    expectShown(expected);

    // The rest of the shortest solution, alternating arrows and swipes, solves the puzzle at par: 300 points.
    for (const [i, direction] of path.slice(2).entries()) {
      await runFrames(guardFrames);
      expected = after(expected, direction);
      if (i % 2 === 0) await tap(direction);
      else await swipe(direction);
      expectShown(expected);
    }
    expect(expected.result).toBe('solved');
    expect(expected.score).toBe(300);
    expect(shown('twins-a')).toBe(text(engine.board.exits.a));
    expect(shown('twins-b')).toBe(text(engine.board.exits.b));
    expect(screen.getByTestId('twins-last')).toHaveTextContent(/^Résolu\s! \+300$/);
    // The solved puzzle stays shown 800 ms (moves are ignored), then puzzle 2 is on the grid.
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^1 \/ 5$/);
    await runFrames(4);
    await tap('up');
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^1 \/ 5$/);
    expectShown(expected);
    await runFrames(Math.ceil(TWINS_SHOW_MS / 50));
    const second = reduceTwins(expected, { type: 'tick', dt: TWINS_SHOW_MS });
    expect(second.puzzle).toBe(2);
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^2 \/ 5$/);
    expectShown(second);
    expect(screen.queryAllByTestId(/^twins-wall-/)).toHaveLength(second.board.walls.length);
  });

  it('AC-108: a move that only one character can make moves that one; a move nobody can make changes nothing', async () => {
    await start();
    let engine = createTwins(SEED, {});
    // Walk until some direction is blocked for one or both characters (the shortest solution meets one).
    for (let i = 0; i < 40; i++) {
      const at = engine;
      const partial = DIRECTIONS.find((d) => {
        const next = step(at.board, at.positions, d);
        return (next.a === at.positions.a) !== (next.b === at.positions.b);
      });
      if (partial) {
        const next = after(engine, partial);
        await tap(partial);
        expectShown(next);
        expect(next.moves).toBe(engine.moves + 1);
        return;
      }
      const direction = (solve(engine.board, engine.positions) as Direction[])[0];
      engine = after(engine, direction);
      await tap(direction);
      await runFrames(guardFrames);
    }
    throw new Error('no partly blocked move met');
  });

  it('AC-108: the hint button shows the direction of the next shortest move on its arrow and counts down', async () => {
    await start(2);
    const button = screen.getByTestId('twins-hint');
    expect(button).toHaveTextContent(/Indice \(2\)/);
    expect(screen.queryAllByTestId(/^twins-hint-/)).toHaveLength(0);
    await fireEvent.press(button);
    const expected = reduceTwins(createTwins(SEED, { hint: 2 }), { type: 'hint' });
    const direction = expected.hint as Direction;
    expect(screen.getByTestId('twins-hint')).toHaveTextContent(/Indice \(1\)/);
    expect(screen.getByTestId('twins-hint')).toBeDisabled(); // one hint shown at a time
    expect(screen.getByTestId(`twins-hint-${direction}`)).toBeTruthy();
    expect(screen.queryAllByTestId(/^twins-hint-/)).toHaveLength(1);
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^0$/); // a hint is not a move
    // Playing the move spends the shown hint.
    await tap(direction);
    expect(screen.queryAllByTestId(/^twins-hint-/)).toHaveLength(0);
    expectShown(reduceTwins(expected, { type: 'move', direction }));
    expect(screen.getByTestId('twins-hint')).not.toBeDisabled();
  });

  it('AC-108: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    await runFrames(4);
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'twins', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
