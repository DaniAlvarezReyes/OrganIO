import { View } from 'react-native';
import { threadColor } from '../lib/color';
import { useTheme } from './theme';

/** El hilo: índigo cuando la tarea avanza, ámbar cuando se estanca. Gris si está cerrada. */
export function Thread({ ratio, closed = false }: { ratio: number; closed?: boolean }) {
  const { c } = useTheme();
  const color = closed ? c.line : threadColor(ratio, c.threadFresh, c.threadStale);
  return <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color }} />;
}
