import { parseQuickAdd, type CreateTaskInput, type TaskSource } from '@organio/core';

/**
 * Convierte el texto de captura rápida en la tarea a crear. Lo que se captura dentro de la app
 * va a «Por hacer»; lo que llega de fuera (Atajos, widget, compartir, bot) entra en «Bandeja».
 */
export function captureToTask(text: string, source: TaskSource, id: string, now: Date = new Date()): CreateTaskInput {
  const parsed = parseQuickAdd(text, now);
  return {
    id,
    title: parsed.title,
    tags: parsed.tags,
    priority: parsed.priority,
    due_at: parsed.dueAt ? parsed.dueAt.toISOString() : null,
    due_has_time: parsed.dueHasTime,
    source,
    status: source === 'app' ? 'todo' : 'inbox',
  };
}
