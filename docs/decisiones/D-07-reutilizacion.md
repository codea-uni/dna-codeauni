# D-07 Qué se reutiliza del prototipo

**Estado:** aceptada (2026-09-28) · Guía `01 §7.3`

**Contexto.** Antes de recibir la guía se construyeron las fases 0–9 de BlastLab. Ver la tabla de `docs/PLAN.md §2`.

**Decisión.** Se reutiliza todo. Cada módulo se **regulariza** en el hito de la guía que le corresponde: se agrega el caso de referencia, se registra la regla y se corrigen las discrepancias. No se reescribe desde cero.

**Consecuencias.**

- F2 (energía, fragmentación, vibración avanzada) ya tiene código, pero se trata como no verificado hasta reproducir sus CR.
- Los bugs encontrados contra la especificación (ventana de MIC en `vibration.ts`, miles con coma en `csv.ts`) se corrigen en el Tramo 0.
