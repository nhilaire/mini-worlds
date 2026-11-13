// Placeholder screen of « treasure » until its engine and board land (docs/PLAN.md v0.3.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function TreasureGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'treasure', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game="treasure" frame={frame} score={0} hud={null} testID="treasure-screen">
      {null}
    </GameFrame>
  );
}
