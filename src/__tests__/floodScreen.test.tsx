import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { createFlood, FLOOD_COLOURS, reduceFlood, tideCells, tideColour, type FloodColour, type FloodState } from '../game/flood/engine';
import { END_MS, FloodGame, WIN_MS } from '../screens/game/FloodGame';
import type { OnFinish } from '../screens/game/GameFrame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save from
// AsyncStorage first, as in the app where the game only opens once the store is loaded.
const SEED = 2026;
let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <FloodGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start() {
  const save = defaultSave();
  save.unlockedWorlds = [...save.unlockedWorlds, 'bubbles'];
  await AsyncStorage.setItem('save', serializeSave(save));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('flood-screen')).toBeTruthy();
  return onFinish;
}

/** The colour that grows the tide the most (the scripted player). */
function greedy(s: FloodState) {
  return FLOOD_COLOURS.filter((c) => c !== tideColour(s.board))
    .map((c) => ({ c, n: tideCells(reduceFlood(s, { type: 'colour', colour: c }).board).length }))
    .sort((a, b) => b.n - a.n)[0].c;
}

/** Look-ahead player (4 taps deep): wins the first board of SEED, unlike the greedy one. */
function lookAhead(s: FloodState): FloodColour {
  const value = (state: FloodState, depth: number): number => {
    if (state.events.some((e) => e.kind === 'board_won')) return 1000 + depth;
    if (depth === 0 || state.status !== 'playing') return tideCells(state.board).length;
    return Math.max(...FLOOD_COLOURS.filter((c) => c !== tideColour(state.board)).map((c) => value(reduceFlood(state, { type: 'colour', colour: c }), depth - 1)));
  };
  const options = FLOOD_COLOURS.filter((c) => c !== tideColour(s.board)).map((c) => ({ c, v: value(reduceFlood(s, { type: 'colour', colour: c }), 3) }));
  return options.sort((a, b) => b.v - a.v)[0].c;
}

describe('Raz-de-Couleurs screen (AC-69)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('a first round shows the tutorial bubble; a colour tap updates the HUD as the engine predicts and dismisses it', async () => {
    await start();
    expect(screen.getByTestId('tutorial-colour')).toHaveTextContent(/ta vague grandit depuis le coin/);
    expect(screen.getByTestId('hud-board')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^20$/);
    const engine = createFlood(SEED, {});
    // The tide's own colour is refused: nothing changes and the bubble stays.
    await fireEvent.press(screen.getByTestId(`flood-colour-${tideColour(engine.board)}`));
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^20$/);
    expect(screen.getByTestId('tutorial-colour')).toBeTruthy();

    const colour = greedy(engine);
    const expected = reduceFlood(engine, { type: 'colour', colour });
    await fireEvent.press(screen.getByTestId(`flood-colour-${colour}`));
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(new RegExp(`^${expected.movesLeft}$`));
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
  });

  it('a scripted round wins board 1 (points shown, board 2 dealt), then ends with the engine score after END_MS', async () => {
    const onFinish = await start();
    let engine = createFlood(SEED, {});
    let wins = 0;
    for (let i = 0; i < 300 && engine.status === 'playing'; i++) {
      const colour = engine.boardNumber === 1 ? lookAhead(engine) : greedy(engine);
      engine = reduceFlood(engine, { type: 'colour', colour });
      await fireEvent.press(screen.getByTestId(`flood-colour-${colour}`));
      if (engine.events.some((e) => e.kind === 'board_won')) {
        wins += 1;
        const won = engine.events.find((e) => e.kind === 'board_won');
        expect(screen.getByTestId('flood-points-pop')).toHaveTextContent(`+${won?.kind === 'board_won' ? won.points : -1}`);
        await act(async () => {
          nowMs += WIN_MS + 50;
        });
        await waitFor(() => expect(screen.queryByTestId('flood-points-pop')).toBeNull());
      }
      expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${engine.score}$`));
      expect(screen.getByTestId('hud-board')).toHaveTextContent(new RegExp(`^${engine.boardNumber}$`));
    }
    expect(engine.status).toBe('over');
    expect(wins).toBeGreaterThanOrEqual(1);
    expect(engine.score).toBeGreaterThan(500);
    expect(onFinish).not.toHaveBeenCalled();
    await act(async () => {
      nowMs += END_MS + 50;
    });
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'flood', score: engine.score, combos: engine.combos, outcome: 'ended' });
  }, 60_000);

  it('Pause → Quitter ends the round', async () => {
    const onFinish = await start();
    await fireEvent.press(screen.getByTestId('game-pause'));
    expect(await screen.findByTestId('pause-overlay')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]).toEqual([expect.objectContaining({ game: 'flood', score: 0, outcome: 'quit' }), 'result']);
  });
});
