// Placeholder screen of « army » until its engine and board land (docs/PLAN.md v0.3.0 tasks).
import { GameFrame, OnFinish, useRoundFrame } from './GameFrame';

const STEPS = [] as const;

export function ArmyGame({ onFinish }: { seed: number; onFinish: OnFinish }) {
  const frame = useRoundFrame({ game: 'army', tutorialSteps: STEPS, onFinish, score: () => 0 });
  return (
    <GameFrame game="army" frame={frame} score={0} hud={null} testID="army-screen">
      {null}
    </GameFrame>
  );
}
