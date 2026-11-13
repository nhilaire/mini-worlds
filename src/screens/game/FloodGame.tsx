// Placeholder screen of « flood » until its engine and board land (docs/PLAN.md v0.2.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function FloodGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'flood', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game='flood' frame={frame} score={0} hud={null} testID='flood-screen'>
      {null}
    </GameFrame>
  );
}
