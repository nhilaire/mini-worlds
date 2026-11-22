// « Bataille de Nombres » screen: the pure engine (src/game/conquest) on a map of Pressable territories joined by
// roads (thin rotated Views). Turn-based: tap one of your territories (highlighted, as are the roads and territories
// it can march onto), then a joined territory; « Passer » skips the turn. Owners are told by colour AND by shape and
// emblem (the player: blue circle with a star, the enemy: red square with crossed swords, neutral: grey rounded
// square with a ring), each territory shows its units. The engine guards the move and the enemy's answer (600 ms)
// and keeps a finished battle shown 900 ms; a frame loop ticks it with the injectable clock only while one of these
// runs, and React re-renders only when the map, the selection or the input guard changes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { OWNER_COLORS, OWNER_EMBLEMS } from '../../art/games/conquest';
import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { acceptsInput, CONQUEST_BATTLES, ConquestAction, ConquestState, createConquest, mapOf, MIN_MARCH_UNITS, neighboursOf, Owner, reduceConquest, TURNS } from '../../game/conquest/engine';
import { upgradeLevels } from '../../game/core/upgrades';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { Button } from '../../ui/Button';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
const ROAD_WIDTH = 4;
/** Corner radius of a territory as a share of its size: each owner has its own shape. */
const OWNER_ROUNDING: Readonly<Record<Owner, number>> = { player: 0.5, enemy: 0.08, neutral: 0.28 };

/** Engine events → sounds / haptics of the shared kit. */
function feedbackOf(events: ConquestState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'select') out.push({ kind: 'button' });
    else if (e.kind === 'move') out.push({ kind: e.by === 'enemy' ? 'push' : e.taken ? 'match' : 'drop' });
    else if (e.kind === 'pass' && e.by === 'player') out.push({ kind: 'move' });
    else if (e.kind === 'battle') out.push({ kind: e.won ? 'reward' : e.lost ? 'swap_back' : 'lock' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

type BattleResult = { battle: number; won: boolean; lost: boolean; points: number };

export function ConquestGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const board = Math.max(240, Math.min(380, Math.floor(Math.min(width - 2 * spacing.md, height - 420))));
  const node = Math.max(48, Math.min(72, Math.floor(board * 0.2)));
  const emblemScale = Math.max(2, Math.floor((node * 0.4) / 7));

  const [state, setState] = useState(() => createConquest(seed, upgradeLevels(save, 'conquest')));
  const stateRef = useRef(state);
  const [last, setLast] = useState<BattleResult | null>(null);
  const steps = useMemo(() => [{ key: 'attack', text: t.tutorial.conquest.attack }], [t]);
  const frame = useRoundFrame({ game: 'conquest', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const dispatch = useCallback(
    (action: ConquestAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceConquest(previous, action);
      stateRef.current = next;
      // A tick only re-renders when the enemy answered, taps are taken again, the map changes or the round ends.
      const redraw =
        action.type !== 'tick' ||
        next.territories !== previous.territories ||
        acceptsInput(next) !== acceptsInput(previous) ||
        next.battle !== previous.battle ||
        next.status !== previous.status;
      if (redraw) setState(next);
      for (const e of next.events) {
        // The bubble goes with the player's first turn (a march or a pass): the enemy's answer needs the clock.
        if ((e.kind === 'move' || e.kind === 'pass') && e.by === 'player') advanceTutorial('attack');
        else if (e.kind === 'battle') setLast({ battle: e.battle, won: e.won, lost: e.lost, points: e.points });
      }
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  // Frame loop of the move guard and the finished battle (injectable clock); dispatch is read through a ref so that a
  // new callback identity never restarts it.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  const waiting = active && state.status === 'playing' && !acceptsInput(state);
  useEffect(() => {
    if (!waiting) return;
    let lastTime = now();
    let handle = 0;
    const loop = () => {
      const time = now();
      const dt = Math.min(MAX_DT_MS, time - lastTime);
      lastTime = time;
      if (dt > 0) dispatchRef.current({ type: 'tick', dt });
      if (stateRef.current.status === 'playing' && !acceptsInput(stateRef.current)) handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [waiting]);

  const onTap = useCallback(
    (territory: number) => {
      if (paused) return;
      dispatch({ type: 'tap', territory });
    },
    [dispatch, paused],
  );
  const onPass = useCallback(() => {
    if (paused) return;
    dispatch({ type: 'pass' });
  }, [dispatch, paused]);

  const map = mapOf(state.battle);
  const locked = paused || state.status !== 'playing';
  const finished = state.doneMs > 0;
  const targets = state.selected === null ? [] : neighboursOf(map, state.selected);
  const answer = state.answer !== null && state.answer !== 'pass' ? state.answer : null;
  // Centre of a territory on the board (the spots of the map are on a 0..1 square).
  const centre = (i: number) => ({ x: node / 2 + map.spots[i].x * (board - node), y: node / 2 + map.spots[i].y * (board - node) });

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.battle}
        </PixelText>
        <PixelText testID="hud-battle">{t.hud.of(state.battle, CONQUEST_BATTLES)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.turns}
        </PixelText>
        <PixelText testID="hud-turns">{String(TURNS - state.turn)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="conquest" frame={frame} score={state.score} hud={hud} testID="conquest-screen">
      <View style={styles.column}>
        <View key={`battle-${state.battle}`} testID="conquest-board" style={{ width: board, height: board }}>
          {map.roads.map(([a, b]) => {
            const from = centre(a);
            const to = centre(b);
            const length = Math.hypot(to.x - from.x, to.y - from.y);
            const open = state.selected === a || state.selected === b;
            const marched = answer !== null && ((answer.from === a && answer.to === b) || (answer.from === b && answer.to === a));
            return (
              <View
                key={`${a}-${b}`}
                testID={`conquest-road-${a}-${b}`}
                pointerEvents="none"
                style={[
                  styles.road,
                  {
                    left: (from.x + to.x) / 2 - length / 2,
                    top: (from.y + to.y) / 2 - ROAD_WIDTH / 2,
                    width: length,
                    backgroundColor: open ? colors.accent : marched ? PALETTE[OWNER_COLORS.enemy] : colors.border,
                    transform: [{ rotate: `${Math.atan2(to.y - from.y, to.x - from.x)}rad` }],
                  },
                ]}
              />
            );
          })}
          {state.territories.map((territory, i) => {
            const selected = state.selected === i;
            const target = targets.includes(i);
            const at = centre(i);
            const dim = territory.owner === 'player' && territory.units < MIN_MARCH_UNITS;
            return (
              <Pressable
                key={i}
                testID={`conquest-territory-${i}`}
                accessibilityRole="button"
                accessibilityLabel={territory.owner === 'player' ? t.play.you : undefined}
                accessibilityValue={{ text: `${territory.owner} ${territory.units}` }}
                accessibilityState={{ selected }}
                disabled={locked}
                onPress={() => onTap(i)}
                style={[
                  styles.territory,
                  {
                    left: at.x - node / 2,
                    top: at.y - node / 2,
                    width: node,
                    height: node,
                    borderRadius: node * OWNER_ROUNDING[territory.owner],
                    backgroundColor: PALETTE[OWNER_COLORS[territory.owner]],
                    borderColor: selected ? colors.accent : target ? colors.success : PALETTE.outline,
                    borderWidth: selected || target ? 4 : 2,
                    borderStyle: target ? 'dashed' : 'solid',
                    opacity: dim ? 0.8 : 1,
                  },
                ]}
              >
                <PixelSprite sprite={OWNER_EMBLEMS[territory.owner]} scale={emblemScale} />
                <PixelText testID={`conquest-units-${i}`} size={9} bold style={styles.units}>
                  {String(territory.units)}
                </PixelText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.message}>
          {last && finished ? (
            <>
              {(last.won || last.lost) && (
                <PixelText testID="conquest-result" bold color={last.won ? 'success' : 'danger'}>
                  {last.won ? t.play.win : t.play.lost}
                </PixelText>
              )}
              <PixelText key={`last-${last.battle}`} testID="conquest-last" bold color={last.points > 0 ? 'success' : 'danger'}>
                {last.points > 0 ? `+${last.points}` : '0'}
              </PixelText>
            </>
          ) : (
            <View testID="conquest-legend" style={styles.legend}>
              <View style={[styles.legendSwatch, { backgroundColor: PALETTE[OWNER_COLORS.player] }]}>
                <PixelSprite sprite={OWNER_EMBLEMS.player} scale={2} />
              </View>
              <PixelText size={8} color="muted">
                {t.play.you}
              </PixelText>
            </View>
          )}
        </View>

        <View style={styles.pass}>
          <Button label={t.play.pass} onPress={onPass} variant="secondary" compact disabled={locked || !acceptsInput(state)} testID="conquest-pass" />
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  road: { position: 'absolute', height: ROAD_WIDTH, borderRadius: ROAD_WIDTH / 2 },
  territory: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  units: { color: PALETTE.white },
  message: { flexDirection: 'row', gap: spacing.md, minHeight: 28, alignItems: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendSwatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: PALETTE.outline, alignItems: 'center', justifyContent: 'center' },
  pass: { width: 200 },
  hudItem: { gap: 2 },
});
