import type { CreateTaskInput, Task, UpdateTaskInput } from '@organio/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useFeedback } from '../ui/Feedback';
import * as api from './api';
import { toUserError } from './errors';
import { supabase } from './supabase';

export const qk = {
  tasks: ['tasks'] as const,
  profile: ['profile'] as const,
  features: ['features'] as const,
};

export function useTasks() {
  const { userId } = useAuth();
  return useQuery({ queryKey: qk.tasks, queryFn: () => api.listTasks(supabase), enabled: !!userId });
}

export function useTask(id: string | undefined) {
  const tasks = useTasks();
  return { ...tasks, data: tasks.data?.find((t) => t.id === id) };
}

export function useProfile() {
  const { userId } = useAuth();
  return useQuery({ queryKey: qk.profile, queryFn: () => api.getProfile(supabase), enabled: !!userId, staleTime: 5 * 60_000 });
}

export function useFeatures() {
  return useQuery({ queryKey: qk.features, queryFn: () => api.getFeatures(supabase), staleTime: 10 * 60_000 });
}

/** Esqueleto de la operación optimista sobre la lista de tareas, con vuelta atrás si falla. */
function useOptimisticTasks<V>(mutationFn: (v: V) => Promise<unknown>, apply: (tasks: Task[], v: V) => Task[]) {
  const qc = useQueryClient();
  const { showError } = useFeedback();
  return useMutation({
    mutationFn,
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: qk.tasks });
      const previous = qc.getQueryData<Task[]>(qk.tasks);
      if (previous) qc.setQueryData<Task[]>(qk.tasks, apply(previous, vars));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.tasks, ctx.previous);
      showError(toUserError(err).message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasks }),
  });
}

export function useCreateTask() {
  const { userId } = useAuth();
  return useOptimisticTasks(
    (input: CreateTaskInput) => api.createTask(supabase, input),
    (tasks, input) => {
      const now = new Date().toISOString();
      const draft: Task = {
        id: input.id ?? `tmp-${now}`,
        user_id: userId ?? '',
        title: input.title.trim(),
        description: input.description ?? null,
        status: input.status ?? 'inbox',
        priority: (input.priority ?? 0) as Task['priority'],
        due_at: input.due_at ?? null,
        due_has_time: input.due_has_time ?? false,
        tags: input.tags ?? [],
        source: input.source ?? 'app',
        stale_after_days: input.stale_after_days ?? null,
        snoozed_until: null,
        last_progress_at: now,
        completed_at: null,
        created_at: now,
        updated_at: now,
      };
      return [draft, ...tasks];
    },
  );
}

export function useUpdateTask() {
  return useOptimisticTasks(
    ({ id, patch }: { id: string; patch: UpdateTaskInput }) => api.updateTask(supabase, id, patch),
    (tasks, { id, patch }) =>
      tasks.map((t) => (t.id === id ? ({ ...t, ...patch, updated_at: new Date().toISOString() } as Task) : t)),
  );
}

export function useDeleteTask() {
  return useOptimisticTasks(
    (id: string) => api.deleteTask(supabase, id),
    (tasks, id) => tasks.filter((t) => t.id !== id),
  );
}

export function useReportProgress() {
  return useOptimisticTasks(
    (id: string) => api.reportProgress(supabase, id),
    (tasks, id) => tasks.map((t) => (t.id === id ? { ...t, last_progress_at: new Date().toISOString(), snoozed_until: null } : t)),
  );
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { showError } = useFeedback();
  return useMutation({
    mutationFn: (patch: api.ProfilePatch) => api.updateProfile(supabase, userId!, patch),
    onSuccess: (profile) => qc.setQueryData(qk.profile, profile),
    onError: (err) => showError(toUserError(err).message),
  });
}
