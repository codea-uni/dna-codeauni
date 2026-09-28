# D-01 Stack tecnológico

**Estado:** aceptada (2026-09-28) · Guía `01 §7.3`

**Contexto.** La guía deja libre la tecnología y exige justificarla. El prototipo (BlastLab, fases 0–9) ya estaba construido.

**Opciones.** Mantener el stack del prototipo o migrar a otro (por ejemplo, un framework con servidor).

**Decisión.**

- Monorepo pnpm y TypeScript estricto (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- `core`: dominio y cálculos, con zod, flatbush, d3-delaunay y dxf-parser.
- `engine`: Three.js.
- `workers`: Comlink y pdf-lib.
- `web`: React 19, Vite, Zustand y ECharts.
- Tests con Vitest.

**Consecuencias.**

- Un solo lenguaje para el cálculo, la UI y los tests.
- Todas las dependencias tienen licencia permisiva (MIT, ISC, Apache-2.0), compatible con distribución comercial (NF-15). Hay que revisarlas al agregar cualquier otra.
