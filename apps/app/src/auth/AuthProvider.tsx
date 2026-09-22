import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { supabase } from '../data/supabase';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  session: Session | null;
  userId: string | null;
  email: string | null;
}

const AuthContext = createContext<AuthValue | null>(null);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Ese correo no parece válido.'));
export const codeSchema = z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 cifras.');

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setStatus(data.session ? 'signedIn' : 'signedOut');
    });
    // Importante: dentro de este callback no se llama a otros métodos de supabase (puede bloquearse).
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setStatus(next ? 'signedIn' : 'signedOut');
      // Al salir se vacía la caché: el siguiente usuario del dispositivo no ve nada del anterior.
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({ status, session, userId: session?.user.id ?? null, email: session?.user.email ?? null }),
    [status, session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}

export async function requestCode(rawEmail: string): Promise<string> {
  const email = emailSchema.parse(rawEmail);
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  return email;
}

export async function verifyCode(email: string, rawCode: string): Promise<void> {
  const token = codeSchema.parse(rawCode);
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  // scope 'local': cierra este dispositivo sin invalidar las sesiones de los demás.
  await supabase.auth.signOut({ scope: 'local' });
}
