// Placeholder screen of « parrot » until its engine and board land (docs/PLAN.md v0.2.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function ParrotGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'parrot', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game='parrot' frame={frame} score={0} hud={null} testID='parrot-screen'>
      {null}
    </GameFrame>
  );
}
