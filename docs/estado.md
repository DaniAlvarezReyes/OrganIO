# Estado de OrganIO

Resumen corto que actualiza Claude Code al cerrar cada tarea y que lee el proyecto de diseño en claude.ai. Máximo 15 líneas: si crece, se resume.

- **Entregas en curso:** 2.5 · Paso a la nube (`docs/plan/entrega-2.5-nube.md`) y 3 · Detalle de tarea (`docs/plan/entrega-3-detalle.md`)
- **Últimas tareas cerradas:** 3·T0c (`feat/3-t0c`): stub de CI igual al Storage real en RLS y privilegios, y prueba conductual del borrado recuperada (101/101 en real y en simulación de CI, aprobada por Codex en la segunda ronda). Antes, `fix/ci-verde`: CI con los cuatro trabajos en verde, `.gitattributes` completo y manifiesto sin `.env`
- **Siguiente:** 3·T1 (capa de datos), y 2.5·T2 cuando Dani cierre 2.5·T1
- **Decisiones pendientes de Dani:** plan de fusión de las ramas en `main` (propuesto, a la espera de visto bueno); `fix/ci-verde` y `feat/3-t0c` sin subir
- **Riesgos o bloqueos:** ninguno abierto. `npm test` estuvo en rojo desde la entrega 1 y se dio por «ajeno» sin diagnosticarlo; corregido y cubierto por la regla 14 de `AGENTS.md`. El trabajo `database` de CI con el stub nuevo solo se ha comprobado en simulación local: se confirma al subir `feat/3-t0c`
