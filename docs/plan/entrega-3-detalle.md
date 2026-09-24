# Entrega 3: detalle de tarea y búsqueda

Objetivo: que una tarea deje de ser un título con estado y pase a ser el sitio donde vive el trabajo — subtareas, notas, imágenes y su historia — y poder encontrar cualquier tarea antigua.

La base de datos ya está hecha y probada desde la entrega 1: `subtasks`, `task_notes`, `attachments`, `task_events`, el bucket `attachments` con carpeta por usuario y la RPC `search_tasks` (texto, estados, etiquetas, rango de fechas, `has_attachments`, y `matched_in` para saber si el acierto vino del título, la descripción o una nota). Esta entrega es **solo interfaz y capa de datos**. Si aparece la necesidad de tocar SQL, es señal de que algo se está diseñando mal: primero se consulta con Dani.

Coste: 0 €.

Fuera de alcance: subtareas sugeridas con IA (entrega 5), recordatorios y avisos de estancamiento (entrega 4), búsqueda por significado (entrega 9), edición de imágenes.

Depende de: nada de la entrega 2.5. Se puede desarrollar en paralelo al paso a la nube, salvo T4, que conviene probar también contra la nube cuando esté (el bucket local y el de la nube se comportan igual, pero las URL firmadas no).

## Tareas

### T0 · Fallo de `004_storage.test.sql` — **investigado, resuelto en diagnóstico** (23/09)

No era estado sucio de la base local: se reprodujo igual con la base recién creada. Es una divergencia de paridad entre el entorno local y el de CI.

- La imagen real de Supabase Storage (`storage-api:v1.72.1`) trae un disparador propio, `protect_objects_delete BEFORE DELETE ... EXECUTE FUNCTION storage.protect_delete()`, que revienta ante **cualquier** `DELETE` por SQL sobre `storage.objects`, sea de quien sea la fila, y lo hace antes de que la RLS llegue a evaluarse. No está en nuestras migraciones: viene de la imagen.
- `scripts/db-ci/supabase_stub.sql`, el sustituto que usa CI, define `storage.objects` con RLS pero sin ese disparador. Allí el `DELETE` se filtra en silencio a cero filas, que es justo lo que `is_empty` espera, y la prueba pasa.
- Conclusión: **las políticas del bucket no están mal.** La que está mal es la aserción de la línea 73, que da por hecho un comportamiento que el Storage real no tiene. Y el problema de fondo es que el stub de CI daba por buena una prueba que no refleja la realidad.

### T0b · Arreglar la prueba y la paridad del stub (Claude Code; **revisa y ataca Codex**)

- Línea 73 de `supabase/tests/database/004_storage.test.sql`: `is_empty` pasa a `throws_ok`, y el nombre de la aserción pasa a decir lo que de verdad demuestra — que Storage bloquea el borrado directo por SQL —, no lo que nos gustaría que demostrase.
- `scripts/db-ci/supabase_stub.sql` gana el mismo disparador `protect_delete`. Sin eso, CI seguirá aprobando pruebas escritas contra una ficción, y este fallo volverá con otra cara.
- **Recuperar la cobertura perdida.** Con el disparador delante, `attachments_delete_own` deja de estar demostrada por esta suite. Se recupera en dos sitios: una aserción estructural en `001_structure.test.sql` (la política existe, es `for delete`, `to authenticated`, y su `using` exige carpeta propia), y la prueba real en T4, atacando por el cliente de Storage, que es el camino que usa la app.
- **Repasar el resto del stub.** Si `storage.objects` divergía, otras piezas pueden divergir igual. Comparar lo que el stub define contra lo que hay en la base local real y anotar en `docs/SEGURIDAD.md` qué cubre de verdad CI y qué no.
- Aceptación: `npx supabase test db` en verde en local **y** el trabajo `database` de CI en verde, con la misma prueba y por el mismo motivo en los dos sitios.

### T0c · Cerrar las divergencias del stub (Claude Code; revisa Codex)

Decisión sobre lo que quedó documentado en `docs/SEGURIDAD.md` tras T0b. No se corrige todo: se corrige lo que puede dejar pasar un fallo de seguridad, y se documenta lo demás.

- **Corregir ahora, porque cambian lo que el stub permite:**
  - RLS habilitada en `storage.buckets`, con cero políticas, como en el Storage real.
  - Los `GRANT` a `anon` sobre `storage.objects` y `storage.buckets`, como en el Storage real. Hoy el stub no se los da, así que una política escrita por error `to public` en vez de `to authenticated` pasaría en CI y sería explotable en producción. Es el fallo más caro de los que quedan y el más fácil de cometer.
  - Si alguna prueba falla al corregir esto, **no se toca la prueba hasta entender por qué**: significa que pasaba apoyándose en que el stub era más permisivo, y eso es un hallazgo, no una molestia.
- **Dejar solo documentadas:** las columnas que faltan en `storage.objects`, `storage.buckets` y `auth.users`, y la volatilidad de `storage.foldername()`. Ninguna tiene consumidor hoy y ampliarlas por si acaso es mantenimiento sin retorno.
- **Regla nueva, ya en `AGENTS.md`:** el stub se amplía cuando una prueba lo necesita, nunca antes, y cada ampliación se comprueba contra la base local real (`pg_get_functiondef`, `\d`, `pg_policies`) antes de darse por buena.
- **Recuperar la prueba conductual del borrado.** La función `protect_delete` que se copió al stub —y la real, de la que se copió— tiene una vía de escape: solo lanza excepción si `storage.allow_delete_query` no vale `'true'`. Es un GUC de marcador de posición, así que en principio cualquier rol puede fijarlo en su propia sesión. Si es así, la prueba que se dio por imposible sí se puede escribir:

  ```sql
  set local storage.allow_delete_query = 'true';
  select is_empty(
    $$ delete from storage.objects where bucket_id = 'attachments' returning id $$,
    'Con el guardarraíl levantado, la RLS impide que B borre las imágenes de A'
  );
  ```

  Eso separa bien las dos cosas: `protect_delete` es un guardarraíl contra borrados accidentales por SQL, no una barrera de seguridad; la barrera es la RLS. Probar la RLS con el guardarraíl levantado es lo correcto, y funciona igual en el stub y en Storage real ahora que el stub es fiel. **Primero comprobar si `authenticated` puede fijar ese GUC**; si no puede, se anota por qué y se deja la cobertura en T4 como está.
- Corregir de paso el recuento de `docs/SEGURIDAD.md`, que dice 96 comprobaciones cuando el total real es 97.
- Aceptación: `npx supabase test db` en verde en local y el trabajo `database` de CI en verde, y la sección de paridad de `docs/SEGURIDAD.md` dice qué se corrigió, qué se dejó y por qué.

### T1 · Capa de datos (Claude Code; revisa Codex)

- En `apps/app/src/data/api.ts`, añadir columnas explícitas y funciones para subtareas, notas, adjuntos e historial. Nunca `select('*')` ni enviar `user_id`: lo pone el servidor.
- En `apps/app/src/data/queries.ts`, los hooks correspondientes y las claves de caché. Al tocar una subtarea, una nota o un adjunto, invalidar también la tarea: el servidor actualiza `last_progress_at` y el progreso, y la pantalla debe reflejarlo sin recargar a mano.
- Aceptación: `npm run typecheck` en verde y pruebas de `data.test.ts` que comprueben que ninguna consulta pide columnas de más ni envía `user_id`.

### T2 · Subtareas (Claude Code; revisa Codex)

- En `apps/app/app/task/[id].tsx`: lista de subtareas con casilla, añadir con Enter sin salir del campo, reordenar y borrar.
- El campo `position` lo gestiona el servidor (`private.subtasks_before_write`). El cliente propone el orden, no lo calcula por su cuenta.
- El progreso de la tarea (hecho / total) se lee de la tarea, que lo calcula el servidor; no se cuenta en el cliente.
- Aceptación: añadir una subtarea marca la tarea como avanzada y el hilo vuelve a índigo sin recargar la pantalla.

### T3 · Notas (Claude Code; revisa Codex)

- Notas en orden inverso, añadir, editar y borrar. Límite de 20.000 caracteres de `LIMITS.noteMax`, con aviso al acercarse, no al pasarse.
- Aceptación: una nota larga se guarda entera y vuelve a aparecer igual tras cerrar y abrir la app.

### T4 · Imágenes (Claude Code; **revisa y ataca Codex**)

- Subida al bucket `attachments` respetando la ruta obligatoria `<user_id>/<task_id>/<uuid>.<ext>`. Límite de 10 MB y los cuatro tipos permitidos, validados en el cliente antes de subir para dar un mensaje decente, sabiendo que quien manda es Storage.
- Los ficheros son inmutables (no hay política de UPDATE): sustituir una imagen es subir otra y borrar la anterior.
- Se muestran con URL firmadas de corta duración, nunca públicas. En web, `expo-image-picker`; comprobar que en Safari del iPhone la selección desde la galería funciona.
- Fila en `attachments` y objeto en Storage tienen que ir a la vez: si falla la segunda mitad, no queda basura.
- Aceptación: Codex intenta subir a la carpeta de otro usuario, a una tarea ajena, con un tipo no permitido y con un fichero de 11 MB; los cuatro intentos fallan. Se anota en `docs/revisiones.md`.

### T5 · Historial (Claude Code; revisa Codex)

- `task_events` en el detalle, en español y en lenguaje humano («Pasó a En curso», «Se añadió una nota»), no el `kind` en crudo.
- Plegado por defecto: el historial es para consultar, no para ocupar la pantalla.
- Aceptación: la secuencia crear → cambiar de estado → añadir subtarea → añadir nota deja cuatro entradas legibles y en orden.

### T6 · Búsqueda (Claude Code; revisa Codex)

- Pantalla `apps/app/app/search.tsx` sobre `search_tasks`, con texto, estados, etiquetas, rango de fechas y «solo con imágenes».
- Retardo de 250 ms al teclear. El texto se manda tal cual: la RPC ya lo recorta a 200 y escapa los comodines.
- Usar `matched_in` para enseñar dónde está el acierto (en el título, en la descripción, en una nota). Es lo que diferencia esta búsqueda de un filtro cualquiera.
- Incluye tareas hechas y descartadas, al contrario que la lista principal: es justo para lo que se busca.
- Aceptación: buscar «segu» encuentra «seguro» por el acierto parcial de título; buscar un texto que solo aparece en una nota encuentra la tarea y lo indica.

### T7 · Cierre (Claude Code; revisa Codex)

- Registrar `task_details` y `search` como activas en `packages/core/src/features.ts` y en `private.app_features`. Las claves ya existen; hay prueba de sincronía que lo comprueba.
- Extender la prueba de extremo a extremo con el recorrido completo: crear tarea, añadir subtarea, nota e imagen, buscarla y abrirla desde los resultados.
- Actualizar README, la tabla de estado de `AGENTS.md`, `docs/estado.md` y `docs/trabajos.md`.

## Decisiones de diseño (cerradas el 22/09; boceto en el proyecto de diseño)

1. **El detalle es una pantalla completa con secciones visibles**, no pestañas ni menús. Subtareas, notas, imágenes e historial son cada una su propio bloque; solo el historial va plegado, porque se consulta y no se trabaja en él.
2. **La búsqueda se entra desde el campo de la cabecera de la lista**, no desde una tercera pestaña. Al escribir, abre la pantalla de búsqueda.
3. **El historial registra** cambios de estado, subtareas creadas y completadas, notas e imágenes añadidas. No registra ediciones de título ni de descripción.
4. **La captura rápida enseña lo que ha entendido antes de guardar**: título, fecha, etiqueta y prioridad, cada uno tocable para corregirlo. Interpretar lenguaje natural sin enseñar la interpretación es un error silencioso.
5. **Un filtro aplicado se ve aplicado**: chip relleno, recuento de resultados y «Quitar filtros» siempre a la vista.
6. **Cada resultado de búsqueda dice dónde está el acierto** (título, descripción o nota) y enseña el trozo, usando `matched_in` de la RPC.
7. **«Sugerir subtareas» tiene su sitio en el detalle desde ya**, marcado como entrega 5 y sin funcionar. Reserva el hueco y evita rehacer la pantalla en la 5.
8. **Todo lo tocable mide 44 px como mínimo.** Casillas, chips, botones de la barra inferior.
9. **Colores y tipografía: los que ya hay** en `apps/app/src/ui/theme.ts`. El boceto no introduce ni un color nuevo. Si hay que cambiar alguno, se cambia ahí.

## Aceptación de la entrega

- Dani crea una tarea, la parte en subtareas, le añade una nota y una foto desde el iPhone, la cierra, y semanas después la encuentra buscando una palabra que solo escribió en la nota.
- Ninguna migración nueva.
- `npm run typecheck`, `npm test` y `npx supabase test db` en verde, y el trabajo de extremo a extremo de CI también.
