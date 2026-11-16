import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { StyleSheet } from 'react-native';

import { approachTime, createArmy, gateLabel, reduceArmy } from '../game/army/engine';
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

describe('Armée de Poche screen (AC-86, AC-92)', () => {
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

  it('AC-86: the first round shows the tutorial bubble, the next pair of gates in one neutral colour, the soldiers and the fort', async () => {
    const engine = createArmy(SEED, {});
    await renderArmy();
    expect(screen.getByTestId('tutorial-gate')).toHaveTextContent(/Touche à gauche ou à droite pour changer de couloir/);
    expect(screen.getByTestId('hud-soldiers')).toHaveTextContent(/^10$/);
    expect(screen.getByTestId('hud-run')).toHaveTextContent(/^1 \/ 8$/);
    expect(screen.getByTestId('army-gate-left')).toHaveTextContent(gateLabel(engine.pairs[0][0]));
    expect(screen.getByTestId('army-gate-right')).toHaveTextContent(gateLabel(engine.pairs[0][1]));
    expect(screen.getByTestId('army-fort')).toHaveTextContent(new RegExp(`^Fort\\s*: ${engine.defenders}$`));
  });

  it('AC-92: every gate has the same colour, whatever its operation', async () => {
    await renderArmy();
    const colours = new Set<string>();
    // Walk through 10 pairs (taps keep the army on the left lane): every gate shown is drawn in the same colour.
    await fireEvent.press(screen.getByTestId('army-lane-left'));
    for (let i = 0; i < 10; i++) {
      for (const side of ['left', 'right']) colours.add(StyleSheet.flatten(screen.getByTestId(`army-door-${side}`).props.style).backgroundColor);
      await runFrames(60, 50);
    }
    expect(colours.size).toBe(1);
  });

  it('AC-92: the army waits behind the bubble, then walks on its own and goes through the gate of its lane, kept to the next pair', async () => {
    await renderArmy();
    // The bubble freezes the round: no approach.
    await runFrames(80, 50);
    expect(screen.getByTestId('hud-soldiers')).toHaveTextContent(/^10$/);
    expect(screen.getByTestId('army-lane-left').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));

    // A tap on the right half: the lane changes, nothing is crossed yet.
    let expected = reduceArmy(createArmy(SEED, {}), { type: 'steer', side: 'right' });
    await fireEvent.press(screen.getByTestId('army-lane-right'));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('army-lane-right').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(screen.getByTestId('hud-soldiers')).toHaveTextContent(/^10$/);

    // 2 950 ms: still walking; at 3 000 ms the army goes through the right gate.
    await runFrames(59, 50);
    expect(screen.getByTestId('hud-soldiers')).toHaveTextContent(/^10$/);
    await runFrames(1, 50);
    expected = reduceArmy(expected, { type: 'tick', dt: approachTime(1) });
    expect(screen.getByTestId('hud-soldiers')).toHaveTextContent(new RegExp(`^${expected.army}$`));
    expect(screen.getByTestId('army-gate-left')).toHaveTextContent(gateLabel(expected.pairs[1][0]));

    // No tap: the next pair is crossed on the right lane too.
    await runFrames(60, 50);
    expected = reduceArmy(expected, { type: 'tick', dt: approachTime(1) });
    expect(screen.getByTestId('hud-soldiers')).toHaveTextContent(new RegExp(`^${expected.army}$`));
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
  });

  it('AC-86: Pause → Quitter ends the round', async () => {
    const onFinish = await renderArmy();
    await fireEvent.press(screen.getByTestId('army-lane-left'));
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'army', score: 0, outcome: 'quit' }), 'result');
  });
});
