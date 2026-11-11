import { StyleSheet, View } from 'react-native';

import { UI_SPRITES } from '../art/sprites';
import { STARS_PER_GAME } from '../game/core/content';
import { PixelSprite } from './PixelSprite';

/** Three star slots, `count` of them lit; `highlight` marks the newly earned ones (result screen). */
export function Stars({ count, scale = 3, highlight = 0, testID }: { count: number; scale?: number; highlight?: number; testID?: string }) {
  return (
    <View style={styles.row} testID={testID} accessibilityLabel={`${count}/${STARS_PER_GAME}`}>
      {Array.from({ length: STARS_PER_GAME }, (_, i) => (
        <PixelSprite key={i} sprite={i < count ? UI_SPRITES.star : UI_SPRITES.starEmpty} scale={scale} style={i >= count - highlight && i < count ? styles.highlight : undefined} testID={testID ? `${testID}-${i < count ? 'on' : 'off'}` : undefined} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  highlight: { transform: [{ scale: 1.15 }] },
});
