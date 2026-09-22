import { Text as RNText, type TextProps } from 'react-native';
import { type as typeScale, useTheme } from './theme';

type Variant = keyof typeof typeScale;
type Tone = 'ink' | 'soft' | 'faint' | 'accent' | 'danger' | 'stale' | 'ok';

export function Text({ variant = 'body', tone = 'ink', style, ...rest }: TextProps & { variant?: Variant; tone?: Tone }) {
  const { c } = useTheme();
  const color = { ink: c.ink, soft: c.inkSoft, faint: c.inkFaint, accent: c.accent, danger: c.danger, stale: c.staleText, ok: c.ok }[tone];
  return <RNText {...rest} style={[typeScale[variant], { color }, style]} />;
}
