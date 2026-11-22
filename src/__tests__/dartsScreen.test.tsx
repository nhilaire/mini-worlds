import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { setClock } from '../game/clock';
import { createDarts, DartsState, dartsLeft, reduceDarts, rotationOf } from '../game/darts/engine';
import { I18nProvider } from '../i18n/I18nProvider';
import { DartsGame } from '../screens/game/DartsGame';
import { GameStoreProvider } from '../state/GameStore';
import { ThemeProvider } from '../ui/ThemeProvider';

const SEED = 777;
const FRAME_MS = 40; // 3 frames = the 120 ms flight
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

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

/** The same script on the engine alone. */
const throwNow = (s: DartsState) => reduceDarts(s, { type: 'throw' });
function ticks(s: DartsState, count: number, ms: number): DartsState {
  let out = s;
  for (let i = 0; i < count; i++) out = reduceDarts(out, { type: 'tick', dt: ms });
  return out;
}

async function renderDarts(onFinish = jest.fn()) {
  await render(
    <ThemeProvider setting="auto">
      <I18nProvider setting="fr" onChange={() => {}}>
        <GameStoreProvider sessionSeed={null}>
          <DartsGame seed={SEED} onFinish={onFinish} />
        </GameStoreProvider>
      </I18nProvider>
    </ThemeProvider>,
  );
  expect(await screen.findByTestId('darts-screen')).toBeTruthy();
  return onFinish;
}

function expectHud(expected: DartsState) {
  expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
  expect(screen.getByTestId('hud-lives')).toHaveTextContent(new RegExp(`^${expected.lives}$`));
  expect(screen.getByTestId('hud-darts')).toHaveTextContent(new RegExp(`^${dartsLeft(expected)}$`));
  expect(screen.getByTestId('hud-stage')).toHaveTextContent(new RegExp(`^${expected.level}\\s/\\s8$`));
}

/** The rotation style of the holder of dart `index` on the target. */
function dartRotation(index: number): string {
  return JSON.stringify(screen.getByTestId(`darts-dart-${index}`).parent?.props.style);
}

/** The rotation style of the target: the Animated value set from the engine. */
function targetRotation(): string {
  return JSON.stringify(screen.getByTestId('darts-target').props.style);
}

describe('Lancer de Cible screen (AC-108)', () => {
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

  it('AC-108: the first round shows the tutorial bubble; the target does not turn while it is shown', async () => {
    await renderDarts();
    expect(screen.getByTestId('tutorial-throw')).toHaveTextContent(/Touche pour lancer\. Ne touche pas une fléchette déjà plantée/);
    expectHud(createDarts(SEED));
    expect(screen.getByTestId('hud-darts')).toHaveTextContent(/^5$/);
    expect(screen.getAllByTestId(/^darts-left-\d+$/)).toHaveLength(5);
    expect(screen.getByTestId('darts-next')).toBeTruthy();
    // 1 s of frames while the bubble is shown: the target stays still, so the first dart lands where a dart thrown
    // at the very start lands (10.8° of rotation during its flight).
    await runFrames(20, 50);
    expect(targetRotation()).toContain('"rotate":"0deg"');
    await fireEvent.press(screen.getByTestId('darts-throw'));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    await runFrames(3, FRAME_MS);
    const expected = ticks(throwNow(createDarts(SEED)), 3, FRAME_MS);
    expect(expected.darts).toHaveLength(1);
    expect(expected.darts[0].angle).toBeCloseTo(349.2);
    expect(dartRotation(0)).toContain(`"rotate":"${expected.darts[0].angle}deg"`);
    expect(targetRotation()).toContain(`"rotate":"${rotationOf(expected)}deg"`);
  });

  it('AC-108: scripted throws update the score, the darts left and the row of darts as the engine predicts', async () => {
    await renderDarts();
    let expected = throwNow(createDarts(SEED));
    await fireEvent.press(screen.getByTestId('darts-throw'));
    // In flight: nothing scored yet, the dart left the row, a second tap is ignored.
    expect(screen.getByTestId('darts-flight')).toBeTruthy();
    expect(screen.queryByTestId('darts-dart-0')).toBeNull();
    expect(screen.getAllByTestId(/^darts-left-\d+$/)).toHaveLength(4);
    await runFrames(1, FRAME_MS);
    await fireEvent.press(screen.getByTestId('darts-throw'));
    expected = throwNow(ticks(expected, 1, FRAME_MS));
    expectHud(expected);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    await runFrames(2, FRAME_MS);
    expected = ticks(expected, 2, FRAME_MS);
    expect(expected).toMatchObject({ score: 10, stuck: 1, lives: 3 });
    expectHud(expected);
    expect(screen.getByTestId('darts-dart-0')).toBeTruthy();
    expect(screen.getByTestId('darts-stuck')).toHaveTextContent(/^\+10$/);
    expect(screen.getByTestId('darts-next')).toBeTruthy();
    // The target turns 4.5° per 50 ms frame: 10 frames later the second dart sticks 55.8° further.
    await runFrames(10, 50);
    await fireEvent.press(screen.getByTestId('darts-throw'));
    await runFrames(3, FRAME_MS);
    expected = ticks(throwNow(ticks(expected, 10, 50)), 3, FRAME_MS);
    expect(expected).toMatchObject({ score: 20, stuck: 2, lives: 3, status: 'playing' });
    expectHud(expected);
    expect(dartRotation(1)).toContain(`"rotate":"${expected.darts[1].angle}deg"`);
    expect(screen.getAllByTestId(/^darts-left-\d+$/)).toHaveLength(3);
  });

  it('AC-108: a dart landing on another one bounces: a life is lost and the bounce is shown, as the engine predicts', async () => {
    await renderDarts();
    await fireEvent.press(screen.getByTestId('darts-throw'));
    await runFrames(3, FRAME_MS);
    // One full turn (4 s at 90°/s) after the first throw, the first dart is back under the bottom point at landing.
    await runFrames(97, FRAME_MS);
    await fireEvent.press(screen.getByTestId('darts-throw'));
    await runFrames(3, FRAME_MS);
    const expected = ticks(throwNow(ticks(throwNow(createDarts(SEED)), 100, FRAME_MS)), 3, FRAME_MS);
    expect(expected).toMatchObject({ score: 10, stuck: 1, lives: 2, status: 'playing' });
    expectHud(expected);
    expect(screen.getByTestId('darts-bounce')).toHaveTextContent(/−1/);
    expect(screen.getByTestId('darts-bounced')).toBeTruthy();
    expect(screen.queryByTestId('darts-dart-1')).toBeNull();
    expect(screen.queryByTestId('darts-stuck')).toBeNull();
    // The chip goes away with the next throw.
    await fireEvent.press(screen.getByTestId('darts-throw'));
    expect(screen.queryByTestId('darts-bounce')).toBeNull();
  });

  it('AC-108: the target does not turn while the pause is shown', async () => {
    await renderDarts();
    await fireEvent.press(screen.getByTestId('darts-throw'));
    await runFrames(3, FRAME_MS);
    await fireEvent.press(screen.getByTestId('game-pause'));
    expect(await screen.findByTestId('pause-overlay')).toBeTruthy();
    await runFrames(40, 50); // 2 s behind the pause: no tick
    await fireEvent.press(screen.getByTestId('pause-resume'));
    await runFrames(10, 50);
    await fireEvent.press(screen.getByTestId('darts-throw'));
    await runFrames(3, FRAME_MS);
    const expected = ticks(throwNow(ticks(ticks(throwNow(createDarts(SEED)), 3, FRAME_MS), 10, 50)), 3, FRAME_MS);
    expect(expected.stuck).toBe(2);
    expectHud(expected);
    expect(dartRotation(1)).toContain(`"rotate":"${expected.darts[1].angle}deg"`);
  });

  it('AC-108: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await renderDarts();
    await fireEvent.press(screen.getByTestId('darts-throw'));
    await runFrames(3, FRAME_MS);
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'darts', score: 10, outcome: 'quit' }), 'result');
  });
});
