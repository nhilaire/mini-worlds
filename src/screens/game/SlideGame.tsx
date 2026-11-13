// Placeholder screen of « slide » until its engine and board land (docs/PLAN.md v0.3.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function SlideGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'slide', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game="slide" frame={frame} score={0} hud={null} testID="slide-screen">
      {null}
    </GameFrame>
  );
}
