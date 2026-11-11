import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import App from '../App';
import { setClock } from '../game/clock';
import { defaultSave, serializeSave } from '../game/core/save';
import { deviceLanguageTags } from '../i18n/deviceLocale';

// The round clock and the daily logic read the injectable clock; the frame loop uses requestAnimationFrame.
let nowMs = new Date(2026, 10, 11, 10, 0).getTime();

async function startBlocks(tutorialDone = true) {
  const save = defaultSave();
  save.games.blocks.tutorialDone = tutorialDone;
  await AsyncStorage.multiSet([
    ['telemetry.consent.v1', 'denied'],
    ['save', serializeSave(save)],
  ]);
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('home-play'));
  expect(await screen.findByTestId('blocks-screen')).toBeTruthy();
}

describe('Pluie de Blocs screen (AC-21, AC-39)', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(deviceLanguageTags).mockReturnValue(['fr-FR']);
    nowMs = new Date(2026, 10, 11, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => restore());

  it('starts from Home with the HUD at zero and the board on screen', async () => {
    await startBlocks();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('hud-lines')).toHaveTextContent(/^0/);
    expect(screen.getByTestId('blocks-board')).toBeTruthy();
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByText(/Étoile à 500/)).toBeTruthy();
  });

  it('quitting from Pause after 20 s settles the round and shows the Result screen', async () => {
    await startBlocks();
    await fireEvent.press(screen.getByTestId('game-pause'));
    expect(await screen.findByTestId('pause-overlay')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pause-resume'));
    nowMs += 25_000; // 25 s of active play
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(await screen.findByTestId('result-screen')).toBeTruthy();
    expect(screen.queryByTestId('result-short')).toBeNull();
    expect(screen.getByTestId('result-coins')).toHaveTextContent(/\+10 pièces/);
    expect(screen.getByTestId('result-xp')).toHaveTextContent(/\+10 XP/);
    await fireEvent.press(screen.getByTestId('result-back'));
    expect(await screen.findByTestId('home-screen')).toBeTruthy();
    expect(screen.getByTestId('home-coins')).toHaveTextContent(/35/); // 10 + « Première partie » 25
    expect(screen.getByTestId('challenge-rounds3-progress')).toHaveTextContent(/1 \/ 3/);
  });

  it('a round quit before 20 s grants nothing (short round)', async () => {
    await startBlocks();
    nowMs += 5_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(await screen.findByTestId('result-short')).toBeTruthy();
    expect(screen.queryByTestId('result-coins')).toBeNull();
  });

  it('shows the three tutorial bubbles in order and dismisses each by its action (AC-21)', async () => {
    await startBlocks(false);
    expect(screen.getByTestId('tutorial-move')).toHaveTextContent(/Glisse pour déplacer/);
    const pan = getByGestureTestId('blocks-pan');
    await act(async () => {
      fireGestureHandler(pan, [{ translationX: 0, translationY: 0 }, { translationX: 200, translationY: 0 }, { translationX: 200, translationY: 0 }]);
    });
    expect(await screen.findByTestId('tutorial-rotate')).toBeTruthy();
    await act(async () => {
      fireGestureHandler(getByGestureTestId('blocks-tap'), []);
    });
    expect(await screen.findByTestId('tutorial-drop')).toBeTruthy();
    await act(async () => {
      fireGestureHandler(pan, [{ translationX: 0, translationY: 0 }, { translationX: 0, translationY: 80 }, { translationX: 0, translationY: 80 }]);
    });
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-score')).not.toHaveTextContent(/^0$/); // hard drop scored
    await new Promise((r) => setTimeout(r, 400));
    const stored = JSON.parse((await AsyncStorage.getItem('save')) ?? '{}');
    expect(stored.games.blocks.tutorialDone).toBe(true);
  });

  it('pauses when the app goes to background and shows the pause overlay on return (AC-39)', async () => {
    await startBlocks(false);
    // Dismiss the first bubble with a drag so that the round has a visible state (one move made).
    await act(async () => {
      fireGestureHandler(getByGestureTestId('blocks-pan'), [{ translationX: 0, translationY: 0 }, { translationX: 200, translationY: 0 }, { translationX: 200, translationY: 0 }]);
    });
    const before = { score: screen.getByTestId('hud-score').props.children, lines: screen.getByTestId('hud-lines').props.children, bubble: screen.getByTestId('tutorial-rotate') };
    const listeners = (AppState.addEventListener as jest.Mock).mock.calls.map((c) => c[1]);
    await act(async () => {
      for (const listener of listeners) listener('background');
    });
    expect(await screen.findByTestId('pause-overlay')).toBeTruthy();
    await act(async () => {
      for (const listener of listeners) listener('active');
    });
    expect(screen.getByTestId('pause-overlay')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pause-resume'));
    expect(screen.queryByTestId('pause-overlay')).toBeNull();
    // The same state is shown: score, lines and the current tutorial step are unchanged.
    expect(screen.getByTestId('hud-score').props.children).toEqual(before.score);
    expect(screen.getByTestId('hud-lines').props.children).toEqual(before.lines);
    expect(screen.getByTestId('tutorial-rotate')).toBeTruthy();
    expect(before.bubble).toBeTruthy();
  });

  it('restarting from Pause starts a new round in place', async () => {
    await startBlocks();
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-restart'));
    expect(await screen.findByTestId('blocks-screen')).toBeTruthy();
    expect(screen.queryByTestId('pause-overlay')).toBeNull();
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
  });
});
