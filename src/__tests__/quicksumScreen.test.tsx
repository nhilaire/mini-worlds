import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import App from '../App';
import { setClock } from '../game/clock';
import { createQuickSum, QuickSumState, reduceQuickSum, rightIndex, secondsLeft } from '../game/quicksum/engine';
import { deviceLanguageTags } from '../i18n/deviceLocale';

// Session seed of the deep link; the first round of the session uses seed + 1. `/unlocked` opens every game.
const SESSION_SEED = 777;
const ROUND_SEED = SESSION_SEED + 1;
const STEP_MS = 50;

let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

/** Moves the injectable clock by `ms` in 50 ms frames and lets the frame loop (requestAnimationFrame) run each time. */
async function advance(ms: number) {
  for (let done = 0; done < ms; done += STEP_MS) {
    nowMs += STEP_MS;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

/** The same frames on the engine side. */
function ticks(s: QuickSumState, ms: number): QuickSumState {
  let state = s;
  for (let done = 0; done < ms; done += STEP_MS) state = reduceQuickSum(state, { type: 'tick', dt: STEP_MS });
  return state;
}

async function openQuickSum() {
  await AsyncStorage.setItem('telemetry.consent.v1', 'denied');
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab-games'));
  await fireEvent.press(await screen.findByTestId('world-memory'));
  await fireEvent.press(await screen.findByTestId('game-quicksum'));
  await fireEvent.press(await screen.findByTestId('sheet-play'));
  expect(await screen.findByTestId('quicksum-screen')).toBeTruthy();
}

const press = (i: number) => fireEvent.press(screen.getByTestId(`quicksum-answer-${i}`));
const questionText = (s: QuickSumState) => `${s.question.a} ${s.question.op} ${s.question.b} = ?`;

describe('Calcul Éclair screen (AC-86)', () => {
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

  it('AC-86: the first round shows the bubble with the timer stopped; right answers score as the engine predicts and the 250 ms guard ignores a double tap', async () => {
    let engine = createQuickSum(ROUND_SEED, { extra_time: 0 });
    await openQuickSum();
    expect(screen.getByTestId('tutorial-answer')).toHaveTextContent(/Touche la bonne réponse/);
    expect(screen.getByTestId('quicksum-question')).toHaveTextContent(questionText(engine));
    engine.question.choices.forEach((value, i) => expect(screen.getByTestId(`quicksum-answer-${i}`)).toHaveTextContent(new RegExp(`^${value}$`)));
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^60$/);
    await advance(1000);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^60$/);

    await press(rightIndex(engine));
    engine = reduceQuickSum(engine, { type: 'answer', index: rightIndex(engine) });
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^10$/);
    expect(screen.getByTestId('hud-streak')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('quicksum-question')).toHaveTextContent(questionText(engine));

    // Double tap: the right answer of the new question at once is ignored.
    await press(rightIndex(engine));
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^10$/);

    await advance(300);
    engine = ticks(engine, 300);
    await press(rightIndex(engine));
    engine = reduceQuickSum(engine, { type: 'answer', index: rightIndex(engine) });
    expect(engine.score).toBe(25);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^25$/);
    expect(screen.getByTestId('hud-streak')).toHaveTextContent(/^2$/);
  }, 60_000);

  it('AC-86: the timer follows the clock frame by frame and a wrong answer costs 5 s and the streak', async () => {
    let engine = createQuickSum(ROUND_SEED, { extra_time: 0 });
    await openQuickSum();
    await press(rightIndex(engine));
    engine = reduceQuickSum(engine, { type: 'answer', index: rightIndex(engine) });

    await advance(2000);
    engine = ticks(engine, 2000);
    expect(secondsLeft(engine)).toBe(58);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^58$/);

    const wrong = (rightIndex(engine) + 1) % 4;
    await press(wrong);
    engine = reduceQuickSum(engine, { type: 'answer', index: wrong });
    expect(secondsLeft(engine)).toBe(53);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^53$/);
    expect(screen.getByTestId('hud-streak')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^10$/);
    expect(screen.getByTestId('quicksum-question')).toHaveTextContent(questionText(engine));
  }, 60_000);

  it('AC-86: Pause → Quitter ends the round and shows the Result', async () => {
    await openQuickSum();
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(await screen.findByTestId('result-screen')).toBeTruthy();
  });
});
