import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { radius, space, useTheme } from './theme';

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'stale' | 'accent';
  accessibilityLabel?: string;
}

export function Chip({ label, selected = false, onPress, tone = 'default', accessibilityLabel }: Props) {
  const { c } = useTheme();
  const fg = selected ? c.onAccent : tone === 'stale' ? c.staleText : tone === 'accent' ? c.accent : c.inkSoft;
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected } : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? c.accent : c.surfaceAlt, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text variant="meta" style={{ color: fg }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: space.md, paddingVertical: 5, borderRadius: radius.pill },
});
