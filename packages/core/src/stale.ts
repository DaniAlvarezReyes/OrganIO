import { isActive, type TaskStatus } from './status';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StaleInput {
  status: TaskStatus;
  last_progress_at: string | Date;
  stale_after_days?: number | null;
  snoozed_until?: string | Date | null;
}

export interface Staleness {
  idleDays: number;
  threshold: number;
  /** 0 = recién tocada, 1 = en el umbral. Se usa para el color del hilo. */
  ratio: number;
  isStale: boolean;
}

export function staleness(task: StaleInput, profileDefault: number, now: Date = new Date()): Staleness {
  const threshold = task.stale_after_days ?? profileDefault;
  const last = new Date(task.last_progress_at).getTime();
  const idleDays = Math.max(0, Math.floor((now.getTime() - last) / DAY_MS));
  const snoozed = task.snoozed_until ? new Date(task.snoozed_until).getTime() > now.getTime() : false;
  const active = isActive(task.status) && !snoozed;
  const ratio = active ? Math.min(1, idleDays / threshold) : 0;
  return { idleDays, threshold, ratio, isStale: active && idleDays >= threshold };
}
