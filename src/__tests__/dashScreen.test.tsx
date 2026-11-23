import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { setClock } from '../game/clock';
import { approachTime, colourLane, createDash, LANES, reduceDash } from '../game/dash/engine';
import { I18nProvider } from '../i18n/I18nProvider';
import { DashGame } from '../screens/game/DashGame';
import { GameStoreProvider } from '../state/GameStore';
import { ThemeProvider } from '../ui/ThemeProvider';

const SEED = 777;
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

// The frame loop is driven by hand: each frame advances the injectable clock by `ms` and runs the queued callbacks.
// Callbacks are cancelled by id: the lane slide (Animated.timing) cancels its own frames, never the game loop.
let frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
async function runFrames(count: number, ms: number) {
  for (let i = 0; i < count; i++) {
    nowMs += ms;
    const queued = [...frames.values()];
    frames = new Map();
    await act(async () => {
      for (const cb of queued) cb(nowMs);
    });
  }
}

async function renderDash(onFinish = jest.fn()) {
  await render(
    <ThemeProvider setting="auto">
      <I18nProvider setting="fr" onChange={() => {}}>
        <GameStoreProvider sessionSeed={null}>
          <DashGame seed={SEED} onFinish={onFinish} />
        </GameStoreProvider>
      </I18nProvider>
    </ThemeProvider>,
  );
  expect(await screen.findByTestId('dash-screen')).toBeTruthy();
  return onFinish;
}

describe('Couleur Éclair screen (AC-108)', () => {
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

  it('AC-108: the first round shows the tutorial bubble, the three doors of the gate, the runner and the HUD', async () => {
    const engine = createDash(SEED, {});
    await renderDash();
    expect(screen.getByTestId('tutorial-lane')).toHaveTextContent(/Touche à gauche, au milieu ou à droite/);
    expect(screen.getByTestId('hud-lives')).toHaveTextContent(/^3$/);
    expect(screen.getByTestId('hud-gates')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    // Each colour has its own shape: the HUD, the runner and each door show the shape of their colour.
    expect(screen.getByTestId(`hud-colour-${engine.colour}`)).toBeTruthy();
    expect(within(screen.getByTestId('dash-runner')).getByTestId(`dash-shape-${engine.colour}`)).toBeTruthy();
    LANES.forEach((lane, i) => expect(within(screen.getByTestId(`dash-door-${lane}`)).getByTestId(`dash-shape-${engine.doors[i]}`)).toBeTruthy());
    expect(screen.getByTestId('dash-lane-middle').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  });

  it('AC-108: the gate waits behind the bubble, then comes on its own; the door of the runner lane scores as the engine predicts', async () => {
    await renderDash();
    // The bubble freezes the round: no approach.
    await runFrames(80, 50);
    expect(screen.getByTestId('hud-gates')).toHaveTextContent(/^0$/);

    // A tap on the lane of the runner's colour: the runner goes there, nothing is passed yet.
    let expected = createDash(SEED, {});
    const good = colourLane(expected);
    expected = reduceDash(expected, { type: 'steer', lane: good });
    await fireEvent.press(screen.getByTestId(`dash-lane-${good}`));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId(`dash-lane-${good}`).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);

    // 2 150 ms: still coming; at 2 200 ms the gate reaches the runner: +10.
    await runFrames(43, 50);
    expect(screen.getByTestId('hud-gates')).toHaveTextContent(/^0$/);
    await runFrames(1, 50);
    expected = reduceDash(expected, { type: 'tick', dt: approachTime(1) });
    expect(expected.score).toBe(10);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^10$/);
    expect(screen.getByTestId('hud-gates')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('hud-lives')).toHaveTextContent(/^3$/);
    expect(screen.getByTestId('dash-streak')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('dash-result-ok')).toHaveTextContent(/^\+10$/);
    // The next gate is shown with its own doors.
    LANES.forEach((lane, i) => expect(within(screen.getByTestId(`dash-door-${lane}`)).getByTestId(`dash-shape-${expected.doors[i]}`)).toBeTruthy());

    // A wrong lane for gate 2 (2 170 ms, reached on the 44th frame of 50 ms): a life is lost, the streak is reset.
    const bad = LANES.find((lane) => lane !== colourLane(expected)) ?? 'left';
    await fireEvent.press(screen.getByTestId(`dash-lane-${bad}`));
    expected = reduceDash(expected, { type: 'steer', lane: bad });
    await runFrames(43, 50);
    expect(screen.getByTestId('hud-gates')).toHaveTextContent(/^1$/);
    await runFrames(1, 50);
    expected = reduceDash(expected, { type: 'tick', dt: approachTime(2) });
    expect(expected.lives).toBe(2);
    expect(screen.getByTestId('hud-lives')).toHaveTextContent(/^2$/);
    expect(screen.getByTestId('hud-gates')).toHaveTextContent(/^2$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^10$/);
    expect(screen.getByTestId('dash-streak')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('dash-result-wrong')).toBeTruthy();
  });

  it('AC-108: the approach does not run while the pause is shown', async () => {
    await renderDash();
    await fireEvent.press(screen.getByTestId('dash-lane-left'));
    await runFrames(20, 50);
    await fireEvent.press(screen.getByTestId('game-pause'));
    expect(await screen.findByTestId('pause-overlay')).toBeTruthy();
    await runFrames(100, 50);
    expect(screen.getByTestId('hud-gates')).toHaveTextContent(/^0$/);
    // After the pause the gate needs the rest of its 2 200 ms: 1 000 ms done, 1 200 ms to go.
    await fireEvent.press(screen.getByTestId('pause-resume'));
    await runFrames(23, 50);
    expect(screen.getByTestId('hud-gates')).toHaveTextContent(/^0$/);
    await runFrames(1, 50);
    expect(screen.getByTestId('hud-gates')).toHaveTextContent(/^1$/);
  });

  it('AC-108: three wrong doors end the round with the score of the engine', async () => {
    const onFinish = await renderDash();
    let expected = createDash(SEED, {});
    for (let guard = 0; expected.status === 'playing' && guard < 10; guard++) {
      const bad = LANES.find((lane) => lane !== colourLane(expected)) ?? 'left';
      // The tap is a no-op when the runner is already on that lane.
      await fireEvent.press(screen.getByTestId(`dash-lane-${bad}`));
      expected = reduceDash(expected, { type: 'steer', lane: bad });
      await runFrames(44, 50);
      expected = reduceDash(expected, { type: 'tick', dt: expected.approachMs });
    }
    expect(expected).toMatchObject({ status: 'over', lives: 0, score: 0, passed: 3 });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'dash', score: 0, combos: 0, outcome: 'ended' }), 'result');
  });

  it('AC-108: Pause → Quitter ends the round', async () => {
    const onFinish = await renderDash();
    await fireEvent.press(screen.getByTestId('dash-lane-left'));
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'dash', score: 0, outcome: 'quit' }), 'result');
  });
});
