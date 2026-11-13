// Typed catalog of the only telemetry events this app may send (must match docs/PRD.md "Telemetry events").
// Params are numbers or short lowercase enums. Never identifiers, names, free text or locations.

export type GameId =
  | 'blocks'
  | 'garden'
  | 'bubbles'
  | 'tower'
  | 'hop'
  | 'lights'
  | 'pipes'
  | 'flood'
  | 'socks'
  | 'twentyone'
  | 'candles'
  | 'parrot'
  | 'moles';
export type WorldId = 'arcade' | 'puzzle' | 'cards' | 'bubbles' | 'skill' | 'memory';
export type RoundOutcome = 'ended' | 'quit' | 'short';
export type UpgradeId =
  | 'preview'
  | 'slow_start'
  | 'extra_move'
  | 'cascade'
  | 'aim'
  | 'next'
  | 'coins'
  | 'wide'
  | 'shield'
  | 'hint'
  | 'more_moves'
  | 'peek'
  | 'extra_hand'
  | 'slow_spin'
  | 'second_chance'
  | 'radar';
export type ChallengeId = 'rounds3' | 'games2' | 'star1' | 'combos5' | 'coins200' | `score_${GameId}`;
export type AchievementId =
  | 'first_round'
  | 'rounds10'
  | 'rounds100'
  | 'first_star'
  | 'all_stars'
  | 'explorer'
  | 'globetrotter'
  | 'first_upgrade'
  | 'maxed_upgrade'
  | 'level5'
  | 'level10'
  | 'week'
  | 'rich';
export type SettingId = 'sound' | 'vibrations' | 'theme' | 'language' | 'stats' | 'reset';

export type TelemetryEvents = {
  round_start: { game: GameId };
  round_end: { game: GameId; score: number; duration_s: number; stars_new: number; outcome: RoundOutcome };
  tutorial_complete: { game: GameId };
  level_up: { level: number };
  world_unlock: { world: WorldId };
  upgrade_buy: { game: GameId; upgrade: UpgradeId; level: number };
  daily_reward_collect: { day: number };
  daily_challenge_complete: { challenge: ChallengeId };
  achievement_unlock: { achievement: AchievementId };
  settings_change: { setting: SettingId; value: string };
};

export type EventName = keyof TelemetryEvents;

export type SafeParams = Record<string, number | string>;

const KEY_FORMAT = /^[a-z][a-z0-9_]{0,39}$/;
// Whole-word checks for short tokens ("ip", "lat"...): a substring test dropped legitimate keys like "skipped".
const FORBIDDEN_KEY = /(mail|name|phone|address|user|device|location|token|uuid|(^|_)(ip|lat|lng|lon|id)(_|$))/i;
const ENUM_VALUE = /^[a-z0-9_]{1,36}$/;

// Drops anything that could carry personal data. Booleans become 0/1 (Analytics has no boolean type).
export function sanitizeParams(params: Record<string, unknown>): SafeParams {
  const safe: SafeParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (!KEY_FORMAT.test(key) || FORBIDDEN_KEY.test(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === 'boolean') safe[key] = value ? 1 : 0;
    else if (typeof value === 'string' && ENUM_VALUE.test(value)) safe[key] = value;
  }
  return safe;
}
