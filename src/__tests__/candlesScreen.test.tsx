import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { candlesLeft, createCandles, reduceCandles } from '../game/candles/engine';
import { setClock } from '../game/clock';
import { I18nProvider } from '../i18n/I18nProvider';
import { CandlesGame } from '../screens/game/CandlesGame';
import { GameStoreProvider } from '../state/GameStore';
import { ThemeProvider } from '../ui/ThemeProvider';

const SEED = 777;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

// The frame loop is driven by hand: each frame advances the injectable clock by `ms` and runs the queued callbacks.
let frames: FrameRequestCallback[] = [];
async function runFrames(count: number, ms: number) {
  for (let i = 0; i < count; i++) {
    nowMs += ms;
    const queued = frames;
    frames = [];
    await act(async () => {
      for (const cb of queued) cb(nowMs);
    });
  }
}

async function renderCandles(onFinish = jest.fn()) {
  await render(
    <ThemeProvider setting="auto">
      <I18nProvider setting="fr" onChange={() => {}}>
        <GameStoreProvider sessionSeed={null}>
          <CandlesGame seed={SEED} onFinish={onFinish} />
        </GameStoreProvider>
      </I18nProvider>
    </ThemeProvider>,
  );
  expect(await screen.findByTestId('candles-screen')).toBeTruthy();
  return onFinish;
}

describe('Bougies Folles screen (AC-69)', () => {
  let restore = () => {};
  const raf = globalThis.requestAnimationFrame;
  const caf = globalThis.cancelAnimationFrame;
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
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

  it('AC-69: the first round shows the tutorial bubble; the cake does not turn while it is shown', async () => {
    await renderCandles();
    expect(screen.getByTestId('tutorial-throw')).toHaveTextContent(/Touche pour lancer une bougie/);
    expect(screen.getByTestId('hud-cake')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('hud-candles')).toHaveTextContent(/^6$/);
    // 1 s of frames while the bubble is shown: the cake stays still, so the first candle lands at 0°.
    await runFrames(20, 50);
    await fireEvent.press(screen.getByTestId('candles-btn-throw'));
    expect(screen.getByTestId('hud-candles')).toHaveTextContent(/^5$/);
    const holder = screen.getByTestId('candles-candle-0').parent?.parent;
    expect(JSON.stringify(holder?.props.style)).toContain('"rotate":"0deg"');
  });

  it('AC-69: scripted throws update the score and candles left exactly as the engine predicts for the same seed', async () => {
    await renderCandles();
    let expected = reduceCandles(createCandles(SEED, {}), { type: 'throw' });
    await fireEvent.press(screen.getByTestId('candles-btn-throw'));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-candles')).toHaveTextContent(new RegExp(`^${candlesLeft(expected)}$`));
    expect(screen.getByTestId('candles-candle-0')).toBeTruthy();
    expect(screen.getByTestId('candles-flight')).toBeTruthy();
    // The cake turns 4.5° per 50 ms frame: after 10 frames (45°) the second candle is planted safely.
    await runFrames(10, 50);
    for (let i = 0; i < 10; i++) expected = reduceCandles(expected, { type: 'tick', dt: 50 });
    expected = reduceCandles(expected, { type: 'throw' });
    await fireEvent.press(screen.getByTestId('candles-btn-throw'));
    expect(expected.status).toBe('playing');
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-candles')).toHaveTextContent(new RegExp(`^${candlesLeft(expected)}$`));
    expect(screen.getByTestId('candles-candle-1')).toBeTruthy();
  });

  it('AC-69: a throw too close to a candle ends the round as the engine predicts', async () => {
    const onFinish = await renderCandles();
    await fireEvent.press(screen.getByTestId('candles-btn-throw'));
    await runFrames(2, 50); // 9°: closer than 14°
    await fireEvent.press(screen.getByTestId('candles-btn-throw'));
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'candles', score: 10, outcome: 'ended' }), 'result');
  });

  it('AC-69: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await renderCandles();
    await fireEvent.press(screen.getByTestId('candles-btn-throw'));
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'candles', score: 10, outcome: 'quit' }), 'result');
  });
});
