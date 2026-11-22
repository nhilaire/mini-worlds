import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { botKeeps } from '../game/hands/bot';
import { createHands, evaluateHand, EXCHANGE_MS, HandsState, reduceHands, RESULT_MS } from '../game/hands/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { cardLabel, HandsGame } from '../screens/game/HandsGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save first.
// The test picks the first seed whose first hand is not kept whole by the casual policy (so « Échanger » is played)
// and holds a pair or a brelan to keep.
function pickSeed(): number {
  for (let seed = 1; seed < 500; seed++) {
    const keeps = botKeeps(createHands(seed, {}).cards);
    const count = keeps.filter((k) => k).length;
    if (count >= 2 && count < 5) return seed;
  }
  throw new Error('no seed with a pair to keep in the first hand');
}
const SEED = pickSeed();
const NAMES = { nothing: 'Rien', pair: 'Paire', twoPairs: 'Deux paires', three: 'Brelan', straight: 'Suite', flush: 'Couleur', fullHouse: 'Full', four: 'Carré', straightFlush: 'Quinte flush' };
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <HandsGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(redrawLevel = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'cards'];
  if (redrawLevel > 0) save.games.hands.upgrades = { redraw: redrawLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('hands-screen')).toBeTruthy();
  return onFinish;
}

/** Moves the injectable clock and lets the frame loop (requestAnimationFrame) run. */
async function advance(ms: number) {
  nowMs += ms;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}
/** 50 ms frames on the screen for `ms`. */
async function frames(ms: number) {
  for (let t = 0; t < ms; t += 50) await advance(50);
}
const tickEngine = (state: HandsState, ms: number) => reduceHands(state, { type: 'tick', dt: ms });

const shownCards = () => [0, 1, 2, 3, 4].map((i) => screen.getByTestId(`hands-card-${i}`).props.accessibilityLabel);
const isKept = (i: number) => screen.getByTestId(`hands-card-${i}`).props.accessibilityState.selected;
const tapCard = (i: number) => fireEvent.press(screen.getByTestId(`hands-card-${i}`));
const exact = (text: string) => new RegExp(`^${text.replace(/[+]/g, '\\+')}$`);

describe('Mains de Cartes screen (AC-108)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 22, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-108: the first round shows the bubble; keeping cards then « Échanger » updates the cards, the combination, the score and the HUD as the engine predicts; taps during the guard are ignored (frames of 50 ms)', async () => {
    await start();
    expect(screen.getByTestId('tutorial-keep')).toHaveTextContent(/Garde tes meilleures cartes/);
    let engine = createHands(SEED, {});
    expect(shownCards()).toEqual(engine.cards.map(cardLabel));
    expect(screen.getByTestId('hud-hand')).toHaveTextContent(/^1 \/ 8$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('hands-combination')).toHaveTextContent(exact(NAMES[evaluateHand(engine.cards).combination]));
    expect(screen.getByTestId('hands-swap')).toHaveTextContent(/Échanger/);
    expect(screen.getByTestId('hands-keep')).toHaveTextContent(/Garder/);
    expect(screen.queryByTestId('hands-redraw')).toBeNull(); // no « Seconde donne » bought

    // Keeps the cards of the casual policy (a pair or a brelan); the first tap dismisses the bubble.
    const keeps = botKeeps(engine.cards);
    const free = keeps.indexOf(false);
    for (let i = 0; i < keeps.length; i++) {
      if (!keeps[i]) continue;
      await tapCard(i);
      engine = reduceHands(engine, { type: 'toggle', index: i });
      expect(isKept(i)).toBe(true);
    }
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    // A second tap releases a card.
    await tapCard(free);
    expect(isKept(free)).toBe(true);
    await tapCard(free);
    expect(isKept(free)).toBe(false);

    await fireEvent.press(screen.getByTestId('hands-swap'));
    engine = reduceHands(engine, { type: 'swap' });
    expect(shownCards()).toEqual(engine.cards.map(cardLabel));
    expect(screen.getByTestId('hands-combination')).toHaveTextContent(exact(NAMES[evaluateHand(engine.cards).combination]));
    // Inside the 300 ms guard: not scored yet, a tap keeps nothing and the buttons do nothing.
    expect(screen.queryByTestId('hands-result')).toBeNull();
    await tapCard(free);
    expect(isKept(free)).toBe(false);
    expect(screen.getByTestId('hands-keep')).toBeDisabled();
    await advance(50);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);

    await frames(EXCHANGE_MS + 50);
    engine = tickEngine(engine, EXCHANGE_MS);
    if (engine.result === null) throw new Error('the hand is scored after the exchange');
    expect(engine.result.points).toBeGreaterThanOrEqual(20); // the pair kept
    expect(engine.score).toBe(engine.result.points);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(exact(String(engine.score)));
    expect(screen.getByTestId('hands-result')).toHaveTextContent(exact(`+${engine.result.points}`));
    expect(screen.getByTestId('hands-combination')).toHaveTextContent(exact(NAMES[engine.result.combination]));
    expect(screen.getByTestId('hud-hand')).toHaveTextContent(/^1 \/ 8$/);

    // The result stays 900 ms, then the second hand is dealt.
    await frames(RESULT_MS + 100);
    engine = tickEngine(engine, RESULT_MS);
    expect(engine.hand).toBe(2);
    expect(screen.getByTestId('hud-hand')).toHaveTextContent(/^2 \/ 8$/);
    expect(shownCards()).toEqual(engine.cards.map(cardLabel));
    expect(screen.queryByTestId('hands-result')).toBeNull();
    expect([0, 1, 2, 3, 4].map(isKept)).toEqual([false, false, false, false, false]);

    // « Garder » scores the hand as it is.
    await fireEvent.press(screen.getByTestId('hands-keep'));
    engine = reduceHands(engine, { type: 'keep' });
    expect(screen.getByTestId('hud-score')).toHaveTextContent(exact(String(engine.score)));
    expect(shownCards()).toEqual(engine.cards.map(cardLabel));
  }, 60_000);

  it('AC-108: with « Seconde donne » the button of the second exchange shows after the first one and the hand scores after it', async () => {
    await start(1);
    let engine = createHands(SEED, { redraw: 1 });
    const keeps = botKeeps(engine.cards);
    for (let i = 0; i < keeps.length; i++) {
      if (!keeps[i]) continue;
      await tapCard(i);
      engine = reduceHands(engine, { type: 'toggle', index: i });
    }
    expect(screen.queryByTestId('hands-redraw')).toBeNull();
    await fireEvent.press(screen.getByTestId('hands-swap'));
    engine = reduceHands(engine, { type: 'swap' });
    await frames(EXCHANGE_MS + 50);
    engine = tickEngine(engine, EXCHANGE_MS);
    expect(engine.phase).toBe('choose');
    expect(screen.getByTestId('hands-redraw')).toHaveTextContent(/Seconde donne \(1\)/);
    expect(screen.getByTestId('hands-redraw')).not.toBeDisabled();
    expect(screen.queryByTestId('hands-swap')).toBeNull();
    expect(screen.queryByTestId('hands-result')).toBeNull();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);

    await fireEvent.press(screen.getByTestId('hands-redraw'));
    engine = reduceHands(engine, { type: 'redraw' });
    expect(shownCards()).toEqual(engine.cards.map(cardLabel));
    await frames(EXCHANGE_MS + 50);
    engine = tickEngine(engine, EXCHANGE_MS);
    if (engine.result === null) throw new Error('the hand is scored after the second exchange');
    expect(screen.getByTestId('hud-score')).toHaveTextContent(exact(String(engine.score)));
    expect(screen.getByTestId('hands-result')).toHaveTextContent(exact(`+${engine.result.points}`));
    // None is left for the next hand.
    await frames(RESULT_MS + 100);
    expect(screen.getByTestId('hud-hand')).toHaveTextContent(/^2 \/ 8$/);
    expect(screen.queryByTestId('hands-redraw')).toBeNull();
    expect(screen.getByTestId('hands-swap')).not.toBeDisabled();
  }, 60_000);

  it('AC-108: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'hands', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
