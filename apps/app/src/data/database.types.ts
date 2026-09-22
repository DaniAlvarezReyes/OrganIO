/**
 * Tipos de la base de datos para supabase-js.
 *
 * Escritos a mano con el formato de `supabase gen types` y limitados a lo que usa la app.
 * Con Supabase local arrancado, sustitúyelos por los generados:  npm run gen:types -w @organio/app
 * Las pruebas de integración (tests/api.it.test.ts) verifican estas consultas contra la base real.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TaskStatus = 'inbox' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'discarded';
type TaskSource = 'app' | 'share' | 'widget' | 'shortcut' | 'notification' | 'bot' | 'email';
type PlanTier = 'free' | 'pro';

export type Database = {
  __InternalSupabase: { PostgrestVersion: '13' };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          timezone: string;
          nudge_hour: number;
          stale_days_default: number;
          plan: PlanTier;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          display_name?: string | null;
          timezone?: string;
          nudge_hour?: number;
          stale_days_default?: number;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          status: TaskStatus;
          priority: number;
          due_at: string | null;
          due_has_time: boolean;
          tags: string[];
          source: TaskSource;
          stale_after_days: number | null;
          snoozed_until: string | null;
          last_progress_at: string;
          completed_at: string | null;
          search_vector: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          status?: TaskStatus;
          priority?: number;
          due_at?: string | null;
          due_has_time?: boolean;
          tags?: string[];
          source?: TaskSource;
          stale_after_days?: number | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          status?: TaskStatus;
          priority?: number;
          due_at?: string | null;
          due_has_time?: boolean;
          tags?: string[];
          stale_after_days?: number | null;
          snoozed_until?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_features: { Args: never; Returns: Json };
      report_progress: { Args: { p_task_id: string }; Returns: undefined };
    };
    Enums: { task_status: TaskStatus; task_source: TaskSource; plan_tier: PlanTier };
    CompositeTypes: { [_ in never]: never };
  };
};
