import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { createLights, reduceLights } from '../game/lights/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { LightsGame } from '../screens/game/LightsGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save from
// AsyncStorage first, as in the app where the game only opens once the store is loaded.
const SEED = 2026;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <LightsGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(hintLevel = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'puzzle'];
  if (hintLevel > 0) save.games.lights.upgrades = { hint: hintLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('lights-screen')).toBeTruthy();
  return onFinish;
}

// Grids 1-2 are 4 × 4: the scripted round plays on the first one.
const cellId = (cell: number, size = 4) => `lights-cell-${cell % size}-${Math.floor(cell / size)}`;
const litOnScreen = (size = 4) => Array.from({ length: size * size }, (_, i) => screen.queryByTestId(`lights-on-${i % size}-${Math.floor(i / size)}`) !== null);

describe('Lucioles screen (AC-69)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-69: a first round shows the tutorial bubble; a tap toggles the fireflies and updates the HUD as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-tap')).toHaveTextContent(/elle et ses voisines changent/);
    const engine = createLights(SEED, {});
    expect(engine.size).toBe(4);
    expect(screen.getByTestId('lights-cell-3-3')).toBeTruthy();
    expect(screen.queryByTestId('lights-cell-4-0')).toBeNull(); // no 5th column on a 4 × 4 grid
    expect(litOnScreen()).toEqual(engine.lit);
    expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^1 \/ 5$/);
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^0$/);
    // Without the upgrade the hint button shows 0 and is disabled.
    expect(screen.getByTestId('lights-btn-hint')).toHaveTextContent(/Indice \(0\)/);
    expect(screen.getByTestId('lights-btn-hint')).toBeDisabled();

    const afterTap = reduceLights(engine, { type: 'tap', cell: 5 });
    expect(afterTap.grid).toBe(1);
    await fireEvent.press(screen.getByTestId(cellId(5)));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^1$/);
    expect(litOnScreen()).toEqual(afterTap.lit);

    // Solving the grid at par (the remaining solution) scores 200 and shows grid 2.
    let expected = afterTap;
    for (const cell of afterTap.solution.flatMap((on, i) => (on ? [i] : []))) {
      expected = reduceLights(expected, { type: 'tap', cell });
      await fireEvent.press(screen.getByTestId(cellId(cell)));
    }
    expect(expected.grid).toBe(2);
    expect(expected.size).toBe(4);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^2 \/ 5$/);
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('lights-last')).toHaveTextContent(new RegExp(`^\\+${expected.score}$`));
    expect(litOnScreen()).toEqual(expected.lit);
  });

  it('AC-69: the hint button highlights a solution cell and counts down', async () => {
    await start(2);
    const button = screen.getByTestId('lights-btn-hint');
    expect(button).toHaveTextContent(/Indice \(2\)/);
    expect(button).toBeEnabled();
    await fireEvent.press(button);
    const expected = reduceLights(createLights(SEED, { hint: 2 }), { type: 'hint' });
    expect(screen.getByTestId('lights-btn-hint')).toHaveTextContent(/Indice \(1\)/);
    expect(screen.getByTestId(cellId(expected.hint as number))).toHaveStyle({ borderWidth: 4 });
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^0$/); // a hint is not a tap
  });

  it('AC-69: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'lights', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
