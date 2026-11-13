// Placeholder screen of « hop » until its engine and board land (docs/PLAN.md v0.2.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function HopGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'hop', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game='hop' frame={frame} score={0} hud={null} testID='hop-screen'>
      {null}
    </GameFrame>
  );
}
