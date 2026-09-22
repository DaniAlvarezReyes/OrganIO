/**
 * Configuración pública de la app (se incrusta en el binario / bundle web).
 * SOLO puede contener la URL del proyecto y la clave publicable (anon). Si alguien pega la
 * clave secreta (service_role), la app se niega a arrancar: esa clave salta RLS.
 */
export interface PublicEnv {
  supabaseUrl: string;
  supabaseKey: string;
}

export function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(globalThis.atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as { role?: unknown };
    return json.role === 'service_role';
  } catch {
    return false;
  }
}

export function readPublicEnv(url: string | undefined, key: string | undefined): PublicEnv {
  if (!url || !key) {
    throw new Error('Faltan EXPO_PUBLIC_SUPABASE_URL y/o EXPO_PUBLIC_SUPABASE_KEY. Copia apps/app/.env.example a apps/app/.env.');
  }
  if (isSecretKey(key)) {
    throw new Error('EXPO_PUBLIC_SUPABASE_KEY contiene una clave SECRETA. Usa la clave publicable (anon) y revoca la secreta si se ha compartido.');
  }
  if (!/^https?:\/\/[^\s/]+/.test(url)) throw new Error('EXPO_PUBLIC_SUPABASE_URL no es una URL válida.');
  return { supabaseUrl: url.replace(/\/+$/, ''), supabaseKey: key };
}
