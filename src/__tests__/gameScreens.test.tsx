import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import App from '../App';
import { aimAngle } from '../screens/game/BubblesGame';
import { setClock } from '../game/clock';
import { BUBBLE_COLS, createBubbles, LAUNCHER, reduceBubbles, ROW_HEIGHT } from '../game/bubbles/engine';
import { defaultSave, serializeSave } from '../game/core/save';
import { createGarden, findValidMoves, GARDEN_COLS, reduceGarden } from '../game/garden/engine';
import { deviceLanguageTags } from '../i18n/deviceLocale';

// The session seed comes from the deep link; the first round of the session uses seed + 1.
const SESSION_SEED = 1;
const ROUND_SEED = SESSION_SEED + 1;
// Jest window: 750 × 1334 (react-native's Dimensions mock); same formulas as the screens.
const GARDEN_CELL = Math.floor(Math.min((750 - 32) / GARDEN_COLS, (1334 - 220) / 8));
const FIELD_UNITS = 0.5 + 13 * ROW_HEIGHT + 0.5;
const BUBBLE_UNIT = Math.floor(Math.min((750 - 32) / BUBBLE_COLS, (1334 - 220) / FIELD_UNITS));

let nowMs = new Date(2026, 10, 11, 10, 0).getTime();

async function openGame(game: 'garden' | 'bubbles') {
  const save = defaultSave();
  save.unlockedWorlds = ['arcade', 'puzzle', 'bubbles'];
  save.games[game].tutorialDone = true;
  await AsyncStorage.multiSet([
    ['telemetry.consent.v1', 'denied'],
    ['save', serializeSave(save)],
  ]);
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab-games'));
  await fireEvent.press(await screen.findByTestId(game === 'garden' ? 'world-puzzle' : 'world-bubbles'));
  await fireEvent.press(await screen.findByTestId(`game-${game}`));
  await fireEvent.press(await screen.findByTestId('sheet-play'));
  expect(await screen.findByTestId(`${game}-screen`)).toBeTruthy();
}

describe('game screens under the seed link', () => {
  let restore = () => {};
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(deviceLanguageTags).mockReturnValue(['fr-FR']);
    jest.mocked(Linking.getInitialURL).mockResolvedValue(`miniworlds://seed/${SESSION_SEED}`);
    nowMs = new Date(2026, 10, 11, 10, 0).getTime();
    restore = setClock(() => nowMs);
  });
  afterEach(() => {
    restore();
    jest.mocked(Linking.getInitialURL).mockResolvedValue(null);
  });

  it('Potager Fou: the scripted first swap updates the score and moves as the engine predicts (AC-26)', async () => {
    await openGame('garden');
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^20$/);
    const engine = createGarden(ROUND_SEED, {});
    const move = findValidMoves(engine.board)[0];
    const expected = reduceGarden(engine, { type: 'swap', from: move.from, to: move.to });
    expect(expected.score).toBeGreaterThan(0);

    const x = (move.from.col + 0.5) * GARDEN_CELL;
    const y = (move.from.row + 0.5) * GARDEN_CELL;
    const dx = (move.to.col - move.from.col) * 40;
    const dy = (move.to.row - move.from.row) * 40;
    await act(async () => {
      fireGestureHandler(getByGestureTestId('garden-pan'), [
        { x, y, translationX: 0, translationY: 0 },
        { x: x + dx, y: y + dy, translationX: dx, translationY: dy },
        { x: x + dx, y: y + dy, translationX: dx, translationY: dy },
      ]);
    });
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-moves')).toHaveTextContent(/^19$/);
    // The replay shows the points of the first cascade step above the aligned pieces, then ends (AC-51).
    const first = expected.events.find((e) => e.kind === 'match');
    if (!first || first.kind !== 'match') throw new Error('a match is expected');
    expect(await screen.findByTestId('garden-points-pop')).toHaveTextContent(new RegExp(`^\\+${Math.round(first.points)}$`));
    await waitFor(() => expect(screen.queryByTestId('garden-points-pop')).toBeNull(), { timeout: 4000 });
  });

  it('Bulles en Folie: one scripted shot updates the score as predicted, then Pause / Quitter shows the Result (AC-30)', async () => {
    await openGame('bubbles');
    expect(screen.getByTestId('hud-shots')).toHaveTextContent(/^0$/);
    const touch = { x: LAUNCHER.x * BUBBLE_UNIT, y: 2 * BUBBLE_UNIT }; // straight up
    const degrees = aimAngle({ x: touch.x / BUBBLE_UNIT, y: touch.y / BUBBLE_UNIT });
    expect(degrees).toBe(90);
    const expected = reduceBubbles(createBubbles(ROUND_SEED, {}), { type: 'shoot', angle: degrees });

    await act(async () => {
      fireGestureHandler(getByGestureTestId('bubbles-pan'), [
        { x: touch.x, y: touch.y, translationX: 0, translationY: 0 },
        { x: touch.x, y: touch.y, translationX: 0, translationY: 0 },
        { x: touch.x, y: touch.y, translationX: 0, translationY: 0 },
      ]);
    });
    expect(screen.getByTestId('hud-shots')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));

    nowMs += 25_000;
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(await screen.findByTestId('result-screen')).toBeTruthy();
    expect(screen.getByTestId('result-score')).toBeTruthy();
  });

  it('shows the tutorial bubbles of Potager Fou and Bulles en Folie on a first round', async () => {
    const save = defaultSave();
    save.unlockedWorlds = ['arcade', 'puzzle', 'bubbles'];
    await AsyncStorage.multiSet([
      ['telemetry.consent.v1', 'denied'],
      ['save', serializeSave(save)],
    ]);
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('tab-games'));
    await fireEvent.press(await screen.findByTestId('world-puzzle'));
    await fireEvent.press(await screen.findByTestId('game-garden'));
    await fireEvent.press(await screen.findByTestId('sheet-play'));
    expect(await screen.findByTestId('tutorial-swap')).toHaveTextContent(/Glisse un légume/);
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    await fireEvent.press(await screen.findByTestId('result-back'));
    await fireEvent.press(await screen.findByTestId('sheet-back'));
    await fireEvent.press(await screen.findByTestId('world-back'));
    await fireEvent.press(await screen.findByTestId('world-bubbles'));
    await fireEvent.press(await screen.findByTestId('game-bubbles'));
    await fireEvent.press(await screen.findByTestId('sheet-play'));
    expect(await screen.findByTestId('tutorial-aim')).toHaveTextContent(/Garde le doigt/);
  });
});
