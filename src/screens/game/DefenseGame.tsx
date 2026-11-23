// « Mini Défense » screen: the winding path on its grid, the 6 turret slots beside it and « Lancer la vague » below.
// Between waves a tap on an empty slot opens the picker of the three turrets (Rapide, Canon, Givre: name, cost,
// effect; the unaffordable ones disabled), a tap on a turret upgrades it (the slot shows its cost); during a wave a
// frame loop reads the injectable clock and ticks the engine while the round is active (not behind the tutorial
// bubble nor the pause). A turret tells its kind by its shape (Rapide: thin barrels, Canon: one wide barrel, Givre: a
// round base) and its level by its number of barrels; an enemy tells its kind by its shape (normal: round, rapide:
// small diamond, blindé: square with a thick rim) and carries a small health bar; a shot is a short flash.
//
// Performance (same rule as Saute-Lapin): a tick never re-renders React by itself. The enemy positions, their health
// bars and the shot flashes are Animated values set from the engine state; React re-renders only when something
// countable changes (an enemy enters, dies or leaks, the gold, the lives, the score, the wave or its phase).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import {
  createDefense,
  DefenseAction,
  DefenseEvent,
  DefenseState,
  GRID_COLS,
  GRID_ROWS,
  EnemyKind,
  MAX_LEVEL,
  MAX_WAVE_ENEMIES,
  PATH,
  PATH_LENGTH,
  reduceDefense,
  SLOT_COUNT,
  SLOTS,
  TURRET_KINDS,
  TurretKind,
  TURRETS,
  upgradeCost,
} from '../../game/defense/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

/** Longest tick fed to the engine (a dropped frame must not teleport the enemies). */
const MAX_DT_MS = 50;
/** A shot stays visible this long after it was fired (read from the turret cooldown, so it pauses with the round). */
export const FLASH_MS = 150;
/** Room kept for the HUD, the button and the system bars around the board. */
const CHROME_HEIGHT = 300;
const MIN_CELL = 24;
const MAX_CELL = 64;

/** Engine events → feedback kinds of the shared kit. Shots stay silent: up to 10 per second. */
function feedbackOf(events: readonly DefenseEvent[]): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'build') out.push({ kind: 'lock' });
    else if (e.kind === 'refused') out.push({ kind: 'swap_back' });
    else if (e.kind === 'wave') out.push({ kind: 'move' });
    else if (e.kind === 'kill') out.push({ kind: 'pop' });
    else if (e.kind === 'leak') out.push({ kind: 'drop' });
    else if (e.kind === 'cleared' && e.clean) out.push({ kind: 'refill' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push(e);
  }
  return out;
}

/** React must re-render only when what it draws as views or text changes; the rest goes through Animated values. */
export function needsRender(previous: DefenseState, next: DefenseState): boolean {
  if (next.status !== previous.status || next.phase !== previous.phase || next.wave !== previous.wave) return true;
  if (next.gold !== previous.gold || next.lives !== previous.lives || next.score !== previous.score || next.turrets !== previous.turrets) return true;
  if (next.enemies.length !== previous.enemies.length) return true;
  return next.enemies.some((e, i) => e.id !== previous.enemies[i].id);
}

/** Position on the grid (in cells) of an enemy `progress` (0 to 1) of the way from its cell to the next one. */
export function enemyPosition(cell: number, progress: number): [col: number, row: number] {
  const [col, row] = PATH[cell];
  // Past the last cell the enemy keeps its direction and walks off the path.
  const [nextCol, nextRow] = cell + 1 < PATH_LENGTH ? PATH[cell + 1] : [2 * col - PATH[cell - 1][0], 2 * row - PATH[cell - 1][1]];
  return [col + (nextCol - col) * progress, row + (nextRow - row) * progress];
}

/** Colour of each turret base (the shape tells the kind as well). */
const TURRET_COLORS: Readonly<Record<TurretKind, string>> = { rapid: PALETTE.blue, cannon: PALETTE.darkPurple, frost: PALETTE.sky };

/** A turret: a base and one barrel per level; Rapide has thin barrels, Canon one wide barrel per level, Givre a round base. */
function Turret({ kind, level, size }: { kind: TurretKind; level: number; size: number }) {
  const barrel = Math.max(3, Math.floor(size / (kind === 'cannon' ? 4 : 7)));
  const base = Math.floor(size * 0.6);
  return (
    <View style={styles.turret} testID={`defense-turret-${kind}`}>
      <View style={styles.barrels}>
        {Array.from({ length: level }, (_, i) => (
          <View key={i} style={[styles.barrel, { width: barrel, height: Math.floor(size * (kind === 'cannon' ? 0.22 : 0.3)) }]} />
        ))}
      </View>
      <View style={[styles.turretBase, { width: base, height: Math.floor(size * 0.3), backgroundColor: TURRET_COLORS[kind], borderRadius: kind === 'frost' ? base / 2 : 3 }]} />
    </View>
  );
}

/** Body of an enemy: its shape and colour tell its kind. */
function enemyBodyStyle(kind: EnemyKind, body: number) {
  if (kind === 'fast') return { width: body * 0.75, height: body * 0.75, borderRadius: 2, backgroundColor: PALETTE.yellow, transform: [{ rotate: '45deg' }] };
  if (kind === 'armoured') return { width: body, height: body, borderRadius: 3, borderWidth: 4, backgroundColor: PALETTE.grey };
  return { width: body, height: body, borderRadius: body / 2, backgroundColor: PALETTE.red };
}

export function DefenseGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min((width - 2 * spacing.md) / GRID_COLS, (height - CHROME_HEIGHT) / GRID_ROWS))));

  const [state, setState] = useState(() => createDefense(seed, upgradeLevels(save, 'defense')));
  const stateRef = useRef(state);
  // Positions in grid cells and health from 0 to 1, by enemy id (its rank in the wave); set on every tick.
  const [enemyCol] = useState(() => Array.from({ length: MAX_WAVE_ENEMIES }, () => new Animated.Value(0)));
  const [enemyRow] = useState(() => Array.from({ length: MAX_WAVE_ENEMIES }, () => new Animated.Value(0)));
  const [enemyHealth] = useState(() => Array.from({ length: MAX_WAVE_ENEMIES }, () => new Animated.Value(1)));
  // Per slot: 1 while its last shot is visible, and the cell that shot hit.
  const [flash] = useState(() => Array.from({ length: SLOT_COUNT }, () => new Animated.Value(0)));
  const [impactCol] = useState(() => Array.from({ length: SLOT_COUNT }, () => new Animated.Value(0)));
  const [impactRow] = useState(() => Array.from({ length: SLOT_COUNT }, () => new Animated.Value(0)));
  const steps = useMemo(() => [{ key: 'build', text: t.tutorial.defense.build }], [t]);
  /** Empty slot whose turret picker is open, null when closed. */
  const [picking, setPicking] = useState<number | null>(null);
  const frame = useRoundFrame({ game: 'defense', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: DefenseAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceDefense(previous, action);
      stateRef.current = next;
      for (const enemy of next.enemies) {
        const [col, row] = enemyPosition(enemy.cell, enemy.moveMs / enemy.stepMs);
        enemyCol[enemy.id].setValue(col);
        enemyRow[enemy.id].setValue(row);
        enemyHealth[enemy.id].setValue(enemy.hp / enemy.maxHp);
      }
      for (const event of next.events) {
        if (event.kind !== 'shot') continue;
        impactCol[event.slot].setValue(PATH[event.cell][0]);
        impactRow[event.slot].setValue(PATH[event.cell][1]);
      }
      next.cooldowns.forEach((ms, slot) => {
        const turret = next.turrets[slot];
        flash[slot].setValue(next.phase === 'wave' && turret !== null && ms > TURRETS[turret.kind].intervalMs - FLASH_MS ? 1 : 0);
      });
      if (needsRender(previous, next) || (action.type !== 'tick' && next.events.length > 0)) setState(next);
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [enemyCol, enemyHealth, enemyRow, finish, flash, impactCol, impactRow, setCombos],
  );
  // The frame loop must not restart when dispatch changes identity: it reads the latest one through a ref.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Frame loop: the wave runs while the round is active (not behind the tutorial bubble nor the pause).
  const playing = state.status === 'playing';
  const inWave = playing && state.phase === 'wave';
  useEffect(() => {
    if (!active || !inWave) return;
    let last = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - last);
      last = time;
      if (dt > 0) dispatchRef.current({ type: 'tick', dt });
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [active, inWave]);

  const planning = playing && state.phase === 'plan';
  const onSlot = useCallback(
    (slot: number) => {
      if (paused) return;
      // An empty slot opens the picker; a turret is upgraded at once.
      if (stateRef.current.turrets[slot] === null) setPicking(slot);
      else dispatch({ type: 'tapSlot', slot });
    },
    [dispatch, paused],
  );
  const onPick = useCallback(
    (turret: TurretKind) => {
      if (paused || picking === null) return;
      dispatch({ type: 'build', slot: picking, turret });
      setPicking(null);
      advanceTutorial('build');
    },
    [advanceTutorial, dispatch, paused, picking],
  );
  const onStart = useCallback(() => {
    if (paused) return;
    setPicking(null);
    dispatch({ type: 'startWave' });
    // A player who launches the first wave without any turret has still read the bubble: the wave must run.
    advanceTutorial('build');
  }, [advanceTutorial, dispatch, paused]);

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.lives}
        </PixelText>
        <PixelText testID="hud-lives">{String(state.lives)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.gold}
        </PixelText>
        <PixelText testID="hud-gold">{String(state.gold)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.wave}
        </PixelText>
        <PixelText testID="hud-wave">{String(state.wave)}</PixelText>
      </View>
    </>
  );

  const body = Math.floor(cell * 0.5);
  const barWidth = Math.floor(cell * 0.6);
  const impact = Math.floor(cell * 0.3);

  return (
    <GameFrame game="defense" frame={frame} score={state.score} hud={hud} testID="defense-screen">
      <View style={styles.column}>
        <View style={[styles.board, { width: GRID_COLS * cell, height: GRID_ROWS * cell, backgroundColor: colors.surface, borderColor: colors.border }]} testID="defense-board">
          {PATH.map(([col, row], i) => (
            <View
              key={i}
              testID={`defense-path-${i}`}
              style={[styles.path, { left: col * cell, top: row * cell, width: cell, height: cell, backgroundColor: colors.surfaceAlt, borderColor: i === PATH_LENGTH - 1 ? PALETTE.red : colors.border }]}
            />
          ))}

          {SLOTS.map(([col, row], slot) => {
            const turret = state.turrets[slot];
            const level = turret?.level ?? 0;
            const cost = turret ? upgradeCost(turret.level) : null;
            const affordable = turret ? cost !== null && state.gold >= cost : TURRET_KINDS.some((kind) => state.gold >= TURRETS[kind].cost);
            return (
              <Pressable
                key={slot}
                testID={`defense-slot-${slot}`}
                accessibilityRole="button"
                accessibilityLabel={!turret ? t.play.pickTurret : cost === null ? t.hud.of(level, MAX_LEVEL) : t.play.upgradeCost(cost)}
                accessibilityValue={{ text: String(level) }}
                accessibilityState={{ disabled: !planning }}
                disabled={!planning}
                onPress={() => onSlot(slot)}
                style={[styles.slot, { left: col * cell, top: row * cell, width: cell, height: cell, borderColor: planning && affordable ? colors.accent : colors.border }, level === 0 && styles.slotEmpty]}
              >
                {turret && <Turret kind={turret.kind} level={turret.level} size={cell} />}
                {cost !== null && (
                  <PixelText size={8} color={affordable ? 'text' : 'muted'} testID={`defense-cost-${slot}`}>
                    {String(cost)}
                  </PixelText>
                )}
                <Animated.View pointerEvents="none" style={[styles.muzzle, { opacity: flash[slot] }]} />
              </Pressable>
            );
          })}

          {state.enemies.map((enemy) => (
            <Animated.View
              key={enemy.id}
              testID={`defense-enemy-${enemy.id}`}
              pointerEvents="none"
              style={[styles.enemy, { width: cell, height: cell, transform: [{ translateX: Animated.multiply(enemyCol[enemy.id], cell) }, { translateY: Animated.multiply(enemyRow[enemy.id], cell) }] }]}
            >
              <View style={[styles.healthBar, { width: barWidth }]}>
                <Animated.View style={[styles.health, { width: Animated.multiply(enemyHealth[enemy.id], barWidth - 2) }]} />
              </View>
              <View testID={`defense-enemy-kind-${enemy.kind}`} style={[styles.enemyBody, enemyBodyStyle(enemy.kind, body)]}>
                <View style={styles.enemyEye} />
                <View style={styles.enemyEye} />
              </View>
            </Animated.View>
          ))}

          {SLOTS.map((_, slot) => (
            <Animated.View
              key={slot}
              pointerEvents="none"
              style={[
                styles.impact,
                {
                  width: impact,
                  height: impact,
                  left: (cell - impact) / 2,
                  top: (cell - impact) / 2,
                  opacity: flash[slot],
                  transform: [{ translateX: Animated.multiply(impactCol[slot], cell) }, { translateY: Animated.multiply(impactRow[slot], cell) }, { rotate: '45deg' }],
                },
              ]}
            />
          ))}
        </View>

        <View style={{ width: GRID_COLS * cell }}>
          <Button label={t.play.startWave} onPress={onStart} disabled={!planning} testID="defense-start" />
        </View>

        {picking !== null && planning && (
          <View style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="defense-picker">
            <PixelText size={10} color="muted">
              {t.play.pickTurret}
            </PixelText>
            {TURRET_KINDS.map((kind) => {
              const def = TURRETS[kind];
              const copy = t.play.turrets[kind];
              const canPay = state.gold >= def.cost;
              return (
                <Pressable
                  key={kind}
                  testID={`defense-pick-${kind}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${copy.name}, ${t.play.goldCost(def.cost)}`}
                  accessibilityState={{ disabled: !canPay }}
                  disabled={!canPay}
                  onPress={() => onPick(kind)}
                  style={[styles.pickRow, { borderColor: colors.border, opacity: canPay ? 1 : 0.45 }]}
                >
                  <View style={[styles.pickIcon, { width: cell, height: cell }]}>
                    <Turret kind={kind} level={1} size={cell} />
                  </View>
                  <View style={styles.pickText}>
                    <PixelText>{copy.name}</PixelText>
                    <PixelText size={8} color="muted">
                      {copy.desc}
                    </PixelText>
                  </View>
                  <PixelText testID={`defense-pick-${kind}-cost`} color={canPay ? 'accent' : 'muted'}>
                    {t.play.goldCost(def.cost)}
                  </PixelText>
                </Pressable>
              );
            })}
            <Button label={t.play.close} onPress={() => setPicking(null)} variant="secondary" compact testID="defense-pick-close" />
          </View>
        )}
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  board: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  path: { position: 'absolute', borderWidth: 1 },
  slot: { position: 'absolute', borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  slotEmpty: { borderStyle: 'dashed' },
  turret: { alignItems: 'center' },
  barrels: { flexDirection: 'row', gap: 2 },
  barrel: { backgroundColor: PALETTE.grey, borderWidth: 1, borderColor: PALETTE.outline },
  turretBase: { borderWidth: 2, borderColor: PALETTE.outline },
  muzzle: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 4, borderWidth: 3, borderColor: PALETTE.yellow },
  enemy: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  healthBar: { height: 5, backgroundColor: PALETTE.outline, borderWidth: 1, borderColor: PALETTE.outline },
  health: { height: 3, backgroundColor: PALETTE.lime },
  enemyBody: { borderWidth: 2, borderColor: PALETTE.outline, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  enemyEye: { width: 3, height: 3, backgroundColor: PALETTE.white },
  impact: { position: 'absolute', backgroundColor: PALETTE.yellow, borderWidth: 1, borderColor: PALETTE.outline },
  hudItem: { gap: 2 },
  picker: { position: 'absolute', left: spacing.md, right: spacing.md, top: spacing.lg, borderWidth: 2, borderRadius: 8, padding: spacing.md, gap: spacing.sm },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: 6, padding: spacing.sm },
  pickIcon: { alignItems: 'center', justifyContent: 'center' },
  pickText: { flex: 1, gap: 2 },
});
