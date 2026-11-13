import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { createArmy, gateLabel, reduceArmy, WALK_MS } from '../game/army/engine';
import { setClock } from '../game/clock';
import { I18nProvider } from '../i18n/I18nProvider';
import { ArmyGame } from '../screens/game/ArmyGame';
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

async function renderArmy(onFinish = jest.fn()) {
  await render(
    <ThemeProvider setting="auto">
      <I18nProvider setting="fr" onChange={() => {}}>
        <GameStoreProvider sessionSeed={null}>
          <ArmyGame seed={SEED} onFinish={onFinish} />
        </GameStoreProvider>
      </I18nProvider>
    </ThemeProvider>,
  );
  expect(await screen.findByTestId('army-screen')).toBeTruthy();
  return onFinish;
}

describe('Armée de Poche screen (AC-86)', () => {
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

  it('AC-86: the first round shows the tutorial bubble, the next pair of gates, the soldiers and the fort', async () => {
    const engine = createArmy(SEED, {});
    await renderArmy();
    expect(screen.getByTestId('tutorial-gate')).toHaveTextContent(/Touche à gauche ou à droite pour choisir ta porte/);
    expect(screen.getByTestId('hud-soldiers')).toHaveTextContent(/^10$/);
    expect(screen.getByTestId('hud-run')).toHaveTextContent(/^1 \/ 8$/);
    expect(screen.getByTestId('army-gate-left')).toHaveTextContent(gateLabel(engine.pairs[0][0]));
    expect(screen.getByTestId('army-gate-right')).toHaveTextContent(gateLabel(engine.pairs[0][1]));
    expect(screen.getByTestId('army-fort')).toHaveTextContent(new RegExp(`^Fort\\s*: ${engine.defenders}$`));
  });

  it('AC-86: scripted taps update the soldiers as the engine predicts; a double tap during the 500 ms walk is ignored', async () => {
    await renderArmy();
    let expected = reduceArmy(createArmy(SEED, {}), { type: 'choose', side: 'left' });
    await fireEvent.press(screen.getByTestId('army-btn-left'));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-soldiers')).toHaveTextContent(new RegExp(`^${expected.army}$`));
    expect(screen.getByTestId('army-gate-left')).toHaveTextContent(gateLabel(expected.pairs[1][0]));

    // Double tap 100 ms later (two 50 ms frames): still walking, nothing changes.
    await runFrames(2, 50);
    await fireEvent.press(screen.getByTestId('army-btn-right'));
    expect(screen.getByTestId('hud-soldiers')).toHaveTextContent(new RegExp(`^${expected.army}$`));
    expect(screen.getByTestId('army-gate-left')).toHaveTextContent(gateLabel(expected.pairs[1][0]));

    // The walk ends after 500 ms of frames; the next tap goes through the right gate of pair 2.
    await runFrames(WALK_MS / 50, 50);
    expected = reduceArmy(reduceArmy(expected, { type: 'tick', dt: WALK_MS }), { type: 'choose', side: 'right' });
    await fireEvent.press(screen.getByTestId('army-btn-right'));
    expect(screen.getByTestId('hud-soldiers')).toHaveTextContent(new RegExp(`^${expected.army}$`));
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
  });

  it('AC-86: Pause → Quitter ends the round', async () => {
    const onFinish = await renderArmy();
    await fireEvent.press(screen.getByTestId('army-btn-left'));
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'army', score: 0, outcome: 'quit' }), 'result');
  });
});
