// Picks the mini-game screen for a route; each screen hands the finished round back through onFinish.
import type { GameId } from '../../game/core/content';
import { BlocksGame } from './BlocksGame';
import { BubblesGame } from './BubblesGame';
import { TowerGame } from './TowerGame';
import { HopGame } from './HopGame';
import { LightsGame } from './LightsGame';
import { PipesGame } from './PipesGame';
import { FloodGame } from './FloodGame';
import { SocksGame } from './SocksGame';
import { TwentyOneGame } from './TwentyOneGame';
import { CandlesGame } from './CandlesGame';
import { ParrotGame } from './ParrotGame';
import { MolesGame } from './MolesGame';
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
    case 'tower':
      return <TowerGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'hop':
      return <HopGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'lights':
      return <LightsGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'pipes':
      return <PipesGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'flood':
      return <FloodGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'socks':
      return <SocksGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'twentyone':
      return <TwentyOneGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'candles':
      return <CandlesGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'parrot':
      return <ParrotGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'moles':
      return <MolesGame key={seed} seed={seed} onFinish={onFinish} />;
  }
}
