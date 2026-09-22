import { describe, expect, it } from 'vitest';
import { canTransition, TRANSITIONS, TASK_STATUSES } from '../src/status';
import { staleness } from '../src/stale';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_KEYS, FEATURES, isFeatureAvailable } from '../src/features';

describe('status', () => {
  it('toda transición declarada apunta a un estado válido', () => {
    for (const from of TASK_STATUSES) for (const to of TRANSITIONS[from]) expect(TASK_STATUSES).toContain(to);
  });
  it('no se puede pasar de hecha a bloqueada', () => {
    expect(canTransition('done', 'blocked')).toBe(false);
    expect(canTransition('done', 'todo')).toBe(true);
  });
});

describe('staleness', () => {
  const now = new Date('2026-09-21T10:00:00Z');
  it('marca estancada tras el umbral por defecto', () => {
    const s = staleness({ status: 'todo', last_progress_at: '2026-09-13T09:00:00Z' }, 7, now);
    expect(s.idleDays).toBe(8);
    expect(s.isStale).toBe(true);
    expect(s.ratio).toBe(1);
  });
  it('respeta el umbral propio y la posposición', () => {
    expect(staleness({ status: 'todo', last_progress_at: '2026-09-13T09:00:00Z', stale_after_days: 14 }, 7, now).isStale).toBe(false);
    expect(
      staleness({ status: 'todo', last_progress_at: '2026-09-01T09:00:00Z', snoozed_until: '2026-09-25T00:00:00Z' }, 7, now).isStale,
    ).toBe(false);
  });
  it('las hechas nunca están estancadas', () => {
    expect(staleness({ status: 'done', last_progress_at: '2020-01-01T00:00:00Z' }, 7, now).isStale).toBe(false);
  });
});

describe('features', () => {
  it('sin flag del servidor, nada está disponible', () => {
    expect(isFeatureAvailable('tasks', {}, 'web')).toBe(false);
  });
  it('respeta la plataforma aunque el servidor la active', () => {
    expect(isFeatureAvailable('widgets', { widgets: true }, 'web')).toBe(false);
    expect(isFeatureAvailable('widgets', { widgets: true }, 'ios')).toBe(true);
    expect(isFeatureAvailable('web_app', { web_app: true }, 'ios')).toBe(false);
  });
  it('las claves coinciden exactamente con las filas de private.app_features', () => {
    const sql = readFileSync(join(__dirname, '../../../supabase/migrations/20260921000100_core.sql'), 'utf8');
    const block = sql.slice(sql.indexOf('insert into private.app_features'), sql.indexOf('create table private.plan_limits'));
    const sqlKeys = [...block.matchAll(/\('([a-z_]+)',/g)].map((m) => m[1]).sort();
    expect(sqlKeys).toEqual([...FEATURE_KEYS].sort());
  });
  it('cada funcionalidad tiene etiqueta en español y una entrega asignada', () => {
    for (const def of Object.values(FEATURES)) {
      expect(def.label.length).toBeGreaterThan(3);
      expect(def.delivery).toBeGreaterThanOrEqual(2);
    }
  });
});
