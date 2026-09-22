import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { radius, space, useTheme } from './theme';

type Kind = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  kind?: Kind;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, kind = 'primary', loading = false, disabled, style, ...rest }: Props) {
  const { c } = useTheme();
  const bg = { primary: c.accent, secondary: c.surfaceAlt, ghost: 'transparent', danger: 'transparent' }[kind];
  const fg = { primary: c.onAccent, secondary: c.ink, ghost: c.accent, danger: c.danger }[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, opacity: inactive ? 0.5 : pressed ? 0.75 : 1 },
        kind === 'danger' && { borderWidth: StyleSheet.hairlineWidth, borderColor: c.danger },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text variant="heading" style={{ color: fg }}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 46, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
