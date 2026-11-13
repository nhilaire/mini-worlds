// « Chasse au Trésor » screen: the treasure engine (src/game/treasure) on an 8 × 8 beach of Pressable sand cells.
// Turn-based: a tap digs at once in the engine; the hole pops in (200 ms Reanimated zoom) with the colour AND the
// symbol of its band (flame, sun, wave, snowflake, chest: readable without colour), and the band's word is written
// under the beach next to a legend of the four bands. The engine guards the dig (200 ms) and keeps a finished map
// shown 800 ms with the chest uncovered; a frame loop ticks it with the injectable clock only while one of these runs,
// and React re-renders only when digs are taken again or the map changes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { BAND_COLORS, BAND_SPRITES } from '../../art/games/treasure';
import { PALETTE } from '../../art/palette';
import { now } from '../../game/clock';
import { upgradeLevels } from '../../game/core/upgrades';
import { acceptsInput, Band, createTreasure, DIG_MS, mapFinished, reduceTreasure, TREASURE_MAPS, TREASURE_SIZE, TreasureAction, TreasureState } from '../../game/treasure/engine';
import { useI18n } from '../../i18n/I18nProvider';
import { useGameStore } from '../../state/GameStore';
import { PixelSprite } from '../../ui/PixelSprite';
import { useTheme } from '../../ui/ThemeProvider';
import { PixelText } from '../../ui/Typography';
import { spacing } from '../../ui/theme';
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';
import { useGameFeedback } from './useGameFeedback';

const MAX_DT_MS = 50;
const LEGEND: readonly Band[] = ['burning', 'hot', 'warm', 'cold'];

/** Engine events → sounds / haptics of the shared kit. */
function feedbackOf(events: TreasureState['events']): { kind: string }[] {
  const out: { kind: string }[] = [];
  for (const e of events) {
    if (e.kind === 'dig') out.push({ kind: 'drop' });
    else if (e.kind === 'found') out.push({ kind: 'reward' });
    else if (e.kind === 'lost') out.push({ kind: 'swap_back' });
    else if (e.kind === 'combo' || e.kind === 'over') out.push({ kind: e.kind });
  }
  return out;
}

type MapResult = { map: number; points: number };

export function TreasureGame({ seed, onFinish }: { seed: number; onFinish: OnFinish }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { save } = useGameStore();
  const { width, height } = useWindowDimensions();
  const cell = Math.max(28, Math.min(48, Math.floor(Math.min((width - 2 * spacing.md - 4) / TREASURE_SIZE, (height - 380) / TREASURE_SIZE))));
  const symbolScale = Math.max(2, Math.floor((cell * 0.7) / 7));

  const [state, setState] = useState(() => createTreasure(seed, upgradeLevels(save, 'treasure')));
  const stateRef = useRef(state);
  const [last, setLast] = useState<MapResult | null>(null);
  const [lastBand, setLastBand] = useState<Band | null>(null);
  const steps = useMemo(() => [{ key: 'dig', text: t.tutorial.treasure.dig }], [t]);
  const frame = useRoundFrame({ game: 'treasure', tutorialSteps: steps, onFinish, score: () => stateRef.current.score });
  const { paused, active, advanceTutorial, finish, setCombos } = frame;
  const feedback = useMemo(() => feedbackOf(state.events), [state.events]);
  useGameFeedback(feedback);

  const words: Record<Band, string> = { found: t.play.found, burning: t.play.burning, hot: t.play.hot, warm: t.play.warm, cold: t.play.cold };

  const dispatch = useCallback(
    (action: TreasureAction) => {
      const previous = stateRef.current;
      if (previous.status !== 'playing') return;
      const next = reduceTreasure(previous, action);
      stateRef.current = next;
      // A tick only re-renders when digs are taken again, the map changes or the round ends.
      const redraw = action.type !== 'tick' || acceptsInput(next) !== acceptsInput(previous) || next.map !== previous.map || next.status !== previous.status;
      if (redraw) setState(next);
      for (const e of next.events) {
        if (e.kind === 'dig') {
          setLastBand(e.band);
          advanceTutorial('dig');
        } else if (e.kind === 'found') setLast({ map: e.map, points: e.points });
        else if (e.kind === 'lost') setLast({ map: e.map, points: 0 });
        else if (e.kind === 'map') setLastBand(null);
      }
      if (next.status === 'over') finish(next.score, next.combos);
      else setCombos(next.combos);
    },
    [advanceTutorial, finish, setCombos],
  );

  // Frame loop of the dig guard and the finished map (injectable clock); dispatch is read through a ref so that a new
  // callback identity never restarts it.
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

  const onDig = useCallback(
    (index: number) => {
      if (paused) return;
      dispatch({ type: 'dig', cell: index });
    },
    [dispatch, paused],
  );

  const locked = paused || state.status !== 'playing';
  const finished = mapFinished(state);

  const hud = (
    <>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.map}
        </PixelText>
        <PixelText testID="hud-map">{t.hud.of(state.map, TREASURE_MAPS)}</PixelText>
      </View>
      <View style={styles.hudItem}>
        <PixelText size={8} color="muted">
          {t.hud.digs}
        </PixelText>
        <PixelText testID="hud-digs">{String(state.digsLeft)}</PixelText>
      </View>
    </>
  );

  return (
    <GameFrame game="treasure" frame={frame} score={state.score} hud={hud} testID="treasure-screen">
      <View style={styles.column}>
        <View key={`map-${state.map}`} testID="treasure-board" style={[styles.board, { width: TREASURE_SIZE * cell + 4, borderColor: PALETTE.darkYellow }]}>
          {state.dug.map((band, i) => {
            const col = i % TREASURE_SIZE;
            const row = Math.floor(i / TREASURE_SIZE);
            // A lost map uncovers its chest (faded) so that the player sees where it was.
            const shown: Band | null = band ?? (finished && i === state.chest ? 'found' : null);
            return (
              <Pressable
                key={i}
                testID={`treasure-cell-${col}-${row}`}
                accessibilityRole="button"
                accessibilityValue={{ text: band ?? 'sand' }}
                disabled={locked}
                onPress={() => onDig(i)}
                style={[styles.cell, { width: cell, height: cell, backgroundColor: PALETTE.light, borderColor: PALETTE.darkYellow, borderWidth: 0.5 }]}
              >
                {shown && (
                  <Animated.View
                    entering={ZoomIn.duration(DIG_MS)}
                    testID={`treasure-hole-${col}-${row}`}
                    style={[styles.hole, { backgroundColor: PALETTE[BAND_COLORS[shown]], opacity: band ? 1 : 0.6 }]}
                    pointerEvents="none"
                  >
                    <PixelSprite sprite={BAND_SPRITES[shown]} scale={symbolScale} />
                  </Animated.View>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.message}>
          {lastBand && (
            <PixelText testID="treasure-band" bold color={lastBand === 'found' ? 'success' : 'text'}>
              {words[lastBand]}
            </PixelText>
          )}
          {last && finished && (
            <PixelText key={`last-${last.map}`} testID="treasure-last" color={last.points > 0 ? 'success' : 'danger'} bold>
              {last.points > 0 ? `+${last.points}` : '0'}
            </PixelText>
          )}
        </View>

        <View testID="treasure-legend" style={styles.legend}>
          {LEGEND.map((band) => (
            <View key={band} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: PALETTE[BAND_COLORS[band]], borderColor: colors.border }]}>
                <PixelSprite sprite={BAND_SPRITES[band]} scale={2} />
              </View>
              <PixelText size={7} color="muted">
                {words[band]}
              </PixelText>
            </View>
          ))}
        </View>
      </View>
    </GameFrame>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: spacing.md },
  board: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  hole: { position: 'absolute', left: 2, top: 2, right: 2, bottom: 2, borderRadius: 4, borderWidth: 2, borderColor: PALETTE.outline, alignItems: 'center', justifyContent: 'center' },
  message: { flexDirection: 'row', gap: spacing.md, minHeight: 28, alignItems: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  legendItem: { alignItems: 'center', gap: 2 },
  legendSwatch: { width: 22, height: 22, borderWidth: 1, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  hudItem: { gap: 2 },
});
