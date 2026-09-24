# OrganIO: instrucciones para agentes (Claude Code y Codex)

Este fichero lo leen los dos agentes. Es la fuente única de reglas del proyecto: si algo cambia, se cambia aquí.

## Qué es

App de tareas y rutinas con seguimiento activo: avisa de lo que lleva días parado, propone subtareas y se integra con calendario y Telegram. Producto multiusuario desde el diseño; hoy se usa en modo personal y sin coste. Dani dirige y valida; los agentes ejecutan.

Idioma: español en interfaz, comentarios, documentación y mensajes de commit.

## Estado

| Entrega | Contenido | Estado |
| --- | --- | --- |
| 1 | Cimientos: núcleo, base de datos, seguridad, pruebas | Hecha |
| 2 | App universal en navegador: acceso por código, lista, captura rápida, edición | Hecha |
| 2.5 | Paso a la nube: Supabase (UE) + web publicada con HTTPS | **En curso** · `docs/plan/entrega-2.5-nube.md` |
| 3 | Detalle de tarea: subtareas, notas, imágenes, historial, búsqueda | Pendiente |
| 4 | Bot de Telegram, recordatorios y avisos de estancamiento | Pendiente |
| 5 | Subtareas con IA | Pendiente |
| 6 | Rutinas | Pendiente |
| 7 | Google Calendar | Pendiente |
| 8 | App nativa: widget, compartir, Face ID, push (requiere Apple Developer) | Pendiente |

La base de datos de la entrega 3 ya existe y está probada (tablas, RLS, `search_tasks`). Falta la interfaz.

## Estructura

- `apps/app`: la app. Expo SDK 57, React Native 0.86, expo-router, TanStack Query, supabase-js. Web primero; el código nativo ya está preparado.
- `packages/core`: lógica compartida sin plataforma (estados, validaciones zod, captura rápida, estancamiento, registro de funcionalidades).
- `supabase/`: `migrations/`, `tests/database/` (pgTAP), `config.toml`, `seed.sql`, `templates/`.
- `scripts/`: lanzador de Windows (`windows/`), iconos, manifiesto, pruebas de CI (bash).
- `vendor/`: sustitutos de dependencias vulnerables (ver `docs/SEGURIDAD.md`).
- `docs/`: `SEGURIDAD.md` y `plan/` (planes de cada entrega).

## Comandos

- Arrancar todo: `OrganIO.cmd` (`-Lan` iPhone en la misma wifi, `-Stop`, `-Reset`).
- Verificación local obligatoria antes de dar una tarea por terminada:
  - `npm run typecheck`
  - `npm test`
  - `npx supabase test db` (con Supabase local arrancado)
- Solo en CI (bash + PostgREST, no en Windows): `npm run test:db`, `npm run test:api`, `npm run test:e2e`.
- Tras cambiar migraciones: `npm run gen:types -w @organio/app`.
- Tras añadir o quitar ficheros del proyecto: `node scripts/make-manifest.mjs`.

## Reglas no negociables

1. **RLS siempre.** Toda tabla nueva en `public` lleva RLS, una política por operación y permisos concedidos columna a columna. `supabase/tests/database/001_structure.test.sql` falla si no.
2. **El servidor manda.** Marcas de tiempo, progreso, historial y campos calculados los escribe la base de datos, nunca el cliente.
3. **Migraciones inmutables.** Una migración aplicada no se edita: cualquier cambio va en una nueva.
4. **Consultas explícitas.** Nunca `select('*')` ni enviar `user_id`; columnas explícitas en `apps/app/src/data/api.ts`.
5. **Core y SQL a la vez.** Límites, estados y funcionalidades se cambian en `packages/core` y en SQL juntos (hay pruebas de sincronía).
6. **Secretos.** Nunca leer, mostrar ni versionar `.env`, claves secretas, contraseñas ni tokens. La app solo lleva la clave publicable (`env.ts` rechaza la secreta). Si una tarea necesita un secreto, lo introduce Dani.
7. **Dependencias.** Nada de `npm audit fix --force`. Cada dependencia nueva, justificada y revisada en `docs/SEGURIDAD.md`.
8. **El stub de CI es una réplica, no un atajo.** `scripts/db-ci/supabase_stub.sql` se amplía cuando una prueba lo necesita, nunca por adelantado, y cada pieza que se añade se comprueba antes contra la base local real (`pg_get_functiondef`, `\d`, `pg_policies`, `role_table_grants`). Si una prueba pasa en CI y falla en local, la sospecha por defecto es el stub, no la prueba. Divergencias conocidas y su motivo: `docs/SEGURIDAD.md`.
9. **Pruebas con cada cambio.** Lógica pura con vitest; datos y permisos con pgTAP o `tests/api.it.test.ts`; flujos de interfaz con la prueba de extremo a extremo.
10. **Diseño.** Tokens en `apps/app/src/ui/theme.ts`. Un único elemento con carácter: el hilo que pasa de índigo a ámbar al estancarse. Tipografía del sistema, sin estilos sueltos.
11. **Errores.** Mensajes en español y sin detalles técnicos: siempre a través de `toUserError`.
12. **Funcionalidades nuevas** se registran en `packages/core/src/features.ts` y en `private.app_features`.
13. **Documentación.** Al cerrar una tarea, actualizar README, `docs/SEGURIDAD.md` y la tabla de estado de este fichero si procede.

## Trabajo entre Claude Code y Codex

- **Claude Code hace la mayor parte:** planifica, implementa, integra, prueba, documenta y hace los commits.
- **Codex es el revisor independiente.** Revisa todo cambio de Claude Code antes del commit, sin modificar ficheros. En cambios de seguridad, migraciones, autenticación o permisos, además escribe pruebas que intenten romper lo implementado. Puntualmente implementa tareas mecánicas y acotadas (`--sandbox workspace-write`; nunca `danger-full-access`).
- **Cómo se le llama.** Codex ya no es un servidor MCP (`codex mcp-server` se eliminó en la 0.154.0 y no hay reemplazo). Se llama con `scripts/windows/revision.ps1`, que lo automatiza entero: Claude Code escribe el encargo, lanza el script y lee la respuesta. Dani no ejecuta nada a mano.
  1. Claude Code escribe `.organio/revision/encargo.md` (carpeta ignorada por git): objetivo de la tarea, criterios de aceptación y ficheros tocados. Solo eso: el diff, las reglas de este fichero y el formato de salida los pega el script.
  2. Claude Code lanza `npm run revision` (o el script con parámetros), **subiendo el tiempo límite de su terminal a 10 minutos**. Con `-Base main` revisa la rama entera en vez de los cambios sin commit; con `-Esfuerzo medium` o `high` sube el razonamiento en seguridad, migraciones, autenticación y permisos; con `-Escribir` deja que Codex escriba pruebas que intenten romper lo implementado. Nunca `danger-full-access`.
  3. Si la revisión fuera a pasar de 10 minutos, se lanza con `-Fondo` y se pregunta después con `-Estado`, que devuelve 2 mientras sigue en curso. Así ningún tiempo límite corta a Codex a medias.
  4. La respuesta queda en `.organio/revision/salida.md` y el script la imprime. Devuelve bloqueantes, importantes y sugerencias, y un veredicto.
  5. **La salida lleva sellada la huella del encargo que la produjo**, en su primera línea. Antes de leerla, Claude Code comprueba con `-Huella` que coincide con el encargo actual: si no coincide, esa salida es de otra revisión y no vale. El script devuelve 3 cuando no coinciden y 2 cuando la revisión sigue en curso.
  6. Un encargo que no tiene diff (una investigación, un diagnóstico) se lanza con `-SinDiff`.
- **Por qué acotado.** `codex exec` es un agente, no una consulta: si se le suelta el repositorio se pone a explorarlo y tarda muchísimo. Por eso el encargo le prohíbe abrir nada que no se le dé, y por eso el diff viaja dentro del prompt.
- **Cuatro ojos en los dos sentidos:** lo que hace Claude Code lo revisa Codex, y lo que hace Codex lo revisa Claude Code, que además ejecuta las pruebas.
- **Hallazgos:** bloqueante (bug, fallo de seguridad o incumplimiento de estas reglas), importante o sugerencia, siempre con fichero, línea y motivo. Los bloqueantes se corrigen antes del commit. Si hay discrepancia sobre un bloqueante, decide Dani.
- **Registro:** cada revisión se anota en `docs/revisiones.md`.
- **Un fichero, un agente:** nunca dos agentes escribiendo a la vez el mismo fichero. En paralelo solo si no comparten ficheros.
- **Ramas:** una rama por tarea (`feat/<entrega>-<tarea>`), commits pequeños, mensajes en español.
- **Confirmación de Dani obligatoria** para: `git push`, `supabase db push`, `link`, `reset` y `config push`, despliegues, cualquier acción con credenciales y borrar datos.
- **No fiarse de informes:** el orquestador revisa el `git diff` y ejecuta las pruebas él mismo antes de aceptar el trabajo de Codex.

## Formato de cierre de cada tarea

Qué se ha hecho y por qué, ficheros tocados, pruebas ejecutadas con su resultado, y riesgos o pendientes.
