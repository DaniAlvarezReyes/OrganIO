import { useColorScheme } from 'react-native';

/**
 * Tokens de diseño. Un único elemento con carácter —el hilo que se vuelve ámbar al
 * estancarse— y todo lo demás sobrio: tipografía del sistema, grises fríos, sin sombras.
 */
export const palettes = {
  light: {
    bg: '#F4F5F7',
    surface: '#FFFFFF',
    surfaceAlt: '#ECEEF2',
    ink: '#1A2030',
    inkSoft: '#5E6678',
    inkFaint: '#8A91A0',
    line: '#E2E5EB',
    accent: '#3552C7',
    onAccent: '#FFFFFF',
    threadFresh: '#3552C7',
    threadStale: '#E09B12',
    staleText: '#9A6200',
    danger: '#B93A2B',
    ok: '#2F7D5B',
  },
  dark: {
    bg: '#12151C',
    surface: '#1A1E27',
    surfaceAlt: '#232835',
    ink: '#E8EAF0',
    inkSoft: '#A3AABA',
    inkFaint: '#6F7687',
    line: '#2A303D',
    accent: '#7D93F0',
    onAccent: '#0E1220',
    threadFresh: '#7D93F0',
    threadStale: '#F0B23A',
    staleText: '#F0B23A',
    danger: '#F07A6A',
    ok: '#5FC39A',
  },
} as const;

export type Palette = { [K in keyof typeof palettes.light]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 } as const;
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const type = {
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
} as const;

export const layout = { maxWidth: 680 } as const;

export function useTheme(): { c: Palette; dark: boolean } {
  const dark = useColorScheme() === 'dark';
  return { c: dark ? palettes.dark : palettes.light, dark };
}
