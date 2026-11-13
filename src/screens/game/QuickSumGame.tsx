// Placeholder screen of « quicksum » until its engine and board land (docs/PLAN.md v0.3.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function QuickSumGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'quicksum', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game="quicksum" frame={frame} score={0} hud={null} testID="quicksum-screen">
      {null}
    </GameFrame>
  );
}
