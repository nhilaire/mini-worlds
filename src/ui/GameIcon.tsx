import { StyleSheet, View } from 'react-native';

import { PALETTE, TETROMINO_COLORS } from '../art/palette';
import { BLOCK_TILE, BUBBLES, VEGETABLES } from '../art/sprites';
import type { GameId } from '../game/core/content';
import { PixelSprite } from './PixelSprite';
import { useTheme } from './ThemeProvider';
import { radius } from './theme';

/** Illustration of a game: a tinted block, a carrot, a bubble. `scale` is the sprite scale (12 px grid). */
export function GameIcon({ game, scale = 3, testID }: { game: GameId; scale?: number; testID?: string }) {
  const { colors } = useTheme();
  const size = 12 * scale + 8;
  return (
    <View testID={testID} style={[styles.box, { width: size, height: size, backgroundColor: colors.surfaceAlt }]}>
      {game === 'blocks' && <PixelSprite sprite={BLOCK_TILE} scale={scale * 1.5} tint={{ white: PALETTE[TETROMINO_COLORS.T], light: PALETTE.pink, shade: PALETTE.darkPurple }} />}
      {game === 'garden' && <PixelSprite sprite={VEGETABLES.carrot} scale={scale} />}
      {game === 'bubbles' && <PixelSprite sprite={BUBBLES.red} scale={scale} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
});
