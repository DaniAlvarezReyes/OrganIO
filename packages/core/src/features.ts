/**
 * Registro central de funcionalidades.
 *
 * - `delivery`: entrega del plan en la que se construye (ver README).
 * - `requires`: qué hay que contratar o configurar para encenderla. Vacío = gratis.
 * - `platforms`: dónde tiene sentido. Sin valor = en todas.
 *
 * El SERVIDOR es la autoridad: tabla private.app_features, consultada con la RPC get_features().
 * El cliente solo decide qué mostrar; una funcionalidad apagada en el servidor no responde aunque
 * el cliente la muestre. Las claves de aquí y las filas de app_features deben coincidir
 * (hay un test que lo comprueba contra la migración).
 */
export type Platform = 'ios' | 'android' | 'web';

export type Requirement =
  | 'apple_developer' // Apple Developer Program (99 €/año)
  | 'anthropic_key' // clave de API de Anthropic (pago por uso, céntimos)
  | 'google_cloud' // proyecto y cliente OAuth de Google Cloud (gratis)
  | 'telegram_token' // token de BotFather (gratis)
  | 'meta_business' // WhatsApp Business verificado
  | 'custom_smtp' // proveedor de correo propio
  | 'billing'; // RevenueCat + App Store / Google Play / Stripe

export interface FeatureDef {
  label: string;
  delivery: number;
  requires: readonly Requirement[];
  platforms?: readonly Platform[];
}

const NATIVE: readonly Platform[] = ['ios', 'android'];

export const FEATURES = {
  email_otp_login: { label: 'Acceso con código por correo', delivery: 2, requires: [] },
  web_app: { label: 'App en el navegador (ordenador e iPhone)', delivery: 2, requires: [], platforms: ['web'] },
  tasks: { label: 'Tareas y estados', delivery: 2, requires: [] },
  quick_capture: { label: 'Captura rápida en lenguaje natural', delivery: 2, requires: [] },
  task_details: { label: 'Subtareas, notas, imágenes e historial', delivery: 3, requires: [] },
  search: { label: 'Búsqueda avanzada', delivery: 3, requires: [] },
  telegram_bot: { label: 'Bot de Telegram', delivery: 4, requires: ['telegram_token'] },
  stale_nudges: { label: 'Avisos de tareas estancadas', delivery: 4, requires: [] },
  ai_subtasks: { label: 'Sugerencia de subtareas con IA', delivery: 5, requires: ['anthropic_key'] },
  routines: { label: 'Rutinas', delivery: 6, requires: [] },
  google_calendar: { label: 'Planificación en Google Calendar', delivery: 7, requires: ['google_cloud'] },
  google_sign_in: { label: 'Iniciar sesión con Google', delivery: 7, requires: ['google_cloud'] },
  share_capture: { label: 'Crear tareas desde «Compartir»', delivery: 8, requires: [], platforms: NATIVE },
  widgets: { label: 'Widgets de pantalla de inicio', delivery: 8, requires: ['apple_developer'], platforms: ['ios'] },
  app_lock: { label: 'Bloqueo con Face ID / huella', delivery: 8, requires: [], platforms: NATIVE },
  push_notifications: { label: 'Notificaciones push', delivery: 8, requires: [], platforms: NATIVE },
  apple_sign_in: { label: 'Iniciar sesión con Apple', delivery: 8, requires: ['apple_developer'], platforms: ['ios'] },
  semantic_search: { label: 'Búsqueda por significado', delivery: 9, requires: ['anthropic_key'] },
  whatsapp_bot: { label: 'Bot de WhatsApp', delivery: 9, requires: ['meta_business'] },
  email_capture: { label: 'Correo a tarea', delivery: 10, requires: ['custom_smtp'] },
  subscriptions: { label: 'Suscripciones de pago', delivery: 10, requires: ['billing'] },
} as const satisfies Record<string, FeatureDef>;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

/** Respuesta de la RPC get_features(): clave → activa para el plan del usuario. */
export type ServerFlags = Partial<Record<FeatureKey, boolean>>;

export function isFeatureAvailable(key: FeatureKey, serverFlags: ServerFlags, platform: Platform): boolean {
  const def: FeatureDef = FEATURES[key];
  if (def.platforms && !def.platforms.includes(platform)) return false;
  return serverFlags[key] === true;
}
