import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const safe = require('../../../../vendor/decode-uri-component-safe/index.js') as (s: string) => string;
const original = require('decode-uri-component') as (s: string) => string;

const CORPUS = [
  'Hola%20mundo',
  'Llamar%20al%20seguro%20ma%C3%B1ana%20%23coche%20!2',
  'emoji%20%F0%9F%A7%B5',
  '%',
  '%2',
  '%zz',
  '%E0%A4%A',
  'test%E0%A4%A%20ok',
  '%C2%B5%E0%A4',
  '%ED%A0%80', // sustituto UTF-16 no válido
  '%F4%90%80%80', // fuera del rango Unicode
  '%E2%9C%93%E2%9C',
  'a%%20b',
  '%41%42%43',
  '',
];

describe('decode-uri-component seguro', () => {
  it('se comporta igual que el original en un banco de entradas', () => {
    for (const input of CORPUS) expect(safe(input), input).toBe(original(input));
  });

  it('diferencia deliberada: con bytes BOM (%FF%FE) no copia la rareza del original', () => {
    // El original devuelve '\uFFFD\uFFFD%41' (sustituye los bytes y deja %41 sin decodificar).
    // Aquí los bytes inválidos se conservan literales y el resto se decodifica, como en los demás casos.
    expect(safe('%FF%FE%41')).toBe('%FF%FEA');
  });

  it('mantiene el contrato de tipos', () => {
    expect(() => safe(1 as unknown as string)).toThrow(TypeError);
  });

  it('coste lineal: multiplicar la entrada por 4 no dispara el tiempo', () => {
    const attack = (n: number) => '%E0%A4%A'.repeat(n) + '%C2' + '%'.repeat(n);
    const time = (input: string) => {
      const start = performance.now();
      safe(input);
      return performance.now() - start;
    };
    time(attack(2_000)); // calentamiento del motor
    const small = time(attack(10_000));
    const large = time(attack(40_000));
    // Lineal ⇒ ~4×. Margen amplio para no depender de la máquina; un coste cuadrático daría ~16×.
    expect(large).toBeLessThan(small * 10 + 50);
    expect(large).toBeLessThan(2_000);
  });
});
