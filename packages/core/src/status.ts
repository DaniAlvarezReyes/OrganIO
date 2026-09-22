export const TASK_STATUSES = ['inbox', 'todo', 'in_progress', 'blocked', 'done', 'discarded'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: 'Bandeja',
  todo: 'Por hacer',
  in_progress: 'En curso',
  blocked: 'Bloqueada',
  done: 'Hecha',
  discarded: 'Descartada',
};

/**
 * Transiciones permitidas. La base de datos aplica exactamente la misma tabla
 * (private.is_valid_transition) para que un cliente manipulado no pueda saltársela.
 */
export const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  inbox: ['todo', 'in_progress', 'done', 'discarded'],
  todo: ['inbox', 'in_progress', 'done', 'discarded'],
  in_progress: ['todo', 'blocked', 'done', 'discarded'],
  blocked: ['todo', 'in_progress', 'discarded'],
  done: ['todo'],
  discarded: ['todo'],
};

/** Estados que cuentan para el aviso de «llevas días sin avanzar». */
export const ACTIVE_STATUSES: readonly TaskStatus[] = ['inbox', 'todo', 'in_progress', 'blocked'];

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function isActive(status: TaskStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}
