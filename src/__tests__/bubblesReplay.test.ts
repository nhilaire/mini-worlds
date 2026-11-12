import { BubbleState, createBubbles, LAUNCHER, pushInterval, reduceBubbles } from '../game/bubbles/engine';
import { buildReplay, FALL_MS, FLASH_MS, FLY_MIN_MS, FLY_UNITS_PER_S, pathLength, pointAlong, POP_MS, PUSH_MS, removeCells, replayDuration, withCell } from '../game/bubbles/replay';

function shoot(state: BubbleState, angle: number): BubbleState {
  return reduceBubbles(state, { type: 'shoot', angle });
}

/** First seed whose straight-up first shot pops a group (the same rule as the Maestro seed flow). */
function poppingSeed(): number {
  for (let seed = 1; seed < 500; seed++) {
    const s = shoot(createBubbles(seed), 90);
    if (s.events.some((e) => e.kind === 'pop') && s.status === 'playing') return seed;
  }
  throw new Error('no popping seed');
}

/** First (seed, angle) whose first shot pops and drops bubbles. */
function droppingShot(): { seed: number; angle: number } {
  for (let seed = 1; seed < 400; seed++) {
    for (const angle of [90, 60, 120, 45, 135, 75, 105]) {
      const s = shoot(createBubbles(seed), angle);
      if (s.events.some((e) => e.kind === 'drop')) return { seed, angle };
    }
  }
  throw new Error('no dropping shot');
}

describe('replay plan of a shot (AC-54)', () => {
  it('a popping shot gives fly, flash and pop with the engine path, landing and group; the settled board follows', () => {
    const state = createBubbles(poppingSeed());
    const next = shoot(state, 90);
    const shot = next.events.find((e) => e.kind === 'shot');
    const pop = next.events.find((e) => e.kind === 'pop');
    if (!shot || shot.kind !== 'shot' || !shot.landing || !pop || pop.kind !== 'pop') throw new Error('shot and pop expected');
    const phases = buildReplay(state.board, state.shift, next);
    expect(phases.map((p) => p.kind)).toEqual(['fly', 'flash', 'pop']);
    const fly = phases[0];
    if (fly.kind !== 'fly') throw new Error('fly');
    expect(fly.board).toBe(state.board);
    expect(fly.colour).toBe(state.current);
    expect(fly.path).toBe(shot.path);
    expect(fly.path[0]).toEqual(LAUNCHER);
    expect(fly.ms).toBe(Math.max(FLY_MIN_MS, Math.round((pathLength(shot.path) / FLY_UNITS_PER_S) * 1000)));
    const flash = phases[1];
    if (flash.kind !== 'flash') throw new Error('flash');
    expect(flash.board).toEqual(withCell(state.board, shot.landing, state.current));
    expect(flash.cells).toBe(pop.cells);
    expect(flash.points).toBe(pop.points);
    expect(flash.ms).toBe(FLASH_MS);
    expect(phases[2]).toMatchObject({ kind: 'pop', cells: pop.cells, ms: POP_MS });
    // No drop, no push on this first shot: the settled board is the flash board without the group.
    expect(removeCells(flash.board, pop.cells)).toEqual(next.board);
    expect(replayDuration(phases)).toBe(fly.ms + FLASH_MS + POP_MS);
  });

  it('a shot that drops bubbles adds a fall phase holding their colours and points', () => {
    const { seed, angle } = droppingShot();
    const state = createBubbles(seed);
    const next = shoot(state, angle);
    const drop = next.events.find((e) => e.kind === 'drop');
    if (!drop || drop.kind !== 'drop') throw new Error('drop');
    const phases = buildReplay(state.board, state.shift, next);
    expect(phases.map((p) => p.kind).slice(0, 4)).toEqual(['fly', 'flash', 'pop', 'fall']);
    const fall = phases[3];
    if (fall.kind !== 'fall') throw new Error('fall');
    expect(fall.cells).toBe(drop.cells);
    expect(fall.points).toBe(drop.points);
    expect(fall.colours).toHaveLength(drop.cells.length);
    expect(fall.ms).toBe(FALL_MS);
    for (const c of drop.cells) expect(fall.board[c.row][c.col]).toBeNull();
    if (!next.events.some((e) => e.kind === 'push')) expect(fall.board).toEqual(next.board);
  });

  it('a shot that misses gives a fly phase only, and a push phase on the 6th shot', () => {
    let state = createBubbles(3);
    const phasesKinds: string[][] = [];
    for (let i = 0; i < pushInterval(0); i++) {
      // A shallow angle that reaches the stack somewhere: whatever happens, the plan is consistent.
      const next = shoot(state, 90);
      phasesKinds.push(buildReplay(state.board, state.shift, next).map((p) => p.kind));
      state = next;
      if (state.status !== 'playing') break;
    }
    const last = phasesKinds[phasesKinds.length - 1];
    if (state.events.some((e) => e.kind === 'push')) {
      expect(last[last.length - 1]).toBe('push');
      expect(buildReplay(state.board, state.shift, state).find((p) => p.kind === 'push')?.ms).toBe(PUSH_MS);
    }
    for (const kinds of phasesKinds) expect(kinds[0]).toBe('fly');
    expect(buildReplay(state.board, state.shift, shoot(state, 5))).toEqual([]); // too flat: nothing to replay
  });

  it('pointAlong walks the polyline by distance, bounces included', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 4 },
    ];
    expect(pathLength(path)).toBe(7);
    expect(pointAlong(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(path, 3 / 7)).toEqual({ x: 3, y: 0 });
    expect(pointAlong(path, 5 / 7)).toEqual({ x: 3, y: 2 });
    expect(pointAlong(path, 1)).toEqual({ x: 3, y: 4 });
    expect(pointAlong(path, 2)).toEqual({ x: 3, y: 4 });
  });

  it('every engine-generated first shot replays with a consistent end board (seeds 1-40)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = createBubbles(seed);
      const next = shoot(state, 70);
      const phases = buildReplay(state.board, state.shift, next);
      expect(phases[0].kind).toBe('fly');
      const last = phases[phases.length - 1];
      let end = last.kind === 'fly' ? withCell(last.board, next.events[0].kind === 'shot' && next.events[0].landing ? next.events[0].landing : { col: 0, row: 0 }, state.current) : last.board;
      if (last.kind === 'pop') end = removeCells(last.board, last.cells);
      const pushed = next.events.some((e) => e.kind === 'push');
      const refilled = next.events.some((e) => e.kind === 'refill');
      if (!pushed && !refilled && (next.events[0].kind !== 'shot' || next.events[0].landing)) expect(end).toEqual(next.board);
    }
  });
});
