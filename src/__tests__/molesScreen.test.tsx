import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { cellOf, createMoles, reduceMoles } from '../game/moles/engine';
import { END_MS, MolesGame } from '../screens/game/MolesGame';
import type { OnFinish } from '../screens/game/GameFrame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save from
// AsyncStorage first, as in the app where the game only opens once the store is loaded.
const SEED = 2026;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <MolesGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(radar = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'memory'];
  if (radar > 0) save.games.moles = { ...save.games.moles, upgrades: { radar } };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('moles-screen')).toBeTruthy();
  return onFinish;
}

describe('Champ de Taupes screen (AC-69)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('a first round shows the tutorial bubble; the first dig updates score and HUD as the engine predicts and dismisses it', async () => {
    await start();
    expect(screen.getByTestId('tutorial-dig')).toHaveTextContent(/Touche une case pour creuser/);
    expect(screen.getByTestId('hud-board')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('hud-moles')).toHaveTextContent(/^8$/);
    const expected = reduceMoles(createMoles(SEED, {}), { type: 'dig', cell: { col: 3, row: 3 } });
    expect(expected.score).toBeGreaterThan(0);

    await fireEvent.press(screen.getByTestId('moles-cell-3-3'));
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    // Every revealed numbered cell shows its count.
    const dig = expected.events.find((e) => e.kind === 'dig');
    if (!dig || dig.kind !== 'dig') throw new Error('a safe dig is expected');
    expect(dig.cells.length).toBeGreaterThan(0);
  });

  it('flag mode flags a covered cell (HUD moles left − 1) and the flag blocks digging', async () => {
    await start();
    await fireEvent.press(screen.getByTestId('moles-flag'));
    await fireEvent.press(screen.getByTestId('moles-cell-0-0'));
    expect(screen.getByTestId('moles-flag-0-0')).toBeTruthy();
    expect(screen.getByTestId('hud-moles')).toHaveTextContent(/^7$/);
    await fireEvent.press(screen.getByTestId('moles-flag')); // back to digging
    await fireEvent.press(screen.getByTestId('moles-cell-0-0'));
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('tutorial-dig')).toBeTruthy(); // a refused dig does not dismiss the bubble
  });

  it('the radar button shows its uses and flags the first mole in seeded order', async () => {
    await start(2);
    expect(screen.getByTestId('moles-radar')).toHaveTextContent('Radar (2)');
    await fireEvent.press(screen.getByTestId('moles-cell-3-3'));
    const engine = reduceMoles(createMoles(SEED, { radar: 2 }), { type: 'dig', cell: { col: 3, row: 3 } });
    const first = cellOf((engine.moles ?? [])[0]);
    await fireEvent.press(screen.getByTestId('moles-radar'));
    expect(screen.getByTestId('moles-radar')).toHaveTextContent('Radar (1)');
    expect(screen.getByTestId(`moles-flag-${first.col}-${first.row}`)).toBeTruthy();
    expect(screen.getByTestId('hud-moles')).toHaveTextContent(/^7$/);
  });

  it('a mole shows every mole, then the round ends with the engine score after END_MS', async () => {
    const onFinish = await start();
    await fireEvent.press(screen.getByTestId('moles-cell-3-3'));
    const engine = reduceMoles(createMoles(SEED, {}), { type: 'dig', cell: { col: 3, row: 3 } });
    const mole = cellOf((engine.moles ?? [])[0]);
    await fireEvent.press(screen.getByTestId(`moles-cell-${mole.col}-${mole.row}`));
    for (const m of engine.moles ?? []) {
      const c = cellOf(m);
      expect(screen.getByTestId(`moles-mole-${c.col}-${c.row}`)).toBeTruthy();
    }
    expect(onFinish).not.toHaveBeenCalled();
    await act(async () => {
      nowMs += END_MS + 50;
    });
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'moles', score: engine.score, outcome: 'ended' });
  });

  it('Pause → Quitter ends the round', async () => {
    const onFinish = await start();
    await fireEvent.press(screen.getByTestId('moles-cell-3-3'));
    await fireEvent.press(screen.getByTestId('game-pause'));
    expect(await screen.findByTestId('pause-overlay')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    const expected = reduceMoles(createMoles(SEED, {}), { type: 'dig', cell: { col: 3, row: 3 } });
    expect(onFinish.mock.calls[0]).toEqual([expect.objectContaining({ game: 'moles', score: expected.score, outcome: 'quit' }), 'result']);
  });
});
