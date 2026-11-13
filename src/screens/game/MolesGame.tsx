// Placeholder screen of « moles » until its engine and board land (docs/PLAN.md v0.2.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function MolesGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'moles', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game='moles' frame={frame} score={0} hud={null} testID='moles-screen'>
      {null}
    </GameFrame>
  );
}
