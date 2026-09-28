# D-09 Nombre del producto: Cronos

**Estado:** aceptada (2026-09-28)

**Contexto.** La guía llama al producto «Cronos», como nombre de trabajo por verificar. El repo usaba «BlastLab».

**Decisión.** Se renombra a Cronos en tres pasos:

1. Docs y CLAUDE.md, de inmediato.
2. Paquetes (`@blastlab/*` → `@cronos/*`), textos de la UI y valor `format` del archivo de proyecto, en el Tramo 0.

El formato viejo se sigue leyendo.

**Consecuencias.** Hay que verificar que el nombre no choque con otro producto antes de distribuirlo (F5).

**Hecho (Tramo 0).** Paquetes `@cronos/*`, UI, informe PDF, worker y `format: 'cronos-project'`, que se escribe desde ahora; `blastlab-project` se sigue leyendo (`packages/core/src/io/projectFile.ts`). Las capas DXF conservan el prefijo `BL_` para seguir reconociendo los DXF ya exportados.
