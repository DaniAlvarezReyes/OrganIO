function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Mezcla lineal de dos colores #RRGGBB; t = 0 → a, t = 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const to = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`.toUpperCase();
}

/**
 * Color del hilo de una tarea: del color fresco al de alerta según se acerca al umbral de
 * estancamiento. La curva es suave al principio para que solo «tire» en el último tramo.
 */
export function threadColor(ratio: number, fresh: string, stale: string): string {
  return mixHex(fresh, stale, Math.pow(Math.min(1, Math.max(0, ratio)), 2));
}
