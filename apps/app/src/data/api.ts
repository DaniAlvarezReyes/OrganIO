/**
 * Acceso a datos. Funciones puras que reciben el cliente: la app les pasa el suyo y las
 * pruebas de integración uno autenticado con un JWT de prueba contra PostgREST.
 *
 * Reglas:
 * - Nunca `select('*')`: columnas explícitas (menos datos y nada de columnas internas).
 * - Nunca se envía user_id: lo pone la base de datos con auth.uid().
 * - La entrada se valida con los esquemas de @organio/core antes de salir del dispositivo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type Profile,
  type ServerFlags,
  type Task,
  type UpdateTaskInput,
} from '@organio/core';
import type { Database } from './database.types';

export type Db = SupabaseClient<Database>;

export const TASK_COLUMNS =
  'id, user_id, title, description, status, priority, due_at, due_has_time, tags, source, stale_after_days, snoozed_until, last_progress_at, completed_at, created_at, updated_at';

export const PROFILE_COLUMNS = 'id, display_name, timezone, nudge_hour, stale_days_default, plan';

/** Hechas y descartadas solo se traen si son recientes: la lista no crece sin límite. */
export const CLOSED_TASKS_WINDOW_DAYS = 14;

export async function listTasks(db: Db, now: Date = new Date()): Promise<Task[]> {
  const since = new Date(now.getTime() - CLOSED_TASKS_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from('tasks')
    .select(TASK_COLUMNS)
    .or(`status.in.(inbox,todo,in_progress,blocked),updated_at.gte.${since}`)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as Task[];
}

export async function getTask(db: Db, id: string): Promise<Task | null> {
  const { data, error } = await db.from('tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Task | null;
}

export async function createTask(db: Db, input: CreateTaskInput): Promise<Task> {
  const payload = createTaskSchema.parse(input);
  const { data, error } = await db.from('tasks').insert(payload).select(TASK_COLUMNS).single();
  if (error) throw error;
  return data as Task;
}

export async function updateTask(db: Db, id: string, patch: UpdateTaskInput): Promise<Task> {
  const payload = updateTaskSchema.parse(patch);
  const { data, error } = await db.from('tasks').update(payload).eq('id', id).select(TASK_COLUMNS).single();
  if (error) throw error;
  return data as Task;
}

export async function deleteTask(db: Db, id: string): Promise<void> {
  const { error } = await db.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

export async function reportProgress(db: Db, id: string): Promise<void> {
  const { error } = await db.rpc('report_progress', { p_task_id: id });
  if (error) throw error;
}

export async function getProfile(db: Db): Promise<Profile> {
  const { data, error } = await db.from('profiles').select(PROFILE_COLUMNS).single();
  if (error) throw error;
  return data as Profile;
}

export type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'timezone' | 'nudge_hour' | 'stale_days_default'>>;

export async function updateProfile(db: Db, id: string, patch: ProfilePatch): Promise<Profile> {
  const { data, error } = await db.from('profiles').update(patch).eq('id', id).select(PROFILE_COLUMNS).single();
  if (error) throw error;
  return data as Profile;
}

export async function getFeatures(db: Db): Promise<ServerFlags> {
  const { data, error } = await db.rpc('get_features');
  if (error) throw error;
  return (data ?? {}) as ServerFlags;
}
