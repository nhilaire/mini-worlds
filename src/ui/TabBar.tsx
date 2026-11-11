import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI_SPRITES, WORLD_ICONS } from '../art/sprites';
import { useI18n } from '../i18n/I18nProvider';
import type { Tab } from '../navigation';
import { PixelSprite } from './PixelSprite';
import { useTheme } from './ThemeProvider';
import { PixelText } from './Typography';
import { spacing } from './theme';

const TABS: { tab: Tab; icon: keyof typeof UI_SPRITES | 'arcade' }[] = [
  { tab: 'home', icon: 'heart' },
  { tab: 'games', icon: 'arcade' },
  { tab: 'profile', icon: 'star' },
];

export function TabBar({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + spacing.xs }]} testID="tab-bar">
      {TABS.map(({ tab, icon }) => {
        const selected = tab === active;
        const sprite = icon === 'arcade' ? WORLD_ICONS.arcade : UI_SPRITES[icon];
        return (
          <Pressable
            key={tab}
            testID={`tab-${tab}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t.tabs[tab]}
            onPress={() => onSelect(tab)}
            style={[styles.tab, selected && { borderTopColor: colors.accent }]}
          >
            <PixelSprite sprite={sprite} scale={2} />
            <PixelText size={8} color={selected ? 'accent' : 'muted'}>
              {t.tabs[tab]}
            </PixelText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 2 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: 3, borderTopColor: 'transparent', minHeight: 56 },
});
