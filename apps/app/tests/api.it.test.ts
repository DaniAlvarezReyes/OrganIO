/**
 * Integración: la capa de datos REAL de la app (src/data/api.ts) contra Postgres + migraciones
 * + PostgREST, con JWT firmados aquí. Comprueba que cada consulta respeta los permisos por
 * columna y el aislamiento entre usuarios. Se ejecuta con scripts/test-api.sh; sin esas
 * variables de entorno se omite.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as api from '../src/data/api';
import type { Database } from '../src/data/database.types';
import { toUserError } from '../src/data/errors';
import { captureToTask } from '../src/tasks/capture';

const URL = process.env.ORGANIO_IT_URL;
const SECRET = process.env.ORGANIO_IT_JWT_SECRET;
const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const B = 'bbbbbbbb-0000-4000-8000-00000000000b';

function jwt(claims: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${body}.${createHmac('sha256', SECRET!).update(body).digest('base64url')}`;
}
const sign = (sub: string) => jwt({ sub, role: 'authenticated', aud: 'authenticated' });

// Como en Supabase: la clave publicable es un JWT con rol anon; la sesión, uno con rol authenticated.
const as = (sub: string | null): api.Db =>
  createClient<Database>(URL!, jwt({ role: 'anon' }), { accessToken: async () => (sub ? sign(sub) : null) });

async function failure(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('Se esperaba un error');
}

describe.skipIf(!URL || !SECRET)('capa de datos contra la base real', () => {
  const a = as(A);
  const b = as(B);
  const taskId = randomUUID();

  it('funcionalidades y perfil del usuario', async () => {
    const flags = await api.getFeatures(a);
    expect(flags.tasks).toBe(true);
    expect(flags.telegram_bot).toBe(false);
    const profile = await api.getProfile(a);
    expect(profile).toMatchObject({ id: A, plan: 'free', stale_days_default: 7 });
  });

  it('actualiza el perfil y valida la zona horaria', async () => {
    const p = await api.updateProfile(a, A, { timezone: 'Europe/Madrid', stale_days_default: 5 });
    expect(p.stale_days_default).toBe(5);
    const err = await failure(api.updateProfile(a, A, { timezone: 'Marte/Olympus' }));
    expect(toUserError(err).message).toMatch(/zona horaria/);
  });

  it('crea una tarea desde la captura rápida con las columnas permitidas', async () => {
    const t = await api.createTask(a, captureToTask('Dentista mañana a las 17 #Salud !2', 'app', taskId));
    expect(t).toMatchObject({ id: taskId, user_id: A, title: 'Dentista', tags: ['salud'], priority: 2, status: 'todo', due_has_time: true });
    const inbox = await api.createTask(a, captureToTask('Idea del atajo', 'shortcut', randomUUID()));
    expect(inbox.status).toBe('inbox');
  });

  it('lista solo lo propio (incluido el filtro de cerradas recientes)', async () => {
    expect((await api.listTasks(a)).map((t) => t.title).sort()).toEqual(['Dentista', 'Idea del atajo']);
    expect(await api.listTasks(b)).toEqual([]);
    expect(await api.getTask(b, taskId)).toBeNull();
  });

  it('cambia estados y respeta las transiciones', async () => {
    expect((await api.updateTask(a, taskId, { status: 'in_progress' })).status).toBe('in_progress');
    const done = await api.updateTask(a, taskId, { status: 'done' });
    expect(done.completed_at).not.toBeNull();
    const err = await failure(api.updateTask(a, taskId, { status: 'blocked' }));
    expect(toUserError(err).message).toMatch(/estado no está permitido/);
    expect((await api.updateTask(a, taskId, { status: 'todo', tags: ['salud', 'citas'] })).completed_at).toBeNull();
  });

  it('otro usuario no puede modificar, avanzar ni borrar la tarea', async () => {
    const upd = await failure(api.updateTask(b, taskId, { title: 'hackeada' }));
    expect(toUserError(upd).message).toMatch(/No se ha encontrado/);
    const prog = await failure(api.reportProgress(b, taskId));
    expect(toUserError(prog).message).toMatch(/No se ha encontrado/);
    await api.deleteTask(b, taskId); // no falla, pero no borra nada (RLS)
    expect(await api.getTask(a, taskId)).not.toBeNull();
  });

  it('marca avance y borra la tarea propia', async () => {
    await api.reportProgress(a, taskId);
    await api.deleteTask(a, taskId);
    expect(await api.getTask(a, taskId)).toBeNull();
  });

  it('sin sesión no se accede a nada salvo las funcionalidades públicas', async () => {
    const anon = as(null);
    expect(toUserError(await failure(api.listTasks(anon))).message).toMatch(/permiso/);
    expect((await api.getFeatures(anon)).tasks).toBe(true);
  });

  it('la validación local frena datos inválidos antes de salir del dispositivo', async () => {
    const err = await failure(api.createTask(a, { title: '   ' }));
    expect(toUserError(err).message).toMatch(/vacío/);
  });
});
