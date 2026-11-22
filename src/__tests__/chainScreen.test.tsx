import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ICON as CHAIN_ICON } from '../art/icons/chain';
import { PALETTE } from '../art/palette';
import { spriteSize, validateSprite } from '../art/sprites';
import { botChain } from '../game/chain/bot';
import { CHAIN_CELLS, CHAIN_GUARD_MS, CHAIN_ROUND, ChainState, colOf, createChain, reduceChain, rowOf } from '../game/chain/engine';
import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { ChainGame, colorOf, VALUE_COLORS } from '../screens/game/ChainGame';
import type { OnFinish } from '../screens/game/GameFrame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

const SEED = 2026;
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

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
  return loaded ? <ChainGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(shuffleLevel = 0) {
  const save = defaultSave();
  if (shuffleLevel > 0) save.games.chain.upgrades = { shuffle: shuffleLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('chain-screen')).toBeTruthy();
  return onFinish;
}

const cellId = (cell: number) => `chain-cell-${colOf(cell)}-${rowOf(cell)}`;
const press = (cell: number) => fireEvent.press(screen.getByTestId(cellId(cell)));
const guardFrames = Math.ceil(CHAIN_GUARD_MS / 50) + 1;

/** The board as the screen shows it: the accessibility value of every cell. */
const shownBoard = () => Array.from({ length: CHAIN_CELLS }, (_, i) => Number(screen.getByTestId(cellId(i)).props.accessibilityValue.text));
const shownChain = () => Array.from({ length: CHAIN_CELLS }, (_, i) => i).filter((i) => screen.getByTestId(cellId(i)).props.accessibilityState.selected);

function expectHud(expected: ChainState) {
  expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
  expect(screen.getByTestId('hud-chains')).toHaveTextContent(new RegExp(`^${expected.chainsLeft}$`));
  expect(screen.getByTestId('hud-best')).toHaveTextContent(new RegExp(`^${expected.best}$`));
}

describe('Chaîne de Nombres screen (AC-108)', () => {
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

  it('AC-108: a first round shows the tutorial bubble; a scripted chain updates the board, the score and the HUD exactly as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-link')).toHaveTextContent(/Relie des nombres voisins identiques, puis retouche le dernier/);
    const engine = createChain(SEED, {});
    expect(shownBoard()).toEqual(engine.cells);
    expectHud(engine);
    expect(screen.getByTestId('hud-chains')).toHaveTextContent(new RegExp(`^${CHAIN_ROUND}$`));
    expect(screen.queryByTestId('chain-shuffle')).toBeNull(); // « Mélange » is not owned
    // Each value has its own colour and shows its digit.
    for (let i = 0; i < CHAIN_CELLS; i++) {
      const cell = screen.getByTestId(cellId(i));
      expect(cell).toHaveTextContent(new RegExp(`^${engine.cells[i]}$`));
      expect(cell.children[0]).toHaveStyle({ backgroundColor: PALETTE[colorOf(engine.cells[i]).fill] });
    }

    // First cell of a chain of 3: the bubble goes, the cell is selected with its rank, nothing to validate yet.
    const chain = botChain(engine.cells, 3);
    expect(chain).toHaveLength(3);
    await press(chain[0]);
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(shownChain()).toEqual([chain[0]]);
    expect(screen.getByTestId('chain-rank-1')).toHaveTextContent(/^1$/);
    expect(screen.queryByTestId('chain-again')).toBeNull();
    // Second and third cells: links drawn, ranks in order, the check « tap again » on the last one.
    await press(chain[1]);
    expect(screen.getByTestId('chain-link-0')).toBeTruthy();
    expect(screen.getByTestId('chain-again')).toBeTruthy();
    await press(chain[2]);
    expect(shownChain()).toEqual(chain.slice().sort((a, b) => a - b));
    expect(screen.getByTestId('chain-link-1')).toBeTruthy();
    expect(screen.getByTestId('chain-rank-3')).toHaveTextContent(/^3$/);
    expectHud(engine); // nothing scored before the validation

    // The last cell again: the chain merges.
    let expected = engine;
    for (const cell of [...chain, chain[2]]) expected = reduceChain(expected, { type: 'tap', cell });
    await press(chain[2]);
    expect(expected.score).toBe(10 * engine.cells[chain[0]] * 3);
    expect(shownBoard()).toEqual(expected.cells);
    expect(shownChain()).toEqual([]);
    expect(screen.queryByTestId('chain-link-0')).toBeNull();
    expect(screen.queryByTestId('chain-again')).toBeNull();
    expectHud(expected);
    expect(screen.getByTestId('hud-chains')).toHaveTextContent(new RegExp(`^${CHAIN_ROUND - 1}$`));
    expect(screen.getByTestId('chain-last')).toHaveTextContent(new RegExp(`^\\+${expected.score}$`));

    // A tap during the 250 ms guard selects nothing; after the guard (injectable clock) it starts a chain.
    const next = botChain(expected.cells, 2);
    await runFrames(2); // 100 ms
    await press(next[0]);
    expect(shownChain()).toEqual([]);
    await runFrames(guardFrames);
    await press(next[0]);
    expect(shownChain()).toEqual([next[0]]);
    // A tap elsewhere cancels it.
    const elsewhere = Array.from({ length: CHAIN_CELLS }, (_, i) => i).find((c) => expected.cells[c] !== expected.cells[next[0]]) as number;
    await press(elsewhere);
    expect(shownChain()).toEqual([]);
    expectHud(expected);
  });

  it('AC-108: a second chain after the guard keeps the screen in step with the engine', async () => {
    await start();
    let expected = createChain(SEED, {});
    for (let n = 0; n < 4; n++) {
      const chain = botChain(expected.cells, 4);
      for (const cell of [...chain, chain[chain.length - 1]]) {
        expected = reduceChain(expected, { type: 'tap', cell });
        await press(cell);
      }
      expect(shownBoard()).toEqual(expected.cells);
      expectHud(expected);
      await runFrames(guardFrames);
      expected = reduceChain(expected, { type: 'tick', dt: CHAIN_GUARD_MS });
    }
    expect(expected.chainsLeft).toBe(CHAIN_ROUND - 4);
  });

  it('AC-105: « Mélange » shows when owned, shuffles the board as the engine does and counts down', async () => {
    await start(1);
    expect(screen.getByTestId('chain-shuffle')).toHaveTextContent(/Mélange \(1\)/);
    await fireEvent.press(screen.getByTestId('chain-shuffle'));
    const expected = reduceChain(createChain(SEED, { shuffle: 1 }), { type: 'shuffle' });
    expect(shownBoard()).toEqual(expected.cells);
    expect(screen.getByTestId('chain-shuffle')).toHaveTextContent(/Mélange \(0\)/);
    expect(screen.getByTestId('chain-shuffle')).toBeDisabled();
  });

  it('AC-108: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    await runFrames(4);
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'chain', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });

  it('the game icon is a valid 12 × 12 pixel sprite and the first values have different colours', () => {
    expect(validateSprite(CHAIN_ICON)).toEqual([]);
    expect(spriteSize(CHAIN_ICON)).toEqual({ width: 12, height: 12 });
    expect(new Set(VALUE_COLORS.map((c) => c.fill)).size).toBe(VALUE_COLORS.length);
    expect(colorOf(VALUE_COLORS.length + 1)).toBe(VALUE_COLORS[0]);
  });
});
