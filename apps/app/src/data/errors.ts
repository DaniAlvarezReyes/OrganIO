/**
 * Traduce errores de Supabase / Postgres / validación a mensajes para el usuario.
 * Nunca muestra el mensaje técnico original (puede contener detalles internos).
 */
import { ZodError } from 'zod';

export interface UserFacingError {
  message: string;
  /** true si reintentar tiene sentido (red, límites temporales). */
  retryable: boolean;
}

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  name?: unknown;
}

const GENERIC: UserFacingError = { message: 'Algo ha fallado. Inténtalo de nuevo en un momento.', retryable: true };

export function toUserError(err: unknown): UserFacingError {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return { message: first?.message ?? 'Revisa los datos introducidos.', retryable: false };
  }
  if (!err || typeof err !== 'object') return GENERIC;
  const e = err as ErrorLike;
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  const status = typeof e.status === 'number' ? e.status : 0;

  // Red. supabase-js envuelve el fallo del fetch, así que se reconoce por el texto que da cada motor:
  // Node/undici «fetch failed», Chrome «Failed to fetch», Safari «Load failed»,
  // Firefox «NetworkError…», React Native «Network request failed».
  if (/fetch failed|failed to fetch|load failed|networkerror|network request failed/i.test(message)) {
    return { message: 'Sin conexión con el servidor. Comprueba tu red.', retryable: true };
  }

  // Autenticación (GoTrue)
  if (code === 'otp_expired' || /token has expired|invalid.*(otp|token)/i.test(message)) {
    return { message: 'El código no es válido o ha caducado. Pide uno nuevo.', retryable: false };
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return { message: 'Demasiados intentos. Espera un minuto antes de volver a probar.', retryable: true };
  }
  if (/signup_not_allowed|Database error saving new user/i.test(message) || code === 'signup_disabled') {
    return { message: 'Este correo no tiene acceso a OrganIO todavía.', retryable: false };
  }
  if (code === 'email_address_invalid' || /invalid.*email|unable to validate email/i.test(message)) {
    return { message: 'Ese correo no parece válido.', retryable: false };
  }

  // Postgres / PostgREST
  switch (code) {
    case '22023':
      if (/Transición no permitida/.test(message)) return { message: 'Ese cambio de estado no está permitido.', retryable: false };
      if (/Etiqueta/.test(message)) return { message: 'Alguna etiqueta no es válida: usa letras, números o guiones.', retryable: false };
      if (/Zona horaria/.test(message)) return { message: 'La zona horaria no es válida.', retryable: false };
      return { message: 'Algún dato no es válido.', retryable: false };
    case '23514':
      return { message: 'Algún dato está fuera de los límites permitidos.', retryable: false };
    case '42501':
      return { message: 'No tienes permiso para hacer eso.', retryable: false };
    case 'PGRST116':
    case 'P0002':
      return { message: 'No se ha encontrado. Puede que se haya borrado.', retryable: false };
    case 'PGRST301':
    case 'PGRST303':
      return { message: 'Tu sesión ha caducado. Vuelve a entrar.', retryable: false };
  }

  return GENERIC;
}
