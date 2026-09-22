import { z } from 'zod';
import { LIMITS, TAG_PATTERN } from './limits';
import { TASK_STATUSES } from './status';

const trimmed = (max: number) => z.string().trim().min(1, 'No puede estar vacío').max(max, `Máximo ${max} caracteres`);

export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(TAG_PATTERN, 'Etiqueta no válida: letras, números, guion o guion bajo');

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const taskSourceSchema = z.enum(['app', 'share', 'widget', 'shortcut', 'notification', 'bot', 'email']);
export type TaskSource = z.infer<typeof taskSourceSchema>;

export const createTaskSchema = z.object({
  id: z.uuid().optional(),
  title: trimmed(LIMITS.titleMax),
  description: z.string().max(LIMITS.descriptionMax).nullish(),
  status: taskStatusSchema.default('inbox'),
  priority: z.number().int().min(0).max(3).default(0),
  due_at: z.iso.datetime({ offset: true }).nullish(),
  due_has_time: z.boolean().default(false),
  tags: z.array(tagSchema).max(LIMITS.tagsMax).default([]),
  source: taskSourceSchema.default('app'),
  stale_after_days: z.number().int().min(LIMITS.staleDaysMin).max(LIMITS.staleDaysMax).nullish(),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema
  .omit({ id: true, source: true })
  .partial()
  .extend({ snoozed_until: z.iso.datetime({ offset: true }).nullish() });
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

export const createSubtaskSchema = z.object({
  task_id: z.uuid(),
  title: trimmed(LIMITS.subtaskTitleMax),
  position: z.number().int().min(0).max(10_000).default(0),
  estimated_minutes: z.number().int().min(1).max(1440).nullish(),
  suggested_by_ai: z.boolean().default(false),
});
export type CreateSubtaskInput = z.input<typeof createSubtaskSchema>;

export const createNoteSchema = z.object({
  task_id: z.uuid(),
  body: trimmed(LIMITS.noteMax),
});

export const searchParamsSchema = z.object({
  q: z.string().max(LIMITS.searchQueryMax).default(''),
  statuses: z.array(taskStatusSchema).nullish(),
  tags: z.array(tagSchema).max(10).nullish(),
  dueFrom: z.iso.datetime({ offset: true }).nullish(),
  dueTo: z.iso.datetime({ offset: true }).nullish(),
  hasAttachments: z.boolean().nullish(),
});
export type SearchParams = z.input<typeof searchParamsSchema>;

/** Contrato de la función suggest-subtasks. La función valida la salida del modelo con este mismo esquema. */
export const subtaskSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  estimated_minutes: z.number().int().min(5).max(480),
});
export const subtaskSuggestionsSchema = z.object({
  subtasks: z.array(subtaskSuggestionSchema).min(1).max(8),
});
export type SubtaskSuggestion = z.infer<typeof subtaskSuggestionSchema>;

export const pushTokenSchema = z
  .string()
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/, 'Token push no válido');
