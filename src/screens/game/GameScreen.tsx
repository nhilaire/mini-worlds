// Picks the mini-game screen for a route; each screen hands the finished round back through onFinish.
import type { GameId } from '../../game/core/content';
import { BlocksGame } from './BlocksGame';
import { BubblesGame } from './BubblesGame';
import type { OnFinish } from './GameFrame';
import { GardenGame } from './GardenGame';

export function GameScreen({ game, seed, onFinish }: { game: GameId; seed: number; onFinish: OnFinish }) {
  switch (game) {
    case 'blocks':
      return <BlocksGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'garden':
      return <GardenGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'bubbles':
      return <BubblesGame key={seed} seed={seed} onFinish={onFinish} />;
  }
}
