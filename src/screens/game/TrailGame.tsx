// Placeholder screen of « trail » until its engine and board land (docs/PLAN.md v0.3.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function TrailGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'trail', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game="trail" frame={frame} score={0} hud={null} testID="trail-screen">
      {null}
    </GameFrame>
  );
}
