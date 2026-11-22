import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { bottomCard, cardPoints, createPatience, MOVE_MS, PatienceState, playableColumns, reducePatience } from '../game/patience/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { cardLabel, PatienceGame } from '../screens/game/PatienceGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save first.
// The seed is the first one whose first deal has a card to play at once and a bottom card that cannot be played.
function pickSeed(): number {
  for (let seed = 1; seed < 500; seed++) {
    const first = createPatience(seed, {});
    const playable = playableColumns(first);
    if (playable.length > 0 && playable.length < first.columns.length) return seed;
  }
  throw new Error('no seed with a playable and an unplayable bottom card');
}
const SEED = pickSeed();
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <PatienceGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(wildLevel = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'cards'];
  if (wildLevel > 0) save.games.patience.upgrades = { wild: wildLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('patience-screen')).toBeTruthy();
  return onFinish;
}

/** Moves the injectable clock and lets the frame loop (requestAnimationFrame) run. */
async function advance(ms: number) {
  nowMs += ms;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

const tapColumn = (c: number) => fireEvent.press(screen.getByTestId(`patience-column-${c}`));
const pileLabel = () => screen.getByTestId('patience-pile').props.accessibilityLabel as string;
const bottomLabel = (c: number) => screen.getByTestId(`patience-column-${c}`).props.accessibilityLabel as string;

/** The screen shows the table of the engine: pile, bottom cards, stock, HUD. */
function expectTable(engine: PatienceState) {
  expect(pileLabel()).toBe(cardLabel(engine.pile));
  engine.columns.forEach((cards, c) => {
    const bottom = bottomCard(engine, c);
    if (bottom === null) expect(screen.queryByTestId(`patience-column-${c}`)).toBeNull();
    else expect(bottomLabel(c)).toBe(cardLabel(bottom));
    for (let i = 0; i < cards.length - 1; i++) expect(screen.getByTestId(`patience-card-${c}-${i}`).props.accessibilityLabel).toBe(cardLabel(cards[i]));
  });
  expect(screen.getByTestId('patience-stock-count')).toHaveTextContent(new RegExp(`^${engine.stock.length}$`));
  expect(screen.getByTestId('hud-stock')).toHaveTextContent(new RegExp(`^${engine.stock.length}$`));
  expect(screen.getByTestId('hud-streak')).toHaveTextContent(new RegExp(`^${engine.streak}$`));
  expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${engine.score}$`));
}

describe('Réussite Express screen (AC-108)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 22, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-108: the first round shows the bubble; a card played and a card drawn update the table and the HUD as the engine predicts; taps during the 150 ms move are ignored (frames of 50 ms)', async () => {
    await start();
    expect(screen.getByTestId('tutorial-play')).toHaveTextContent(/Pose une carte qui suit ou précède celle de la pile/);
    let engine: PatienceState = createPatience(SEED, {});
    expect(cardLabel({ rank: 1, suit: 'spades' })).toBe('A♠');
    expect(cardLabel({ rank: 10, suit: 'hearts' })).toBe('10♥');
    expect(cardLabel({ rank: 13, suit: 'diamonds' })).toBe('K♦');
    expect(screen.getByTestId('hud-deal')).toHaveTextContent(/^1 \/ 2$/);
    expectTable(engine);
    expect(screen.getByTestId('hud-stock')).toHaveTextContent(/^15$/);
    // No joker owned: no joker button.
    expect(screen.queryByTestId('patience-wild')).toBeNull();

    // A bottom card that is not a neighbour of the pile: nothing moves, the bubble stays, the card stays tappable.
    const playable = playableColumns(engine);
    const refused = engine.columns.findIndex((_, c) => !playable.includes(c));
    await tapColumn(refused);
    expectTable(engine);
    expect(screen.getByTestId('tutorial-play')).toBeTruthy();
    expect(screen.getByTestId(`patience-column-${refused}`).props.accessibilityState?.disabled).not.toBe(true);

    // A neighbour, as the engine plays it: +10, streak 1, the card is on the pile.
    const column = playable[0];
    const played = bottomCard(engine, column);
    engine = reducePatience(engine, { type: 'tapColumn', column });
    await tapColumn(column);
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(engine.score).toBe(cardPoints(1));
    expect(played && pileLabel()).toBe(played && cardLabel(played));
    expectTable(engine);
    expect(screen.getByTestId('patience-last')).toHaveTextContent(/^\+10$/);

    // Inside the guard, the stock and the columns do nothing.
    await fireEvent.press(screen.getByTestId('patience-stock'));
    for (const c of playableColumns(engine)) await tapColumn(c);
    expectTable(engine);
    for (let t = 0; t < MOVE_MS + 100; t += 50) {
      await advance(50);
      engine = reducePatience(engine, { type: 'tick', dt: 50 });
    }
    expect(engine.busyMs).toBe(0);

    // The stock: its next card goes onto the pile, the count goes down, the streak is reset.
    engine = reducePatience(engine, { type: 'draw' });
    await fireEvent.press(screen.getByTestId('patience-stock'));
    expect(engine.stock).toHaveLength(14);
    expect(engine.streak).toBe(0);
    expectTable(engine);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^10$/);
  }, 60_000);

  it('AC-108: the joker button shows when the upgrade is owned; armed, it plays a card that is not a neighbour and counts down', async () => {
    await start(1);
    let engine: PatienceState = createPatience(SEED, { wild: 1 });
    expect(screen.getByTestId('patience-wild')).toHaveTextContent(/Joker \(1\)/);
    const playable = playableColumns(engine);
    const column = engine.columns.findIndex((_, c) => !playable.includes(c));
    engine = reducePatience(reducePatience(engine, { type: 'wild' }), { type: 'tapColumn', column });
    expect(engine.wildsLeft).toBe(0);
    await fireEvent.press(screen.getByTestId('patience-wild'));
    await tapColumn(column);
    expectTable(engine);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^10$/);
    expect(screen.getByTestId('patience-wild')).toHaveTextContent(/Joker \(0\)/);
    expect(screen.getByTestId('patience-wild')).toBeDisabled();
  });

  it('AC-108: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'patience', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
