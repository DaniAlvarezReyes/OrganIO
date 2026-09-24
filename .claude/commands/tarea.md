---
description: Ejecuta una tarea del plan con el flujo completo (implementar, probar, revisar con Codex, registrar)
argument-hint: <tarea, p. ej. T2>
---

Ejecuta la tarea $ARGUMENTS del plan vigente en `docs/plan/`, siguiendo `AGENTS.md`.

1. Lee solo la sección de esa tarea y los ficheros que menciona. No explores el repositorio entero.
2. Si la tarea es grande o ambigua, propón un plan breve (máximo 10 líneas) y espera mi visto bueno.
3. Crea la rama `feat/<entrega>-<tarea>` desde `main`.
4. Implementa. Verifica con `npm run typecheck`, `npm test` y, si toca base de datos, `npx supabase test db`. Muéstrame solo el resultado de cada comando, no los logs completos.
5. Pasa la revisión de Codex: escribe `.organio/revision/encargo.md` (objetivo, criterios de aceptación y ficheros tocados; el diff y las reglas los pone el script) y lanza `npm run revision` con el tiempo límite de la terminal en 10 minutos. Si la tarea toca seguridad, migraciones, autenticación o permisos, lánzalo con `-Esfuerzo medium`.
6. Corrige los bloqueantes de `.organio/revision/salida.md`. Si discrepas de alguno, no lo descartes: explícamelo.
7. Anota la revisión en `docs/revisiones.md` y actualiza `docs/estado.md` (máximo 15 líneas).
8. Enséñame: resumen, `git diff --stat`, hallazgos de Codex y resultado de las pruebas. No hagas commit hasta que lo apruebe.
