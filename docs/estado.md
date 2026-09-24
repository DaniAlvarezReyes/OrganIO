# Estado de OrganIO

Resumen corto que actualiza Claude Code al cerrar cada tarea y que lee el proyecto de diseño en claude.ai. Máximo 15 líneas: si crece, se resume.

- **Entregas en curso:** 2.5 · Paso a la nube (`docs/plan/entrega-2.5-nube.md`) y 3 · Detalle de tarea (`docs/plan/entrega-3-detalle.md`)
- **Últimas tareas cerradas:** 2.5·T0 y 3·T0b, ya con commit y subidas (`feat/2.5-t0`, `feat/3-t0b`). Se cerraron con `npm test` en rojo sin diagnosticarlo: ver riesgos. Arreglo de CI en curso en `fix/ci-verde`
- **Siguiente:** CI con los cuatro trabajos en verde; después 3·T0c (paridad del stub y prueba conductual del borrado), 2.5·T2 y 3·T1
- **Decisiones pendientes de Dani:** fusionar las ramas en `main`; arreglar `scripts/make-manifest.mjs`, que recoge `apps/app/.env.cloud`
- **Riesgos o bloqueos:** `npm test` estuvo roto desde la entrega 1 y se dio por «ajeno» sin diagnosticarlo. No lo era: `apps/app/tests/api.it.test.ts` creaba los clientes (y firmaba JWT con un secreto indefinido) en el cuerpo del `describe`, que vitest ejecuta aunque la suite esté omitida. Corregido en `fix/ci-verde`: ahora se omite y lo dice (9 pruebas «skipped»). Además, los tres `scripts/*.sh` se subieron sin bit de ejecución (exit 126 en CI)
