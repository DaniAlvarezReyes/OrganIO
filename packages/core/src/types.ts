import type { TaskStatus } from './status';
import type { TaskSource } from './schemas';

/** Filas tal como las devuelve la API (Supabase). */
export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: 0 | 1 | 2 | 3;
  due_at: string | null;
  due_has_time: boolean;
  tags: string[];
  source: TaskSource;
  stale_after_days: number | null;
  snoozed_until: string | null;
  last_progress_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  done_at: string | null;
  position: number;
  estimated_minutes: number | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  suggested_by_ai: boolean;
  created_at: string;
}

export interface TaskNote {
  id: string;
  task_id: string;
  body: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  task_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface TaskEvent {
  id: number;
  task_id: string;
  kind: 'created' | 'status_changed' | 'subtask_done' | 'note_added' | 'attachment_added' | 'progress_reported' | 'nudged';
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string;
  nudge_hour: number;
  stale_days_default: number;
  plan: 'free' | 'pro';
}

export interface SearchResult {
  id: string;
  title: string;
  status: TaskStatus;
  priority: 0 | 1 | 2 | 3;
  due_at: string | null;
  tags: string[];
  last_progress_at: string;
  updated_at: string;
  rank: number;
  matched_in: 'title' | 'note' | 'filter';
}
