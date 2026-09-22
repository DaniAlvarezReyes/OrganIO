// Genera los iconos PNG de la app a partir de apps/app/assets/brand/organio-mark.svg.
// Se ejecuta solo tras `npm install` (postinstall). Los PNG no se versionan: el SVG es la fuente.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'apps', 'app');
const markSvg = readFileSync(join(app, 'assets', 'brand', 'organio-mark.svg'), 'utf8');
const inner = markSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '');

const BG = '#3552C7';
const svg = (body, background) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${background ? `<rect width="1024" height="1024" fill="${background}"/>` : ''}${body}</svg>`;
// Android recorta el icono adaptable: la marca se reduce al 66 % central.
const scaled = (body) => `<g transform="translate(174 174) scale(0.66)">${body}</g>`;
const white = (body) => body.replace(/#[0-9A-Fa-f]{6}/g, '#FFFFFF');

const targets = [
  { file: 'assets/icon.png', size: 1024, svg: svg(inner, BG) },
  { file: 'assets/favicon.png', size: 48, svg: svg(inner, BG) },
  { file: 'assets/android-icon-foreground.png', size: 1024, svg: svg(scaled(inner)) },
  { file: 'assets/android-icon-monochrome.png', size: 1024, svg: svg(scaled(white(inner))) },
  { file: 'public/apple-touch-icon.png', size: 180, svg: svg(inner, BG) },
  { file: 'public/icon-192.png', size: 192, svg: svg(inner, BG) },
  { file: 'public/icon-512.png', size: 512, svg: svg(inner, BG) },
];

let Resvg;
try {
  ({ Resvg } = await import('@resvg/resvg-js'));
} catch {
  const missing = targets.filter((t) => !existsSync(join(app, t.file)));
  if (missing.length) {
    console.error('[iconos] Falta @resvg/resvg-js y no hay iconos generados. Ejecuta `npm install` sin --omit=dev.');
    process.exit(1);
  }
  console.warn('[iconos] @resvg/resvg-js no disponible; se mantienen los iconos existentes.');
  process.exit(0);
}

for (const t of targets) {
  const png = new Resvg(t.svg, { fitTo: { mode: 'width', value: t.size }, background: 'rgba(0,0,0,0)' }).render().asPng();
  const out = join(app, t.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
}
console.log(`[iconos] ${targets.length} iconos generados desde organio-mark.svg`);
