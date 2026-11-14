import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { spriteSize, validateSprite } from '../art/sprites';
import { EXIT, GEM, ROCK, START } from '../art/games/trail';
import { ICON as SLIDE_ICON } from '../art/icons/slide';
import { ICON as TRAIL_ICON } from '../art/icons/trail';
import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { colOf, createTrail, reduceTrail, rowOf, TRAIL_GUARD_MS } from '../game/trail/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { TrailGame } from '../screens/game/TrailGame';
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
  return loaded ? <TrailGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(hintLevel = 0) {
  const save = defaultSave();
  if (hintLevel > 0) save.games.trail.upgrades = { hint: hintLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('trail-screen')).toBeTruthy();
  return onFinish;
}

const cellId = (cell: number) => `trail-cell-${colOf(cell)}-${rowOf(cell)}`;
const guardFrames = Math.ceil(TRAIL_GUARD_MS / 50) + 1;

describe("Fil d'Ariane screen (AC-86)", () => {
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

  it('AC-86: a first round shows the tutorial bubble; scripted taps draw the trail and score exactly as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-step')).toHaveTextContent(/Touche les cases voisines pour tracer ton chemin/);
    const engine = createTrail(SEED, {});
    expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^1 \/ 5$/);
    expect(screen.getByTestId('hud-gems')).toHaveTextContent(new RegExp(`^0 / ${engine.gems.length}$`));
    for (const gem of engine.gems) expect(screen.getByTestId(`trail-gem-${colOf(gem)}-${rowOf(gem)}`)).toBeTruthy();
    for (const rock of engine.rocks) expect(screen.getByTestId(`trail-rock-${colOf(rock)}-${rowOf(rock)}`)).toBeTruthy();
    expect(screen.getByTestId('trail-btn-hint')).toBeDisabled();

    // First step along the full trail: the bubble goes, one bar of trail is drawn.
    await fireEvent.press(screen.getByTestId(cellId(engine.solution[1])));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('trail-seg-0')).toBeTruthy();
    // A double tap on the new head inside the 150 ms guard does not step back.
    await fireEvent.press(screen.getByTestId(cellId(engine.solution[1])));
    expect(screen.getByTestId('trail-seg-0')).toBeTruthy();

    // The rest of the checked full trail, one tap every 150 ms of frames: every gem, grid 2.
    let expected = reduceTrail(engine, { type: 'tap', cell: engine.solution[1] });
    for (const cell of engine.solution.slice(2)) {
      await runFrames(guardFrames);
      expected = reduceTrail(reduceTrail(expected, { type: 'tick', dt: TRAIL_GUARD_MS }), { type: 'tap', cell });
      await fireEvent.press(screen.getByTestId(cellId(cell)));
      if (expected.grid === 1) {
        const onTrail = expected.gems.filter((g) => expected.trail.includes(g)).length;
        expect(screen.getByTestId('hud-gems')).toHaveTextContent(new RegExp(`^${onTrail} / `));
      }
    }
    expect(expected.grid).toBe(2);
    expect(expected.score).toBe(50 * engine.gems.length + 100);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^2 \/ 5$/);
    expect(screen.getByTestId('trail-last')).toHaveTextContent(new RegExp(`^\\+${expected.score}$`));
    expect(screen.queryByTestId('trail-seg-0')).toBeNull(); // the new grid starts with the start cell only
  });

  it('AC-86: a tap on the head steps back after the guard', async () => {
    await start();
    const engine = createTrail(SEED, {});
    await fireEvent.press(screen.getByTestId(cellId(engine.path[1])));
    await runFrames(guardFrames);
    await fireEvent.press(screen.getByTestId(cellId(engine.path[1])));
    expect(screen.queryByTestId('trail-seg-0')).toBeNull();
  });

  it('AC-86: the hint button outlines the next path cell and counts down', async () => {
    await start(1);
    expect(screen.getByTestId('trail-btn-hint')).toHaveTextContent(/Indice \(1\)/);
    await fireEvent.press(screen.getByTestId('trail-btn-hint'));
    const expected = reduceTrail(createTrail(SEED, { hint: 1 }), { type: 'hint' });
    expect(screen.getByTestId('trail-btn-hint')).toHaveTextContent(/Indice \(0\)/);
    expect(screen.getByTestId('trail-btn-hint')).toBeDisabled();
    expect(screen.getByTestId(cellId(expected.hint as number))).toHaveStyle({ borderWidth: 4 });
  });

  it('AC-86: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    await runFrames(4);
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'trail', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });

  it('the board sprites and the two game icons are valid pixel sprites (icons 12 × 12)', () => {
    for (const sprite of [START, EXIT, GEM, ROCK]) expect(validateSprite(sprite)).toEqual([]);
    for (const icon of [SLIDE_ICON, TRAIL_ICON]) {
      expect(validateSprite(icon)).toEqual([]);
      expect(spriteSize(icon)).toEqual({ width: 12, height: 12 });
    }
  });
});
