// Placeholder screen of « lights » until its engine and board land (docs/PLAN.md v0.2.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function LightsGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'lights', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game='lights' frame={frame} score={0} hud={null} testID='lights-screen'>
      {null}
    </GameFrame>
  );
}
