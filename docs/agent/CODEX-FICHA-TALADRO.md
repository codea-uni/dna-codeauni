# Ficha del taladro — 14/10/2026

Implementado en `/opt/dna-agente`, sin commits, stash, checkout, reset ni despliegues. No se modificaron `Engine.ts`, `XrSession.ts`, `handGestures.ts`, `placement.ts` ni sus tests.

## Cambios

- `apps/web/src/ai/holeResolution.ts`: resolución común por etiqueta exacta y, si falta, por posición 1–N en el orden del documento. Incluye prefijos dictados, rangos, `resolved_label`/`resolved_labels`, explicación de la posición y errores con el rango existente. El caso 500 de 725 taladros etiquetados 1672–2396 resuelve a 2171.
- `apps/web/src/ai/{tools,blastTools,sceneTools,targetSchema}.ts`: aplicación a `focus_hole`, `go_to hole`, cámara web, spotlight, filtros, inicio de amarre y retardos. Nueva herramienta de lectura `hole_detail`; las acciones que muestran el taladro devuelven también su ficha en texto.
- `packages/core/src/model/factories.ts` y `apps/web/src/actions.ts`: al reemplazar una malla se reutilizan los menores números libres desde 1, sin cambiar otras mallas ni el comportamiento de `nextHoleNumber`. Se conserva deshacer.
- `apps/web/src/ai/{holeDetail,cards}.ts`, `AgentCards.tsx`, `apps/web/src/xr/holeCard.ts` y `apps/web/src/styles.css`: ficha compartida entre web, tarjetas VR y texto para voz; taco, columna y kg, iniciadores, retardos, disparo relativo al primero y geometría. La ficha explícita persiste entre reportes y se reemplaza al pedir otro taladro. Se distingue un análisis pendiente de un resultado vigente.
- `apps/web/src/xr/{bindXr,holeProximity}.ts`: proximidad con `engine.xrState()` existente, solo a escala real. Entrada <6 m en planta y ojos <15 m sobre el collar, permanencia de 1,2 s; salida a 8 m/18 m. La ficha explícita tiene prioridad y cerrar una automática impide reabrirla hasta alejarse. Limpieza del intervalo al desmontar y actualización de fichas al cambiar documento/análisis.
- `apps/web/src/ai/{prompts,labels}.ts` y `apps/web/src/i18n/ns/ai.ts`: instrucción de usar la ficha, explicar la resolución por posición y nunca confirmar éxito cuando la herramienta devuelve error.
- Tests nuevos: `apps/web/src/ai/{holeResolution,holeDetail,patternNumbering}.test.ts`, `apps/web/src/xr/holeProximity.test.ts` y `packages/core/src/model/holeNumbering.test.ts`.

## Verificación

El comando solicitado con `docker run ... node:24-alpine` se intentó, pero el entorno negó acceso a `/var/run/docker.sock`. Descargar Node 24 tampoco fue posible por DNS. **Queda pendiente repetir la validación en Node 24/Docker y comprobar la presentación físicamente en Meta Quest.**

Verificación alternativa realizada con Node 20.20.2, sin reinstalar dependencias:

- `node node_modules/typescript/bin/tsc -b --pretty false`: correcto en todo el monorepo, también después de los cambios funcionales finales.
- Vitest sobre `apps/web packages/core`: **84 archivos, 474 pruebas correctas**. Después de los ajustes finales de presentación y errores: **10 archivos, 59 pruebas correctas** en IA, ficha, proximidad y numeración.
- ESLint sobre los módulos de ficha/resolución/proximidad, tarjetas, binding XR y factories: correcto. `git diff --check`: correcto.

Para Vitest se usó en modo lectura el binding GNU de Rolldown 1.2.9 ya instalado en otro worktree (el de este worktree solo tiene musl):

```sh
NAPI_RS_NATIVE_LIBRARY_PATH=/opt/dna-codeauni/node_modules/.pnpm/@rolldown+binding-linux-x64-gnu@1.2.9/node_modules/@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node \
  node node_modules/vitest/vitest.mjs run apps/web packages/core
```

Las pruebas incluyen prioridad exacta, posiciones y límites, el caso del log, error sin mover ni sustituir ficha, tarjeta web y VR, protección frente a proximidad/reportes, cierre, histéresis, altura, reemplazos sucesivos, otras mallas y deshacer. No hubo fallos de pruebas ajenas en las suites ejecutadas; no se ejecutó la suite de engine/XrSession.
