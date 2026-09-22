import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '../src/quickAdd';

// Lunes 21 de septiembre de 2026, 10:00 (hora local)
const NOW = new Date(2026, 8, 21, 10, 0);
const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min);

describe('parseQuickAdd', () => {
  it('extrae etiquetas, prioridad y fecha', () => {
    const r = parseQuickAdd('Llamar al seguro mañana #coche !2', NOW);
    expect(r.title).toBe('Llamar al seguro');
    expect(r.tags).toEqual(['coche']);
    expect(r.priority).toBe(2);
    expect(r.dueAt).toEqual(at(2026, 9, 22));
    expect(r.dueHasTime).toBe(false);
  });

  it('entiende hora con "a las"', () => {
    const r = parseQuickAdd('Dentista pasado mañana a las 17:30', NOW);
    expect(r.title).toBe('Dentista');
    expect(r.dueAt).toEqual(at(2026, 9, 23, 17, 30));
    expect(r.dueHasTime).toBe(true);
  });

  it('distingue "mañana" (día) de "por la mañana" (franja)', () => {
    const r = parseQuickAdd('Correr mañana por la mañana', NOW);
    expect(r.title).toBe('Correr');
    expect(r.dueAt).toEqual(at(2026, 9, 22, 9));
    expect(r.dueHasTime).toBe(true);
  });

  it('días de la semana: siempre el siguiente, nunca hoy', () => {
    expect(parseQuickAdd('Reunión el viernes', NOW).dueAt).toEqual(at(2026, 9, 25));
    expect(parseQuickAdd('Revisar el lunes', NOW).dueAt).toEqual(at(2026, 9, 28));
    expect(parseQuickAdd('Compra el sábado', NOW).dueAt).toEqual(at(2026, 9, 26));
  });

  it('fechas dd/mm y paso de año', () => {
    expect(parseQuickAdd('ITV 15/10', NOW).dueAt).toEqual(at(2026, 10, 15));
    expect(parseQuickAdd('Renovar DNI 3/2', NOW).dueAt).toEqual(at(2027, 2, 3));
    expect(parseQuickAdd('Fecha imposible 31/02', NOW).dueAt).toBeNull();
  });

  it('"en N días / semanas"', () => {
    expect(parseQuickAdd('Seguimiento en 3 días', NOW).dueAt).toEqual(at(2026, 9, 24));
    expect(parseQuickAdd('Revisar en una semana', NOW).dueAt).toEqual(at(2026, 9, 28));
  });

  it('solo hora ya pasada → mañana', () => {
    expect(parseQuickAdd('Llamar a las 8', NOW).dueAt).toEqual(at(2026, 9, 22, 8));
    expect(parseQuickAdd('Llamar a las 18h', NOW).dueAt).toEqual(at(2026, 9, 21, 18));
  });

  it('no inventa nada en texto normal', () => {
    const r = parseQuickAdd('Comprar 2 kg de naranjas', NOW);
    expect(r).toEqual({ title: 'Comprar 2 kg de naranjas', tags: [], priority: 0, dueAt: null, dueHasTime: false });
  });

  it('texto compartido desde WhatsApp con enlace se conserva', () => {
    const r = parseQuickAdd('Mira esto: https://example.com/a?b=1 #leer', NOW);
    expect(r.title).toBe('Mira esto: https://example.com/a?b=1');
    expect(r.tags).toEqual(['leer']);
  });

  it('si solo hay tokens, conserva el texto original', () => {
    expect(parseQuickAdd('mañana', NOW).title).toBe('mañana');
  });
});
