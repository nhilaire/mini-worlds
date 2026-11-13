// Placeholder screen of « maze » until its engine and board land (docs/PLAN.md v0.3.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function MazeGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'maze', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game="maze" frame={frame} score={0} hud={null} testID="maze-screen">
      {null}
    </GameFrame>
  );
}
