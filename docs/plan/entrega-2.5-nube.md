# Entrega 2.5: paso a la nube

Objetivo: usar OrganIO desde cualquier sitio con el PC apagado. Supabase en la nube (plan gratuito, región UE) y la web publicada con HTTPS en Cloudflare Pages (gratuito). El entorno local con Docker se mantiene para desarrollar.

Coste: 0 €.

Fuera de alcance: migrar las tareas locales (la nube empieza limpia), dominio propio, Telegram (entrega 4).

## Tareas

### T0 · Ajustes del primer arranque (Claude Code; revisa Codex)

- En `scripts/windows/organio.ps1`, eliminar el `supabase db reset` redundante del primer arranque: `supabase start` ya aplica migraciones y `seed.sql`. El reset solo debe ejecutarse con `-Reset`. El marcador de inicialización se crea tras el `start`.
- En `supabase/config.toml`, desactivar `[analytics]`: no se usa y en Windows genera un aviso.
- Regenerar el manifiesto: `node scripts/make-manifest.mjs`.
- Aceptación: primer arranque en limpio sin reset duplicado ni aviso de analytics. El script conserva UTF-8 con BOM y sigue sin comillas tipográficas.

### T1 · Cuentas y proyecto (Dani)

- Crear el proyecto `organio` en Supabase, región Frankfurt (eu-central-1). Guardar la contraseña de la base en un gestor de contraseñas.
- Activar la verificación en dos pasos en Supabase, GitHub y Cloudflare.
- En la carpeta del proyecto: `npx supabase login` y `npx supabase link --project-ref <ref>`.
- Crear `apps/app/.env.cloud` con la URL del proyecto y la clave publicable (Project Settings › API). Nunca la secreta.

### T2 · Dos entornos en el lanzador (Claude Code; revisa Codex)

- `OrganIO.cmd -Cloud` arranca la app contra la nube usando `apps/app/.env.cloud`, sin tocar Supabase local.
- Sin `-Cloud`, todo funciona como hasta ahora.
- Añadir `apps/app/.env.cloud.example` y la excepción correspondiente en `.gitignore`.
- Aceptación: se cambia de entorno sin editar ficheros a mano, y `env.ts` sigue rechazando claves secretas.

### T3 · Base de datos en la nube (Claude Code, con confirmación de Dani; revisa y ataca Codex)

- `npx supabase db push` para aplicar las migraciones.
- Invitar el correo de Dani: el `seed.sql` no se aplica en la nube. Se hace con `insert into private.signup_allowlist (email) values ('…');` en el editor SQL, y lo ejecuta Dani.
- Comprobar que `signup_mode` es `invite_only`.
- Aceptación: las migraciones están aplicadas y solo el correo invitado puede darse de alta.

### T4 · Autenticación en la nube (Claude Code; revisa y ataca Codex)

- Llevar a la nube la configuración de `config.toml`: código de 600 s, un envío por minuto, plantillas en español y URL permitidas (solo las de la web publicada). Usar `npx supabase config push` con confirmación, o documentar los pasos en el panel.
- Anotar en `docs/SEGURIDAD.md` que el correo integrado de Supabase tiene un límite bajo de envíos por hora: basta para un usuario, pero antes de abrir el registro hará falta SMTP propio.

### T5 · Publicación de la web (Claude Code; revisa y ataca Codex: CSP y cabeceras)

- Script `npm run deploy:web`: build con `.env.cloud` (`expo export --clear`) y publicación en Cloudflare Pages con `npx wrangler pages deploy`. Requiere confirmación de Dani.
- En `public/_headers`, restringir `connect-src` al dominio exacto del proyecto (`https://<ref>.supabase.co` y `wss://<ref>.supabase.co`), generado en el build a partir de `.env.cloud`, sin escribirlo a mano.
- Aceptación: la web carga por HTTPS, las cabeceras se comprueban con `curl -I` y Dani verifica en Chrome y en Safari del iPhone que la consola no muestra avisos de CSP.

### T6 · Seguridad, copias y documentación (Claude Code; revisa Codex)

- Completar la lista de comprobación de la nube en `docs/SEGURIDAD.md`: 2FA, SSL obligatorio, solo `public` expuesto, GraphQL desactivado, URL de Auth.
- Script `npm run backup:cloud` con `supabase db dump` hacia una carpeta local ignorada por git.
- Actualizar el README (sección nube) y la tabla de estado de `AGENTS.md`.

## Aceptación de la entrega

- Desde el iPhone con datos móviles (sin la wifi de casa), Dani entra con el código que llega a su Gmail y crea y edita tareas con el PC apagado.
- El entorno local sigue funcionando igual.
- Ningún secreto en el repositorio ni en el bundle web.
- `npm run typecheck`, `npm test` y `npx supabase test db` en verde.
