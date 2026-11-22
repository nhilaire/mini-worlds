import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { setClock } from '../game/clock';
import { createPattern, PatternState, reducePattern, rightIndex, secondsLeft } from '../game/pattern/engine';
import { I18nProvider } from '../i18n/I18nProvider';
import { PatternGame } from '../screens/game/PatternGame';
import { GameStoreProvider } from '../state/GameStore';
import { ThemeProvider } from '../ui/ThemeProvider';

const SEED = 777;
const STEP_MS = 50;
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

// The frame loop is driven by hand: each frame advances the injectable clock by 50 ms and runs the queued callbacks.
let frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
async function advance(ms: number) {
  for (let done = 0; done < ms; done += STEP_MS) {
    nowMs += STEP_MS;
    const queued = [...frames.values()];
    frames = new Map();
    await act(async () => {
      for (const cb of queued) cb(nowMs);
    });
  }
}

/** The same frames on the engine side. */
function ticks(s: PatternState, ms: number): PatternState {
  let state = s;
  for (let done = 0; done < ms; done += STEP_MS) state = reducePattern(state, { type: 'tick', dt: STEP_MS });
  return state;
}

async function renderPattern(onFinish = jest.fn()) {
  await render(
    <ThemeProvider setting="auto">
      <I18nProvider setting="fr" onChange={() => {}}>
        <GameStoreProvider sessionSeed={null}>
          <PatternGame seed={SEED} onFinish={onFinish} />
        </GameStoreProvider>
      </I18nProvider>
    </ThemeProvider>,
  );
  expect(await screen.findByTestId('pattern-screen')).toBeTruthy();
  return onFinish;
}

const press = (i: number) => fireEvent.press(screen.getByTestId(`pattern-answer-${i}`));

/** The screen shows this question: its 4 terms, the « ? » tile and its 4 answers (by value or symbol id). */
function expectQuestion(question: PatternState['question']) {
  question.terms.forEach((item, i) => expect(screen.getByTestId(`pattern-term-${i}`).props.accessibilityLabel).toBe(String(item)));
  expect(screen.getByTestId('pattern-unknown')).toHaveTextContent(/^\?$/);
  question.answers.forEach((item, i) => expect(screen.getByTestId(`pattern-answer-${i}`).props.accessibilityLabel).toBe(String(item)));
}

describe('Suite Logique screen (AC-108)', () => {
  let restore = () => {};
  const raf = globalThis.requestAnimationFrame;
  const caf = globalThis.cancelAnimationFrame;
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 22, 10, 0).getTime();
    restore = setClock(() => nowMs);
    frames = new Map();
    globalThis.requestAnimationFrame = (cb) => {
      frameId += 1;
      frames.set(frameId, cb);
      return frameId;
    };
    globalThis.cancelAnimationFrame = (id) => {
      if (typeof id === 'number') frames.delete(id);
    };
  });
  afterEach(() => {
    restore();
    globalThis.requestAnimationFrame = raf;
    globalThis.cancelAnimationFrame = caf;
  });

  it('AC-108: the first round shows the bubble with the timer stopped; a right answer is shown 250 ms (green, check) and scores as the engine predicts', async () => {
    let engine = createPattern(SEED, { extra_time: 0 });
    await renderPattern();
    expect(screen.getByTestId('tutorial-answer')).toHaveTextContent(/Trouve ce qui vient après/);
    expectQuestion(engine.question);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^60$/);
    expect(screen.getByTestId('hud-level')).toHaveTextContent(/^Niv\. 1$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    await advance(1000);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^60$/);

    const first = engine.question;
    await press(rightIndex(engine));
    engine = reducePattern(engine, { type: 'answer', index: first.right });
    expect(engine.score).toBe(25);
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^25$/);
    // The answered question stays while its answer is shown, with the check on the tapped button.
    expectQuestion(first);
    expect(screen.getByTestId('pattern-mark-right')).toBeTruthy();
    expect(screen.queryByTestId('pattern-mark-wrong')).toBeNull();

    // A tap while the answer is shown is ignored.
    await press(rightIndex(engine));
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^25$/);
    await advance(200);
    expect(screen.getByTestId('pattern-mark-right')).toBeTruthy();
    await advance(50);
    engine = ticks(engine, 250);
    expect(screen.queryByTestId('pattern-mark-right')).toBeNull();
    expectQuestion(engine.question);

    // Three more right answers: level 2 and its numbers.
    for (let k = 0; k < 3; k++) {
      await press(rightIndex(engine));
      engine = reducePattern(engine, { type: 'answer', index: rightIndex(engine) });
      await advance(250);
      engine = ticks(engine, 250);
    }
    expect(engine.score).toBe(100);
    expect(engine.question.family).toBe('step');
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^100$/);
    expect(screen.getByTestId('hud-level')).toHaveTextContent(/^Niv\. 2$/);
    expectQuestion(engine.question);
    engine.question.terms.forEach((item, i) => expect(screen.getByTestId(`pattern-term-${i}`)).toHaveTextContent(new RegExp(`^${item}$`)));
  }, 60_000);

  it('AC-108: the timer follows the clock frame by frame, stops during the pause, and a wrong answer (red, cross) costs 3 s', async () => {
    let engine = createPattern(SEED, { extra_time: 0 });
    await renderPattern();
    await press(rightIndex(engine));
    engine = reducePattern(engine, { type: 'answer', index: rightIndex(engine) });

    await advance(2000);
    engine = ticks(engine, 2000);
    expect(secondsLeft(engine)).toBe(58);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^58$/);

    await fireEvent.press(screen.getByTestId('game-pause'));
    expect(await screen.findByTestId('pause-overlay')).toBeTruthy();
    await advance(5000);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^58$/);
    await fireEvent.press(screen.getByTestId('pause-resume'));

    const asked = engine.question;
    const wrong = (rightIndex(engine) + 1) % 4;
    await press(wrong);
    engine = reducePattern(engine, { type: 'answer', index: wrong });
    expect(secondsLeft(engine)).toBe(55);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^55$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^25$/);
    expectQuestion(asked);
    expect(screen.getByTestId('pattern-mark-wrong')).toBeTruthy();
    await advance(250);
    engine = ticks(engine, 250);
    expect(screen.queryByTestId('pattern-mark-wrong')).toBeNull();
    expectQuestion(engine.question);
  }, 60_000);

  it('AC-108: Pause → Quitter ends the round with the score so far', async () => {
    const engine = createPattern(SEED, { extra_time: 0 });
    const onFinish = await renderPattern();
    await press(rightIndex(engine));
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'pattern', score: 25, outcome: 'quit' }), 'result');
  });
});
