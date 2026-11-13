import fs from 'node:fs';
import path from 'node:path';

import { GAMES, WORLDS } from '../game/core/content';

// AC-70: the Maestro smoke flow of v0.2.0 opens each of the ten new games from its own world, in world display
// order (the world list only scrolls down between two games), through the /unlocked test link.
describe('v0.2.0 smoke flow (AC-70)', () => {
  const flow = fs.readFileSync(path.join(__dirname, '..', '..', '.maestro', 'new-games.yaml'), 'utf8');
  const helper = fs.readFileSync(path.join(__dirname, '..', '..', '.maestro', 'helpers', 'new-game.yaml'), 'utf8');

  it('opens the ten new games from their worlds in display order, through the /unlocked link', () => {
    const pairs = [...flow.matchAll(/WORLD: (\w+)\n\s+GAME: (\w+)/g)].map((m) => [m[1], m[2]]);
    const expected = WORLDS.flatMap((w) => w.games.filter((g) => !['blocks', 'garden', 'bubbles'].includes(g)).map((g) => [w.id, g]));
    expect(pairs).toEqual(expected);
    expect(pairs).toHaveLength(10);
    for (const [world, game] of pairs) expect(GAMES.find((g) => g.id === game)?.world).toBe(world);
    expect(flow).toMatch(/openLink: miniworlds:\/\/seed\/\d+\/unlocked/);
  });

  it('captures each game screen with its tutorial bubble, then Pause / Quitter reach the Result', () => {
    for (const step of ['id: "${GAME}-screen"', 'id: "tutorial-bubble"', 'takeScreenshot: newgame-${GAME}', 'id: "pause-quit"', 'id: "result-screen"']) {
      expect(helper).toContain(step);
    }
  });
});
