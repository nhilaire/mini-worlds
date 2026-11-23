import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { setClock } from '../game/clock';
import { createDefense, DefenseState, PATH, reduceDefense, SIM_STEP_MS, SLOT_COUNT, TurretKind } from '../game/defense/engine';
import { I18nProvider } from '../i18n/I18nProvider';
import { DefenseGame, enemyPosition, needsRender } from '../screens/game/DefenseGame';
import { GameStoreProvider } from '../state/GameStore';
import { ThemeProvider } from '../ui/ThemeProvider';

const SEED = 777;
let nowMs = new Date(2026, 10, 22, 10, 0).getTime();

// The frame loop is driven by hand: each frame advances the injectable clock by `ms` and runs the queued callbacks.
let frames: FrameRequestCallback[] = [];
async function runFrames(count: number, ms: number) {
  for (let i = 0; i < count; i++) {
    nowMs += ms;
    const queued = frames;
    frames = [];
    await act(async () => {
      for (const cb of queued) cb(nowMs);
    });
  }
}

/** The engine played the same way: `count` ticks of 50 ms. */
function ticks(state: DefenseState, count: number): DefenseState {
  let s = state;
  for (let i = 0; i < count; i++) s = reduceDefense(s, { type: 'tick', dt: SIM_STEP_MS });
  return s;
}

/** Opens the picker of an empty slot and picks a turret, as the player does. */
async function pick(slot: number, kind: TurretKind) {
  await fireEvent.press(screen.getByTestId(`defense-slot-${slot}`));
  await fireEvent.press(screen.getByTestId(`defense-pick-${kind}`));
}
const built = (state: DefenseState, slot: number, turret: TurretKind) => reduceDefense(state, { type: 'build', slot, turret });

async function renderDefense(onFinish = jest.fn()) {
  await render(
    <ThemeProvider setting="auto">
      <I18nProvider setting="fr" onChange={() => {}}>
        <GameStoreProvider sessionSeed={null}>
          <DefenseGame seed={SEED} onFinish={onFinish} />
        </GameStoreProvider>
      </I18nProvider>
    </ThemeProvider>,
  );
  expect(await screen.findByTestId('defense-screen')).toBeTruthy();
  return onFinish;
}

describe('Mini Défense screen (AC-108)', () => {
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

  it('AC-108: the first round shows the tutorial bubble, the path, the 6 empty slots, lives, gold and « Vague 1 » without a total', async () => {
    await renderDefense();
    expect(screen.getByTestId('tutorial-build')).toHaveTextContent(/Touche un emplacement et choisis une tourelle/);
    expect(screen.getByTestId('hud-lives')).toHaveTextContent(/^5$/);
    expect(screen.getByTestId('hud-gold')).toHaveTextContent(/^100$/);
    expect(screen.getByTestId('hud-wave')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(/^0$/);
    expect(screen.getAllByTestId(/^defense-path-\d+$/)).toHaveLength(PATH.length);
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const view = screen.getByTestId(`defense-slot-${slot}`);
      expect(view.props.accessibilityLabel).toBe('Choisis une tourelle');
      expect(view.props.accessibilityValue).toEqual({ text: '0' });
      expect(screen.queryByTestId(`defense-cost-${slot}`)).toBeNull();
    }
    expect(screen.getByTestId('defense-start')).toHaveTextContent(/^Lancer la vague$/);
  });

  it('AC-114: an empty slot opens the picker (Rapide 40, Canon 70, Givre 50, the unaffordable ones disabled); a pick builds and lowers the gold', async () => {
    await renderDefense();
    await fireEvent.press(screen.getByTestId('defense-slot-1'));
    expect(screen.getByTestId('defense-picker')).toHaveTextContent(/Choisis une tourelle/);
    expect(screen.getByTestId('defense-pick-rapid-cost')).toHaveTextContent(/^40 or$/);
    expect(screen.getByTestId('defense-pick-cannon-cost')).toHaveTextContent(/^70 or$/);
    expect(screen.getByTestId('defense-pick-frost-cost')).toHaveTextContent(/^50 or$/);
    expect(screen.getByTestId('defense-pick-cannon')).toHaveTextContent(/Gros dégâts, touche les voisins/);
    for (const kind of ['rapid', 'cannon', 'frost']) expect(screen.getByTestId(`defense-pick-${kind}`).props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    expect(screen.getByTestId('tutorial-build')).toBeTruthy(); // the bubble goes with the first turret built

    await fireEvent.press(screen.getByTestId('defense-pick-cannon'));
    let expected = built(createDefense(SEED, {}), 1, 'cannon');
    expect(expected.gold).toBe(30);
    expect(screen.queryByTestId('defense-picker')).toBeNull();
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    expect(screen.getByTestId('hud-gold')).toHaveTextContent(/^30$/);
    expect(screen.getByTestId('defense-slot-1').props.accessibilityValue).toEqual({ text: '1' });
    expect(screen.getByTestId('defense-slot-1').props.accessibilityLabel).toBe('Améliorer (40)');
    expect(screen.getByTestId('defense-cost-1')).toHaveTextContent(/^40$/);
    expect(screen.getByTestId('defense-turret-cannon')).toBeTruthy();

    // 30 gold: every turret is disabled in the picker; the upgrade (40) is refused too.
    await fireEvent.press(screen.getByTestId('defense-slot-0'));
    for (const kind of ['rapid', 'cannon', 'frost']) expect(screen.getByTestId(`defense-pick-${kind}`).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(screen.getByTestId('defense-pick-rapid'));
    expect(screen.getByTestId('defense-slot-0').props.accessibilityValue).toEqual({ text: '0' });
    await fireEvent.press(screen.getByTestId('defense-pick-close'));
    expect(screen.queryByTestId('defense-picker')).toBeNull();
    expected = reduceDefense(expected, { type: 'tapSlot', slot: 1 });
    await fireEvent.press(screen.getByTestId('defense-slot-1'));
    expect(screen.getByTestId('hud-gold')).toHaveTextContent(new RegExp(`^${expected.gold}$`));
    expect(screen.getByTestId('defense-slot-1').props.accessibilityValue).toEqual({ text: '1' });
  });

  it('AC-108: a wave driven frame by frame through the injectable clock changes the score, the gold and the lives as the engine predicts', async () => {
    await renderDefense();
    let expected = createDefense(SEED, {});
    for (const slot of [1, 3]) {
      expected = built(expected, slot, 'rapid');
      await pick(slot, 'rapid');
    }
    // Planning: time does not count, whatever the frames.
    await runFrames(40, 50);
    expect(screen.queryByTestId('defense-enemy-0')).toBeNull();

    expected = reduceDefense(expected, { type: 'startWave' });
    await fireEvent.press(screen.getByTestId('defense-start'));
    expect(screen.getByTestId('defense-start').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    // First frame: the first enemy enters.
    await runFrames(1, 50);
    expected = ticks(expected, 1);
    expect(screen.getByTestId('defense-enemy-0')).toBeTruthy();
    expect(screen.queryByTestId('defense-enemy-1')).toBeNull();

    // 4 s later: the engine has killed some enemies.
    await runFrames(80, 50);
    expected = ticks(expected, 80);
    expect(expected.score).toBeGreaterThan(0);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-gold')).toHaveTextContent(new RegExp(`^${expected.gold}$`));
    expect(screen.getAllByTestId(/^defense-enemy-\d+$/)).toHaveLength(expected.enemies.length);

    // A tap on a slot during the wave changes nothing.
    await fireEvent.press(screen.getByTestId('defense-slot-0'));
    expect(screen.getByTestId('defense-slot-0').props.accessibilityValue).toEqual({ text: '0' });
    expect(screen.getByTestId('hud-gold')).toHaveTextContent(new RegExp(`^${expected.gold}$`));

    // To the end of the wave: wave 2 is planned, with the score, gold and lives of the engine.
    for (let guard = 0; expected.phase === 'wave' && guard < 100; guard++) {
      await runFrames(20, 50);
      expected = ticks(expected, 20);
    }
    expect(expected.phase).toBe('plan');
    expect(screen.getByTestId('hud-wave')).toHaveTextContent(/^2$/);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getByTestId('hud-gold')).toHaveTextContent(new RegExp(`^${expected.gold}$`));
    expect(screen.getByTestId('hud-lives')).toHaveTextContent(new RegExp(`^${expected.lives}$`));
    expect(screen.queryAllByTestId(/^defense-enemy-\d+$/)).toHaveLength(0);
    expect(screen.getByTestId('defense-start').props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it('AC-108: the wave waits behind the pause and goes on after it; frames longer than 50 ms count for 50 ms', async () => {
    await renderDefense();
    let expected = reduceDefense(built(createDefense(SEED, {}), 1, 'rapid'), { type: 'startWave' });
    await pick(1, 'rapid');
    await fireEvent.press(screen.getByTestId('defense-start'));
    await runFrames(30, 50);
    expected = ticks(expected, 30);
    expect(screen.getAllByTestId(/^defense-enemy-\d+$/)).toHaveLength(expected.enemies.length);

    await fireEvent.press(screen.getByTestId('game-pause'));
    await runFrames(200, 50);
    await fireEvent.press(await screen.findByTestId('pause-resume'));
    expect(screen.getByTestId('hud-lives')).toHaveTextContent(/^5$/);
    expect(screen.getAllByTestId(/^defense-enemy-\d+$/)).toHaveLength(expected.enemies.length);

    // 40 slow frames of 200 ms advance the wave by 40 × 50 ms only.
    await runFrames(40, 200);
    expected = ticks(expected, 40);
    expect(screen.getByTestId('hud-score')).toHaveTextContent(new RegExp(`^${expected.score}$`));
    expect(screen.getAllByTestId(/^defense-enemy-\d+$/)).toHaveLength(expected.enemies.length);
  });

  it('AC-108: launching the first wave without any turret dismisses the bubble; the round ends when no life is left', async () => {
    const onFinish = await renderDefense();
    await fireEvent.press(screen.getByTestId('defense-start'));
    expect(screen.queryByTestId('tutorial-bubble')).toBeNull();
    // 6 enemies, no turret: the 5th leak comes 50 + 4 × 700 + 20 × 500 ms into the wave.
    await runFrames(256, 50);
    expect(screen.getByTestId('hud-lives')).toHaveTextContent(/^1$/);
    expect(onFinish).not.toHaveBeenCalled();
    await runFrames(1, 50);
    expect(screen.getByTestId('hud-lives')).toHaveTextContent(/^0$/);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'defense', score: 0, combos: 0, outcome: 'ended' }), 'result');
  });

  it('AC-108: Pause → Quitter ends the round', async () => {
    const onFinish = await renderDefense();
    await fireEvent.press(screen.getByTestId('defense-slot-1'));
    await fireEvent.press(screen.getByTestId('game-pause'));
    await fireEvent.press(await screen.findByTestId('pause-quit'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ game: 'defense', score: 0, outcome: 'quit' }), 'result');
  });
});

// Same rule as Saute-Lapin (AC-73): plain ticks only move Animated values; React re-renders when something countable
// changes (an enemy enters, dies or leaks, the gold, the lives, the wave).
describe('Mini Défense rendering (AC-108)', () => {
  it('re-renders on a small fraction of the frames of a wave', () => {
    let s = createDefense(3);
    for (const slot of [1, 3]) s = built(s, slot, 'rapid');
    s = reduceDefense(s, { type: 'startWave' });
    let frameCount = 0;
    let renders = 0;
    while (s.phase === 'wave' && s.status === 'playing' && frameCount < 5000) {
      const next = reduceDefense(s, { type: 'tick', dt: 16 });
      frameCount++;
      if (needsRender(s, next)) renders++;
      s = next;
    }
    expect(frameCount).toBeGreaterThan(300);
    // 6 enemies: each enters once and leaves once, plus the end of the wave.
    expect(renders).toBeLessThanOrEqual(13);
    expect(renders / frameCount).toBeLessThan(0.05);
  });

  it('a tick that only moves or hurts enemies needs no render; a spawn, a kill, a leak or the end of the round does', () => {
    const wave = reduceDefense(built(createDefense(3), 1, 'rapid'), { type: 'startWave' });
    const first = reduceDefense(wave, { type: 'tick', dt: 50 });
    expect(needsRender(wave, first)).toBe(true); // the first enemy entered
    const walked = reduceDefense(first, { type: 'tick', dt: 50 });
    expect(first.enemies[0].hp).toBe(2); // shot on cell 0 by slot 1 as it entered
    expect(walked.enemies[0].moveMs).toBe(50);
    expect(needsRender(first, walked)).toBe(false);
    expect(needsRender(walked, { ...walked, enemies: walked.enemies.map((e) => ({ ...e, hp: 1 })) })).toBe(false);
    expect(needsRender(walked, { ...walked, enemies: [] })).toBe(true);
    expect(needsRender(walked, { ...walked, gold: walked.gold + 8 })).toBe(true);
    expect(needsRender(walked, { ...walked, lives: 4 })).toBe(true);
    expect(needsRender(walked, { ...walked, status: 'over' })).toBe(true);
  });

  it('an enemy is drawn between its cell and the next one, and walks off the path after the last cell', () => {
    expect(enemyPosition(0, 0)).toEqual([0, 0]);
    expect(enemyPosition(0, 0.5)).toEqual([0.5, 0]);
    expect(enemyPosition(4, 0.25)).toEqual([4, 0.25]); // the first bend: down
    expect(enemyPosition(19, 0.5)).toEqual([2.5, 8]); // leaving to the left
  });
});
