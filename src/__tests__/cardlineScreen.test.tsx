import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CardlineState, createCardline, placingSwap, reduceCardline, ROW_SHOW_MS, SWAP_MS } from '../game/cardline/engine';
import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { CardLineGame } from '../screens/game/CardLineGame';
import type { OnFinish } from '../screens/game/GameFrame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save first.
const SEED = 2026;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <CardLineGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(hintLevel = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'cards'];
  if (hintLevel > 0) save.games.cardline.upgrades = { hint: hintLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('cardline-screen')).toBeTruthy();
  return onFinish;
}

/** Moves the injectable clock and lets the frame loop (requestAnimationFrame) run. */
async function advance(ms: number) {
  nowMs += ms;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

const shownCards = () => {
  const out: number[] = [];
  for (let i = 0; screen.queryByTestId(`cardline-value-${i}`); i++) out.push(Number(screen.getByTestId(`cardline-value-${i}`).props.children));
  return out;
};
const tapCard = (i: number) => fireEvent.press(screen.getByTestId(`cardline-card-${i}`));

describe('Suite de Cartes screen (AC-86)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-86: the first round shows the bubble; a swap updates the cards and the HUD as the engine predicts; taps during the 200 ms swap are ignored (frames of 50 ms)', async () => {
    await start();
    expect(screen.getByTestId('tutorial-swap')).toHaveTextContent(/Touche deux cartes pour les échanger/);
    let engine: CardlineState = createCardline(SEED, {});
    expect(shownCards()).toEqual(engine.cards);
    expect(screen.getByTestId('hud-row')).toHaveTextContent(/^1 \/ 5$/);
    expect(screen.getByTestId('hud-swaps')).toHaveTextContent(/^0$/);

    // Select then unselect: no swap, the bubble stays.
    await tapCard(0);
    expect(screen.getByTestId('cardline-card-0').props.accessibilityState.selected).toBe(true);
    await tapCard(0);
    expect(screen.getByTestId('cardline-card-0').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('tutorial-swap')).toBeTruthy();

    // A placing swap, as the engine plays it.
    const [a, b] = placingSwap(engine.cards) as [number, number];
    engine = reduceCardline(reduceCardline(engine, { type: 'tap', index: a }), { type: 'tap', index: b });
    await tapCard(a);
    await tapCard(b);
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(shownCards()).toEqual(engine.cards);
    expect(screen.getByTestId('hud-swaps')).toHaveTextContent(/^1$/);

    // A double tap inside the guard selects nothing.
    await tapCard(0);
    await tapCard(0);
    expect(screen.getByTestId('cardline-card-0').props.accessibilityState.selected).toBe(false);
    for (let t = 0; t < SWAP_MS + 100; t += 50) {
      await advance(50);
      engine = reduceCardline(engine, { type: 'tick', dt: 50 });
    }
    expect(engine.busyMs).toBe(0);
    await tapCard(0);
    expect(screen.getByTestId('cardline-card-0').props.accessibilityState.selected).toBe(true);
    await tapCard(0);

    // Sorting the rest of the row at par scores 200 (engine prediction); the sorted row stays 600 ms, then row 2.
    while (engine.doneMs === 0) {
      const [x, y] = placingSwap(engine.cards) as [number, number];
      engine = reduceCardline(reduceCardline(engine, { type: 'tap', index: x }), { type: 'tap', index: y });
      await tapCard(x);
      await tapCard(y);
      if (engine.doneMs === 0) {
        for (let t = 0; t < SWAP_MS + 50; t += 50) {
          await advance(50);
          engine = reduceCardline(engine, { type: 'tick', dt: 50 });
        }
      }
    }
    expect(engine.score).toBe(200);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^200$/);
    expect(screen.getByTestId('cardline-last')).toHaveTextContent(/^\+200$/);
    expect(shownCards()).toEqual([1, 2, 3, 4, 5]);
    await advance(50);
    expect(screen.getByTestId('hud-row')).toHaveTextContent(/^1 \/ 5$/);
    for (let t = 0; t < ROW_SHOW_MS + 100; t += 50) await advance(50);
    expect(screen.getByTestId('hud-row')).toHaveTextContent(/^2 \/ 5$/);
    expect(shownCards()).toHaveLength(6);
    expect(screen.getByTestId('hud-swaps')).toHaveTextContent(/^0$/);
  }, 60_000);

  it('AC-86: the hint button outlines a swap that places a card and counts down', async () => {
    await start(1);
    expect(screen.getByTestId('cardline-btn-hint')).toHaveTextContent(/Indice \(1\)/);
    await fireEvent.press(screen.getByTestId('cardline-btn-hint'));
    const expected = reduceCardline(createCardline(SEED, { hint: 1 }), { type: 'hint' });
    const [a, b] = expected.hint as [number, number];
    expect(screen.getByTestId('cardline-btn-hint')).toHaveTextContent(/Indice \(0\)/);
    expect(screen.getByTestId('cardline-btn-hint')).toBeDisabled();
    expect(screen.getByTestId(`cardline-face-${a}`)).toHaveStyle({ borderWidth: 3 });
    expect(screen.getByTestId(`cardline-face-${b}`)).toHaveStyle({ borderWidth: 3 });
    expect(screen.getByTestId('hud-swaps')).toHaveTextContent(/^0$/);
  });

  it('AC-86: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'cardline', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
