# D-05 Formato de proyecto

**Estado:** aceptada (2026-09-28) · Guía `01 §7.3`, `03 §1` principio 4

**Decisión.**

- JSON con `format`, `schemaVersion`, `savedAt` y `project`, validado con zod en la entrada (`packages/core/src/io/projectSchema.ts`).
- Cada cambio de esquema incrementa `SCHEMA_VERSION` (`model/schema.ts`) y agrega una migración en `io/projectFile.ts` (`MIGRATIONS`), con su test.
- Hoy `schemaVersion = 2`; la v3 llega en G1.

**Consecuencias.**

- Ida y vuelta sin pérdidas, probada en `io/projectFile.test.ts`.
- Al renombrar a Cronos (D-09), el archivo se escribe con `format: 'cronos-project'` y `'blastlab-project'` se sigue aceptando al leer.
