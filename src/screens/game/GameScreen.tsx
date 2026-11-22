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
import { FruitGame } from './FruitGame';
import { SlideGame } from './SlideGame';
import { CardLineGame } from './CardLineGame';
import { MarblesGame } from './MarblesGame';
import { QuickSumGame } from './QuickSumGame';
import { ArmyGame } from './ArmyGame';
import { MergeGame } from './MergeGame';
import { MazeGame } from './MazeGame';
import { TrailGame } from './TrailGame';
import { TreasureGame } from './TreasureGame';
import { DashGame } from './DashGame';
import { TilesGame } from './TilesGame';
import { ConquestGame } from './ConquestGame';
import { DefenseGame } from './DefenseGame';
import { HandsGame } from './HandsGame';
import { PatienceGame } from './PatienceGame';
import { DartsGame } from './DartsGame';
import { ShotGame } from './ShotGame';
import { PatternGame } from './PatternGame';
import { ChainGame } from './ChainGame';
import { LaserGame } from './LaserGame';
import { TwinsGame } from './TwinsGame';

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
    case 'fruit':
      return <FruitGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'slide':
      return <SlideGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'cardline':
      return <CardLineGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'marbles':
      return <MarblesGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'quicksum':
      return <QuickSumGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'army':
      return <ArmyGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'merge':
      return <MergeGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'maze':
      return <MazeGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'trail':
      return <TrailGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'treasure':
      return <TreasureGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'dash':
      return <DashGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'tiles':
      return <TilesGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'conquest':
      return <ConquestGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'defense':
      return <DefenseGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'hands':
      return <HandsGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'patience':
      return <PatienceGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'darts':
      return <DartsGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'shot':
      return <ShotGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'pattern':
      return <PatternGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'chain':
      return <ChainGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'laser':
      return <LaserGame key={seed} seed={seed} onFinish={onFinish} />;
    case 'twins':
      return <TwinsGame key={seed} seed={seed} onFinish={onFinish} />;
  }
}
