const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Diferencia en días naturales (a − b), robusta frente a cambios de hora. */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
const shortFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface DueLabel {
  text: string;
  tone: 'overdue' | 'soon' | 'normal';
}

export function formatDue(dueAt: string | Date, hasTime: boolean, now: Date = new Date()): DueLabel {
  const due = new Date(dueAt);
  const diff = dayDiff(due, now);
  let text: string;
  if (diff === 0) text = 'Hoy';
  else if (diff === 1) text = 'Mañana';
  else if (diff === -1) text = 'Ayer';
  else if (diff > 1 && diff < 7) text = capitalize(weekdayFmt.format(due));
  else text = capitalize(shortFmt.format(due));
  if (hasTime) text += ` · ${timeFmt.format(due)}`;
  const overdue = hasTime ? due.getTime() < now.getTime() : diff < 0;
  return { text, tone: overdue ? 'overdue' : diff <= 1 ? 'soon' : 'normal' };
}

export function formatIdle(days: number): string {
  if (days <= 0) return 'Avanzada hoy';
  if (days === 1) return 'Sin avanzar desde ayer';
  return `${days} días sin avanzar`;
}

/** Zona horaria IANA del dispositivo (p. ej. «Europe/Madrid»). */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
