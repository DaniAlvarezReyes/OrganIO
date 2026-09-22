'use strict';
/**
 * Sustituto de `decode-uri-component` 0.2.x, que llega a la app a través de
 * expo-router → query-string y es vulnerable a denegación de servicio con entradas
 * mal formadas (GHSA-vcc3-ghjq-m6fr). La versión corregida (0.5) es solo ESM y
 * query-string@7 la carga con require(), así que no se puede forzar.
 *
 * Mismo contrato que el original: decodifica todo lo que sea válido y deja tal cual las
 * secuencias %XX que no formen UTF-8 válido (única diferencia: el original trata aparte
 * %FF%FE y %FE%FF; aquí siguen la regla general). Coste O(n): cada secuencia se intenta como
 * mucho con 4 longitudes.
 */
const RUN = /(?:%[0-9a-fA-F]{2})+/g;

function decodeRun(run) {
  try {
    return decodeURIComponent(run);
  } catch (_) {
    // Secuencia con bytes inválidos: se decodifica de izquierda a derecha, un carácter
    // UTF-8 (1 a 4 bytes) cada vez; lo que no sea válido se conserva literal.
    let out = '';
    let i = 0;
    while (i < run.length) {
      let done = false;
      for (let bytes = 4; bytes >= 1 && !done; bytes--) {
        const chunk = run.slice(i, i + bytes * 3);
        if (chunk.length !== bytes * 3) continue;
        try {
          out += decodeURIComponent(chunk);
          i += bytes * 3;
          done = true;
        } catch (_) {
          /* probar con menos bytes */
        }
      }
      if (!done) {
        out += run.slice(i, i + 3);
        i += 3;
      }
    }
    return out;
  }
}

module.exports = function decodeUriComponent(encoded) {
  if (typeof encoded !== 'string') {
    throw new TypeError('Expected `encodedURI` to be of type `string`, got `' + typeof encoded + '`');
  }
  try {
    return decodeURIComponent(encoded);
  } catch (_) {
    return encoded.replace(RUN, decodeRun);
  }
};
