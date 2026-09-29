# Estado del proyecto y cómo retomar

**Leer primero.** Esta página dice dónde estamos. Se actualiza al cerrar cada hito, en el mismo commit de docs.

## Dónde estamos (2026-09-29)

| Qué                   | Valor                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| Fase                  | **F2 Análisis avanzado** (la Fase 1 tiene el código completo; ver pendientes) |
| Hito en curso         | **A2 Holmberg–Persson y criterio de daño**                                    |
| Último hito cerrado   | A1 Precorte y buffer (CR-01; reporte en `docs/hitos/fase-2.md`)               |
| Qué sigue exactamente | `docs/PLAN.md §4`, «Fase 2», hito A2                                          |
| Preguntas abiertas F2 | P-17…P-22 en `docs/preguntas.md` (ninguna bloquea A2)                         |

## Mapa de fases

| Fase                       | Hitos                                                                                                                                                                                | Estado                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| **F1 Diseño y simulación** | G0 base · G1 modelo · G2 importación · G3 malla · G4 carga · G5 tiempos · G6 MIC y PPV · G7 reporte y escenarios · G8 idiomas · G9 cierre (`docs/hitos/cierre-fase-1.md`)            | ✅ código · 🟡 cierre formal (pendientes abajo) |
| **F2 Análisis avanzado**   | A0 especificación ✅ · A1 precorte y buffer ✅ · **A2 Holmberg–Persson y daño** · A3 Kuz-Ram y Swebrec · A4 proyección y onda aérea · A5 desplazamiento y verificaciones · A6 cierre | ⏳ en curso                                     |
| Evaluación 2               | Ingenieros externos                                                                                                                                                                  | —                                               |
| F3 Subterráneo             | Frentes y anillos (`docs/theory/references/R4`)                                                                                                                                      | —                                               |
| F4 Datos de campo          | As-drilled, sismógrafos, ajuste de K/β, IREDES                                                                                                                                       | —                                               |
| F5 Distribución + backend  | Usuarios, roles, auditoría (D-08)                                                                                                                                                    | —                                               |

## Pendientes de la Fase 1 (no bloquean F2)

Bloquean el **cierre formal** de la Fase 1 (Evaluación 1), no el desarrollo.

| Pendiente                                                                        | Quién                                           |
| -------------------------------------------------------------------------------- | ----------------------------------------------- |
| I1: respuesta 3 de `docs/comprension.md` (CR-01 a mano) y las preguntas por hito | El desarrollador responde; el ingeniero aprueba |
| P-15: fichas de HA73/HA64 → CR-04 completo (carga y reporte)                     | Ingeniero o proveedor                           |
| I6: un ingeniero reproduce CR-04 de punta a punta (protocolo en el cierre de F1) | Ingeniero                                       |
| P-16: confirmar la regla de alivio del burden efectivo y el umbral ≥ 2·B         | Ingeniero                                       |
| Técnicos: reproyección entre CRS, topografía GeoJSON/LandXML, reglas en ft       | Desarrollo (deuda, sin fecha)                   |

## Cómo retomar en un chat nuevo

Basta con decir: **«Lee `docs/ESTADO.md` y sigue con el hito en curso»**.

Orden de lectura:

1. Esta página.
2. `docs/PLAN.md §4`, el hito en curso (tareas, casos y salida).
3. Lo que cite el hito de `docs/theory/` (fórmulas en `02`, casos en `04`, fichas en `references/R1`).
4. `docs/reglas.md` (estado de cada regla) y `docs/preguntas.md` (dudas abiertas).

Convenciones de trabajo:

- Ciclo por hito (`docs/PLAN.md §5`): regla con fuente → caso de referencia → prueba con el valor de la fuente → código → reporte.
- Unos **3 commits por hito** (núcleo, web y docs). Solo el asunto en español (Conventional Commits) y el trailer `Co-Authored-By`, sin cuerpo.
- Antes de cada commit: `pnpm typecheck && pnpm lint && pnpm test` en verde (revisar la salida, no solo el código de salida).
- `git push` solo cuando lo pida el usuario.
- Al cerrar el hito: actualizar esta página, `docs/PLAN.md` y `docs/reglas.md`.
