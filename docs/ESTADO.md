# Estado del proyecto y cómo retomar

**Leer primero.** Esta página dice dónde estamos. Se actualiza al cerrar cada hito, en el mismo commit de docs.

## Dónde estamos (2026-09-29)

| Qué                   | Valor                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Fase                  | **F2 Análisis avanzado** (la Fase 1 tiene el código completo; ver pendientes)                                                     |
| Hito en curso         | **A1b Burden efectivo por isócronas** (respuesta P-16 del ingeniero)                                                              |
| Último hito cerrado   | A1 Precorte y buffer (CR-01; reporte en `docs/hitos/fase-2.md`)                                                                   |
| Qué sigue exactamente | `docs/PLAN.md §4`, «Fase 2», hito A1b; después A2                                                                                 |
| Preguntas             | P-01…P-22 respondidas (`docs/preguntas.md`). Falta que el ingeniero corrija el γ de CR-01 en `docs/theory/04` (1,514 kg/m², P-18) |

## Mapa de fases

Cada fase tiene sus hitos, fuentes, casos y criterio de salida en `docs/PLAN.md §4`.

| Fase                          | Hitos                                                                                                                                                                                                                                      | Estado                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| **F1 Diseño y simulación**    | G0 base · G1 modelo · G2 importación · G3 malla · G4 carga · G5 tiempos · G6 MIC y PPV · G7 reporte y escenarios · G8 idiomas · G9 cierre (`docs/hitos/cierre-fase-1.md`)                                                                  | ✅ código · 🟡 cierre formal (pendientes abajo) |
| Evaluación 1                  | El ingeniero usa el producto con los casos; hallazgos críticos resueltos                                                                                                                                                                   | ⏳ espera los pendientes de F1                  |
| **F2 Análisis avanzado**      | A0 especificación ✅ · A1 precorte y buffer ✅ · **A1b burden efectivo por isócronas** · A2 Holmberg–Persson y daño · A3 Kuz-Ram y Swebrec · A4 proyección y onda aérea · A5 desplazamiento con magnitud, costo y doble cebado · A6 cierre | ⏳ en curso                                     |
| Evaluación 2                  | E2.1 manual básico · E2.2 registro de comentarios · E2.3 sesión con ingenieros externos                                                                                                                                                    | —                                               |
| **F3 Subterráneo**            | S0 fuentes y casos · S1 modelo · S2 diseño de frentes · S3 carga, secuencia y resultados de frentes · S4 anillos · S5 análisis · S6 cierre                                                                                                 | —                                               |
| **F4 Datos de campo**         | C0 formatos · C1 as-drilled e IREDES · C2 sismógrafos y ajuste de K/β · C3 nube de puntos y dron · C4 calibración · C5 cierre                                                                                                              | —                                               |
| **F5 Distribución + backend** | D0 decisión de backend · D1 usuarios y roles · D2 comentarios, auditoría e historial · D3 manual y empaquetado · D4 cierre                                                                                                                 | —                                               |

## Pendientes de la Fase 1 (no bloquean F2)

Bloquean el **cierre formal** de la Fase 1 (Evaluación 1), no el desarrollo.

| Pendiente                                                                                                                                                                            | Quién                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| I1: respuesta 3 de `docs/comprension.md` (CR-01 a mano) y las preguntas por hito                                                                                                     | El desarrollador responde; el ingeniero aprueba |
| P-15: fichas de HA73/HA64 → CR-04 completo (carga y reporte). No son públicas: HA73 es un heavy ANFO 70/30 de la operación (Antamina lo usa gasificado); la ficha la da el proveedor | Ingeniero u operación                           |
| CSV real de CR-04 (180 taladros)                                                                                                                                                     | Ingeniero                                       |
| I6: un ingeniero reproduce CR-04 de punta a punta (protocolo en el cierre de F1)                                                                                                     | Ingeniero                                       |
| Registros de CR-06 con carga por retardo (ajuste de K/β, F4) y ejemplo publicado de Kuz-Ram (CR-07; Cunningham 2005 no trae uno numérico)                                            | Ingeniero                                       |
| Técnicos: reproyección entre CRS, topografía GeoJSON/LandXML, reglas en ft                                                                                                           | Desarrollo (deuda, sin fecha)                   |

## Herramientas para el agente

- **Ver la aplicación sin intervención del usuario:** `pnpm dev` en segundo plano y un script de Playwright con el Chromium sin interfaz de `~/.cache/ms-playwright/chromium_headless_shell-*`. En este WSL le faltan `libnspr4`/`libnss3`: se bajan sin sudo con `apt-get download libnspr4 libnss3`, `dpkg -x` en una carpeta temporal y `LD_LIBRARY_PATH` apuntando a su `usr/lib/x86_64-linux-gnu`. `playwright-core` se instala en una carpeta temporal (no en el repo).
- **Fuentes en PDF:** se leen con `pypdf` en un entorno virtual temporal (no hay `pdftotext`). ScienceDirect bloquea la descarga automática (403): el artículo de Zhang et al. (2021) hay que bajarlo a mano desde el navegador si se quiere archivar.

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
