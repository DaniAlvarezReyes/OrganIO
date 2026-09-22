/**
 * Captura rápida en lenguaje natural (español).
 *
 *   "Llamar al seguro mañana a las 10 #coche !2"
 *   → { title: "Llamar al seguro", dueAt: mañana 10:00, tags: ["coche"], priority: 2 }
 *
 * Función pura: recibe `now` para ser determinista en tests. Todo se calcula en hora local
 * del dispositivo, que es la del usuario.
 */
export type Priority = 0 | 1 | 2 | 3;

export interface QuickAddResult {
  title: string;
  tags: string[];
  priority: Priority;
  dueAt: Date | null;
  /** false cuando solo se indicó el día; la hora por defecto es DEFAULT_HOUR. */
  dueHasTime: boolean;
}

export const DEFAULT_HOUR = 9;

const END = '(?=$|[\\s,.;:!?)])';
const LETTERS = 'A-Za-z0-9áéíóúüñÁÉÍÓÚÜÑ_-';

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const PARTS_OF_DAY: Record<string, number> = { manana: 9, tarde: 17, noche: 21 };

function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áà]/g, 'a')
    .replace(/[éè]/g, 'e')
    .replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n');
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Aplica `re` una vez sobre `text`; si casa, devuelve los grupos y el texto sin el fragmento. */
function take(text: string, re: RegExp): { groups: string[]; rest: string } | null {
  const m = re.exec(text);
  if (!m) return null;
  const lead = m[1] ?? '';
  const rest = text.slice(0, m.index) + lead + ' ' + text.slice(m.index + m[0].length);
  return { groups: m.slice(2).map((g) => g ?? ''), rest };
}

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddResult {
  let text = ` ${input.replace(/\s+/g, ' ').trim()} `;

  // Etiquetas: #coche #casa-nueva
  const tags: string[] = [];
  const tagRe = new RegExp(`(^|\\s)#([${LETTERS}]{1,32})${END}`, 'g');
  text = text.replace(tagRe, (_all, lead: string, tag: string) => {
    const t = tag.toLowerCase();
    if (!tags.includes(t) && tags.length < 20) tags.push(t);
    return lead;
  });

  // Prioridad: !1 … !3
  let priority: Priority = 0;
  const pr = take(text, new RegExp(`(^|\\s)!([1-3])${END}`));
  if (pr) {
    priority = Number(pr.groups[0]) as Priority;
    text = pr.rest;
  }

  // Hora
  let hour: number | null = null;
  let minute = 0;
  const setTime = (h: string, m?: string) => {
    const hh = Number(h);
    const mm = m ? Number(m) : 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      hour = hh;
      minute = mm;
      return true;
    }
    return false;
  };

  const partOfDay = take(text, new RegExp(`(^|\\s)por la (mañana|manana|tarde|noche)${END}`, 'i'));
  if (partOfDay) {
    hour = PARTS_OF_DAY[fold(partOfDay.groups[0] ?? '')] ?? null;
    text = partOfDay.rest;
  }

  const timePatterns = [
    new RegExp(`(^|\\s)a (?:las|la) (\\d{1,2})(?::(\\d{2}))?(?:\\s?h)?${END}`, 'i'),
    new RegExp(`(^|\\s)(\\d{1,2}):(\\d{2})(?:\\s?h)?${END}`),
    new RegExp(`(^|\\s)(\\d{1,2})\\s?h${END}`, 'i'),
  ];
  for (const re of timePatterns) {
    const t = take(text, re);
    if (t && setTime(t.groups[0] ?? '', t.groups[1] || undefined)) {
      text = t.rest;
      break;
    }
  }

  // Fecha
  const today = startOfDay(now);
  let day: Date | null = null;

  const datePatterns: Array<[RegExp, (g: string[]) => Date | null]> = [
    [new RegExp(`(^|\\s)pasado (?:mañana|manana)${END}`, 'i'), () => addDays(today, 2)],
    [new RegExp(`(^|\\s)hoy${END}`, 'i'), () => today],
    [new RegExp(`(^|\\s)(?:mañana|manana)${END}`, 'i'), () => addDays(today, 1)],
    [
      new RegExp(`(^|\\s)en (\\d{1,3}|un|una) (d[ií]as?|semanas?)${END}`, 'i'),
      (g) => {
        const n = /^\d+$/.test(g[0] ?? '') ? Number(g[0]) : 1;
        const unit = fold(g[1] ?? '');
        return addDays(today, unit.startsWith('semana') ? n * 7 : n);
      },
    ],
    [
      new RegExp(`(^|\\s)(?:el )?(?:pr[oó]ximo )?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)${END}`, 'i'),
      (g) => {
        const target = WEEKDAYS[fold(g[0] ?? '')];
        if (target === undefined) return null;
        const diff = (target - today.getDay() + 7) % 7 || 7;
        return addDays(today, diff);
      },
    ],
    [
      new RegExp(`(^|\\s)(?:el )?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?${END}`),
      (g) => {
        const d = Number(g[0]);
        const m = Number(g[1]) - 1;
        let y = g[2] ? Number(g[2]) : today.getFullYear();
        if (y < 100) y += 2000;
        const candidate = new Date(y, m, d);
        if (candidate.getMonth() !== m || candidate.getDate() !== d) return null; // 31/02 y similares
        if (!g[2] && candidate < today) return new Date(y + 1, m, d);
        return candidate;
      },
    ],
  ];

  for (const [re, toDate] of datePatterns) {
    const t = take(text, re);
    if (!t) continue;
    const d = toDate(t.groups);
    if (d) {
      day = d;
      text = t.rest;
      break;
    }
  }

  let dueAt: Date | null = null;
  let dueHasTime = false;
  if (day || hour !== null) {
    const base = day ?? today;
    dueHasTime = hour !== null;
    dueAt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour ?? DEFAULT_HOUR, hour !== null ? minute : 0);
    // Solo hora y ya pasó hoy → mañana a esa hora.
    if (!day && dueAt <= now) {
      const next = addDays(today, 1);
      dueAt = new Date(next.getFullYear(), next.getMonth(), next.getDate(), hour ?? DEFAULT_HOUR, minute);
    }
  }

  let title = text.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  title = title.replace(/^[,.;:\s]+|[,;:\s]+$/g, '').trim();
  if (!title) title = input.trim();

  return { title, tags, priority, dueAt, dueHasTime };
}
