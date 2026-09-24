// Extremo a extremo (jsdom): simula un navegador; lo que jsdom no trae (Fetch API) se toma de Node.
// Extremo a extremo: carga el build web real con una sesión iniciada, comprueba que pinta las
// tareas de la base, escribe en la captura rápida y verifica lo que llega a PostgREST.
import { JSDOM, VirtualConsole } from 'jsdom';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dist, accessToken, userId, apiUrl, anonKey] = process.argv.slice(2);
const raw = readFileSync(join(dist, 'index.html'), 'utf8');
const bundle = raw.match(/_expo\/static\/js\/web\/[^"]+/)[0];
const html = raw.replace(/<script[^>]*><\/script>/g, '');
const now = Math.floor(Date.now() / 1000);
const session = {
  access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'e2e',
  user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'a@it.dev', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};

const errors = [];
const vc = new VirtualConsole();
vc.on('error', (e) => errors.push(String(e)));
vc.on('jsdomError', (e) => errors.push(String(e.message ?? e)));
const dom = new JSDOM(html, {
  url: 'http://localhost:8081/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.localStorage.setItem('organio.auth', JSON.stringify(session)); },
});
const w = dom.window;
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const calls = [];
w.fetch = async (url, init = {}) => { const { signal, ...rest } = init; try { const r = await globalThis.fetch(String(url), { ...rest, headers: Object.fromEntries(new globalThis.Headers(rest.headers ?? {})) }); calls.push(`${rest.method ?? 'GET'} ${String(url).replace(/^https?:\/\/[^/]+/, '')} → ${r.status}${r.status >= 400 ? ' ' + (await r.clone().text()).slice(0, 160) : ''}`); return r; } catch (e) { calls.push(`FETCH ERROR ${String(url)}: ${e.message}`); throw e; } };
w.Headers = globalThis.Headers; w.Request = globalThis.Request; w.Response = globalThis.Response;
w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
w.eval(readFileSync(join(dist, bundle), 'utf8'));

const text = () => w.document.body.textContent;
const until = async (pred, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (pred()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
const result = {};

result.listaConTareaSembrada = await until(() => text().includes('Tarea sembrada'));
result.resumenCabecera = /abierta/.test(text());

const input = w.document.querySelector('input[aria-label="Nueva tarea"]');
result.hayCaptura = !!input;
Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(input, 'Revisar ITV mañana #coche !3');
input.dispatchEvent(new w.Event('input', { bubbles: true }));
// «mañana» y no un día de la semana: la etiqueta de un día concreto depende de qué día se ejecute
// (el viernes es «Mañana» los jueves). El análisis de días y sus etiquetas se prueban con fecha fija
// en packages/core/test/quickAdd.test.ts y apps/app/src/lib/lib.test.ts.
result.vistaPrevia = await until(() => text().includes('Prioridad alta') && text().includes('#coche') && text().includes('Mañana'), 3000);
input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
result.apareceEnLista = await until(() => text().includes('Revisar ITV'), 3000);
result.campoVaciado = input.value === '';

// Enlace externo (Atajos de iOS): el texto codificado llega decodificado y NO se crea solo.
const dom2 = new JSDOM(html, {
  url: 'http://localhost:8081/quick-add?text=Llamar%20al%20seguro%20ma%C3%B1ana%20%23coche', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w2) { w2.localStorage.setItem('organio.auth', JSON.stringify(session)); },
});
const w2 = dom2.window;
Object.assign(w2, { matchMedia: w.matchMedia, fetch: w.fetch, Headers: w.Headers, Request: w.Request, Response: w.Response, ResizeObserver: w.ResizeObserver });
w2.eval(readFileSync(join(dist, bundle), 'utf8'));
result.enlaceDecodificado = await until(() => w2.document.querySelector('input[aria-label="Nueva tarea"]')?.value === 'Llamar al seguro mañana #coche', 6000);

// El bundle usa el decodificador seguro, no el paquete vulnerable
const mapFile = readdirSync(join(dist, '_expo/static/js/web')).find((f) => f.endsWith('.map'));
const sources = JSON.parse(readFileSync(join(dist, '_expo/static/js/web', mapFile), 'utf8')).sources;
result.decodificadorSeguro = sources.some((s) => s.includes('vendor/decode-uri-component-safe')) && !sources.some((s) => s.includes('node_modules/decode-uri-component'));

await new Promise((r) => setTimeout(r, 1500));
const res = await fetch(`${apiUrl}/rest/v1/tasks?select=title,tags,priority,status,due_at,due_has_time&title=eq.Revisar%20ITV`, {
  headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
});
result.enBaseDeDatos = await res.json();
const fromLink = await fetch(`${apiUrl}/rest/v1/tasks?select=id&title=like.Llamar*`, { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } });
result.enlaceNoCreaSolo = (await fromLink.json()).length === 0;
result.errores = errors.slice(0, 5);

const row = result.enBaseDeDatos?.[0];
const checks = {
  'pinta las tareas de la base': result.listaConTareaSembrada,
  'muestra el resumen de la cabecera': result.resumenCabecera,
  'hay campo de captura rápida': result.hayCaptura,
  'la vista previa entiende fecha, etiqueta y prioridad': result.vistaPrevia,
  'la tarea nueva aparece en la lista al instante': result.apareceEnLista,
  'el campo se vacía tras añadir': result.campoVaciado,
  'llega a la base con los datos interpretados': !!row && row.priority === 3 && row.tags.join() === 'coche' && row.status === 'todo' && row.due_has_time === false,
  'un enlace de Atajos llega decodificado a la captura': result.enlaceDecodificado,
  'el enlace no crea la tarea sin confirmación': result.enlaceNoCreaSolo,
  'el bundle usa el decodificador seguro': result.decodificadorSeguro,
  'sin errores en consola': result.errores.length === 0,
};
let failed = 0;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`${ok ? 'ok    ' : 'FALLA '} ${name}`);
  if (!ok) failed++;
}
if (failed) console.log(JSON.stringify({ ...result, peticiones: calls }, null, 1));
process.exit(failed ? 1 : 0);
