import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { createSlide, directionOf, reduceSlide, SLIDE_MS, SlideState } from '../game/slide/engine';
import { solve, SlideMove } from '../game/slide/solver';
import type { OnFinish } from '../screens/game/GameFrame';
import { SlideGame } from '../screens/game/SlideGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

const SEED = 2026;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

// The guard loop is driven by hand: each frame advances the injectable clock by `ms` and runs the queued callbacks.
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
  return loaded ? <SlideGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(hintLevel = 0) {
  const save = defaultSave();
  if (hintLevel > 0) save.games.slide.upgrades = { hint: hintLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('slide-screen')).toBeTruthy();
  return onFinish;
}

/** Cell size on screen, read from the board (6 cells + 4 px of border). */
const cellPx = () => ((StyleSheet.flatten(screen.getByTestId('slide-board').props.style).width as number) - 4) / 6;

/** Swipes a move on the board: from the centre of the block's first cell, 40 px in its direction. */
async function swipe(state: SlideState, move: SlideMove) {
  const cell = cellPx();
  const b = state.blocks[move.block];
  const x = (b.col + 0.5) * cell;
  const y = (b.row + 0.5) * cell;
  const dir = directionOf(state.blocks, move);
  const dx = dir === 'left' ? -40 : dir === 'right' ? 40 : 0;
  const dy = dir === 'up' ? -40 : dir === 'down' ? 40 : 0;
  await act(async () => {
    fireGestureHandler(getByGestureTestId('slide-pan'), [
      { x, y, translationX: 0, translationY: 0 },
      { x: x + dx, y: y + dy, translationX: dx, translationY: dy },
      { x: x + dx, y: y + dy, translationX: dx, translationY: dy },
    ]);
  });
}

const blockPos = (i: number) => {
  const style = StyleSheet.flatten(screen.getByTestId(`slide-block-${i}`).props.style);
  const cell = cellPx();
  return { col: Math.round((style.left - 2) / cell), row: Math.round((style.top - 2) / cell) };
};

describe('Bloc Glissant screen (AC-86)', () => {
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

  it('AC-86: a first round shows the tutorial bubble; scripted swipes move blocks and score exactly as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-slide')).toHaveTextContent(/Glisse les blocs pour libérer la sortie du bloc rouge/);
    const engine = createSlide(SEED, {});
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^1 \/ 5$/);
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^0$/);
    engine.blocks.forEach((b, i) => expect(blockPos(i)).toEqual({ col: b.col, row: b.row }));
    expect(screen.getByTestId('slide-btn-hint')).toHaveTextContent(/Indice \(0\)/);
    expect(screen.getByTestId('slide-btn-hint')).toBeDisabled();

    const path = solve(engine.blocks) as SlideMove[];
    const afterFirst = reduceSlide(engine, { type: 'swipe', block: path[0].block, dir: directionOf(engine.blocks, path[0]) });
    await swipe(engine, path[0]);
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^1$/);
    const moved = afterFirst.blocks[path[0].block];
    expect(blockPos(path[0].block)).toEqual({ col: moved.col, row: moved.row });

    // A second swipe inside the 120 ms slide is ignored; after the slide (frames of 50 ms) it is taken.
    await swipe(afterFirst, path[1]);
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^1$/);
    await runFrames(Math.ceil(SLIDE_MS / 50) + 1);
    await swipe(afterFirst, path[1]);
    let expected = reduceSlide(reduceSlide(afterFirst, { type: 'tick', dt: SLIDE_MS }), { type: 'swipe', block: path[1].block, dir: directionOf(afterFirst.blocks, path[1]) });
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^2$/);

    // The rest of the shortest solution solves the puzzle at par: 300 points and puzzle 2.
    for (const move of path.slice(2)) {
      await runFrames(3);
      const before = expected;
      expected = reduceSlide(reduceSlide(before, { type: 'tick', dt: SLIDE_MS }), { type: 'swipe', block: move.block, dir: directionOf(before.blocks, move) });
      await swipe(before, move);
    }
    expect(expected.puzzle).toBe(2);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(expected.score).toBe(300);
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^2 \/ 5$/);
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('slide-last')).toHaveTextContent(/^\+300$/);
    expected.blocks.forEach((b, i) => expect(blockPos(i)).toEqual({ col: b.col, row: b.row }));
  });

  it('AC-86: the hint button outlines the block of the next shortest move with its direction and counts down', async () => {
    await start(2);
    const button = screen.getByTestId('slide-btn-hint');
    expect(button).toHaveTextContent(/Indice \(2\)/);
    await fireEvent.press(button);
    const expected = reduceSlide(createSlide(SEED, { hint: 2 }), { type: 'hint' });
    const hint = expected.hint as SlideMove;
    expect(screen.getByTestId('slide-btn-hint')).toHaveTextContent(/Indice \(1\)/);
    expect(screen.getByTestId('slide-btn-hint')).toBeDisabled(); // one hint shown at a time
    expect(screen.getByTestId(`slide-hint-${hint.block}-${directionOf(expected.blocks, hint)}`)).toBeTruthy();
    expect(screen.getByTestId(`slide-block-${hint.block}`)).toHaveStyle({ borderWidth: 4 });
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^0$/); // a hint is not a move
  });

  it('AC-86: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    await runFrames(4);
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'slide', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
