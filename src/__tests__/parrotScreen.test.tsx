import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import App from '../App';
import { setClock } from '../game/clock';
import { createParrot, reduceParrot, showSchedule } from '../game/parrot/engine';
import { deviceLanguageTags } from '../i18n/deviceLocale';

// Session seed of the deep link; the first round of the session uses seed + 1. `/unlocked` opens every game.
const SESSION_SEED = 777;
const ROUND_SEED = SESSION_SEED + 1;

let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

/** Moves the injectable clock and lets the show loop (requestAnimationFrame) run. */
async function advance(ms: number) {
  nowMs += ms;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

async function openParrot() {
  await AsyncStorage.setItem('telemetry.consent.v1', 'denied');
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab-games'));
  await fireEvent.press(await screen.findByTestId('world-memory'));
  await fireEvent.press(await screen.findByTestId('game-parrot'));
  await fireEvent.press(await screen.findByTestId('sheet-play'));
  expect(await screen.findByTestId('parrot-screen')).toBeTruthy();
}

const isLit = (pad: number) => screen.getByTestId(`parrot-pad-${pad}`).props.accessibilityState?.selected === true;

describe('Perroquet Copieur screen (AC-69)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(deviceLanguageTags).mockReturnValue(['fr-FR']);
    jest.mocked(Linking.getInitialURL).mockResolvedValue(`miniworlds://seed/${SESSION_SEED}/unlocked`);
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => {
    restore();
    jest.mocked(Linking.getInitialURL).mockResolvedValue(null);
  });

  it('AC-69: the first round shows the bubble and the show, ignores taps during it, then a right pad scores as the engine predicts', async () => {
    const engine = createParrot(ROUND_SEED, { second_chance: 0 });
    const first = engine.sequence[0];
    const expected = reduceParrot(reduceParrot(engine, { type: 'shown' }), { type: 'tap', pad: first });
    expect(expected.score).toBe(10);

    await openParrot();
    expect(screen.getByTestId('tutorial-repeat')).toHaveTextContent(/Regarde le perroquet/);
    expect(screen.getByTestId('hud-length')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('parrot-status')).toHaveTextContent(/Regarde/);

    // 600 ms dark, then the first pad lights for 500 ms.
    await advance(0);
    expect([0, 1, 2, 3].some(isLit)).toBe(false);
    await advance(700);
    expect(isLit(first)).toBe(true);
    expect([0, 1, 2, 3].filter(isLit)).toEqual([first]);

    // A tap during the show is ignored (no score, the bubble stays).
    await fireEvent.press(screen.getByTestId(`parrot-pad-${first}`));
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('tutorial-repeat')).toBeTruthy();

    // After the schedule, the player's turn.
    await advance(showSchedule(engine.sequence).totalMs);
    expect(screen.getByTestId('parrot-status')).toHaveTextContent(/À toi/);
    expect(isLit(first)).toBe(false);

    await fireEvent.press(screen.getByTestId(`parrot-pad-${first}`));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-length')).toHaveTextContent(new RegExp(`^${expected.sequence.length}$`));
    expect(screen.getByTestId('parrot-status')).toHaveTextContent(/Regarde/);
  });

  it('AC-69: a wrong pad without second chance ends the round on the Result', async () => {
    const engine = createParrot(ROUND_SEED, {});
    const wrong = (engine.sequence[0] + 1) % 4;
    await openParrot();
    await advance(0);
    await advance(showSchedule(engine.sequence).totalMs);
    await fireEvent.press(screen.getByTestId(`parrot-pad-${wrong}`));
    expect(await screen.findByTestId('result-screen')).toBeTruthy();
  });

  it('AC-69: Pause → Quitter ends the round and shows the Result', async () => {
    await openParrot();
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(await screen.findByTestId('result-screen')).toBeTruthy();
  });
});
