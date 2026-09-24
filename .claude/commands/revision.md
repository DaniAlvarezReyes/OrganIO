---
description: Pide a Codex una revisión independiente de los cambios actuales y la registra
argument-hint: [foco opcional, p. ej. seguridad]
---

Pide a Codex una revisión independiente de los cambios actuales (sin commit y de la rama frente a `main`).

- Escribe `.organio/revision/encargo.md` con el propósito del cambio y los ficheros tocados, y lanza `npm run revision` con el tiempo límite de la terminal en 10 minutos (`-Base main` para la rama entera en vez de los cambios sin commit). El diff, las reglas de `AGENTS.md` y el formato de salida los pega el script. Foco adicional: $ARGUMENTS
- Formato de los hallazgos: bloqueante, importante o sugerencia, cada uno con fichero, línea y motivo. Sin modificar ficheros.

Después:
1. Lee `.organio/revision/salida.md`, valora cada hallazgo y dime cuáles aceptas y cuáles no, con el motivo.
2. Corrige los bloqueantes aceptados y vuelve a ejecutar las pruebas.
3. Anota la revisión en `docs/revisiones.md`.
