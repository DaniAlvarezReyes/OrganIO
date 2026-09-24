# OrganIO

Aplicación de tareas y rutinas con seguimiento activo: recuerda lo que lleva días parado, propone subtareas y se integra con el calendario y con Telegram. Diseñada como producto multiusuario desde el primer día, se usa inicialmente en modo personal y sin coste.

## Estado

| Entrega | Contenido | Estado |
| --- | --- | --- |
| 1 · Cimientos | Núcleo compartido, base de datos, seguridad y pruebas automáticas | **Hecha** |
| 2 · App universal | Acceso por código, lista de tareas, captura rápida y edición, en navegador (ordenador e iPhone) | **Hecha** |
| 3 · Detalle de tarea | Subtareas, notas, imágenes, historial y búsqueda | Siguiente |
| 4 · Bot de Telegram | Vincular cuenta, crear y consultar tareas, recordatorios y avisos de estancamiento | Pendiente |
| 5 · Subtareas con IA | Sugerencias con validación y cuota diaria | Pendiente |
| 6 · Rutinas | Recurrencias, pasos y seguimiento | Pendiente |
| 7 · Google Calendar | Planificación automática de subtareas | Pendiente |
| 8 · App nativa | Widget, compartir, Face ID, push, Apple Sign-In (requiere Apple Developer para iPhone) | Pendiente |

Qué está encendido en cada momento lo decide la tabla `private.app_features` (servidor) junto con `packages/core/src/features.ts` (interfaz). Una prueba automática garantiza que ambas listas coinciden.

## Estructura

```
apps/app/                 La app: una sola base de código para navegador, iOS y Android (Expo)
  app/                    Pantallas (Expo Router): acceso, tareas, detalle, ajustes, captura externa
  src/data/               Cliente de Supabase, sesión cifrada, API, consultas y errores
  src/tasks/              Captura rápida, fila de tarea y agrupación
  src/ui/                 Sistema visual: tokens, tipografía y componentes
  assets/brand/           Marca en SVG: fuente única de todos los iconos (los PNG se generan al instalar)
  public/                 Plantilla web, manifiesto (instalable en el iPhone) y cabeceras de seguridad
  tests/                  Pruebas de la capa de datos contra la base real
packages/core/            Lógica compartida sin dependencias de plataforma
  src/status.ts           Estados y transiciones permitidas
  src/quickAdd.ts         Captura rápida: "Dentista mañana a las 17 #salud !2"
  src/stale.ts            Cálculo de «días sin avanzar»
  src/schemas.ts          Validaciones (zod), espejo de las restricciones SQL
  src/features.ts         Registro de funcionalidades por entrega
supabase/
  config.toml             Configuración del entorno local (endurecida)
  migrations/             Esquema, RLS, privilegios, funciones y almacenamiento
  tests/database/         Pruebas pgTAP de seguridad y dominio (101 comprobaciones)
  templates/              Correo del código de acceso
  seed.sql                Correo invitado para desarrollo local
OrganIO.cmd               Lanzador para Windows: instala, configura y arranca
scripts/windows/          Lógica del lanzador (PowerShell)
scripts/                  Pruebas sin Docker: base de datos, API y extremo a extremo; iconos
vendor/                   Sustitutos de dependencias vulnerables (ver docs/SEGURIDAD.md)
docs/SEGURIDAD.md         Modelo de seguridad y lista de comprobación del proyecto
```

## Requisitos

Todo gratuito:

- Node.js 22 o superior.
- Docker Desktop, para levantar Supabase en local.
- La CLI de Supabase va incluida como dependencia del proyecto (versión fijada).

## Puesta en marcha (Windows)

Doble clic en **`OrganIO.cmd`**. La primera vez:

1. Comprueba Node y Docker (y arranca Docker Desktop si está cerrado).
2. Instala las dependencias y genera los iconos.
3. Te pregunta el correo con el que vas a entrar: es el único invitado.
4. Arranca Supabase y crea la base de datos (la primera descarga de Docker tarda).
5. Genera `apps/app/.env` con la URL y la clave pública.
6. Abre OrganIO en el navegador.

Las siguientes veces solo arranca: reinstala dependencias únicamente si cambia algún `package.json` y aplica migraciones nuevas sin borrar tus datos.

| Opción | Qué hace |
| --- | --- |
| `OrganIO.cmd -Lan` | Arranca usando la IP de la wifi para abrir la app desde el iPhone |
| `OrganIO.cmd -Stop` | Detiene Supabase y libera memoria (los datos se conservan) |
| `OrganIO.cmd -Reset` | Borra la base de datos local y la crea de nuevo (pide confirmación) |

La primera instalación genera `package-lock.json`. Conviene versionarlo a partir de ahí para que todas las instalaciones sean idénticas.

### Puesta en marcha manual (otros sistemas)

```bash
npm install
# Pon tu correo en supabase/seed.sql
npx supabase start
npx supabase db reset
cp apps/app/.env.example apps/app/.env   # valores de `npx supabase status`
npm run web -w @organio/app
```

Entra con tu correo: el código de 6 cifras aparece en Mailpit (http://127.0.0.1:54324), porque en local los correos no salen a Internet.

Servicios locales:

| Servicio | Dirección |
| --- | --- |
| App (navegador) | http://localhost:8081 |
| API de Supabase | http://127.0.0.1:54321 |
| Studio (panel) | http://127.0.0.1:54323 |
| Correos enviados (Mailpit) | http://127.0.0.1:54324 |

**Si cambias `apps/app/.env`, arranca siempre con caché limpia.** `npm run web` ya lo hace. Metro guarda en caché los valores `EXPO_PUBLIC_*` y, sin limpiarla, la app seguiría apuntando a la configuración anterior.

### Abrirla en el iPhone (misma red wifi)

1. Arranca con `OrganIO.cmd -Lan`: detecta la IP del ordenador y la muestra en pantalla.
2. En Safari del iPhone, abre la dirección indicada (`http://192.168.x.x:8081`).
3. Compartir › **Añadir a pantalla de inicio**: se abre a pantalla completa, con su icono.

Si Windows pregunta por el firewall al arrancar, permite el acceso en redes privadas. Si el iPhone carga la app pero no conecta con los datos, el firewall está bloqueando el puerto 54321. En la entrega 4 la base pasa a la nube (plan gratuito) y esto deja de depender de tu red.

### Añadir tareas con un toque (Atajos)

En *Ajustes* de la app aparece la URL para crear un atajo de iOS («Dictar texto» → «Abrir URL») que abre la captura con lo dictado. Se puede asignar al Botón de Acción. Por seguridad, la tarea se muestra para confirmarla: nada se crea solo desde un enlace.

## Pruebas

```bash
npm test               # núcleo compartido y lógica de la app (vitest)
npm run typecheck      # tipos de todo el monorepo
npx supabase test db   # base de datos con Supabase local (referencia)
npm run test:db        # base de datos sobre un Postgres normal, sin Docker (CI)
npm run test:api       # la capa de datos real de la app contra Postgres + PostgREST
npm run test:e2e       # build web real: sesión, lista y captura rápida hasta la base de datos
```

`test:db`, `test:api` y `test:e2e` son scripts de bash (CI, Linux, macOS o WSL) y necesitan Postgres local y el binario [`postgrest`](https://github.com/PostgREST/postgrest/releases) en el PATH. Sirven para comprobar, sin Docker, que cada consulta de la app respeta los permisos por columna y el aislamiento entre usuarios.

La integración continua (`.github/workflows/ci.yml`) ejecuta todo lo anterior y busca secretos filtrados con gitleaks en cada `push`.

## Reglas del repositorio

1. **Toda tabla nueva** en `public` lleva RLS, una política por operación y permisos concedidos columna a columna. Las pruebas de `001_structure.test.sql` fallan si no es así.
2. **Las marcas de tiempo y los campos calculados** los escribe el servidor, nunca el cliente.
3. **Las migraciones aplicadas no se editan**: cualquier cambio va en una migración nueva.
4. **Ningún secreto en el repositorio.** Las claves van en `.env` (ignorado) o en los secretos de Supabase. La clave `service_role` jamás sale del servidor.
5. **Cambios en límites o estados** se hacen a la vez en `packages/core` y en SQL.
6. **La app nunca usa `select('*')` ni envía `user_id`**: columnas explícitas y propietario asignado por la base de datos.
7. **Tipos de la base:** tras cambiar migraciones, `npm run gen:types -w @organio/app` (con Supabase local arrancado).

## Paso a la nube

No es necesario hasta la entrega 2 (acceso desde el iPhone) o la 4 (Telegram necesita una URL pública). Cuando toque:

```bash
npx supabase login
npx supabase link --project-ref <ref>   # proyecto creado en región UE (Frankfurt)
npx supabase db push
```

Antes de usarlo, completar la lista de comprobación de `docs/SEGURIDAD.md`.
