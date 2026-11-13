// Placeholder screen of « tower » until its engine and board land (docs/PLAN.md v0.2.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function TowerGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'tower', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game='tower' frame={frame} score={0} hud={null} testID='tower-screen'>
      {null}
    </GameFrame>
  );
}
