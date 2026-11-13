import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import App from '../App';
import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { createSocks, MISS_HIDE_MS, reduceSocks, SOCKS_COLS, type SocksState } from '../game/socks/engine';
import { deviceLanguageTags } from '../i18n/deviceLocale';

// The session seed comes from the deep link; the first round of the session uses seed + 1.
const SESSION_SEED = 4242;
const ROUND_SEED = SESSION_SEED + 1;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

const cell = (index: number) => `socks-cell-${index % SOCKS_COLS}-${Math.floor(index / SOCKS_COLS)}`;
const face = (index: number) => `socks-face-${index % SOCKS_COLS}-${Math.floor(index / SOCKS_COLS)}`;
const back = (index: number) => `socks-back-${index % SOCKS_COLS}-${Math.floor(index / SOCKS_COLS)}`;
function pairsOf(s: SocksState): [number, number][] {
  const bySock = new Map<number, number[]>();
  s.cards.forEach((card, i) => bySock.set(card.sock, [...(bySock.get(card.sock) ?? []), i]));
  return [...bySock.values()].map(([a, b]) => [a, b]);
}

async function openSocks({ tutorialDone = false, peek = 0 } = {}) {
  const save = defaultSave();
  save.unlockedWorlds = ['arcade', 'cards'];
  save.games.socks.tutorialDone = tutorialDone;
  if (peek > 0) save.games.socks.upgrades = { peek };
  await AsyncStorage.multiSet([
    ['telemetry.consent.v1', 'denied'],
    ['save', serializeSave(save)],
  ]);
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab-games'));
  await fireEvent.press(await screen.findByTestId('world-cards'));
  await fireEvent.press(await screen.findByTestId('game-socks'));
  await fireEvent.press(await screen.findByTestId('sheet-play'));
  expect(await screen.findByTestId('socks-screen')).toBeTruthy();
}

describe('Chaussettes Perdues screen (AC-69)', () => {
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

  it('AC-69: the first round shows the bubble, a scripted pair and miss update score and HUD as the engine predicts, the miss hides after 700 ms, Pause → Quitter shows the Result', async () => {
    await openSocks();
    expect(screen.getByTestId('tutorial-flip')).toHaveTextContent(/Retourne deux cartes/);
    expect(screen.getByTestId('hud-board')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('hud-misses')).toHaveTextContent(/^8$/);

    let engine = createSocks(ROUND_SEED, {});
    const pairs = pairsOf(engine);
    const [a, b] = pairs[0];
    await fireEvent.press(screen.getByTestId(cell(a)));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull(); // dismissed by the first card
    expect(screen.getByTestId(face(a))).toBeTruthy();
    await fireEvent.press(screen.getByTestId(cell(b)));
    engine = [a, b].reduce((s, index) => reduceSocks(s, { type: 'flip', index }), engine);
    expect(engine.score).toBe(100);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${engine.score}$`));

    // A miss: both stay up, one miss is used, then the injectable clock hides them after 700 ms.
    const [c, d] = [pairs[1][0], pairs[2][0]];
    await fireEvent.press(screen.getByTestId(cell(c)));
    await fireEvent.press(screen.getByTestId(cell(d)));
    engine = [c, d].reduce((s, index) => reduceSocks(s, { type: 'flip', index }), engine);
    expect(screen.getByTestId('hud-misses')).toHaveTextContent(new RegExp(`^${8 - engine.misses}$`));
    expect(screen.getByTestId(face(c))).toBeTruthy();
    expect(screen.getByTestId(face(d))).toBeTruthy();
    nowMs += MISS_HIDE_MS + 100;
    await waitFor(() => expect(screen.getByTestId(back(c))).toBeTruthy(), { timeout: 4000 });
    expect(screen.getByTestId(back(d))).toBeTruthy();
    expect(screen.getByTestId(face(a))).toBeTruthy(); // the pair found stays up

    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(await screen.findByTestId('result-screen')).toBeTruthy();
  }, 60_000);

  it('« Coup d\'œil » shows every card, ignores taps, then hides them after the peek duration', async () => {
    await openSocks({ tutorialDone: true, peek: 1 });
    expect(screen.getByTestId('socks-watch')).toBeTruthy();
    expect(screen.getByTestId(face(0))).toBeTruthy();
    await fireEvent.press(screen.getByTestId(cell(0)));
    nowMs += 1100;
    await waitFor(() => expect(screen.queryByTestId('socks-watch')).toBeNull(), { timeout: 4000 });
    expect(screen.getByTestId(back(0))).toBeTruthy(); // the tap during the peek turned nothing
  }, 60_000);
});
