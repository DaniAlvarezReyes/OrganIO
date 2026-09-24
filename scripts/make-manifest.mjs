// Genera scripts/windows/manifest.sha256: huella de cada fichero del proyecto para que el
// lanzador compruebe, la primera vez, que la copia está completa. Normaliza BOM y CRLF.
// Uso: node scripts/make-manifest.mjs (necesita git)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SKIP_FILES = new Set(['package-lock.json', 'manifest.sha256']);
// Segunda barrera, por si un .env dejara de estar en .gitignore: solo la plantilla versionada.
const isSecretEnv = (name) => (name === '.env' || name.startsWith('.env.')) && name !== '.env.example';

// La lista sale de git: lo versionado más lo nuevo, nunca lo que ignora .gitignore (secretos,
// claves de firma, node_modules, iconos generados, estado local…). Así no depende de mantener
// aquí una lista de nombres que siempre se quedaría corta.
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter((path) => {
    const name = path.split('/').pop();
    return path && !SKIP_FILES.has(name) && !isSecretEnv(name) && !name.endsWith('.png') && existsSync(join(root, path));
  })
  .sort();

const lines = [];
for (const file of new Set(files)) {
  let bytes = readFileSync(join(root, file));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3);
  const hash = createHash('sha256').update(bytes.filter((b) => b !== 13)).digest('hex');
  lines.push(`${hash}  ${file}`);
}
writeFileSync(join(root, 'scripts', 'windows', 'manifest.sha256'), lines.join('\n') + '\n');
console.log(`manifest.sha256: ${lines.length} ficheros`);
