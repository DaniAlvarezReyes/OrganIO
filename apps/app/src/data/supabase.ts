import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import type { Database } from './database.types';
import { readPublicEnv } from './env';
import { sessionStorage } from './sessionStorage';

// Acceso estático obligatorio: Expo solo incrusta EXPO_PUBLIC_* escritas literalmente.
const env = readPublicEnv(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY);

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey, {
  auth: {
    storage: sessionStorage,
    storageKey: 'organio.auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // el acceso es por código; no se aceptan tokens en la URL
    flowType: 'pkce',
  },
});

// En móvil, el refresco automático solo corre con la app en primer plano (recomendación de Supabase).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
