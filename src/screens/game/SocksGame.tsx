// Placeholder screen of « socks » until its engine and board land (docs/PLAN.md v0.2.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function SocksGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'socks', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game='socks' frame={frame} score={0} hud={null} testID='socks-screen'>
      {null}
    </GameFrame>
  );
}
