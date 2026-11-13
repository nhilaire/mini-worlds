import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { setClock } from '../game/clock';
import { createTower, reduceTower } from '../game/tower/engine';
import { I18nProvider } from '../i18n/I18nProvider';
import { TowerGame } from '../screens/game/TowerGame';
import { GameStoreProvider } from '../state/GameStore';
import { ThemeProvider } from '../ui/ThemeProvider';

const SEED = 4242;
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

async function renderTower(onFinish = jest.fn()) {
  await render(
    <ThemeProvider setting="auto">
      <I18nProvider setting="fr" onChange={() => {}}>
        <GameStoreProvider sessionSeed={null}>
          <TowerGame seed={SEED} onFinish={onFinish} />
        </GameStoreProvider>
      </I18nProvider>
    </ThemeProvider>,
  );
  expect(await screen.findByTestId('tower-screen')).toBeTruthy();
  return onFinish;
}

describe('Tour Bancale screen (AC-69)', () => {
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

  it('AC-69: the first round shows the tutorial bubble; the block does not move while it is shown', async () => {
    await renderTower();
    expect(screen.getByTestId('tutorial-drop')).toHaveTextContent(/Touche pour lâcher le bloc/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('hud-floors')).toHaveTextContent(/^0$/);
    // 1 s of frames while the bubble is shown: the block stays at the left edge, so the drop keeps 1 unit of 4.
    await runFrames(20, 50);
    await fireEvent.press(screen.getByTestId('tower-btn-drop'));
    const flat = (id: string) => [screen.getByTestId(id).props.style].flat(3).reduce((a, b) => ({ ...a, ...b }), {});
    expect(flat('tower-floor-1').width * 4).toBe(flat('tower-floor-0').width);
  });

  it('AC-69: scripted drops update the score and floors exactly as the engine predicts for the same seed', async () => {
    await renderTower();
    // First drop: the bubble is dismissed by it, the block is still at the left edge.
    let expected = reduceTower(createTower(SEED, {}), { type: 'drop' });
    await fireEvent.press(screen.getByTestId('tower-btn-drop'));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-floors')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('tower-cut')).toBeTruthy(); // the overhang falls away
    // 14 frames of 50 ms slide the block, then a second drop (perfect for this layout).
    await runFrames(14, 50);
    for (let i = 0; i < 14; i++) expected = reduceTower(expected, { type: 'tick', dt: 50 });
    expected = reduceTower(expected, { type: 'drop' });
    await fireEvent.press(screen.getByTestId('tower-btn-drop'));
    expect(expected.combos).toBe(1);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-floors')).toHaveTextContent(/^2$/);
    expect(screen.getByTestId('tower-perfect')).toBeTruthy();
  });

  it('AC-69: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await renderTower();
    await fireEvent.press(screen.getByTestId('tower-btn-drop'));
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'tower', score: 10, outcome: 'quit' }), 'result');
  });
});
