// Draws a pixel sprite (src/art/sprites.ts) in a small Skia canvas: one filled rect per pixel, recorded once per
// sprite/scale/tint into a Skia picture and replayed on every frame. Drawing is proven by Maestro screenshots.
import { Canvas, createPicture, Picture, Skia, SkPicture } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { PALETTE, PaletteColor } from '../art/palette';
import { Sprite, spriteSize } from '../art/sprites';

export type Tint = Partial<Record<PaletteColor, string>>;

/** Hex colour of a legend entry, with optional per-colour overrides (block tiles are tinted per piece). */
export function resolveColor(color: PaletteColor, tint?: Tint): string {
  return tint?.[color] ?? PALETTE[color];
}

export function recordSprite(sprite: Sprite, scale: number, tint?: Tint): SkPicture {
  const { width, height } = spriteSize(sprite);
  return createPicture((canvas) => {
    const paint = Skia.Paint();
    sprite.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        const color = resolveColor(sprite.legend[ch], tint);
        if (color === 'transparent') continue;
        paint.setColor(Skia.Color(color));
        canvas.drawRect({ x: x * scale, y: y * scale, width: scale, height: scale }, paint);
      }
    });
  }, { x: 0, y: 0, width: width * scale, height: height * scale });
}

type Props = { sprite: Sprite; scale?: number; tint?: Tint; testID?: string; style?: object };

export function PixelSprite({ sprite, scale = 3, tint, testID, style }: Props) {
  const { width, height } = spriteSize(sprite);
  const picture = useMemo(() => recordSprite(sprite, scale, tint), [sprite, scale, tint]);
  return (
    <View testID={testID} style={[{ width: width * scale, height: height * scale }, style]} accessible={false}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
