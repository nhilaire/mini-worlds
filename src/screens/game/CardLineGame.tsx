// Placeholder screen of « cardline » until its engine and board land (docs/PLAN.md v0.3.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function CardLineGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'cardline', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game="cardline" frame={frame} score={0} hud={null} testID="cardline-screen">
      {null}
    </GameFrame>
  );
}
