# Estado de OrganIO

Resumen corto que actualiza Claude Code al cerrar cada tarea y que lee el proyecto de diseño en claude.ai. Máximo 15 líneas: si crece, se resume.

- **Entregas en curso:** 2.5 · Paso a la nube (`docs/plan/entrega-2.5-nube.md`) y 3 · Detalle de tarea (`docs/plan/entrega-3-detalle.md`)
- **Últimas tareas cerradas:** 2.5·T0 (pendiente de tu aprobación para el commit) y 3·T0b (arreglada, 97/97 en local y en simulación de CI, aprobada por Codex tras una corrección)
- **Siguiente:** 2.5·T1 (Dani: cuentas de Supabase y Cloudflare) y 3·T1 (capa de datos), salvo que decidas antes qué hacer con las divergencias stub↔Storage real documentadas en `docs/SEGURIDAD.md`
- **Decisiones pendientes de Dani:** aprobar el commit de 2.5·T0 y de 3·T0b; si corregir ahora o dejar documentadas (ver `docs/SEGURIDAD.md`, sección «Paridad entre CI y Storage real») las divergencias no urgentes del stub (RLS deshabilitada en `storage.buckets`, privilegios de `anon` distintos, columnas que faltan)
- **Riesgos o bloqueos:** ninguno nuevo. `004_storage.test.sql` quedó resuelto en T0b: el stub de CI ya tiene el disparador `protect_delete`, la prueba comprueba lo que de verdad ocurre, y la cobertura de la política se recuperó en `001_structure.test.sql` (real en T4). `apps/app/tests/api.it.test.ts` sigue fallando en local por motivos ajenos (falta `ORGANIO_IT_URL`/`ORGANIO_IT_JWT_SECRET`; solo corre en CI)
