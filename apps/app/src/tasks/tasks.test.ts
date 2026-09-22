import type { Task } from '@organio/core';
import { describe, expect, it } from 'vitest';
import { captureToTask } from './capture';
import { collectTags, groupTasks } from './grouping';

let n = 0;
const task = (p: Partial<Task>): Task => ({
  id: `t${++n}`,
  user_id: 'u',
  title: 'x',
  description: null,
  status: 'todo',
  priority: 0,
  due_at: null,
  due_has_time: false,
  tags: [],
  source: 'app',
  stale_after_days: null,
  snoozed_until: null,
  last_progress_at: '2026-09-20T10:00:00Z',
  completed_at: null,
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-20T10:00:00Z',
  ...p,
});

describe('agrupación', () => {
  it('ordena secciones y omite las vacías', () => {
    const s = groupTasks([task({ status: 'inbox' }), task({ status: 'in_progress' }), task({ status: 'done' })]);
    expect(s.map((x) => x.key)).toEqual(['in_progress', 'inbox', 'closed']);
  });
  it('dentro de una sección: prioridad, luego fecha más próxima, luego sin fecha', () => {
    const a = task({ title: 'sin fecha' });
    const b = task({ title: 'viernes', due_at: '2026-09-25T09:00:00Z' });
    const c = task({ title: 'urgente', priority: 3 });
    const d = task({ title: 'martes', due_at: '2026-09-22T09:00:00Z' });
    expect(groupTasks([a, b, c, d])[0]!.tasks.map((t) => t.title)).toEqual(['urgente', 'martes', 'viernes', 'sin fecha']);
  });
  it('filtra por etiqueta y cuenta solo las abiertas', () => {
    const list = [task({ tags: ['coche'] }), task({ tags: ['casa', 'coche'] }), task({ tags: ['viejo'], status: 'done' })];
    expect(groupTasks(list, 'casa')[0]!.tasks).toHaveLength(1);
    expect(collectTags(list)).toEqual(['coche', 'casa']);
  });
});

describe('captura', () => {
  const NOW = new Date(2026, 8, 21, 10, 0);
  it('en la app va a Por hacer; desde fuera, a Bandeja', () => {
    expect(captureToTask('Algo', 'app', 'id', NOW).status).toBe('todo');
    expect(captureToTask('Algo', 'shortcut', 'id', NOW).status).toBe('inbox');
  });
  it('convierte fecha, etiquetas y prioridad', () => {
    const t = captureToTask('Dentista mañana a las 17 #salud !2', 'app', 'id', NOW);
    expect(t).toMatchObject({ title: 'Dentista', tags: ['salud'], priority: 2, due_has_time: true });
    expect(new Date(t.due_at!).getTime()).toBe(new Date(2026, 8, 22, 17, 0).getTime());
  });
});
