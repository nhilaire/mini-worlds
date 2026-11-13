// Placeholder screen of « marbles » until its engine and board land (docs/PLAN.md v0.3.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function MarblesGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'marbles', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game="marbles" frame={frame} score={0} hud={null} testID="marbles-screen">
      {null}
    </GameFrame>
  );
}
