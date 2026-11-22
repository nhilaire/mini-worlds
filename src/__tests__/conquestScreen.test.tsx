import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { casualConquestMove } from '../game/conquest/bot';
import { acceptsInput, CONQUEST_MAPS, ConquestState, createConquest, MOVE_GUARD_MS, neighboursOf, reduceConquest, TURNS } from '../game/conquest/engine';
import { defaultSave, serializeSave } from '../game/core/save';
import { ConquestGame } from '../screens/game/ConquestGame';
import type { OnFinish } from '../screens/game/GameFrame';
import { GameStoreProvider, useGameStore } from '../state/GameStore';

// The game screen is rendered alone with the providers it reads (store, safe area); the store loads the save from
// AsyncStorage first, as in the app where the game only opens once the store is loaded.
const SEED = 2026;
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

// The frame loop is driven by hand: each frame advances the injectable clock by `ms` and runs the queued callbacks.
let frames: FrameRequestCallback[] = [];
async function runFrames(count: number, ms = 50) {
  for (let i = 0; i < count; i++) {
    nowMs += ms;
    const queued = frames;
    frames = [];
    await act(async () => {
      for (const cb of queued) cb(nowMs);
    });
  }
}

function Loaded({ onFinish }: { onFinish: OnFinish }) {
  const { loaded } = useGameStore();
  return loaded ? <ConquestGame seed={SEED} onFinish={onFinish} /> : null;
}

async function start() {
  await AsyncStorage.setItem('save', serializeSave(defaultSave()));
  const onFinish = jest.fn<ReturnType<OnFinish>, Parameters<OnFinish>>();
  await render(
    <SafeAreaProvider>
      <GameStoreProvider sessionSeed={null}>
        <Loaded onFinish={onFinish} />
      </GameStoreProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByTestId('conquest-screen')).toBeTruthy();
  return onFinish;
}

const territoryId = (i: number) => `conquest-territory-${i}`;
function expectBoard(state: ConquestState) {
  state.territories.forEach((t, i) => {
    expect([i, screen.getByTestId(territoryId(i)).props.accessibilityValue]).toEqual([i, { text: `${t.owner} ${t.units}` }]);
    expect(screen.getByTestId(`conquest-units-${i}`)).toHaveTextContent(new RegExp(`^${t.units}$`));
  });
  expect(screen.queryByTestId(territoryId(state.territories.length))).toBeNull();
  expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${state.score}$`));
  expect(screen.getByTestId('hud-battle')).toHaveTextContent(new RegExp(`^${state.battle} / 3$`));
  expect(screen.getByTestId('hud-turns')).toHaveTextContent(new RegExp(`^${TURNS - state.turn}$`));
}
const isSelected = (i: number) => screen.getByTestId(territoryId(i)).props.accessibilityState?.selected === true;
/** One frame of the engine as the screen's loop plays it: a 50 ms tick only while a guard or a finished battle runs. */
const frameOf = (state: ConquestState) => (state.status === 'playing' && !acceptsInput(state) ? reduceConquest(state, { type: 'tick', dt: 50 }) : state);

describe('Bataille de Nombres screen (AC-108)', () => {
  let restore = () => {};
  const raf = globalThis.requestAnimationFrame;
  const caf = globalThis.cancelAnimationFrame;
  beforeEach(async () => {
    await AsyncStorage.clear();
    nowMs = new Date(2026, 10, 22, 10, 0).getTime();
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

  it('AC-108: a first round shows the tutorial bubble; select then march updates the map, then the enemy answers and the turns go down as the engine predicts', async () => {
    await start();
    expect(screen.getByTestId('tutorial-attack')).toHaveTextContent(/Touche ton territoire puis un voisin/);
    let engine = createConquest(SEED, { reinforce: 0 });
    expectBoard(engine);
    const map = CONQUEST_MAPS[0];
    const from = map.player;
    const to = neighboursOf(map, from)[0];
    expect(screen.getAllByTestId(/^conquest-road-/)).toHaveLength(map.roads.length);

    await fireEvent.press(screen.getByTestId(territoryId(from)));
    expect(isSelected(from)).toBe(true);
    expect(screen.getByTestId(territoryId(from))).toHaveStyle({ borderWidth: 4, borderStyle: 'solid' });
    // Its legal targets are highlighted, the others are not.
    for (let i = 0; i < map.spots.length; i++) {
      if (i !== from) expect(screen.getByTestId(territoryId(i))).toHaveStyle(neighboursOf(map, from).includes(i) ? { borderWidth: 4, borderStyle: 'dashed' } : { borderWidth: 2 });
    }
    expect(screen.getByTestId('tutorial-attack')).toBeTruthy(); // a selection is not yet a move

    await fireEvent.press(screen.getByTestId(territoryId(to)));
    engine = reduceConquest(reduceConquest(engine, { type: 'tap', territory: from }), { type: 'tap', territory: to });
    expect(engine.territories[from].units).toBe(1);
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(isSelected(from)).toBe(false);
    expectBoard(engine);

    // The enemy's answer and the growth come with the clock (600 ms guard).
    for (let i = 0; i < MOVE_GUARD_MS / 50; i++) engine = frameOf(engine);
    await runFrames(MOVE_GUARD_MS / 50);
    expect(engine.turn).toBe(1);
    expect(engine.answer).not.toBeNull();
    expectBoard(engine);
    expect(screen.getByTestId('hud-turns')).toHaveTextContent(/^14$/);
  });

  it('AC-108: a whole battle played with the clock scores as the engine predicts, then the next map comes', async () => {
    await start();
    let engine = createConquest(SEED, { reinforce: 0 });
    let result: { won: boolean; lost: boolean; points: number } | null = null;
    for (let step = 0; step < 1000 && engine.battle === 1 && engine.status === 'playing'; step++) {
      if (!acceptsInput(engine)) {
        engine = frameOf(engine);
        await runFrames(1);
      } else {
        const move = casualConquestMove(engine);
        if (move === null) {
          await fireEvent.press(screen.getByTestId('conquest-pass'));
          engine = reduceConquest(engine, { type: 'pass' });
        } else {
          await fireEvent.press(screen.getByTestId(territoryId(move.from)));
          await fireEvent.press(screen.getByTestId(territoryId(move.to)));
          engine = reduceConquest(reduceConquest(engine, { type: 'tap', territory: move.from }), { type: 'tap', territory: move.to });
        }
      }
      for (const e of engine.events) if (e.kind === 'battle') result = e;
      if (engine.battle === 1 && engine.doneMs > 0 && result) {
        // The finished battle is on show with its points.
        expect(screen.getByTestId('conquest-last')).toHaveTextContent(result.points > 0 ? `+${result.points}` : '0');
        expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${result.points}$`));
      }
    }
    expect(result).not.toBeNull();
    expect(engine.battle).toBe(2);
    expect(engine.score).toBe(result?.points);
    expect(engine.territories).toHaveLength(6);
    expectBoard(engine);
    expect(screen.queryByTestId('conquest-last')).toBeNull();
  });

  it('AC-108: inputs during the 600 ms guard are ignored on screen, then accepted', async () => {
    await start();
    const from = CONQUEST_MAPS[0].player;
    let engine = reduceConquest(createConquest(SEED, { reinforce: 0 }), { type: 'pass' });
    await fireEvent.press(screen.getByTestId('conquest-pass'));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    // 50 ms later (double tap): nothing is selected, « Passer » is disabled.
    await runFrames(1);
    engine = frameOf(engine);
    await fireEvent.press(screen.getByTestId(territoryId(from)));
    expect(isSelected(from)).toBe(false);
    expect(screen.getByTestId('conquest-pass')).toBeDisabled();
    expectBoard(engine);
    // After the guard the same tap selects.
    await runFrames(MOVE_GUARD_MS / 50);
    for (let i = 0; i < MOVE_GUARD_MS / 50; i++) engine = frameOf(engine);
    expect(acceptsInput(engine)).toBe(true);
    expectBoard(engine);
    expect(screen.getByTestId('conquest-pass')).not.toBeDisabled();
    await fireEvent.press(screen.getByTestId(territoryId(from)));
    expect(isSelected(from)).toBe(true);
  });

  it('AC-108: Pause → Quitter ends the round with the current score', async () => {
    const onFinish = await start();
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ game: 'conquest', score: 0, outcome: 'quit' });
    expect(onFinish.mock.calls[0][1]).toBe('result');
  });
});
