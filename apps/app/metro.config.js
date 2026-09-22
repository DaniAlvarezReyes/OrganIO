// Configuración de Metro (empaquetador). Parte de la de Expo, que ya detecta el monorepo.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Seguridad: `decode-uri-component` 0.2.x (vía expo-router → query-string) es vulnerable a
// denegación de servicio con URLs mal formadas (GHSA-vcc3-ghjq-m6fr) y la versión corregida
// no es compatible con query-string. En el bundle se sustituye por una implementación propia
// de coste lineal y mismo comportamiento (vendor/decode-uri-component-safe, con pruebas).
const SAFE_DECODE = path.resolve(__dirname, '../../vendor/decode-uri-component-safe/index.js');
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'decode-uri-component') return { type: 'sourceFile', filePath: SAFE_DECODE };
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
