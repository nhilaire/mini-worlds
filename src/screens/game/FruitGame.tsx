// Placeholder screen of « fruit » until its engine and board land (docs/PLAN.md v0.3.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function FruitGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'fruit', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game="fruit" frame={frame} score={0} hud={null} testID="fruit-screen">
      {null}
    </GameFrame>
  );
}
