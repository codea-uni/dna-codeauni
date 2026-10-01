# Cronos: reglas del proyecto

Aplicación web de diseño y simulación de voladuras mineras (antes «BlastLab»; paquetes `@cronos/*`, D-09). Prioridades: **cálculos correctos y verificables**, **fluidez de la interfaz** y **cobertura progresiva de herramientas de simulación**.

**Leer primero `docs/ROADMAP.md`:** todas las fases, el hito en curso (▶) y cómo trabajar.

**Norte y máxima prioridad:** `docs/theory/`, la guía del ingeniero de minas. Está por encima de `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` y este archivo: si algo la contradice, gana la guía y la diferencia se corrige o se anota en `docs/QUESTIONS.md`.

## Dónde buscar

| Necesito                                                                | Documento                                                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Requisito, historia o criterio de aceptación (R-xx, H-xxx)              | `docs/theory/01-DEVELOPER-GUIDE.md` §5 y §12                                                              |
| Fórmula, unidades o verificación                                        | `docs/theory/02-CALCULATION-SPEC.md`; fichas F01–F30 de `docs/theory/references/R1-MINING-PRIMER.md` §3   |
| Valor esperado de un test (CR-xx)                                       | `docs/theory/04-REFERENCE-CASES.md`                                                                       |
| Entidad, catálogo o trampa de importación                               | `docs/theory/03-DATA-MODEL.md`                                                                            |
| Estado de una regla (RM, FC, CK, DF, CT)                                | `docs/RULES.md` (semilla: `docs/theory/05`)                                                               |
| Término minero ES/EN                                                    | `R1` §2 (glosario) y la tabla de vocabulario de `docs/ARCHITECTURE.md`                                    |
| Cómo lo hacen JKSimBlast o I-Blast (al diseñar una pantalla o un flujo) | `docs/theory/references/R3` (flujo en 12 pasos en §3) y `R2`; referencia de funciones, **no** para copiar |
| Subterráneo (frentes, anillos)                                          | `docs/theory/references/R4`                                                                               |

## Stack

- **Monorepo:** pnpm workspaces, Node ≥ 24.
- **Lenguaje:** TypeScript estricto en todos los paquetes.
- **Paquetes:**
  - `packages/core`: dominio y cálculos. Sin UI ni DOM; corre en Node, en workers y en el hilo principal. Tests con Vitest.
  - `packages/engine`: Three.js/WebGL. Cámara ortográfica para planta, perspectiva para 3D, InstancedMesh y loop rAF propio.
  - `packages/workers`: Web Workers + Comlink.
  - `apps/web`: React + Vite, Zustand para el estado de UI y ECharts para gráficos (uPlot si el rendimiento lo exige).
- **Persistencia:** IndexedDB/OPFS y JSON exportable. Por ahora no hay backend.
- **Prohibido por ahora:** Rust/WASM propio (se evaluará solo con un kernel medido como lento), Unity WebGL y Canvas2D para la vista principal. Excepción acotada (D-17): Rapier (`@dimforge/rapier3d-compat`, WASM de terceros) solo en el worker de la animación física de la pila, cargado al pedirlo.

## Reglas de arquitectura (no negociables)

1. **React no renderiza el diseño.**
   - React solo emite comandos (al engine y al DocumentStore) y muestra paneles, tablas y propiedades.
   - Ningún componente React recibe listas de taladros para dibujarlas.
   - El engine se suscribe al DocumentStore sin pasar por React.
2. **Los cálculos pesados solo corren en workers.** Todo lo que sea O(n) sobre taladros con n grande, grillas, contornos, fragmentación, Dijkstra, cubicación o exportaciones va en `packages/workers`. En el hilo principal solo se permiten cálculos triviales de un solo taladro (por ejemplo, el panel de propiedades).
3. **Un único modelo de dominio** en `packages/core/src/model`.
   - Se usan unidades SI internamente (m, kg, s, rad, Pa, J/kg, kg/m³, m/s); las conversiones solo ocurren en presentación.
   - Coordenadas: X = Este, Y = Norte, Z arriba. La inclinación se mide desde la vertical; el azimut, en sentido horario desde el Norte.
   - El modelo es serializable a JSON con `schemaVersion`. Todo cambio de esquema incluye una migración y un test.
4. **Toda mutación del documento es un comando** del DocumentStore y debe poder deshacerse (undo/redo).
5. **Grafo de dependencias:** `core ← engine`, `core ← workers`, `todos ← web`. `core` no importa nada de los demás; `engine` no importa `workers`.
6. **La GPU recibe coordenadas relativas a `CoordinateSystem.origin`** (float32), nunca UTM absolutas.
7. **El render es a demanda.** Solo se renderiza si hay un frame _dirty_ o una animación activa.

## Convenciones

- **TypeScript:** `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`.
  - Prohibido `any`. Se usa `unknown` + validación (Zod en los bordes de IO).
  - Nada de `@ts-ignore`; si hace falta, `@ts-expect-error` con una justificación.
- **pnpm** exclusivamente, nunca npm ni yarn.
- **Comandos:** `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm format`.
- **Commits:** Conventional Commits (`feat(core): …`, `fix(engine): …`, `chore: …`, `docs: …`, `test: …`, `perf: …`).
- **Tests obligatorios en core.** Toda función de cálculo nueva o modificada lleva tests en Vitest (`*.test.ts` junto al fuente), con valores de referencia documentados (caso CR-xx o fuente citada en un comentario; ver «Reglas de dominio»). Tests suficientes para asegurar la precisión, sin sobredimensionar: priorizar los cálculos de ingeniería sobre la UI.
- **Nombres:** código e identificadores en inglés; UI y documentación en español.
- **Rendimiento:** un cambio que toque engine o workers se valida con el fixture de 5.000 taladros (60 fps en pan/zoom).
- **i18n:** todo texto visible de la UI pasa por `t()`/`useT()` (D-11, `apps/web/src/i18n/`): la clave va en el diccionario del área (`i18n/ns/*.ts`, español e inglés) y los números con `useFormat()`. Los mensajes del núcleo se traducen en `i18n/coreText.ts` (el núcleo expone `id`/`kind` y `params`); los del motor con `engine.setText`; el PDF con `ReportOptions.language`.

## Reglas de dominio (guía §9–§11, no negociables)

1. **Ninguna fórmula, constante o rango minero sin fuente humana verificable.** Se registra en `docs/RULES.md` con su estado (R0–R4) antes de programarla. La IA no es fuente.
2. **El valor esperado de un test sale de un caso de referencia (CR-xx) o de la fuente citada**, nunca de la misma fórmula del código (prueba circular). El test cita el caso y el paso en un comentario.
3. **Por debajo de R3, una regla es a lo sumo una advertencia configurable**, nunca un bloqueo. Una constante en R0 es un parámetro del usuario, no un valor fijo.
4. **Constantes exactas** (π/4, no 0,507 ni 0,7854). El motor no redondea; solo la presentación.
5. **Nombres honestos y separados.** La profundidad escalada de enterramiento (SDOB, raíz cúbica) y la distancia escalada de vibración (raíz cuadrada) son dos modelos con dos nombres (RM-08). No se llama «energía» ni «daño» a un valor normalizado.
6. **Terminología del glosario** (`R1` §2) en la UI, y los identificadores de la tabla de `docs/ARCHITECTURE.md` en el código.
7. **Sin copiar** interfaz, textos ni constantes propietarias de JKSimBlast, I-Blast, SHOTPlus ni BlastLogic.
8. **Dudas de dominio (D-12):** no se detiene el trabajo para preguntar. Se busca la fuente (web, `docs/theory/`); si no aparece, se usa el valor por defecto de `docs/theory/01 §17` o un supuesto razonable como parámetro editable, y se anota en `docs/QUESTIONS.md` §2.

## Hitos

Uno a la vez, con el ciclo de `docs/ROADMAP.md`. Fases: **F1** diseño y simulación (G0–G9, código completo) · **F2** análisis avanzado (A0–A6, código terminado; A7 pila de material adelantado, D-17) · **Evaluación 2** (en curso) · **F3** subterráneo (S0–S6) · **F4** datos de campo (C0–C5) · **F5** distribución y backend (D0–D4). El detalle y el hito en curso están solo en `docs/ROADMAP.md`.

El prototipo BlastLab ya implementó las fases 0–9 (malla, carguío, tiempos, CSV, energía, fragmentación, vibración, DXF/PDF, 3D). Se reutilizan y se regularizan hito a hito (D-07).
