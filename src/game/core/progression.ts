// XP, level and coins rules (docs/PRD.md "XP and global level", "Coins"). Pure functions on the profile.
import { COINS_PER_NEW_STAR, LEVEL_CAP, levelUpCoins, XP_PER_NEW_STAR, XP_PER_ROUND_CAP, xpToNextLevel } from './content';
import type { Save } from './save';

export type Profile = Save['profile'];

/** XP of a settled round: 10 + floor(score / 50), capped at 100, plus 25 per new star. */
export function roundXp(score: number, newStars: number): number {
  return Math.min(XP_PER_ROUND_CAP, 10 + Math.floor(score / 50)) + XP_PER_NEW_STAR * newStars;
}

/**
 * Coins of a settled round: floor((10 + floor(score / 25)) × (1 + 0.1 × bonusLevel) × multiplier) + 50 per new star
 * (multiplier 2 for the game of the day; the new-star coins are never multiplied).
 */
export function roundCoins(score: number, newStars: number, coinsBonusLevel: number, multiplier = 1): number {
  const base = 10 + Math.floor(score / 25);
  return Math.floor(base * (1 + 0.1 * coinsBonusLevel) * multiplier) + COINS_PER_NEW_STAR * newStars;
}

export type LevelUp = { level: number; coins: number };

/** Adds XP, applies level-ups (several possible, cap 50), grants their coins. */
export function addXp(profile: Profile, xp: number): { profile: Profile; levelUps: LevelUp[] } {
  let { level, xp: current } = profile;
  current += xp;
  const levelUps: LevelUp[] = [];
  let coins = 0;
  while (level < LEVEL_CAP && current >= xpToNextLevel(level)) {
    current -= xpToNextLevel(level);
    level += 1;
    const reward = levelUpCoins(level);
    coins += reward;
    levelUps.push({ level, coins: reward });
  }
  return { profile: { ...profile, xp: current, level, coins: profile.coins + coins, lifetimeCoins: profile.lifetimeCoins + coins }, levelUps };
}

/** Earned coins: balance and lifetime total. */
export function addCoins(profile: Profile, coins: number): Profile {
  if (coins <= 0) return profile;
  return { ...profile, coins: profile.coins + coins, lifetimeCoins: profile.lifetimeCoins + coins };
}

/** Spent coins: balance only; refused (unchanged) when unaffordable. */
export function spendCoins(profile: Profile, coins: number): Profile | null {
  if (coins > profile.coins) return null;
  return { ...profile, coins: profile.coins - coins };
}
