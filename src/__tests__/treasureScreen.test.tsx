import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { createTreasure, DIG_MS, distance, MAP_SHOW_MS, reduceTreasure, TREASURE_CELLS, TREASURE_SIZE, TreasureState } from '../game/treasure/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { TreasureGame } from '../screens/game/TreasureGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save first.
const SEED = 2026;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <TreasureGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(detector = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'exploration'];
  if (detector > 0) save.games.treasure.upgrades = { detector };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('treasure-screen')).toBeTruthy();
  return onFinish;
}

/** Moves the injectable clock and lets the frame loop (requestAnimationFrame) run. */
async function advance(ms: number) {
  nowMs += ms;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

const id = (cell: number) => `treasure-cell-${cell % TREASURE_SIZE}-${Math.floor(cell / TREASURE_SIZE)}`;
const shownBand = (cell: number) => screen.getByTestId(id(cell)).props.accessibilityValue.text;
const digCell = (cell: number) => fireEvent.press(screen.getByTestId(id(cell)));
const far = (state: TreasureState) =>
  Array.from({ length: TREASURE_CELLS }, (_, c) => c)
    .filter((c) => c !== state.chest)
    .sort((a, b) => distance(b, state.chest) - distance(a, state.chest));

describe('Chasse au Trésor screen (AC-86)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-86: the first round shows the bubble; a dig shows its band and spends a dig as the engine predicts; taps during the 200 ms dig are ignored (frames of 50 ms)', async () => {
    await start();
    expect(screen.getByTestId('tutorial-dig')).toHaveTextContent(/Touche le sable pour creuser/);
    let engine = createTreasure(SEED, {});
    expect(screen.getByTestId('hud-map')).toHaveTextContent(/^1 \/ 5$/);
    expect(screen.getByTestId('hud-digs')).toHaveTextContent(/^8$/);
    expect(screen.getByTestId('treasure-legend')).toHaveTextContent(/Brûlant/);

    const [first, second] = far(engine);
    engine = reduceTreasure(engine, { type: 'dig', cell: first });
    await digCell(first);
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(shownBand(first)).toBe(engine.dug[first]);
    expect(screen.getByTestId('treasure-band')).toHaveTextContent(/^Froid$/);
    expect(screen.getByTestId('hud-digs')).toHaveTextContent(/^7$/);

    // A double tap inside the guard digs nothing.
    await digCell(second);
    await digCell(second);
    expect(shownBand(second)).toBe('sand');
    expect(screen.getByTestId('hud-digs')).toHaveTextContent(/^7$/);
    for (let t = 0; t < DIG_MS + 100; t += 50) {
      await advance(50);
      engine = reduceTreasure(engine, { type: 'tick', dt: 50 });
    }
    // A tap on a dug cell spends nothing; a new cell is dug.
    await digCell(first);
    expect(screen.getByTestId('hud-digs')).toHaveTextContent(/^7$/);
    await digCell(second);
    engine = reduceTreasure(engine, { type: 'dig', cell: second });
    expect(shownBand(second)).toBe(engine.dug[second]);
    expect(screen.getByTestId('hud-digs')).toHaveTextContent(/^6$/);
    for (let t = 0; t < DIG_MS + 100; t += 50) {
      await advance(50);
      engine = reduceTreasure(engine, { type: 'tick', dt: 50 });
    }

    // Digging the chest scores 100 + 20 × 5 = 200; the map stays shown 800 ms, then map 2.
    engine = reduceTreasure(engine, { type: 'dig', cell: engine.chest });
    await digCell(engine.chest);
    expect(engine.score).toBe(200);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^200$/);
    expect(screen.getByTestId('treasure-last')).toHaveTextContent(/^\+200$/);
    expect(screen.getByTestId('treasure-band')).toHaveTextContent(/Trésor/);
    for (let t = 50; t < MAP_SHOW_MS; t += 50) await advance(50);
    expect(screen.getByTestId('hud-map')).toHaveTextContent(/^1 \/ 5$/);
    for (let t = 0; t < 200; t += 50) await advance(50);
    expect(screen.getByTestId('hud-map')).toHaveTextContent(/^2 \/ 5$/);
    expect(screen.getByTestId('hud-digs')).toHaveTextContent(/^8$/);
    expect(shownBand(first)).toBe('sand');
  }, 60_000);

  it('AC-86: « Détecteur » gives one more dig per level', async () => {
    await start(2);
    expect(screen.getByTestId('hud-digs')).toHaveTextContent(/^10$/);
  });

  it('AC-86: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'treasure', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
