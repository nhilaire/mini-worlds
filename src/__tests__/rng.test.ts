import { createRng, hashString, parseSeedLink, parseTestLink, randomSeed } from '../game/rng';

describe('seeded generator', () => {
  it('is deterministic for the same seed and differs for another seed', () => {
    const a = Array.from({ length: 20 }, () => createRng(42).next());
    const b = Array.from({ length: 20 }, () => createRng(42).next());
    const c = Array.from({ length: 20 }, () => createRng(43).next());
    const seqA = createRng(42);
    const seqB = createRng(42);
    expect(Array.from({ length: 20 }, () => seqA.next())).toEqual(Array.from({ length: 20 }, () => seqB.next()));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('stays in [0, 1) and int(n) in [0, n)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const k = rng.int(5);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(5);
    }
  });

  it('shuffles into a permutation without touching the input', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const out = createRng(3).shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out.slice().sort()).toEqual(items);
    expect(createRng(3).shuffle(items)).toEqual(out);
  });

  it('pick returns an element', () => {
    expect(['a', 'b']).toContain(createRng(1).pick(['a', 'b']));
  });
});

describe('hashString', () => {
  it('is stable and sensitive to the text', () => {
    expect(hashString('2026-11-11')).toBe(hashString('2026-11-11'));
    expect(hashString('2026-11-11')).not.toBe(hashString('2026-11-12'));
  });
});

describe('seed link', () => {
  it('parses miniworlds://seed/<n>', () => {
    expect(parseSeedLink('miniworlds://seed/1')).toBe(1);
    expect(parseSeedLink('miniworlds://seed/123456/')).toBe(123456);
  });

  it.each(['', 'miniworlds://seed/', 'miniworlds://seed/abc', 'other://seed/1', 'miniworlds://seed/99999999999', null, undefined])(
    'rejects %s',
    (url) => {
      expect(parseSeedLink(url)).toBeNull();
    },
  );

  it('parses the unlocked flag of the test link', () => {
    expect(parseTestLink('miniworlds://seed/7/unlocked')).toEqual({ seed: 7, unlocked: true });
    expect(parseTestLink('miniworlds://seed/7')).toEqual({ seed: 7, unlocked: false });
    expect(parseTestLink('miniworlds://seed/7/other')).toBeNull();
    expect(parseSeedLink('miniworlds://seed/7/unlocked')).toBe(7);
  });

  it('random seeds are 32-bit integers', () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
