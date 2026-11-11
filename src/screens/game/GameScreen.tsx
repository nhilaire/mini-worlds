// Picks the mini-game screen for a route; each screen hands the finished round back through onFinish.
import type { GameId } from '../../game/core/content';
import { PlaceholderScreen } from '../PlaceholderScreen';
import { BlocksGame } from './BlocksGame';
import type { OnFinish } from './GameFrame';

export function GameScreen({ game, seed, onFinish }: { game: GameId; seed: number; onFinish: OnFinish }) {
  if (game === 'blocks') return <BlocksGame key={seed} seed={seed} onFinish={onFinish} />;
  return (
    <PlaceholderScreen
      testID={`${game}-screen`}
      title={game}
      actions={[{ testID: 'game-quit', label: 'quit', onPress: () => onFinish({ game, score: 0, durationS: 0, combos: 0, outcome: 'quit' }, 'result') }]}
    />
  );
}
