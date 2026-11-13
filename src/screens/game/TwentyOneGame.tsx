// Placeholder screen of « twentyone » until its engine and board land (docs/PLAN.md v0.2.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function TwentyOneGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'twentyone', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game='twentyone' frame={frame} score={0} hud={null} testID='twentyone-screen'>
      {null}
    </GameFrame>
  );
}
