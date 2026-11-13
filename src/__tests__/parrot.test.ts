import { createParrot, lightAt, litMs, Pad, ParrotState, reduceParrot, showSchedule } from '../game/parrot/engine';

/** Ends the show and repeats the whole current sequence. */
function repeat(state: ParrotState): ParrotState {
  let s = reduceParrot(state, { type: 'shown' });
  for (const pad of state.sequence) s = reduceParrot(s, { type: 'tap', pad });
  return s;
}

function wrongPad(pad: Pad): Pad {
  return ((pad + 1) % 4) as Pad;
}

describe('Perroquet Copieur engine (AC-67)', () => {
  it('starts with a sequence of length 1 being shown', () => {
    const s = createParrot(5);
    expect(s.sequence).toHaveLength(1);
    expect(s.phase).toBe('show');
    expect(s.chances).toBe(0);
    expect(createParrot(5, { second_chance: 2 }).chances).toBe(2);
  });

  it('AC-67: the sequence grows by one seeded pad and keeps its previous pads', () => {
    let s = createParrot(11);
    const seen: (readonly Pad[])[] = [s.sequence];
    for (let i = 0; i < 12; i++) {
      s = repeat(s);
      expect(s.sequence).toHaveLength(i + 2);
      expect(s.sequence.slice(0, -1)).toEqual(seen[seen.length - 1]);
      seen.push(s.sequence);
    }
    // Same seed, same pads; another seed, other pads.
    let t = createParrot(11);
    for (let i = 0; i < 12; i++) t = repeat(t);
    expect(t.sequence).toEqual(s.sequence);
    let u = createParrot(12);
    for (let i = 0; i < 12; i++) u = repeat(u);
    expect(u.sequence).not.toEqual(s.sequence);
    // Every pad shows up over many seeds.
    const pads = new Set<number>();
    for (let seed = 0; seed < 20; seed++) pads.add(createParrot(seed).sequence[0]);
    expect([...pads].sort()).toEqual([0, 1, 2, 3]);
  });

  it('AC-67: the display time follows the rules: 500 − 20 × (length − 1) ms, at least 250, 150 ms off, 600 ms before', () => {
    expect(litMs(1)).toBe(500);
    expect(litMs(2)).toBe(480);
    expect(litMs(10)).toBe(320);
    expect(litMs(13)).toBe(260);
    expect(litMs(14)).toBe(250);
    expect(litMs(30)).toBe(250);
    const schedule = showSchedule([0, 1, 2]);
    expect(schedule.lights).toEqual([
      { pad: 0, startMs: 600, endMs: 1060 },
      { pad: 1, startMs: 1210, endMs: 1670 },
      { pad: 2, startMs: 1820, endMs: 2280 },
    ]);
    expect(schedule.totalMs).toBe(2280);
    expect(lightAt(schedule, 0)).toBeNull();
    expect(lightAt(schedule, 599)).toBeNull();
    expect(lightAt(schedule, 600)).toEqual({ pad: 0, index: 0 });
    expect(lightAt(schedule, 1100)).toBeNull();
    expect(lightAt(schedule, 1300)).toEqual({ pad: 1, index: 1 });
    expect(lightAt(schedule, 2280)).toBeNull();
  });

  it('AC-67: a repeated pad shows two separate lights with a dark gap between them', () => {
    const schedule = showSchedule([3, 3]);
    expect(schedule.lights).toHaveLength(2);
    const [a, b] = schedule.lights;
    expect(a.pad).toBe(3);
    expect(b.pad).toBe(3);
    expect(b.startMs - a.endMs).toBe(150);
    expect(lightAt(schedule, a.endMs - 1)).toEqual({ pad: 3, index: 0 });
    expect(lightAt(schedule, a.endMs)).toBeNull();
    expect(lightAt(schedule, a.endMs + 149)).toBeNull();
    expect(lightAt(schedule, b.startMs)).toEqual({ pad: 3, index: 1 });
  });

  it('AC-67: inputs are ignored while the sequence is shown', () => {
    const s = createParrot(3);
    const tapped = reduceParrot(s, { type: 'tap', pad: s.sequence[0] });
    expect(tapped.phase).toBe('show');
    expect(tapped.score).toBe(0);
    expect(tapped.inputIndex).toBe(0);
    expect(tapped.events).toEqual([{ kind: 'ignored' }]);
    // A wrong pad during the show does not cost anything either.
    expect(reduceParrot(s, { type: 'tap', pad: wrongPad(s.sequence[0]) }).status).toBe('playing');
    // `shown` only ends a show.
    const input = reduceParrot(s, { type: 'shown' });
    expect(input.phase).toBe('input');
    expect(reduceParrot(input, { type: 'shown' })).toMatchObject({ phase: 'input', events: [] });
  });

  it('AC-67: a repeated sequence scores 10 × length and shows the next one', () => {
    let s = createParrot(8);
    s = repeat(s); // length 1
    expect(s.score).toBe(10);
    expect(s.phase).toBe('show');
    expect(s.showId).toBe(2);
    s = repeat(s); // length 2
    expect(s.score).toBe(30);
    s = repeat(s); // length 3
    expect(s.score).toBe(60);
    expect(s.events).toContainEqual({ kind: 'repeated', length: 3, points: 30 });
    // A partial repeat scores nothing yet.
    let p = reduceParrot(s, { type: 'shown' });
    p = reduceParrot(p, { type: 'tap', pad: s.sequence[0] });
    expect(p.score).toBe(60);
    expect(p.inputIndex).toBe(1);
    expect(p.events).toEqual([{ kind: 'pad', pad: s.sequence[0], index: 0 }]);
  });

  it('AC-67: a mistake uses a second chance (same sequence shown again) or ends the round', () => {
    let s = createParrot(21, { second_chance: 1 });
    s = repeat(repeat(s)); // length 3 now, score 30
    const sequence = s.sequence;
    let input = reduceParrot(s, { type: 'shown' });
    input = reduceParrot(input, { type: 'tap', pad: sequence[0] });
    const retry = reduceParrot(input, { type: 'tap', pad: wrongPad(sequence[1]) });
    expect(retry.status).toBe('playing');
    expect(retry.chances).toBe(0);
    expect(retry.phase).toBe('show');
    expect(retry.inputIndex).toBe(0);
    expect(retry.sequence).toEqual(sequence);
    expect(retry.showId).toBe(s.showId + 1);
    expect(retry.score).toBe(30);
    expect(retry.events[0]).toMatchObject({ kind: 'wrong', expected: sequence[1], chancesLeft: 0 });

    // No chance left: the round is over with the current score.
    const again = reduceParrot(retry, { type: 'shown' });
    const over = reduceParrot(again, { type: 'tap', pad: wrongPad(sequence[0]) });
    expect(over.status).toBe('over');
    expect(over.events).toContainEqual({ kind: 'over', score: 30 });
    expect(reduceParrot(over, { type: 'tap', pad: 0 }).events).toEqual([]);
  });

  it('AC-67: a combo for each sequence of length 5, 10, 15... repeated', () => {
    let s = createParrot(2);
    const combosAt: number[] = [];
    for (let length = 1; length <= 15; length++) {
      s = repeat(s);
      if (s.events.some((e) => e.kind === 'combo')) combosAt.push(length);
    }
    expect(combosAt).toEqual([5, 10, 15]);
    expect(s.combos).toBe(3);
    expect(s.score).toBe(10 * ((15 * 16) / 2));
  });
});
