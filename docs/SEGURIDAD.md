# Modelo de seguridad

Este documento describe qué protege OrganIO, frente a qué, con qué medidas y cómo se verifican. Se actualiza en cada entrega.

## Activos y amenazas

Los activos son los datos personales de cada usuario: tareas, notas, imágenes, historial de actividad y vínculos con servicios externos (Telegram, calendario).

| Amenaza | Ejemplo | Defensa principal |
| --- | --- | --- |
| Acceso entre usuarios | Un usuario consulta o modifica tareas ajenas conociendo su identificador | RLS y claves foráneas compuestas |
| Cliente manipulado | Peticiones directas a la API saltándose la interfaz | Privilegios por columna, validación en base de datos |
| Escalada de privilegios | Un usuario se asigna el plan de pago o invoca funciones internas | Columnas no escribibles, funciones `*_service` restringidas |
| Filtración de secretos | Clave de servicio o de terceros en el repositorio o en la app | Solo clave publicable en clientes, gitleaks en CI |
| Altas no deseadas | Terceros creando cuentas mientras el uso es personal | Registro solo por invitación en base de datos |
| Suplantación en Telegram | Vincular un chat ajeno a una cuenta | Códigos de un solo uso, con hash y caducidad |
| Abuso de costes | Uso masivo de la IA | Cuota diaria por usuario y plan |
| Exposición de metadatos | Ubicación GPS en fotos | Recompresión en el dispositivo (entrega 3) |

## Medidas implementadas (entrega 1)

**Aislamiento de datos.** Todas las tablas de `public` tienen RLS con una política por operación, limitada al rol `authenticated`. Las tablas hijas (subtareas, notas, adjuntos, historial, avisos) referencian a la tarea mediante la clave compuesta `(task_id, user_id)`, por lo que es imposible asociar datos a una tarea de otro usuario aunque se conozca su identificador.

**Privilegios mínimos.** Se retiran los privilegios que Supabase concede por defecto y se otorgan de forma explícita, columna a columna. El rol `anon` no tiene acceso a ninguna tabla y solo puede ejecutar `get_features()`. Las columnas calculadas por el servidor (`user_id`, `plan`, `last_progress_at`, `completed_at`, marcas de tiempo, vectores de búsqueda) no son escribibles por el cliente.

**Integridad del historial.** El registro de actividad (`task_events`), los avisos enviados y el uso de IA solo los escriben disparadores o funciones de servidor. El cliente puede leerlos, pero no alterarlos.

**Funciones seguras.** Las funciones `SECURITY DEFINER` fijan `search_path` vacío y comprueban la propiedad de los datos. El permiso de ejecución se revoca a `PUBLIC` y se concede de forma explícita. Las funciones con sufijo `_service` solo las ejecuta `service_role`.

**Reglas de dominio en la base de datos.** Las transiciones de estado, la normalización de etiquetas, los límites de longitud y los tipos de archivo se validan en PostgreSQL, además de en el cliente.

**Almacenamiento.** El bucket de imágenes es privado, con un límite de 10 MB y tipos MIME permitidos. Las rutas siguen el formato `<usuario>/<tarea>/<uuid>.<ext>` y se comprueba que la tarea pertenece al usuario. Los archivos no pueden sobrescribirse.

**Autenticación.** El acceso se realiza con un código de seis dígitos por correo, sin contraseñas. El código caduca a los 10 minutos y se admite un envío por minuto. Los tokens de refresco rotan. Mientras `signup_mode = 'invite_only'`, solo pueden darse de alta los correos de `private.signup_allowlist`.

**Telegram.** Los códigos de vinculación tienen 244 bits aleatorios, se guardan como hash SHA-256, son de un solo uso y caducan a los 10 minutos. Un chat solo puede estar vinculado a una cuenta.

**Minimización.** El borrado de la cuenta elimina en cascada todos los datos asociados. Los avisos y el uso de IA tienen retención limitada: la limpieza programada llega en la entrega 4.

## Medidas implementadas (entrega 2: app)

**Configuración pública controlada.** La app solo admite la URL del proyecto y la clave publicable. Si detecta una clave secreta (`service_role` o `sb_secret_…`), se niega a arrancar, para evitar que un despiste la incruste en el bundle web o en la app.

**Sesión.** En iOS y Android se guarda cifrada con AES-256-GCM. La clave está en el llavero del sistema, marcada como no transferible a otros dispositivos ni a copias de seguridad, y el nombre de cada entrada actúa como dato autenticado. Android tiene `allowBackup` desactivado. En web se usa `localStorage`, protegido por la política de seguridad de contenido y por la corta vida de los tokens (1 h, con rotación). No se aceptan tokens en la URL.

**Cierre de sesión.** Vacía la caché de datos del dispositivo, de modo que el siguiente usuario del mismo navegador no ve nada del anterior. Solo cierra el dispositivo actual.

**Entradas externas.** La ruta `/quick-add?text=…` (Atajos de iOS, más adelante widget) precarga el texto, lo limpia y lo recorta, pero nunca crea la tarea sin confirmación. Un enlace malicioso no puede introducir tareas.

**Datos.** Todas las consultas piden columnas explícitas, nunca envían `user_id` y validan la entrada con los esquemas compartidos antes de salir del dispositivo. Los errores se traducen a mensajes para el usuario sin exponer detalles internos.

**Web.** El build no contiene scripts en línea. `public/_headers` define una política de seguridad de contenido que solo permite scripts propios y conexiones a la propia app y a Supabase, impide incrustar la app en marcos ajenos y añade HSTS, `nosniff`, `no-referrer` y una política de permisos restrictiva. Estas cabeceras las aplica el alojamiento (Cloudflare Pages o Netlify); en desarrollo local no están activas.

## Dependencias

Cada `push` pasa `npm audit` y gitleaks en integración continua. Estado a 21/09/2026 (`npm audit --omit=dev`):

| Aviso | Dónde | Decisión |
| --- | --- | --- |
| `decode-uri-component` ≤ 0.4.2, denegación de servicio con URL mal formadas (GHSA-vcc3-ghjq-m6fr) | Dentro de la app web, vía expo-router → query-string | **Mitigado.** La versión corregida no es compatible con query-string, así que en el bundle se sustituye por `vendor/decode-uri-component-safe`, de coste lineal y probada contra el original. La prueba de extremo a extremo verifica que el bundle usa la versión segura. |
| `uuid` < 11.1.1, falta de comprobación de límites en v3/v5/v6 (GHSA-w5hq-g745-h8pq) | Solo en herramientas de compilación (generación del proyecto de Xcode) | **Aceptado.** No se incluye en la app y la función afectada no se invoca. Se revisa en cada actualización de Expo. |

`npm audit fix --force` **no debe usarse**: propone bajar Expo a la versión 46.

## Paridad entre CI y Storage real (23/09, entrega 3 · T0b)

`scripts/db-ci/supabase_stub.sql` es una réplica mínima de `auth` y `storage` para poder aplicar migraciones y pgTAP sobre un Postgres normal en CI, sin Docker. El 23/09 se descubrió que `storage.objects` en el Storage real (imagen `storage-api:v1.72.1`) trae un disparador `protect_delete` que el stub no reproducía: bloquea **cualquier** `DELETE` directo por SQL antes de que la RLS se evalúe. Una prueba pgTAP daba por hecho que un `DELETE` bloqueado por RLS devuelve 0 filas en silencio — cierto en el stub, falso en el Storage real — así que pasaba en CI por un motivo que no existe fuera de CI. Corregido: el stub ya incluye ese disparador y la prueba pasó a comprobar lo que de verdad ocurre (`throws_ok` en vez de `is_empty`). Detalle en `docs/revisiones.md` (T0 y T0b de la entrega 3).

Ese hallazgo obligó a revisar el resto del stub contra la base local real. Lo que se encontró, comparando `\d storage.objects`, `\d storage.buckets`, `pg_trigger`, `pg_policies` y `information_schema.role_table_grants` en la base local con lo que define el stub:

| Divergencia | Stub | Storage real | Riesgo si no se corrige |
| --- | --- | --- | --- |
| Disparador `protect_delete` en `storage.objects` | Ausente → **corregido** en T0b | Bloquea cualquier `DELETE` directo | Cerrado |
| Disparador `protect_delete` en `storage.buckets` | Ausente | Bloquea cualquier `DELETE` directo sobre buckets | Ninguna prueba borra buckets hoy; si se escribe una, pasaría en CI sin pasar en real |
| RLS en `storage.buckets` | Deshabilitada, con `GRANT SELECT` y `USAGE` de esquema a `authenticated`/`service_role` | Habilitada, con **cero políticas** → acceso directo por SQL denegado a todo el que no sea `service_role` | Comprobado con `set role authenticated` en el stub: un `SELECT` directo a `storage.buckets` funciona (devuelve el bucket `attachments`). En el Storage real, ese mismo `SELECT` fallaría por RLS. Ninguna prueba depende hoy de que `authenticated` lea `storage.buckets` por SQL directo |
| Privilegios de tabla en `storage.objects`/`storage.buckets` | Solo `authenticated`/`service_role` | **También `anon`**, con todos los privilegios (SELECT/INSERT/UPDATE/DELETE/…) — la barrera real es la RLS, no el `GRANT` | Si una política futura se escribiera por error `to public` en vez de `to authenticated`, el stub no lo detectaría (a `anon` le falta hasta el `GRANT`), pero en Storage real sí sería explotable |
| Columnas de `storage.objects` | `id, bucket_id, name, owner, created_at` | Además `updated_at, last_accessed_at, metadata, path_tokens, version, owner_id, user_metadata, archived_at, is_delete_marker, is_versioned` | Ninguna migración ni política propia las usa hoy. Si una futura entrega las necesita, el stub debe ampliarse antes |
| Columnas de `storage.buckets` | `id, name, public, file_size_limit, allowed_mime_types` | Además `updated_at, avif_autodetection, owner_id, type, versioning_status` (con checks) | Igual que arriba: sin impacto mientras no se usen |
| `storage.foldername()` | Sin volatilidad declarada (por defecto `VOLATILE`) | `IMMUTABLE` | Misma lógica, sin impacto funcional conocido |
| `auth.users` | Mínima: `id, email, created_at` | Decenas de columnas (contraseña cifrada, confirmación de email, teléfono, baneos, metadatos…) | Nuestros únicos disparadores sobre `auth.users` (`on_auth_user_before_insert`, `on_auth_user_created`) solo leen `new.id`/`new.email`; sin impacto mientras no se necesite otro campo |

Comprobación hecha con `grep` sobre migraciones y pruebas: ninguna referencia hoy las columnas, disparadores o privilegios que faltan en el stub. Es una comprobación sintáctica (qué nombres se mencionan), no una revisión semántica de cada prueba; no descarta que alguna aserción dependa del comportamiento más permisivo del stub de un modo menos directo. Quedan sin corregir a la espera de decisión de Dani, porque corregirlas todas de golpe (sobre todo RLS en `storage.buckets` y los privilegios de `anon`) cambia lo que el stub permite ejecutar y podría hacer fallar pruebas que hoy pasan asumiendo ese comportamiento más permisivo.

**Lo que CI cubre de verdad con esto:** aislamiento por RLS entre usuarios en `public.*` y en las políticas de `storage.objects` que sí están declaradas (`attachments_select_own`, `attachments_insert_own`, `attachments_delete_own` como estructura, no como comportamiento de borrado real), privilegios por columna, funciones `SECURITY DEFINER`, reglas de dominio y disparador `protect_delete` sobre `storage.objects`.

**Lo que CI NO cubre:** el comportamiento de `storage.buckets` (RLS y disparadores), los privilegios reales de `anon` sobre las tablas de Storage, el borrado real de un objeto por un usuario legítimo a través del cliente de Storage (eso es T4, contra Storage de verdad, no contra el stub) y cualquier columna de `storage.objects`/`storage.buckets`/`auth.users` que el stub no reproduce.

## Verificación

Las pruebas de `supabase/tests/database` (96 comprobaciones) cubren:

- **Estructura:** todas las tablas tienen RLS, `anon` carece de privilegios y las funciones internas no son accesibles.
- **Aislamiento:** un segundo usuario intenta leer, modificar, borrar, enlazar y suplantar.
- **Reglas de dominio:** transiciones, normalización y búsqueda.
- **Almacenamiento:** rutas ajenas, recorrido de directorios y extensiones no permitidas.
- **Funciones de servidor:** vinculación con Telegram, reclamo de avisos, cuota de IA, altas y borrado de cuenta.

La capa de datos de la app se prueba además contra la base real a través de PostgREST (`npm run test:api`, 9 casos): permisos por columna, transiciones, aislamiento entre usuarios y acceso anónimo. La prueba de extremo a extremo (`npm run test:e2e`, 11 comprobaciones) ejecuta el build web de producción con una sesión iniciada, sigue una tarea desde la captura rápida hasta la base de datos y comprueba que un enlace externo llega decodificado pero no crea nada sin confirmación.

Se ha comprobado que las pruebas detectan fallos reales introduciendo de forma deliberada tres vulnerabilidades: una política permisiva, el privilegio de cambiar de plan y una función interna expuesta. Las tres provocan fallos en la batería.

## Lista de comprobación del proyecto en la nube

Completar antes de usar el proyecto con datos reales:

- [ ] Proyecto creado en región UE (Frankfurt).
- [ ] Autenticación en dos pasos activada en la cuenta de Supabase y en la de GitHub.
- [ ] Migraciones aplicadas con `supabase db push` y comprobado que `signup_mode` es `invite_only`.
- [ ] Correo propio añadido a `private.signup_allowlist` desde el editor SQL.
- [ ] Auth › Email: caducidad del código de 600 s y plantillas en español, copiadas de `supabase/templates`.
- [ ] Auth › URL Configuration: solo las URL propias de la app.
- [ ] API › Exposed schemas: únicamente `public`.
- [ ] Integrations › GraphQL desactivado si no se utiliza.
- [ ] Database › SSL enforcement activado.
- [ ] La clave `service_role` / secreta no se ha copiado a ningún cliente ni fichero del repositorio.
- [ ] Copias de seguridad: volcado periódico con `npx supabase db dump`, sin depender de las copias del plan gratuito.
- [ ] Antes de abrir el registro: SMTP propio, CAPTCHA en Auth y `signup_mode = 'open'`.

## Pendiente por entrega

- **Al publicar la web:** comprobar en un navegador real que la CSP no bloquea nada (consola sin avisos) y ajustar `connect-src` al dominio exacto del proyecto de Supabase.
- **Entrega 4:** verificación de la cabecera secreta del webhook de Telegram, limitación de frecuencia por chat y limpieza programada.
- **Entrega 5:** tratamiento del contenido de las tareas como datos (no instrucciones) en las peticiones a la IA y validación de la salida con esquema.
- **Entrega 8:** bloqueo biométrico y pantalla de privacidad en el selector de aplicaciones.
