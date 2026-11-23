import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setClock } from '../game/clock';
import { casualConquestMove } from '../game/conquest/bot';
import { acceptsInput, CONQUEST_MAPS, ConquestState, createConquest, MOVE_GUARD_MS, neighboursOf, previewsOf, reduceConquest, TURNS } from '../game/conquest/engine';
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

async function start(tutorialDone = false) {
  const save = defaultSave();
  save.games.conquest.tutorialDone = tutorialDone;
  await AsyncStorage.setItem('save', serializeSave(save));
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
  expect(screen.getByTestId('hud-battle')).toHaveTextContent(new RegExp(`^${state.battle} / 4$`));
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

  it('AC-113: a first round starts on the training map with three bubbles in order; selecting shows the outcome of each attack; the enemy answers once the bubbles are gone', async () => {
    await start();
    expect(screen.getByTestId('tutorial-attack')).toHaveTextContent(/Touche ton territoire bleu, puis un voisin/);
    let engine = createConquest(SEED, { reinforce: 0 });
    expect(engine.territories).toHaveLength(3);
    expectBoard(engine);
    const map = CONQUEST_MAPS[0];
    expect(screen.getAllByTestId(/^conquest-road-/)).toHaveLength(map.roads.length);
    expect(screen.getByTestId('conquest-pass')).toBeDisabled(); // the first bubble goes with a move
    const from = map.player;
    const to = neighboursOf(map, from)[0];

    await fireEvent.press(screen.getByTestId(territoryId(from)));
    expect(isSelected(from)).toBe(true);
    // Each neighbour that is not the player's shows the outcome the engine predicts.
    const selected = reduceConquest(engine, { type: 'tap', territory: from });
    for (const [i, preview] of previewsOf(selected)) {
      expect(screen.getByTestId(`conquest-preview-${i}`)).toHaveTextContent(preview.taken ? `Pris · ${preview.left}` : `Reste ${preview.left}`);
      expect(screen.getByTestId(territoryId(i))).toHaveStyle({ borderWidth: 4, borderStyle: 'dashed' });
    }
    expect(screen.getByTestId(`conquest-preview-${to}`)).toHaveTextContent('Pris · 6'); // 9 units against 3
    expect(screen.queryByTestId('conquest-preview-2')).toBeNull(); // not joined
    expect(screen.getByTestId('tutorial-attack')).toBeTruthy(); // a selection is not yet a move

    await fireEvent.press(screen.getByTestId(territoryId(to)));
    engine = reduceConquest(selected, { type: 'tap', territory: to });
    expect(screen.queryByTestId(/^conquest-preview-/)).toBeNull();
    expectBoard(engine);
    // Second bubble: the enemy plays after you; the clock waits for the tap.
    expect(screen.getByTestId('tutorial-enemy')).toHaveTextContent(/l'ennemi rouge joue à son tour/);
    await runFrames(MOVE_GUARD_MS / 50);
    expectBoard(engine);
    await fireEvent.press(screen.getByTestId('tutorial-next'));
    expect(screen.getByTestId('tutorial-grow')).toHaveTextContent(/tes territoires gagnent 1 unité/);
    await fireEvent.press(screen.getByTestId('tutorial-next'));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.queryByTestId('tutorial-next')).toBeNull();

    // The passive enemy passes, then every owned territory grows.
    for (let i = 0; i < MOVE_GUARD_MS / 50; i++) engine = frameOf(engine);
    await runFrames(MOVE_GUARD_MS / 50);
    expect(engine.turn).toBe(1);
    expect(engine.answer).toBe('pass');
    expectBoard(engine);
    expect(screen.getByTestId('hud-turns')).toHaveTextContent(/^14$/);
  });

  it('AC-113: tapping another own territory selects it instead of marching onto it', async () => {
    await start(true);
    // The training map, tutorial done: take the neutral first.
    let engine = createConquest(SEED, { reinforce: 0 });
    await fireEvent.press(screen.getByTestId(territoryId(0)));
    await fireEvent.press(screen.getByTestId(territoryId(1)));
    engine = reduceConquest(reduceConquest(engine, { type: 'tap', territory: 0 }), { type: 'tap', territory: 1 });
    for (let i = 0; i < MOVE_GUARD_MS / 50; i++) engine = frameOf(engine);
    await runFrames(MOVE_GUARD_MS / 50);
    expectBoard(engine);
    // Both 0 (1 + 1 units) and 1 (6 + 1) are the player's: a tap on 1 then on 0 never marches onto 0.
    await fireEvent.press(screen.getByTestId(territoryId(1)));
    expect(isSelected(1)).toBe(true);
    expect(screen.queryByTestId('conquest-preview-0')).toBeNull();
    await fireEvent.press(screen.getByTestId(territoryId(0)));
    expect(isSelected(1)).toBe(false);
    expect(isSelected(0)).toBe(true);
    expectBoard(engine);
  });

  it('AC-108: a whole battle played with the clock scores as the engine predicts, then the next map comes', async () => {
    await start(true);
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
    expect(engine.territories).toHaveLength(5);
    expectBoard(engine);
    expect(screen.queryByTestId('conquest-last')).toBeNull();
  });

  it('AC-108: inputs during the 600 ms guard are ignored on screen, then accepted', async () => {
    await start(true);
    const from = CONQUEST_MAPS[0].player;
    let engine = reduceConquest(createConquest(SEED, { reinforce: 0 }), { type: 'pass' });
    await fireEvent.press(screen.getByTestId('conquest-pass'));
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
