# D-06 Pruebas

**Estado:** aceptada (2026-09-28) · Guía `01 §7.3`, `§11`, `04`

**Decisión.**

- Vitest, con cada `*.test.ts` junto a su fuente.
- Todo cálculo de ingeniería se prueba con el **valor de un caso de referencia** (`docs/theory/04`, CR-xx) o de la fuente citada, con la tolerancia que indica el caso.
- **Prohibido** calcular el valor esperado con la misma fórmula del código (prueba circular).
- Cada test cita en un comentario el caso o la fuente, y el paso.
- Cobertura v8 con meta ≥ 85 % en `core` (NF-12).

**Consecuencias.**

- Los tests actuales usan valores calculados a mano sin CR. Se complementan hito a hito con los CR.
- Hasta entonces, ninguna fórmula pasa de R2 en `docs/reglas.md`.
