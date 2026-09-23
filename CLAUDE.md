# BlastLab: reglas del proyecto

Aplicación web de diseño y simulación de voladuras mineras. Prioridades: **fluidez de la interfaz** y **cobertura progresiva de herramientas de simulación**. Ver `docs/PLAN.md` y `docs/ARCHITECTURE.md`.

## Stack

- **Monorepo:** pnpm workspaces, Node ≥ 24.
- **Lenguaje:** TypeScript estricto en todos los paquetes.
- **Paquetes:**
  - `packages/core`: dominio y cálculos. Sin UI ni DOM; corre en Node, en workers y en el hilo principal. Tests con Vitest.
  - `packages/engine`: Three.js/WebGL. Cámara ortográfica para planta, perspectiva para 3D, InstancedMesh y loop rAF propio.
  - `packages/workers`: Web Workers + Comlink.
  - `apps/web`: React + Vite, Zustand para el estado de UI y ECharts para gráficos (uPlot si el rendimiento lo exige).
- **Persistencia:** IndexedDB/OPFS y JSON exportable. Por ahora no hay backend.
- **Prohibido por ahora:** Rust/WASM (se evaluará solo con un kernel medido como lento), Unity WebGL y Canvas2D para la vista principal.

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
- **Tests obligatorios en core.** Toda función de cálculo nueva o modificada lleva tests en Vitest (`*.test.ts` junto al fuente), con valores de referencia documentados (bibliografía o cálculo manual en un comentario). Tests suficientes para asegurar la precisión, sin sobredimensionar: priorizar los cálculos de ingeniería sobre la UI.
- **Nombres:** código e identificadores en inglés; UI y documentación en español.
- **Rendimiento:** un cambio que toque engine o workers se valida con el fixture de 5.000 taladros (60 fps en pan/zoom).

## Orden de módulos del MVP (uno a la vez; no avanzar sin aprobación)

0. Bootstrap del monorepo ✅
1. Editor de malla y taladros en planta (patrón, edición, selección múltiple, snapping, undo/redo) ✅
2. Carguío (librería de productos, decks, diagrama de columna, kg/taladro, factor de carga, cubicación) ✅
3. Tiempos (retardos, amarres, tiempos de detonación, animación, isócronas, coincidencias, ventana entre filas) ✅
4. Importación CSV de taladros ✅
5. Contornos de energía y distribución de explosivo ✅
6. Fragmentación (Kuz-Ram, Swebrec/KCO, P50/P80) ✅
7. Vibración (PPV), flyrock (Lundborg) y sobrepresión ✅
8. DXF y reporte PDF
9. Vista 3D del banco con decks coloreados (al final)
