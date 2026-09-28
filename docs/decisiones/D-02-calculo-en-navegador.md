# D-02 Dónde corre el cálculo

**Estado:** aceptada (2026-09-28) · Guía `01 §7.3`, spike S2

**Contexto.** La guía propone cálculo liviano en el navegador y simulaciones pesadas en un servidor, con una sola biblioteca para ambos.

**Opciones.**

- (a) Cálculo en el navegador y en el servidor.
- (b) Todo en el navegador, con Web Workers.

**Decisión.** (b). `packages/core` es TS puro, sin DOM: corre en el hilo principal, en workers y en Node (tests). Los cálculos O(n) sobre taladros corren en `packages/workers`.

**Consecuencias.**

- S2 se cumple sin servidor: el mismo código da resultados idénticos en Node (Vitest) y en el worker, y la UI no se bloquea.
- Si un día hay backend (D-08), puede importar `core` tal cual.
- 5.000 taladros se resuelven en milisegundos (`packages/core/src/performance.perf.test.ts`).
