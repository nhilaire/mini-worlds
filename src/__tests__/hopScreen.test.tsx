import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { Profiler } from 'react';
import { Animated } from 'react-native';

import App from '../App';
import { setClock } from '../game/clock';
import { BUNNY_X, createHop, HopState, onGround, reduceHop } from '../game/hop/engine';
import { deviceLanguageTags } from '../i18n/deviceLocale';
import * as ThemeProvider from '../ui/ThemeProvider';

// Session seed of the deep link; the first round of the session uses seed + 1. `/unlocked` opens every game.
const SESSION_SEED = 4242;
const ROUND_SEED = SESSION_SEED + 1;
const STEP_MS = 50;

let nowMs = new Date(2026, 10, 13, 10, 0).getTime();

/** Moves the injectable clock by one frame step and lets the frame loop (requestAnimationFrame) consume it. */
async function step() {
  nowMs += STEP_MS;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

async function openHop() {
  await AsyncStorage.setItem('telemetry.consent.v1', 'denied');
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab-games'));
  await fireEvent.press(await screen.findByTestId('world-arcade'));
  await fireEvent.press(await screen.findByTestId('game-hop'));
  await fireEvent.press(await screen.findByTestId('sheet-play'));
  expect(await screen.findByTestId('hop-screen')).toBeTruthy();
}

/** Plays 50 ms frames from `s` until the first fence is passed or the round ends; returns the frames and the state. */
function runUntilPassed(s: HopState): { frames: number; state: HopState } {
  let frames = 0;
  while (s.passed === 0 && s.status === 'playing' && frames < 200) {
    s = reduceHop(s, { type: 'tick', dt: STEP_MS });
    frames += 1;
  }
  return { frames, state: s };
}

/**
 * The scripted run, played on the engine: a first jump (it dismisses the bubble; the bunny lands long before the
 * fence), then 50 ms frames until the first frame from which a second jump clears the first fence.
 */
function scriptedRun(): { framesBeforeSecondJump: number; framesAfter: number; expected: HopState } {
  let s = reduceHop(createHop(ROUND_SEED, { shield: 0 }), { type: 'jump' });
  for (let framesBeforeSecondJump = 0; framesBeforeSecondJump < 100; framesBeforeSecondJump++) {
    if (onGround(s) && s.obstacles[0].x > BUNNY_X) {
      const after = runUntilPassed(reduceHop(s, { type: 'jump' }));
      if (after.state.passed === 1 && after.state.status === 'playing') return { framesBeforeSecondJump, framesAfter: after.frames, expected: after.state };
    }
    s = reduceHop(s, { type: 'tick', dt: STEP_MS });
  }
  throw new Error('no frame lets the second jump clear the first fence');
}

describe('Saute-Lapin screen (AC-69)', () => {
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

  it('AC-69: the first round shows the tutorial bubble, frozen until the first jump', async () => {
    await openHop();
    expect(screen.getByTestId('tutorial-jump')).toHaveTextContent(/Touche pour sauter/);
    expect(screen.getByTestId('hud-shields')).toHaveTextContent(/^0$/);
    const fence = screen.getByTestId('hop-fence-0');
    const left = fence.props.style;
    // Time passes but the round does not advance while the bubble is shown.
    for (let i = 0; i < 5; i++) await step();
    expect(screen.getByTestId('hop-fence-0').props.style).toEqual(left);
    await fireEvent(screen.getByTestId('hop-btn-jump'), 'pressIn');
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
  });

  it('AC-69: a scripted run of two jumps passes the first fence and scores as the engine predicts', async () => {
    const { framesBeforeSecondJump, framesAfter, expected } = scriptedRun();
    expect(expected.score).toBe(10);
    await openHop();
    await fireEvent(screen.getByTestId('hop-btn-jump'), 'pressIn');
    for (let i = 0; i < framesBeforeSecondJump; i++) await step();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    await fireEvent(screen.getByTestId('hop-btn-jump'), 'pressIn');
    for (let i = 0; i < framesAfter; i++) await step();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-shields')).toHaveTextContent(new RegExp(`^${expected.shields}$`));
    expect(screen.queryByTestId('hop-fence-0')).toBeNull();
  });

  it('AC-73: plain frames move the bunny through Animated values without rendering the game again', async () => {
    let commits = 0;
    await AsyncStorage.setItem('telemetry.consent.v1', 'denied');
    await render(
      <Profiler id="app" onRender={() => (commits += 1)}>
        <App />
      </Profiler>,
    );
    await fireEvent.press(await screen.findByTestId('tab-games'));
    await fireEvent.press(await screen.findByTestId('world-arcade'));
    await fireEvent.press(await screen.findByTestId('game-hop'));
    await fireEvent.press(await screen.findByTestId('sheet-play'));
    expect(await screen.findByTestId('hop-screen')).toBeTruthy();
    await fireEvent(screen.getByTestId('hop-btn-jump'), 'pressIn');
    await step();
    const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    // Every themed component (HopGame, its HUD, GameFrame) reads the theme when React renders it.
    const themeReads = jest.spyOn(ThemeProvider, 'useTheme');
    const lift = () => -screen.getByTestId('hop-bunny').props.style.transform[0].translateY;
    try {
      const before = commits;
      const heights: number[] = [];
      const frames = 4;
      for (let i = 0; i < frames; i++) {
        await step();
        heights.push(lift());
      }
      // The bunny is in the air and moves from frame to frame (bunny height + fence slots pushed every frame)...
      expect(heights.every((h) => h > 0)).toBe(true);
      expect(new Set(heights).size).toBe(frames);
      expect(setValue.mock.calls.length).toBeGreaterThanOrEqual(frames * 2);
      // ...and no game component rendered again during these plain frames (no spawn, event or end in the first
      // jump). Under Jest the host view has no setNativeProps, so Animated itself commits its own props once per
      // frame; on a phone it writes them natively.
      expect(themeReads).not.toHaveBeenCalled();
      expect(commits - before).toBeLessThanOrEqual(frames);
    } finally {
      setValue.mockRestore();
      themeReads.mockRestore();
    }
  });

  it('AC-69: Pause → Quitter ends the round and shows the Result', async () => {
    await openHop();
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(await screen.findByTestId('result-screen')).toBeTruthy();
  });
});
