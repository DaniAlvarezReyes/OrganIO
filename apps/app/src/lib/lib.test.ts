import { describe, expect, it } from 'vitest';
import { mixHex, threadColor } from './color';
import { dayDiff, formatDue, formatIdle } from './dates';
import { utf8Decode, utf8Encode } from './utf8';

// Lunes 21/09/2026 10:00 (se ejecuta con TZ=Europe/Madrid)
const NOW = new Date(2026, 8, 21, 10, 0);

describe('dates', () => {
  it('días naturales, incluido el cambio de hora de octubre', () => {
    expect(dayDiff(new Date(2026, 9, 26, 0, 30), new Date(2026, 9, 24, 23, 0))).toBe(2);
  });
  it('etiquetas relativas en español', () => {
    expect(formatDue(new Date(2026, 8, 21, 9), false, NOW)).toEqual({ text: 'Hoy', tone: 'soon' });
    expect(formatDue(new Date(2026, 8, 22, 17, 30), true, NOW)).toEqual({ text: 'Mañana · 17:30', tone: 'soon' });
    expect(formatDue(new Date(2026, 8, 25, 9), false, NOW).text).toBe('Viernes');
    expect(formatDue(new Date(2026, 8, 20, 9), false, NOW)).toEqual({ text: 'Ayer', tone: 'overdue' });
    expect(formatDue(new Date(2026, 9, 15, 9), false, NOW).text).toMatch(/^Jue.*15.*oct/);
  });
  it('una tarea con hora de hoy ya pasada está vencida', () => {
    expect(formatDue(new Date(2026, 8, 21, 8, 0), true, NOW).tone).toBe('overdue');
  });
  it('días sin avanzar', () => {
    expect(formatIdle(0)).toBe('Avanzada hoy');
    expect(formatIdle(1)).toBe('Sin avanzar desde ayer');
    expect(formatIdle(8)).toBe('8 días sin avanzar');
  });
});

describe('color del hilo', () => {
  it('mezcla en los extremos y en medio', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
  it('el hilo apenas cambia al principio y se acelera al final', () => {
    expect(threadColor(0.3, '#000000', '#FFFFFF')).toBe(mixHex('#000000', '#FFFFFF', 0.09));
    expect(threadColor(5, '#000000', '#FFFFFF')).toBe('#FFFFFF');
  });
});

describe('utf8', () => {
  it('ida y vuelta con acentos, eñes y emoji', () => {
    const s = '{"email":"dani@ejemplo.es","nota":"Año nuevo ñandú 🧵"}';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
    expect(Array.from(utf8Encode('ñ'))).toEqual([0xc3, 0xb1]);
  });
});
