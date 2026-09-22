import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { radius, space, type as typeScale, useTheme } from './theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
}

export const TextField = forwardRef<TextInput, Props>(function TextField({ label, error, hint, style, ...rest }, ref) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? <Text variant="label" tone="soft">{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={c.inkFaint}
        accessibilityLabel={label}
        style={[
          typeScale.body,
          styles.input,
          { color: c.ink, backgroundColor: c.surface, borderColor: error ? c.danger : c.line },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="meta" tone="danger" accessibilityLiveRegion="polite">{error}</Text>
      ) : hint ? (
        <Text variant="meta" tone="faint">{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  input: { minHeight: 46, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1 },
});
