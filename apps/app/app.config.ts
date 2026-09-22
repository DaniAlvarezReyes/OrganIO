import type { ExpoConfig } from 'expo/config';

// Identificador de la app. Cámbialo por uno tuyo (dominio invertido) antes de publicar.
const bundleId = process.env.ORGANIO_BUNDLE_ID ?? 'dev.organio.app';

const config: ExpoConfig = {
  name: 'OrganIO',
  slug: 'organio',
  scheme: 'organio',
  version: '0.2.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: true,
  },
  android: {
    package: bundleId,
    allowBackup: false, // la sesión no debe acabar en copias de seguridad
    adaptiveIcon: {
      backgroundColor: '#3552C7',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    output: 'single',
    bundler: 'metro',
    favicon: './assets/favicon.png',
  },
  plugins: ['expo-router', 'expo-secure-store', 'expo-localization'],
};

export default config;
