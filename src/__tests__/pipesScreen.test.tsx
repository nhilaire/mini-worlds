import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { createPipes, PIPES_SIZE, PipesState, reducePipes, turnsToFit, wateredCells } from '../game/pipes/engine';
import type { OnFinish } from '../screens/game/GameFrame';
import { PipesGame } from '../screens/game/PipesGame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save from
// AsyncStorage first, as in the app where the game only opens once the store is loaded.
const SEED = 2026;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <PipesGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start(hintLevel = 0) {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'puzzle'];
  if (hintLevel > 0) save.games.pipes.upgrades = { hint: hintLevel };
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('pipes-screen')).toBeTruthy();
  return onFinish;
}

const pos = (cell: number) => `${cell % PIPES_SIZE}-${Math.floor(cell / PIPES_SIZE)}`;
const rotationOf = (cell: number) => {
  const style = [screen.getByTestId(`pipes-piece-${pos(cell)}`).props.style].flat(3);
  return style.find((s) => s && s.transform)?.transform[0].rotate;
};
const waterOnScreen = (state: PipesState) => state.pieces.map((_, i) => screen.getByTestId(`pipes-cell-${pos(i)}`).props.accessibilityValue.text === 'water');

describe('Plombier Express screen (AC-69)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('AC-69: a first round shows the tutorial bubble; a tap turns the piece and updates the HUD and water as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-turn')).toHaveTextContent(/Touche un tuyau pour le tourner/);
    const engine = createPipes(SEED, {});
    expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^1 \/ 5$/);
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('pipes-btn-hint')).toHaveTextContent(/Indice \(0\)/);
    expect(screen.getByTestId('pipes-btn-hint')).toBeDisabled();
    expect(waterOnScreen(engine)).toEqual(wateredCells(engine.pieces, engine.entryRow));

    // Turn the first wrong path cell once.
    const first = engine.path.find((p) => turnsToFit(engine.pieces[p.cell], p.need) !== 0)!.cell;
    const afterTap = reducePipes(engine, { type: 'tap', cell: first });
    expect(rotationOf(first)).toBe(`${engine.pieces[first].rot * 90}deg`);
    await fireEvent.press(screen.getByTestId(`pipes-cell-${pos(first)}`));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^1$/);
    expect(rotationOf(first)).toBe(`${afterTap.pieces[first].rot * 90}deg`);
    expect(waterOnScreen(afterTap)).toEqual(wateredCells(afterTap.pieces, afterTap.entryRow));

    // Turning the rest of the path right solves grid 1 as the engine predicts.
    let expected = afterTap;
    for (const p of afterTap.path) {
      const n = turnsToFit(expected.pieces[p.cell], p.need) as number;
      for (let i = 0; i < n && expected.grid === 1; i++) {
        expected = reducePipes(expected, { type: 'tap', cell: p.cell });
        await fireEvent.press(screen.getByTestId(`pipes-cell-${pos(p.cell)}`));
      }
    }
    expect(expected.grid).toBe(2);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-grid')).toHaveTextContent(/^2 \/ 5$/);
    expect(screen.getByTestId('pipes-last')).toHaveTextContent(new RegExp(`^\\+${expected.score}$`));
  });

  it('AC-69: the hint button highlights a path cell not yet turned right and counts down', async () => {
    await start(1);
    expect(screen.getByTestId('pipes-btn-hint')).toHaveTextContent(/Indice \(1\)/);
    await fireEvent.press(screen.getByTestId('pipes-btn-hint'));
    const expected = reducePipes(createPipes(SEED, { hint: 1 }), { type: 'hint' });
    expect(screen.getByTestId('pipes-btn-hint')).toHaveTextContent(/Indice \(0\)/);
    expect(screen.getByTestId('pipes-btn-hint')).toBeDisabled();
    expect(screen.getByTestId(`pipes-cell-${pos(expected.hint as number)}`)).toHaveStyle({ borderWidth: 3 });
    expect(screen.getByTestId('hud-taps')).toHaveTextContent(/^0$/);
  });

  it('AC-69: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'pipes', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
