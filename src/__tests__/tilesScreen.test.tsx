import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { greedyMove } from '../game/tiles/bot';
import { bestGem, createTiles, Dir, DIRS, EMPTY, JOKER, MOVE_MS, reduceTiles, slide, TILES_CELLS, TilesState } from '../game/tiles/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { TilesGame } from '../screens/game/TilesGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save first.
const SEED = 2026;
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <TilesGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(undoLevel = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'puzzle'];
  if (undoLevel > 0) save.games.tiles.upgrades = { undo: undoLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('tiles-screen')).toBeTruthy();
  return onFinish;
}

/** Moves the injectable clock and lets the frame loop (requestAnimationFrame) run. */
async function advance(ms: number) {
  nowMs += ms;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

/** The board as the screen shows it: one accessibility label per gem (its level, « Joker » for the joker). */
const shownBoard = () =>
  Array.from({ length: TILES_CELLS }, (_, i) => {
    const gem = screen.queryByTestId(`tiles-gem-${i}`);
    if (!gem) return EMPTY;
    return gem.props.accessibilityLabel === 'Joker' ? JOKER : Number(gem.props.accessibilityLabel);
  });

const ARROWS = ['tiles-up', 'tiles-right', 'tiles-down', 'tiles-left'] as const;
const pressArrow = (dir: Dir) => fireEvent.press(screen.getByTestId(ARROWS[dir]));
/** Swipe translations of the four directions. */
const SWIPES = [{ translationX: 0, translationY: -80 }, { translationX: 80, translationY: 0 }, { translationX: 0, translationY: 80 }, { translationX: -80, translationY: 0 }] as const;
async function swipeBoard(dir: Dir) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('tiles-pan'), [{ translationX: 0, translationY: 0 }, SWIPES[dir], SWIPES[dir]]);
  });
}

/** Lets the 150 ms move guard run out on the screen and in the reference engine (frames of 50 ms). */
async function land(engine: TilesState): Promise<TilesState> {
  let e = engine;
  for (let t = 0; t < MOVE_MS + 100; t += 50) {
    await advance(50);
    e = reduceTiles(e, { type: 'tick', dt: 50 });
  }
  return e;
}

describe('Glisse-Fusion screen (AC-108)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 22, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-108: the first round shows the bubble; arrows and swipes move the gems, the score and the HUD as the engine predicts; inputs during the 150 ms move are ignored (frames of 50 ms)', async () => {
    await start();
    expect(screen.getByTestId('tutorial-swipe')).toHaveTextContent(/Glisse pour pousser toutes les gemmes/);
    let engine: TilesState = createTiles(SEED, {});
    expect(shownBoard()).toEqual(engine.cells);
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^80$/);
    expect(screen.getByTestId('hud-best').props.accessibilityLabel).toBe('1');
    expect(screen.queryByTestId('tiles-undo')).toBeNull();

    // An arrow, as the engine plays it: the bubble goes, one move is counted, the new gem is on the board.
    const first = DIRS.find((dir) => slide(engine.cells, dir).changed) as Dir;
    engine = reduceTiles(engine, { type: 'swipe', dir: first });
    await pressArrow(first);
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(shownBoard()).toEqual(engine.cells);
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^79$/);

    // An arrow and a swipe inside the guard change nothing.
    const shown = shownBoard();
    for (const dir of DIRS) await pressArrow(dir);
    await swipeBoard(DIRS.find((dir) => slide(engine.cells, dir).changed) as Dir);
    expect(shownBoard()).toEqual(shown);
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^79$/);
    engine = await land(engine);
    expect(engine.busyMs).toBe(0);

    // Swipes on the board until the first merges score (engine prediction), alternating with the arrows.
    for (let n = 0; n < 12 && engine.score < 60; n++) {
      const dir = greedyMove(engine.cells) as Dir;
      engine = reduceTiles(engine, { type: 'swipe', dir });
      if (n % 2 === 0) await swipeBoard(dir);
      else await pressArrow(dir);
      expect(shownBoard()).toEqual(engine.cells);
      expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${engine.score}$`));
      expect(screen.getByTestId('hud-moves')).toHaveTextContent(new RegExp(`^${80 - engine.moves}$`));
      engine = await land(engine);
    }
    expect(engine.score).toBeGreaterThanOrEqual(60);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${engine.score}$`));
    expect(screen.getByTestId('hud-best').props.accessibilityLabel).toBe(String(bestGem(engine.cells)));

    // A swipe that changes nothing counts no move.
    const blocked = DIRS.find((dir) => !slide(engine.cells, dir).changed);
    if (blocked !== undefined) {
      await swipeBoard(blocked);
      expect(shownBoard()).toEqual(engine.cells);
      expect(screen.getByTestId('hud-moves')).toHaveTextContent(new RegExp(`^${80 - engine.moves}$`));
    }
  }, 60_000);

  it('AC-108: the « Annuler » button (upgrade owned) restores the board, the score and the moves of before the last move and counts down', async () => {
    await start(1);
    let engine: TilesState = createTiles(SEED, { undo: 1 });
    const before = engine.cells;
    expect(screen.getByTestId('tiles-undo')).toHaveTextContent(/Annuler \(1\)/);
    expect(screen.getByTestId('tiles-undo')).toBeDisabled();

    const dir = DIRS.find((d) => slide(engine.cells, d).changed) as Dir;
    engine = reduceTiles(engine, { type: 'swipe', dir });
    await pressArrow(dir);
    expect(shownBoard()).toEqual(engine.cells);
    // Inside the guard the undo is ignored.
    await fireEvent.press(screen.getByTestId('tiles-undo'));
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^79$/);
    expect(screen.getByTestId('tiles-undo')).toHaveTextContent(/Annuler \(1\)/);
    engine = await land(engine);

    await fireEvent.press(screen.getByTestId('tiles-undo'));
    engine = reduceTiles(engine, { type: 'undo' });
    expect(engine.cells).toEqual(before);
    expect(shownBoard()).toEqual(before);
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^80$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('tiles-undo')).toHaveTextContent(/Annuler \(0\)/);
    expect(screen.getByTestId('tiles-undo')).toBeDisabled();
  }, 60_000);

  it('AC-108: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'tiles', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
