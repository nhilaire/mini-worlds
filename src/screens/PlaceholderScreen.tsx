// Temporary screen for routes not built yet (replaced task by task in docs/PLAN.md).
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { PixelText } from '../ui/Typography';

type Action = { testID: string; label: string; onPress: () => void };

export function PlaceholderScreen({ testID, title, actions = [] }: { testID: string; title: string; actions?: Action[] }) {
  return (
    <Screen testID={testID}>
      <PixelText>{title}</PixelText>
      {actions.map((a) => (
        <Button key={a.testID} testID={a.testID} label={a.label} onPress={a.onPress} variant="secondary" />
      ))}
    </Screen>
  );
}
