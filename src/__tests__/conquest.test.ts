import { OWNER_COLORS, OWNER_EMBLEMS } from '../art/games/conquest';
import { ICON } from '../art/icons/conquest';
import { spriteSize, validateSprite } from '../art/sprites';
import { BOT_ERROR_RATE, casualConquestMove, exposedAfter, playConquestBot } from '../game/conquest/bot';
import {
  acceptsInput,
  ANSWER_AT_MS,
  BATTLE_SHOW_MS,
  battleScore,
  CONQUEST_BATTLES,
  CONQUEST_MAPS,
  ConquestMap,
  ConquestState,
  createConquest,
  enemyMove,
  GROWTH,
  joined,
  legalMoves,
  march,
  MOVE_GUARD_MS,
  neighboursOf,
  NEUTRAL_MAX_UNITS,
  NEUTRAL_MIN_UNITS,
  Owner,
  ownedBy,
  reduceConquest,
  REINFORCE_UNITS,
  START_UNITS,
  TERRITORY_POINTS,
  Territory,
  TURN_LEFT_POINTS,
  TURNS,
  WIN_POINTS,
} from '../game/conquest/engine';
import { gameById } from '../game/core/content';

const OWNERS: Readonly<Record<string, Owner>> = { p: 'player', e: 'enemy', n: 'neutral' };

/** Territories from specs like 'p10' (player, 10 units), 'e3', 'n5'. */
const lands = (specs: string[]): Territory[] => specs.map((s) => ({ owner: OWNERS[s[0]], units: Number(s.slice(1)) }));
const show = (s: Pick<ConquestState, 'territories'>) => s.territories.map((t) => `${t.owner[0]}${t.units}`);

/** A battle (1..3) with the given territories. Map 1 roads: 0-1 0-2 0-3 1-2 1-4 2-3 2-4 3-4. */
function battle(specs: string[], extra: Partial<ConquestState> = {}, number = 1): ConquestState {
  return { ...createConquest(1), battle: number, territories: lands(specs), ...extra };
}

const tap = (s: ConquestState, territory: number) => reduceConquest(s, { type: 'tap', territory });
const pass = (s: ConquestState) => reduceConquest(s, { type: 'pass' });
const tick = (s: ConquestState, dt: number) => reduceConquest(s, { type: 'tick', dt });
const settle = (s: ConquestState) => tick(s, MOVE_GUARD_MS);
const median = (values: number[]) => {
  const s = values.slice().sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};

/** Roads between two territories on the shortest way (breadth-first), Infinity when not connected. */
function roadsBetween(map: ConquestMap, from: number, to: number): number {
  const seen = new Map<number, number>([[from, 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift() as number;
    for (const n of neighboursOf(map, at)) {
      if (seen.has(n)) continue;
      seen.set(n, (seen.get(at) as number) + 1);
      queue.push(n);
    }
  }
  return seen.get(to) ?? Infinity;
}

describe('Bataille de Nombres engine (AC-98)', () => {
  it('AC-98: the 3 fixed maps have 5, 6 and 7 territories, are connected, and the two camps start far apart', () => {
    expect(CONQUEST_MAPS.map((m) => m.spots.length)).toEqual([5, 6, 7]);
    expect(CONQUEST_BATTLES).toBe(3);
    for (const map of CONQUEST_MAPS) {
      const n = map.spots.length;
      for (const spot of map.spots) {
        expect(spot.x).toBeGreaterThanOrEqual(0);
        expect(spot.x).toBeLessThanOrEqual(1);
        expect(spot.y).toBeGreaterThanOrEqual(0);
        expect(spot.y).toBeLessThanOrEqual(1);
      }
      // Territories never overlap on screen (their size is a fifth of the board).
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) expect(Math.hypot(map.spots[a].x - map.spots[b].x, map.spots[a].y - map.spots[b].y)).toBeGreaterThan(0.3);
      for (const [a, b] of map.roads) {
        expect(a).toBeLessThan(b);
        expect(b).toBeLessThan(n);
        expect(joined(map, a, b) && joined(map, b, a)).toBe(true);
      }
      expect(new Set(map.roads.map(([a, b]) => `${a}-${b}`)).size).toBe(map.roads.length);
      for (let i = 0; i < n; i++) expect(roadsBetween(map, map.player, i)).toBeLessThan(Infinity);
      // Never neighbours, and no other pair of territories is further apart.
      const furthest = Math.max(...map.spots.flatMap((_, a) => map.spots.map((__, b) => roadsBetween(map, a, b))));
      expect(roadsBetween(map, map.player, map.enemy)).toBeGreaterThanOrEqual(2);
      expect(roadsBetween(map, map.player, map.enemy)).toBe(furthest);
    }
  });

  it('AC-98: a battle starts with 10 blue units, 10 red units and neutrals of 2 to 8 seeded units, for every seed (200 seeds)', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const s = createConquest(seed * 104729 + 11);
      const map = CONQUEST_MAPS[0];
      expect(s.status).toBe('playing');
      expect(s.battle).toBe(1);
      expect(s.turn).toBe(0);
      expect(s.territories).toHaveLength(5);
      s.territories.forEach((t, i) => {
        if (i === map.player) expect(t).toEqual({ owner: 'player', units: START_UNITS });
        else if (i === map.enemy) expect(t).toEqual({ owner: 'enemy', units: START_UNITS });
        else {
          expect(t.owner).toBe('neutral');
          expect(t.units).toBeGreaterThanOrEqual(NEUTRAL_MIN_UNITS);
          expect(t.units).toBeLessThanOrEqual(NEUTRAL_MAX_UNITS);
          seen.add(t.units);
        }
      });
      expect(acceptsInput(s)).toBe(true);
    }
    expect([START_UNITS, NEUTRAL_MIN_UNITS, NEUTRAL_MAX_UNITS]).toEqual([10, 2, 8]);
    expect([...seen].sort()).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(createConquest(5)).toEqual(createConquest(5));
    expect(show(createConquest(5))).not.toEqual(show(createConquest(6)));
  });

  it('AC-98: « Renforts » gives the player\'s first territory +2 / +4 / +6 units, in every battle', () => {
    expect(REINFORCE_UNITS).toBe(2);
    for (const level of [0, 1, 2, 3]) {
      let s = createConquest(9, { reinforce: level });
      for (let k = 1; k <= CONQUEST_BATTLES; k++) {
        const map = CONQUEST_MAPS[k - 1];
        expect(s.battle).toBe(k);
        expect(s.territories[map.player]).toEqual({ owner: 'player', units: 10 + 2 * level });
        expect(s.territories[map.enemy]).toEqual({ owner: 'enemy', units: 10 });
        s = tick(settle(pass({ ...s, turn: TURNS - 1 })), BATTLE_SHOW_MS);
      }
    }
  });

  it('AC-98: a move sends all units but one; onto an own territory they add up', () => {
    const s0 = battle(['p10', 'n3', 'n5', 'p4', 'e10']);
    const s1 = tap(s0, 0);
    expect(s1.selected).toBe(0);
    expect(s1.events).toEqual([{ kind: 'select', territory: 0 }]);
    const s2 = tap(s1, 3);
    expect(show(s2)).toEqual(['p1', 'n3', 'n5', 'p13', 'e10']);
    expect(s2.selected).toBeNull();
    expect(s2.events).toEqual([{ kind: 'move', by: 'player', from: 0, to: 3, sent: 9, taken: false }]);
    expect(march(lands(['p2', 'p1']), 0, 1)).toEqual({ territories: lands(['p1', 'p2']), sent: 1, taken: false });
  });

  it('AC-98: units that outnumber the units there take the territory, which holds the difference; else its units drop by the number sent (0 stays to its owner)', () => {
    // 9 against 3: taken with 6.
    expect(show(tap(tap(battle(['p10', 'n3', 'n5', 'n2', 'e10']), 0), 1))).toEqual(['p1', 'p6', 'n5', 'n2', 'e10']);
    // 4 against 8: lowered to 4, still neutral.
    const lowered = tap(tap(battle(['p5', 'n8', 'n5', 'n2', 'e10']), 0), 1);
    expect(show(lowered)).toEqual(['p1', 'n4', 'n5', 'n2', 'e10']);
    expect(lowered.events).toEqual([{ kind: 'move', by: 'player', from: 0, to: 1, sent: 4, taken: false }]);
    // 4 against 4: 0 units, stays to its owner; anything then takes it.
    expect(show(tap(tap(battle(['p5', 'n4', 'n5', 'n2', 'e10']), 0), 1))).toEqual(['p1', 'n0', 'n5', 'n2', 'e10']);
    expect(march(lands(['p2', 'e0']), 0, 1)).toEqual({ territories: lands(['p1', 'p1']), sent: 1, taken: true });
    // The same rules against the enemy.
    expect(march(lands(['p8', 'e7']), 0, 1)).toEqual({ territories: lands(['p1', 'e0']), sent: 7, taken: false });
    expect(march(lands(['p9', 'e7']), 0, 1)).toEqual({ territories: lands(['p1', 'p1']), sent: 8, taken: true });
  });

  it('AC-98: only an own territory with 2 units or more is selected; tapping it again unselects it; only a joined territory is marched onto', () => {
    const s0 = battle(['p5', 'p1', 'n3', 'p5', 'e10']);
    for (const territory of [1, 2, 4]) {
      // 1 unit only, neutral, enemy: no selection.
      expect(tap(s0, territory).selected).toBeNull();
      expect(tap(s0, territory).events).toEqual([]);
    }
    const s1 = tap(s0, 0);
    expect(tap(s1, 0).selected).toBeNull();
    expect(tap(s1, 0).events).toEqual([{ kind: 'select', territory: null }]);
    // 4 is not joined to 0: nothing changes, the selection stays.
    const far = tap(s1, 4);
    expect(far.territories).toBe(s1.territories);
    expect(far.selected).toBe(0);
    expect(far.busyMs).toBe(0);
    // An own territory that is not joined (1 and 3 share no road) is selected instead.
    const other = battle(['n5', 'p5', 'n3', 'p5', 'e10']);
    expect(tap(tap(other, 1), 3).selected).toBe(3);
    expect(tap(tap(other, 1), 3).territories).toBe(other.territories);
    // Out of range or not an index: nothing.
    for (const bad of [-1, 5, 1.5, NaN]) expect(tap(s1, bad)).toEqual({ ...s1, events: [] });
    expect(legalMoves(CONQUEST_MAPS[0], s0.territories, 'player')).toEqual([
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 0, to: 3 },
      { from: 3, to: 0 },
      { from: 3, to: 2 },
      { from: 3, to: 4 },
    ]);
  });

  it('AC-98: the enemy plays the attack that takes a territory with the most units left', () => {
    const map = CONQUEST_MAPS[0];
    // 9 units march from 4: they would leave 6 on 1, 4 on 2, 7 on 3.
    expect(enemyMove(map, lands(['p10', 'n3', 'n5', 'n2', 'e10']))).toEqual({ from: 4, to: 3 });
    // A tie goes to the lowest index.
    expect(enemyMove(map, lands(['p10', 'n3', 'n5', 'n3', 'e10']))).toEqual({ from: 4, to: 1 });
    // The player's territories are attacked by the same rule; a territory that cannot be taken is left alone.
    expect(enemyMove(map, lands(['p1', 'n8', 'p2', 'n8', 'e6']))).toEqual({ from: 4, to: 2 });
    // The best attack over all its territories.
    expect(enemyMove(map, lands(['p3', 'e12', 'n9', 'n2', 'e6']))).toEqual({ from: 1, to: 0 });
    // Deterministic.
    expect(enemyMove(map, lands(['p10', 'n3', 'n5', 'n2', 'e10']))).toEqual(enemyMove(map, lands(['p10', 'n3', 'n5', 'n2', 'e10'])));
  });

  it('AC-98: without such an attack the enemy moves from its strongest territory onto its weakest neighbour it owns, else it passes', () => {
    const map = CONQUEST_MAPS[0];
    // 4 (9 units) is the strongest; it owns the neighbours 1 (3 units) and 3 (5 units).
    expect(enemyMove(map, lands(['p20', 'e3', 'p20', 'e5', 'e9']))).toEqual({ from: 4, to: 1 });
    expect(enemyMove(map, lands(['p20', 'e3', 'p20', 'e7', 'e5']))).toEqual({ from: 3, to: 4 });
    // Nothing to take, no neighbour it owns, or a single unit: it passes.
    expect(enemyMove(map, lands(['p20', 'n20', 'n20', 'n20', 'e10']))).toBeNull();
    expect(enemyMove(map, lands(['p20', 'n20', 'e1', 'n20', 'e1']))).toBeNull();
    // Reading: the strongest territory among those that own a neighbour (5 has none on the hexagon map).
    expect(enemyMove(CONQUEST_MAPS[1], lands(['p30', 'e3', 'e4', 'n20', 'n20', 'e9']))).toEqual({ from: 2, to: 1 });
  });

  it('AC-98: the enemy answers the move (or the pass), then every territory owned by the player or the enemy gains 1 unit', () => {
    expect(GROWTH).toBe(1);
    const s1 = pass(battle(['p10', 'n3', 'n5', 'n2', 'e10']));
    expect(s1.events).toEqual([{ kind: 'pass', by: 'player' }]);
    expect(s1.turn).toBe(0);
    // Nothing before the answer time.
    const before = tick(s1, ANSWER_AT_MS - 50);
    expect(show(before)).toEqual(['p10', 'n3', 'n5', 'n2', 'e10']);
    const s2 = tick(before, 50);
    expect(s2.events).toEqual([{ kind: 'move', by: 'enemy', from: 4, to: 3, sent: 9, taken: true }, { kind: 'grow' }]);
    expect(show(s2)).toEqual(['p11', 'n3', 'n5', 'e8', 'e2']);
    expect(s2.turn).toBe(1);
    expect(s2.answer).toEqual({ from: 4, to: 3 });
    expect(s2.busyMs).toBe(MOVE_GUARD_MS - ANSWER_AT_MS);
    // The same result whatever the tick grouping.
    expect(show(settle(s1))).toEqual(show(s2));
    expect(settle(s1).turn).toBe(1);
    // After a march: the answer comes on the new position; an enemy without a move passes, then all grow.
    const marched = settle(tap(tap(battle(['p10', 'n3', 'n20', 'n20', 'e2']), 0), 1));
    expect(show(marched)).toEqual(['p2', 'p7', 'n20', 'n20', 'e3']);
    expect(marched.answer).toBe('pass');
    expect(marched.events).toEqual([{ kind: 'pass', by: 'enemy' }, { kind: 'grow' }]);
  });

  it('AC-98: a battle ends when the enemy owns nothing: 60 per territory owned + 200 + 10 per turn not played; it is a combo', () => {
    expect([TERRITORY_POINTS, WIN_POINTS, TURN_LEFT_POINTS, TURNS]).toEqual([60, 200, 10, 15]);
    const s = tap(tap(battle(['p2', 'n3', 'p10', 'n2', 'e4'], { turn: 4, score: 70 }), 2), 4);
    expect(show(s)).toEqual(['p2', 'n3', 'p1', 'n2', 'p5']);
    // 3 territories, won on the 5th turn: 180 + 200 + 10 × 10.
    expect(s.turn).toBe(5);
    expect(s.score).toBe(70 + 480);
    expect(s.combos).toBe(1);
    expect(s.events).toEqual([
      { kind: 'move', by: 'player', from: 2, to: 4, sent: 9, taken: true },
      { kind: 'battle', battle: 1, won: true, lost: false, points: 480 },
      { kind: 'score', points: 480 },
      { kind: 'combo' },
    ]);
    // No answer, no growth: the battle is on show.
    expect(s.answerDue).toBe(false);
    expect(s.doneMs).toBe(BATTLE_SHOW_MS);
    expect(battleScore(lands(['p1', 'p1', 'p1', 'p1', 'p1']), 15)).toBe(500);
    expect(battleScore(lands(['p1', 'p1', 'p1', 'p1', 'p1']), 3)).toBe(620);
  });

  it('AC-98: a battle ends after 15 turns with 60 per territory owned, and scores 0 when the player owns nothing', () => {
    // The enemy (2 units, +1 per turn) can take nothing and owns no neighbour: it passes every turn.
    let s = battle(['p10', 'n40', 'n40', 'p30', 'e2']);
    for (let turn = 1; turn <= TURNS; turn++) {
      expect(s.doneMs).toBe(0);
      s = settle(pass(s));
      expect(s.turn).toBe(turn);
    }
    expect(s.doneMs).toBe(BATTLE_SHOW_MS);
    expect(s.score).toBe(120);
    expect(s.combos).toBe(0);
    expect(s.events.slice(-2)).toEqual([
      { kind: 'battle', battle: 1, won: false, lost: false, points: 120 },
      { kind: 'score', points: 120 },
    ]);
    expect(battleScore(lands(['p1', 'n1', 'e1']), 15)).toBe(60);

    // The enemy takes the player's last territory: lost, 0 points.
    const lost = settle(pass(battle(['p2', 'e10', 'n20', 'n20', 'e1'], { turn: 2, score: 300 })));
    expect(ownedBy(lost.territories, 'player')).toBe(0);
    expect(lost.score).toBe(300);
    expect(lost.combos).toBe(0);
    expect(lost.events).toEqual([
      { kind: 'move', by: 'enemy', from: 1, to: 0, sent: 9, taken: true },
      { kind: 'grow' },
      { kind: 'battle', battle: 1, won: false, lost: true, points: 0 },
    ]);
    expect(lost.doneMs).toBe(BATTLE_SHOW_MS);
    expect(battleScore(lands(['e1', 'n1', 'e1']), 4)).toBe(0);
  });

  it('AC-98: a finished battle stays shown 900 ms (taps ignored), then the next map comes; the round is the 3 maps of 5, 6 and 7 territories', () => {
    expect(BATTLE_SHOW_MS).toBe(900);
    let s = createConquest(77);
    const sizes: number[] = [];
    for (let k = 1; k <= CONQUEST_BATTLES; k++) {
      expect(s.battle).toBe(k);
      expect(s.turn).toBe(0);
      expect(s.selected).toBeNull();
      sizes.push(s.territories.length);
      s = settle(pass({ ...s, turn: TURNS - 1 }));
      expect(s.doneMs).toBe(BATTLE_SHOW_MS);
      expect(acceptsInput(s)).toBe(false);
      expect(tap(s, CONQUEST_MAPS[k - 1].player)).toEqual({ ...s, events: [{ kind: 'ignored' }] });
      expect(pass(s)).toEqual({ ...s, events: [{ kind: 'ignored' }] });
      s = tick(s, BATTLE_SHOW_MS - 50);
      expect(s.battle).toBe(k);
      expect(s.status).toBe('playing');
      const score = s.score;
      s = tick(s, 50);
      expect(s.score).toBe(score);
      if (k < CONQUEST_BATTLES) expect(s.events).toEqual([{ kind: 'map', battle: k + 1 }]);
    }
    expect(sizes).toEqual([5, 6, 7]);
    expect(s.status).toBe('over');
    expect(s.events).toEqual([{ kind: 'over', score: s.score }]);
    expect(s.score).toBeGreaterThan(0);
    // Nothing moves once the round is over.
    const quiet = tick(s, 50);
    expect(quiet.events).toEqual([]);
    expect(tap(quiet, 0)).toBe(quiet);
    expect(pass(quiet)).toBe(quiet);
  });

  it('AC-108: the input guard ignores taps and « Passer » for 600 ms after a move; an input during the guard changes nothing', () => {
    expect(MOVE_GUARD_MS).toBe(600);
    const s1 = tap(tap(battle(['p10', 'n3', 'n5', 'p4', 'e2']), 0), 1);
    expect(s1.busyMs).toBe(MOVE_GUARD_MS);
    expect(acceptsInput(s1)).toBe(false);
    let s = s1;
    for (let elapsed = 0; elapsed < MOVE_GUARD_MS; elapsed += 50) {
      for (const territory of [0, 1, 3, 4]) expect(tap(s, territory)).toEqual({ ...s, events: [{ kind: 'ignored' }] });
      expect(pass(s)).toEqual({ ...s, events: [{ kind: 'ignored' }] });
      s = tick(s, 50);
    }
    expect(s.busyMs).toBe(0);
    expect(s.turn).toBe(1);
    expect(acceptsInput(s)).toBe(true);
    expect(tap(s, 3).selected).toBe(3);
    // Nothing runs: the same state comes back (no re-render).
    expect(tick(s, 50)).toBe(s);
    expect(tick(s1, 0)).toEqual({ ...s1, events: [] });
  });
});

describe('Bataille de Nombres casual bot (AC-108)', () => {
  it('AC-108: the casual bot takes the territory that leaves it the most units, never leaving one of its own within reach of the enemy, else it passes', () => {
    // Every attack would leave a territory weaker than the 9 units the enemy can send: it waits.
    const threatened = battle(['p10', 'n3', 'n5', 'n2', 'e10']);
    expect(exposedAfter(threatened, { from: 0, to: 3 })).toBe(true);
    expect(casualConquestMove(threatened)).toBeNull();
    // Against 5 enemy units (4 sent): 0 → 3 leaves 7 units there, the most.
    const safe = battle(['p10', 'n3', 'n5', 'n2', 'e5']);
    expect(exposedAfter(safe, { from: 0, to: 3 })).toBe(false);
    expect(casualConquestMove(safe)).toEqual({ from: 0, to: 3 });
    // Nothing can be taken: pass.
    expect(casualConquestMove(battle(['p3', 'n8', 'n8', 'n8', 'e2']))).toBeNull();
    expect(BOT_ERROR_RATE).toBeGreaterThan(0);
    expect(playConquestBot(3)).toEqual(playConquestBot(3));
  });

  describe('balance over 50 seeds', () => {
    const finals = Array.from({ length: 50 }, (_, i) => playConquestBot(i + 1));

    it('AC-108: every seed starts and finishes a round of 3 battles', () => {
      for (const s of finals) {
        expect(s.status).toBe('over');
        expect(s.battle).toBe(CONQUEST_BATTLES);
        expect(s.score).toBeGreaterThanOrEqual(0);
      }
    });

    it('AC-108: the casual bot median reaches the 1-star threshold and stays below the 3-star threshold', () => {
      const m = median(finals.map((s) => s.score));
      const stars = gameById('conquest').stars;
      expect(m).toBeGreaterThanOrEqual(stars[0]);
      expect(m).toBeLessThan(stars[2]);
    });

    it('AC-108: an input during the input guard changes nothing, for every seed', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const guarded = pass(createConquest(seed));
        expect(guarded.busyMs).toBe(MOVE_GUARD_MS);
        expect(tap(guarded, CONQUEST_MAPS[0].player)).toEqual({ ...guarded, events: [{ kind: 'ignored' }] });
        expect(pass(guarded)).toEqual({ ...guarded, events: [{ kind: 'ignored' }] });
      }
    });
  });
});

describe('Bataille de Nombres sprites', () => {
  it('one emblem per owner with its own silhouette and colour, and a 12×12 icon', () => {
    const emblems = Object.values(OWNER_EMBLEMS);
    expect(new Set(emblems.map((s) => s.rows.join('\n'))).size).toBe(3);
    expect(new Set(Object.values(OWNER_COLORS)).size).toBe(3);
    for (const sprite of [...emblems, ICON]) expect(validateSprite(sprite)).toEqual([]);
    for (const sprite of emblems) expect(spriteSize(sprite)).toEqual({ width: 7, height: 7 });
    expect(spriteSize(ICON)).toEqual({ width: 12, height: 12 });
  });
});
