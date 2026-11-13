import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import App from '../App';
import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { createTwentyOne, handTotal, reduceTwentyOne } from '../game/twentyone/engine';
import { deviceLanguageTags } from '../i18n/deviceLocale';

// The session seed comes from the deep link; the first round of the session uses seed + 1. The test picks the first
// session seed whose first hand is still open after one « Tirer » (no natural 21, no bust), so both buttons show.
function pickSessionSeed(): number {
  for (let seed = 1; seed < 500; seed++) {
    const first = createTwentyOne(seed + 1, {});
    if (first.outcome === null && reduceTwentyOne(first, { type: 'hit' }).outcome === null) return seed;
  }
  throw new Error('no seed with an open first hand');
}
const SESSION_SEED = pickSessionSeed();
const ROUND_SEED = SESSION_SEED + 1;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

async function openTwentyOne() {
  const save = defaultSave();
  save.unlockedWorlds = ['arcade', 'cards'];
  save.games.socks.stars = 2; // the 2nd game of Cartes needs 2 stars in the world
  await AsyncStorage.multiSet([
    ['telemetry.consent.v1', 'denied'],
    ['save', serializeSave(save)],
  ]);
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab-games'));
  await fireEvent.press(await screen.findByTestId('world-cards'));
  await fireEvent.press(await screen.findByTestId('game-twentyone'));
  await fireEvent.press(await screen.findByTestId('sheet-play'));
  expect(await screen.findByTestId('twentyone-screen')).toBeTruthy();
}

describe('Vingt-et-Un screen (AC-69)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(deviceLanguageTags).mockReturnValue(['fr-FR']);
    jest.mocked(Linking.getInitialURL).mockResolvedValue(`miniworlds://seed/${SESSION_SEED}`);
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => {
    restore();
    jest.mocked(Linking.getInitialURL).mockResolvedValue(null);
  });

  it('AC-69: the first round shows the bubble, scripted Tirer / Rester / Main suivante update the table and HUD as the engine predicts, Pause → Quitter shows the Result', async () => {
    await openTwentyOne();
    expect(screen.getByTestId('tutorial-play')).toHaveTextContent(/Tirer ou Rester/);
    expect(screen.getByTestId('hud-hand')).toHaveTextContent(/^1 \/ 10$/);
    let engine = createTwentyOne(ROUND_SEED, {});
    expect(screen.getByTestId('twentyone-player-total')).toHaveTextContent(new RegExp(`^${handTotal(engine.player)}$`));
    expect(screen.getByTestId('twentyone-dealer-total')).toHaveTextContent(new RegExp(`^${handTotal(engine.dealer.slice(0, 1))}$`));
    expect(screen.getByTestId('twentyone-message')).toHaveTextContent(/À toi/);

    await fireEvent.press(screen.getByTestId('twentyone-btn-hit'));
    engine = reduceTwentyOne(engine, { type: 'hit' });
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull(); // dismissed by « Tirer »
    expect(screen.getByTestId('twentyone-player-card-2')).toBeTruthy();
    expect(screen.getByTestId('twentyone-player-total')).toHaveTextContent(new RegExp(`^${handTotal(engine.player)}$`));

    await fireEvent.press(screen.getByTestId('twentyone-btn-stand'));
    engine = reduceTwentyOne(engine, { type: 'stand' });
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${engine.score}$`));
    expect(screen.getByTestId('twentyone-dealer-total')).toHaveTextContent(new RegExp(`^${handTotal(engine.dealer)}$`));
    const messages = { win: /Gagné/, push: /Égalité/, lose: /Perdu/, bust: /Plus de 21/, blackjack: /Vingt-et-un/, blackjack_push: /Égalité/ };
    if (engine.outcome === null) throw new Error('the hand is settled after « Rester »');
    expect(screen.getByTestId('twentyone-message')).toHaveTextContent(messages[engine.outcome]);
    expect(screen.queryByTestId('twentyone-btn-hit')).toBeNull();

    await fireEvent.press(screen.getByTestId('twentyone-btn-next'));
    expect(screen.getByTestId('hud-hand')).toHaveTextContent(/^2 \/ 10$/);

    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(await screen.findByTestId('result-screen')).toBeTruthy();
  }, 60_000);
});
