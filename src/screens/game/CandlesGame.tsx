// Placeholder screen of « candles » until its engine and board land (docs/PLAN.md v0.2.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function CandlesGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'candles', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game='candles' frame={frame} score={0} hud={null} testID='candles-screen'>
      {null}
    </GameFrame>
  );
}
