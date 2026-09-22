import { type Task, type TaskStatus } from '@organio/core';

export type SectionKey = 'in_progress' | 'todo' | 'inbox' | 'blocked' | 'closed';

export interface TaskSection {
  key: SectionKey;
  title: string;
  tasks: Task[];
}

const ORDER: Array<{ key: SectionKey; title: string; statuses: TaskStatus[] }> = [
  { key: 'in_progress', title: 'En curso', statuses: ['in_progress'] },
  { key: 'todo', title: 'Por hacer', statuses: ['todo'] },
  { key: 'inbox', title: 'Bandeja', statuses: ['inbox'] },
  { key: 'blocked', title: 'Bloqueadas', statuses: ['blocked'] },
  { key: 'closed', title: 'Cerradas estos días', statuses: ['done', 'discarded'] },
];

const time = (s: string | null) => (s ? new Date(s).getTime() : Number.POSITIVE_INFINITY);

/** Activas: prioridad alta primero, luego la fecha más próxima, luego lo último tocado. */
export function compareActive(a: Task, b: Task): number {
  return b.priority - a.priority || time(a.due_at) - time(b.due_at) || time(b.updated_at) - time(a.updated_at);
}

export function compareClosed(a: Task, b: Task): number {
  return time(b.completed_at ?? b.updated_at) - time(a.completed_at ?? a.updated_at);
}

export function groupTasks(tasks: readonly Task[], tag: string | null = null): TaskSection[] {
  const visible = tag ? tasks.filter((t) => t.tags.includes(tag)) : tasks;
  return ORDER.map(({ key, title, statuses }) => ({
    key,
    title,
    tasks: visible.filter((t) => statuses.includes(t.status)).sort(key === 'closed' ? compareClosed : compareActive),
  })).filter((s) => s.tasks.length > 0);
}

/** Etiquetas de las tareas abiertas, por frecuencia de uso. */
export function collectTags(tasks: readonly Task[]): string[] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'discarded') continue;
    for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([tag]) => tag);
}
