// Placeholder screen of « pipes » until its engine and board land (docs/PLAN.md v0.2.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function PipesGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'pipes', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game='pipes' frame={frame} score={0} hud={null} testID='pipes-screen'>
      {null}
    </GameFrame>
  );
}
