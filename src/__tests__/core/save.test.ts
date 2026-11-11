import { completeTutorial, purchaseUpgrade, resetTutorial, settleRound } from '../../game/core/engine';
import { defaultSave, parseSave, resetProgress, SCHEMA_VERSION, serializeSave, totalStars } from '../../game/core/save';

describe('save model (AC-15)', () => {
  it('round-trips a full save', () => {
    let save = defaultSave();
    save = settleRound(save, { game: 'garden', score: 1600, durationS: 60, combos: 2, outcome: 'ended', date: '2026-11-11' }).save;
    save = purchaseUpgrade(save, 'garden', 'extra_move').save;
    save = completeTutorial(save, 'garden');
    save = { ...save, settings: { sound: false, vibrations: true, theme: 'dark' } };
    const { save: back, readOnly } = parseSave(serializeSave(save));
    expect(readOnly).toBe(false);
    expect(back).toEqual(save);
  });

  it('missing fields take defaults, unknown game ids and fields are preserved', () => {
    const stored = JSON.stringify({
      schemaVersion: 1,
      profile: { coins: 42 },
      games: { blocks: { stars: 2 }, future_game: { bestScore: 9, stars: 1 } },
      experimental: { flag: true },
    });
    const { save, readOnly } = parseSave(stored);
    expect(readOnly).toBe(false);
    expect(save.profile.coins).toBe(42);
    expect(save.profile.level).toBe(1);
    expect(save.games.blocks).toEqual({ bestScore: 0, stars: 2, rounds: 0, upgrades: {}, tutorialDone: false });
    expect(save.games.garden).toEqual(defaultSave().games.garden);
    expect(save.games.future_game).toEqual({ bestScore: 9, stars: 1 });
    expect(save.experimental).toEqual({ flag: true });
    expect(save.unlockedWorlds).toEqual(['arcade']);
    expect(JSON.parse(serializeSave(save)).games.future_game).toEqual({ bestScore: 9, stars: 1 });
    expect(totalStars(save)).toBe(2);
  });

  it('empty, corrupt or non-object input gives the defaults', () => {
    expect(parseSave(null)).toEqual({ save: defaultSave(), readOnly: false });
    expect(parseSave('')).toEqual({ save: defaultSave(), readOnly: false });
    expect(parseSave('{not json')).toEqual({ save: defaultSave(), readOnly: false });
    expect(parseSave('[1,2]')).toEqual({ save: defaultSave(), readOnly: false });
  });

  it('a higher schemaVersion is not understood: defaults in memory, read-only session', () => {
    const { save, readOnly } = parseSave(JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, profile: { coins: 9999 } }));
    expect(readOnly).toBe(true);
    expect(save).toEqual(defaultSave());
  });

  it('reset clears everything except the settings', () => {
    let save = defaultSave();
    save = settleRound(save, { game: 'blocks', score: 1600, durationS: 60, combos: 0, outcome: 'ended', date: '2026-11-11' }).save;
    save = { ...save, settings: { sound: false, vibrations: false, theme: 'light' } };
    const reset = resetProgress(save);
    expect(reset.profile).toEqual(defaultSave().profile);
    expect(reset.games).toEqual(defaultSave().games);
    expect(reset.unlockedWorlds).toEqual(['arcade']);
    expect(reset.achievements).toEqual([]);
    expect(reset.settings).toEqual({ sound: false, vibrations: false, theme: 'light' });
  });

  it('tutorial flags per game', () => {
    const done = completeTutorial(defaultSave(), 'bubbles');
    expect(done.games.bubbles.tutorialDone).toBe(true);
    expect(done.games.blocks.tutorialDone).toBe(false);
    expect(completeTutorial(done, 'bubbles')).toBe(done);
    expect(resetTutorial(done, 'bubbles').games.bubbles.tutorialDone).toBe(false);
  });
});
