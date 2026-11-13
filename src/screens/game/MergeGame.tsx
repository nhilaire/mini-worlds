// Placeholder screen of « merge » until its engine and board land (docs/PLAN.md v0.3.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function MergeGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'merge', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game="merge" frame={frame} score={0} hud={null} testID="merge-screen">
      {null}
    </GameFrame>
  );
}
