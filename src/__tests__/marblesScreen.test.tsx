import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import App from '../App';
import { setClock } from '../game/clock';
import { createMarbles, MarblesState, reduceMarbles, secondsLeft, solve, Tubes } from '../game/marbles/engine';
import { deviceLanguageTags } from '../i18n/deviceLocale';

// Session seed of the deep link; the first round of the session uses seed + 1. `/unlocked` opens every game.
const SESSION_SEED = 777;
const ROUND_SEED = SESSION_SEED + 1;
const STEP_MS = 50;

let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

/** Moves the injectable clock by `ms` in 50 ms frames and lets the frame loop (requestAnimationFrame) run each time. */
async function advance(ms: number) {
  for (let done = 0; done < ms; done += STEP_MS) {
    nowMs += STEP_MS;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

async function openMarbles() {
  await AsyncStorage.setItem('telemetry.consent.v1', 'denied');
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab-games'));
  await fireEvent.press(await screen.findByTestId('world-bubbles'));
  await fireEvent.press(await screen.findByTestId('game-marbles'));
  await fireEvent.press(await screen.findByTestId('sheet-play'));
  expect(await screen.findByTestId('marbles-screen')).toBeTruthy();
}

/** The tubes as drawn: testIDs `marbles-ball-<tube>-<slot>-c<colour>`. */
function drawnTubes(count: number): number[][] {
  const tubes: number[][] = Array.from({ length: count }, () => []);
  for (const node of screen.queryAllByTestId(/^marbles-ball-/)) {
    const [, tube, slot, colour] = /^marbles-ball-(\d+)-(\d+)-c(\d+)$/.exec(String(node.props.testID))!;
    tubes[Number(tube)][Number(slot)] = Number(colour);
  }
  return tubes;
}

async function tapTube(i: number) {
  await fireEvent.press(screen.getByTestId(`marbles-tube-${i}`));
}

const engineMove = (s: MarblesState, from: number, to: number) => reduceMarbles(reduceMarbles(s, { type: 'tap', tube: from }), { type: 'tap', tube: to });
const asArrays = (tubes: Tubes) => tubes.map((t) => [...t]);

describe('Tri de Billes screen (AC-86)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(deviceLanguageTags).mockReturnValue(['fr-FR']);
    jest.mocked(Linking.getInitialURL).mockResolvedValue(`miniworlds://seed/${SESSION_SEED}/unlocked`);
    nowMs = new Date(2026, 10, 13, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => {
    restore();
    jest.mocked(Linking.getInitialURL).mockResolvedValue(null);
  });

  it('AC-86: the first round shows the bubble with the timer stopped, then solving the puzzle scores as the engine predicts', async () => {
    const engine = createMarbles(ROUND_SEED, { extra_time: 0 });
    const path = solve(engine.tubes)!;
    let expected = engine;
    for (const m of path) expected = engineMove({ ...expected, guardMs: 0 }, m.from, m.to);
    expect(expected.score).toBe(160);

    await openMarbles();
    expect(screen.getByTestId('tutorial-move')).toHaveTextContent(/Touche un tube puis un autre/);
    expect(drawnTubes(5)).toEqual(asArrays(engine.tubes));
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^90$/);
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^1$/);

    // The timer does not run while the bubble is shown.
    await advance(1000);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^90$/);

    // First move: the bubble goes, the tubes match the engine.
    await tapTube(path[0].from);
    expect(screen.getByTestId(`marbles-tube-${path[0].from}`).props.accessibilityState?.selected).toBe(true);
    await tapTube(path[0].to);
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    const afterFirst = engineMove(engine, path[0].from, path[0].to);
    expect(drawnTubes(5)).toEqual(asArrays(afterFirst.tubes));

    // A double tap inside the 200 ms move guard changes nothing.
    if (path.length > 1) {
      await tapTube(path[1].from);
      await tapTube(path[1].to);
      expect(drawnTubes(5)).toEqual(asArrays(afterFirst.tubes));
    }

    for (const m of path.slice(1)) {
      await advance(250);
      await tapTube(m.from);
      await tapTube(m.to);
    }
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-puzzle')).toHaveTextContent(/^2$/);
    expect(drawnTubes(6)).toEqual(asArrays(expected.tubes));
  }, 60_000);

  it('AC-86: the round timer follows the injectable clock frame by frame; « Recommencer » restores the puzzle and the timer keeps running', async () => {
    let engine = createMarbles(ROUND_SEED, { extra_time: 0 });
    const start = engine.tubes;
    const first = solve(engine.tubes)![0];
    await openMarbles();
    await tapTube(first.from);
    await tapTube(first.to);
    engine = engineMove(engine, first.from, first.to);

    for (let i = 0; i < 1500 / STEP_MS; i++) engine = reduceMarbles(engine, { type: 'tick', dt: STEP_MS });
    await advance(1500);
    expect(secondsLeft(engine)).toBe(89);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(new RegExp(`^${secondsLeft(engine)}$`));
    expect(drawnTubes(5)).not.toEqual(asArrays(start));

    await fireEvent.press(screen.getByTestId('marbles-btn-restart'));
    expect(screen.getByTestId('marbles-btn-restart')).toHaveTextContent(/Recommencer/);
    expect(drawnTubes(5)).toEqual(asArrays(start));
    await advance(1000);
    expect(screen.getByTestId('hud-time')).toHaveTextContent(/^88$/);
  }, 60_000);

  it('AC-86: Pause → Quitter ends the round and shows the Result', async () => {
    await openMarbles();
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(await screen.findByTestId('result-screen')).toBeTruthy();
  });
});
