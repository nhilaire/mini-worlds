// The one shared game state (the save) and the actions that change it, wired to storage, the clock and telemetry.
// Screens only call these actions; every rule lives in src/game/core.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { today } from '../game/clock';
import { ensureChallenges } from '../game/core/challenges';
import { AchievementId, GameId, UpgradeId, WORLDS } from '../game/core/content';
import {
  collectDailyReward,
  CollectResult,
  completeTutorial as completeTutorialRule,
  purchaseUpgrade,
  PurchaseResult,
  resetTutorial as resetTutorialRule,
  RoundInput,
  RoundResult,
  settleRound,
} from '../game/core/engine';
import { defaultSave, resetProgress, Save, SettingsSave } from '../game/core/save';
import { randomSeed } from '../game/rng';
import { clearSave, loadSave, writeSave } from '../storage/saveStore';
import { track } from '../telemetry/telemetry';

export type Round = Omit<RoundInput, 'date' | 'sessionSeed'>;

export type GameStore = {
  save: Save;
  loaded: boolean;
  readOnly: boolean;
  sessionSeed: number | null;
  /** Seed of the next round: derived from the session seed (deep link) or random. */
  roundSeed: () => number;
  settle: (round: Round) => RoundResult;
  collectDaily: () => CollectResult | null;
  buy: (game: GameId, upgrade: UpgradeId) => PurchaseResult;
  setSettings: (patch: Partial<SettingsSave>) => void;
  reset: () => Promise<void>;
  completeTutorial: (game: GameId) => void;
  resetTutorial: (game: GameId) => void;
  /** Makes sure today's challenges are drawn (called when Home shows and on foreground). */
  refreshDay: () => void;
  /** Achievement toasts waiting to be shown, oldest first. */
  toasts: AchievementId[];
  dismissToast: () => void;
};

const SAVE_DEBOUNCE_MS = 300;

const GameStoreContext = createContext<GameStore | null>(null);

type ProviderProps = {
  sessionSeed: number | null;
  /** Test link `/unlocked`: every world of this version is open in memory and the session never writes the save. */
  testUnlocked?: boolean;
  children: ReactNode;
};

export function GameStoreProvider({ sessionSeed, testUnlocked = false, children }: ProviderProps) {
  const [save, setSave] = useState<Save>(defaultSave);
  const [loaded, setLoaded] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [toasts, setToasts] = useState<AchievementId[]>([]);
  const saveRef = useRef<Save>(save);
  const roundIndex = useRef(0);

  // Synchronous updates: actions read and write the ref so that two actions in a row see each other.
  const apply = useCallback((next: Save) => {
    saveRef.current = next;
    setSave(next);
  }, []);

  const announce = useCallback((ids: readonly AchievementId[]) => {
    if (ids.length === 0) return;
    for (const id of ids) track('achievement_unlock', { achievement: id });
    setToasts((current) => [...current, ...ids]);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const result = await loadSave();
      if (!alive) return;
      const opened = testUnlocked ? { ...result.save, unlockedWorlds: WORLDS.filter((w) => !w.comingSoon).map((w) => w.id) } : result.save;
      const withDay = ensureChallenges(opened, today(), sessionSeed ?? undefined);
      saveRef.current = withDay;
      setSave(withDay);
      setReadOnly(result.readOnly || testUnlocked);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [sessionSeed, testUnlocked]);

  // Debounced persistence after every change (never during a read-only session or before the load).
  useEffect(() => {
    if (!loaded || readOnly) return;
    const id = setTimeout(() => void writeSave(save), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [save, loaded, readOnly]);

  const roundSeed = useCallback(() => {
    roundIndex.current += 1;
    return sessionSeed === null ? randomSeed() : (sessionSeed + roundIndex.current) >>> 0;
  }, [sessionSeed]);

  const settle = useCallback(
    (round: Round): RoundResult => {
      const { save: next, result } = settleRound(saveRef.current, { ...round, date: today(), sessionSeed: sessionSeed ?? undefined });
      apply(next);
      track('round_end', { game: round.game, score: round.score, duration_s: Math.round(round.durationS), stars_new: result.newStars, outcome: result.outcome });
      for (const up of result.levelUps) track('level_up', { level: up.level });
      for (const world of result.worldsUnlocked) if (world === 'arcade' || world === 'puzzle' || world === 'bubbles') track('world_unlock', { world });
      for (const challenge of result.challengesCompleted) track('daily_challenge_complete', { challenge });
      announce(result.achievementsUnlocked);
      return result;
    },
    [apply, announce, sessionSeed],
  );

  const collectDaily = useCallback((): CollectResult | null => {
    const out = collectDailyReward(saveRef.current, today());
    if (!out) return null;
    apply(out.save);
    track('daily_reward_collect', { day: out.result.reward.day });
    for (const up of out.result.levelUps) track('level_up', { level: up.level });
    for (const world of out.result.worldsUnlocked) if (world === 'arcade' || world === 'puzzle' || world === 'bubbles') track('world_unlock', { world });
    announce(out.result.achievementsUnlocked);
    return out.result;
  }, [apply, announce]);

  const buy = useCallback(
    (game: GameId, upgrade: UpgradeId): PurchaseResult => {
      const out = purchaseUpgrade(saveRef.current, game, upgrade);
      if ('refused' in out) return out;
      apply(out.save);
      track('upgrade_buy', { game, upgrade, level: out.level });
      announce(out.achievementsUnlocked);
      return out;
    },
    [apply, announce],
  );

  const setSettings = useCallback(
    (patch: Partial<SettingsSave>) => {
      const current = saveRef.current;
      apply({ ...current, settings: { ...current.settings, ...patch } });
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'sound' || key === 'vibrations' || key === 'theme') track('settings_change', { setting: key, value: String(value) });
      }
    },
    [apply],
  );

  const reset = useCallback(async () => {
    apply(ensureChallenges(resetProgress(saveRef.current), today(), sessionSeed ?? undefined));
    track('settings_change', { setting: 'reset', value: 'done' });
    await clearSave();
  }, [apply, sessionSeed]);

  const completeTutorial = useCallback(
    (game: GameId) => {
      const current = saveRef.current;
      if (current.games[game]?.tutorialDone) return;
      apply(completeTutorialRule(current, game));
      track('tutorial_complete', { game });
    },
    [apply],
  );

  const resetTutorial = useCallback((game: GameId) => apply(resetTutorialRule(saveRef.current, game)), [apply]);

  const refreshDay = useCallback(() => {
    const next = ensureChallenges(saveRef.current, today(), sessionSeed ?? undefined);
    if (next !== saveRef.current) apply(next);
  }, [apply, sessionSeed]);

  const dismissToast = useCallback(() => setToasts((current) => current.slice(1)), []);

  const value = useMemo<GameStore>(
    () => ({ save, loaded, readOnly, sessionSeed, roundSeed, settle, collectDaily, buy, setSettings, reset, completeTutorial, resetTutorial, refreshDay, toasts, dismissToast }),
    [save, loaded, readOnly, sessionSeed, roundSeed, settle, collectDaily, buy, setSettings, reset, completeTutorial, resetTutorial, refreshDay, toasts, dismissToast],
  );

  return <GameStoreContext.Provider value={value}>{children}</GameStoreContext.Provider>;
}

export function useGameStore(): GameStore {
  const store = useContext(GameStoreContext);
  if (!store) throw new Error('useGameStore outside GameStoreProvider');
  return store;
}
