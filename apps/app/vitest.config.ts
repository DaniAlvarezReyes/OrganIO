import { defineConfig } from 'vitest/config';

// Solo lógica pura (sin React Native). La interfaz se verifica con el build web y a mano.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
