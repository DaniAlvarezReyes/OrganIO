// Genera scripts/windows/manifest.sha256: huella de cada fichero del proyecto para que el
// lanzador compruebe, la primera vez, que la copia está completa. Normaliza BOM y CRLF.
// Uso: node scripts/make-manifest.mjs
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.expo', '.git', '.organio', '.temp', 'web-build']);
const SKIP_FILES = new Set(['package-lock.json', 'manifest.sha256', '.env']);

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(full);
    } else if (!SKIP_FILES.has(name) && !name.endsWith('.png')) {
      yield full;
    }
  }
}

const lines = [];
for (const file of walk(root)) {
  let bytes = readFileSync(file);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3);
  const hash = createHash('sha256').update(bytes.filter((b) => b !== 13)).digest('hex');
  lines.push(`${hash}  ${relative(root, file).split(sep).join('/')}`);
}
writeFileSync(join(root, 'scripts', 'windows', 'manifest.sha256'), lines.join('\n') + '\n');
console.log(`manifest.sha256: ${lines.length} ficheros`);
