import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { ANGLES, createShot, FLIGHT_MS, perfectSettings, POWERS, reduceShot, resolveShot, ShotState, TARGET_SHOW_MS } from '../game/shot/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { ShotGame } from '../screens/game/ShotGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save first.
const SEED = 2026;
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <ShotGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(sight = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'skill'];
  if (sight > 0) save.games.shot.upgrades = { sight };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('shot-screen')).toBeTruthy();
  return onFinish;
}

/** Moves the injectable clock and lets the frame loop (requestAnimationFrame) run. */
async function advance(ms: number) {
  nowMs += ms;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));

/** Brings the setting to `angle` / `power` with the buttons, one step per press, and the engine with it. */
async function aimTo(engine: ShotState, angle: number, power: number): Promise<ShotState> {
  let s = engine;
  for (let i = 0; i < 40 && s.angle !== angle; i++) {
    const step = angle > s.angle ? 1 : -1;
    s = reduceShot(s, { type: 'angle', step });
    await press(step > 0 ? 'shot-angle-plus' : 'shot-angle-minus');
  }
  for (let i = 0; i < 40 && s.power !== power; i++) {
    const step = power > s.power ? 1 : -1;
    s = reduceShot(s, { type: 'power', step });
    await press(step > 0 ? 'shot-power-plus' : 'shot-power-minus');
  }
  expect(screen.getByTestId('shot-angle')).toHaveTextContent(`${angle}°`);
  expect(screen.getByTestId('shot-power')).toHaveTextContent(String(power));
  return s;
}

/** The engine after the whole flight of its shot in the air (50 ms ticks). */
function landed(engine: ShotState): ShotState {
  let s = engine;
  for (let i = 0; i < 100 && s.flight !== null; i++) s = reduceShot(s, { type: 'tick', dt: 50 });
  return s;
}

/** A setting that misses the current target by more than 10 m. */
function missOf(engine: ShotState): { angle: number; power: number } {
  for (const angle of ANGLES) for (const power of POWERS) if (resolveShot(engine, angle, power).points === 0) return { angle, power };
  throw new Error('no miss');
}

describe('Tir Parfait screen (AC-108)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 22, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-108: the first round shows the bubble; the settings, a miss then a perfect 2nd shot update the HUD and the score as the engine predicts; inputs during the 700 ms flight are ignored (frames of 50 ms)', async () => {
    await start();
    expect(screen.getByTestId('tutorial-aim')).toHaveTextContent(/Règle l'angle et la puissance, puis tire/);
    let engine = createShot(SEED, {});
    expect(screen.getByTestId('hud-target')).toHaveTextContent(/^1 \/ 6$/);
    expect(screen.getByTestId('hud-shots')).toHaveTextContent(/^3$/);
    expect(screen.getByTestId('hud-wind')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('shot-angle')).toHaveTextContent(/^45°$/);
    expect(screen.getByTestId('shot-power')).toHaveTextContent(/^5$/);
    expect(screen.getByTestId('shot-distance')).toHaveTextContent(`${engine.distance} m`);
    expect(screen.getByTestId('shot-fire')).toHaveTextContent(/^Tirer$/);
    // No « Viseur »: no trajectory dots; no wall before the 5th target; nothing landed yet.
    expect(screen.queryByTestId('shot-sight')).toBeNull();
    expect(screen.queryByTestId('shot-wall')).toBeNull();
    expect(screen.queryByTestId('shot-landing')).toBeNull();

    // The first press of a control dismisses the bubble.
    await press('shot-angle-plus');
    engine = reduceShot(engine, { type: 'angle', step: 1 });
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('shot-angle')).toHaveTextContent(/^50°$/);

    // A miss: one shot spent, the ball flies, nothing scored.
    const miss = missOf(engine);
    engine = await aimTo(engine, miss.angle, miss.power);
    engine = reduceShot(engine, { type: 'fire' });
    await press('shot-fire');
    expect(screen.getByTestId('hud-shots')).toHaveTextContent(/^2$/);
    expect(screen.getByTestId('shot-ball')).toBeTruthy();

    // Inputs inside the flight change nothing.
    await press('shot-fire');
    await press('shot-power-plus');
    await press('shot-angle-plus');
    expect(screen.getByTestId('hud-shots')).toHaveTextContent(/^2$/);
    expect(screen.getByTestId('shot-angle')).toHaveTextContent(`${miss.angle}°`);
    expect(screen.getByTestId('shot-power')).toHaveTextContent(String(miss.power));
    for (let t = 0; t < FLIGHT_MS + 200; t += 50) await advance(50);
    engine = landed(engine);
    expect(engine.score).toBe(0);
    expect(screen.queryByTestId('shot-ball')).toBeNull();
    expect(screen.getByTestId('shot-landing').props.accessibilityValue.text).toBe(String(Math.round(engine.last?.landing ?? NaN)));
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('hud-shots')).toHaveTextContent(/^2$/);
    expect(screen.queryByTestId('shot-last')).toBeNull();

    // The 2nd shot lands 2 m or less from the centre: 100 + 20, when the ball lands.
    const perfect = perfectSettings(engine)[0];
    engine = await aimTo(engine, perfect.angle, perfect.power);
    engine = reduceShot(engine, { type: 'fire' });
    await press('shot-fire');
    expect(screen.getByTestId('hud-shots')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    for (let t = 0; t < FLIGHT_MS + 200; t += 50) await advance(50);
    engine = landed(engine);
    expect(engine.score).toBe(120);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^120$/);
    expect(screen.getByTestId('shot-last')).toHaveTextContent(/^\+120$/);
    expect(screen.getByTestId('shot-landing').props.accessibilityValue.text).toBe(String(Math.round(engine.last?.landing ?? NaN)));

    // The finished target stays shown 900 ms (inputs ignored), then target 2 comes with 3 shots.
    for (let t = 0; t < TARGET_SHOW_MS - 400; t += 50) await advance(50);
    await press('shot-fire');
    expect(screen.getByTestId('hud-target')).toHaveTextContent(/^1 \/ 6$/);
    expect(screen.getByTestId('hud-shots')).toHaveTextContent(/^1$/);
    for (let t = 0; t < 700; t += 50) await advance(50);
    for (let i = 0; i < 100 && engine.target === 1; i++) engine = reduceShot(engine, { type: 'tick', dt: 50 });
    expect(screen.getByTestId('hud-target')).toHaveTextContent(/^2 \/ 6$/);
    expect(screen.getByTestId('hud-shots')).toHaveTextContent(/^3$/);
    expect(screen.getByTestId('shot-distance')).toHaveTextContent(`${engine.distance} m`);
    expect(screen.queryByTestId('shot-landing')).toBeNull();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^120$/);
  }, 60_000);

  it('AC-108: « Viseur » draws the first part of the trajectory as dots (40 % at level 2)', async () => {
    await start(2);
    // 36 dots for a whole trajectory: 40 % is 14 dots.
    expect(screen.getByTestId('shot-sight').props.accessibilityValue.text).toBe('14');
  });

  it('AC-108: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'shot', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
