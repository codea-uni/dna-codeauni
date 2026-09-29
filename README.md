# Cronos

Aplicación web para **diseñar** una voladura en banco, **simular** su secuencia y **predecir** sus resultados antes de disparar: carga por taladro, factor de carga, tiempos, carga máxima por retardo, vibración, energía y fragmentación. Cada cálculo cita su fuente y se verifica con un caso de referencia.

Todo corre en el navegador: el cálculo pesado va en Web Workers y la vista usa WebGL. Por ahora no hay backend.

## Demostración

El botón de la claqueta en la barra lanza un recorrido automático de 16 pasos (≈ 2 min) pensado para grabar un video: portada y cierre animados, capítulo numerado, subtítulo y barra de progreso. Cubre diseño, carga, 3D, secuencia, burden efectivo, semáforo de proyección, desplazamiento, daño, fragmentación, vibración, escenarios, revisión e idiomas.

Controles: **← →** paso anterior o siguiente, **espacio** pausa, **Esc** sale; también con los botones del subtítulo o haciendo clic en la barra de progreso. Cada paso parte de una vista limpia, así que se puede retroceder o saltar a cualquiera.

## Requisitos

- Node ≥ 24
- pnpm (se usa **solo** pnpm; ver `packageManager` en `package.json`)

## Uso

```bash
pnpm install
pnpm dev         # aplicación web (Vite)
pnpm test        # tests (core, engine, workers, web) y de rendimiento
pnpm typecheck   # tsc -b
pnpm lint
pnpm format
```

## Estructura

| Paquete            | Qué hace                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `packages/core`    | Modelo de dominio, comandos con undo/redo y todos los cálculos. Sin DOM: corre en Node, en workers y en el navegador |
| `packages/engine`  | Dibujo con Three.js (planta y 3D), picking y herramientas de edición                                                 |
| `packages/workers` | Cálculos e informe PDF en Web Workers (Comlink)                                                                      |
| `apps/web`         | Interfaz React (paneles, tablas, gráficos)                                                                           |

Detalle en `docs/ARCHITECTURE.md`.

## Documentación

**Para saber en qué fase va el proyecto, o para retomarlo en otro chat: `docs/ROADMAP.md`.** Tiene todas las fases (F1 a F5), sus hitos y el hito en curso marcado con ▶.

| Documento              | Para qué                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ROADMAP.md`      | Todas las fases y hitos, estado actual, cómo trabajar                                                                                                                                    |
| `docs/RULES.md`        | Cada fórmula y regla minera con su fuente y estado (R0–R4)                                                                                                                               |
| `docs/QUESTIONS.md`    | Decisiones del ingeniero, supuestos tomados y examen de comprensión                                                                                                                      |
| `docs/DECISIONS.md`    | Decisiones técnicas (D-01…)                                                                                                                                                              |
| `docs/REPORTS.md`      | Reportes de cada hito e indicadores de cierre de fase                                                                                                                                    |
| `docs/ARCHITECTURE.md` | Arquitectura, flujo de datos, vocabulario minero ↔ código                                                                                                                                |
| `docs/DEPLOY.md`       | Despliegue en el servidor                                                                                                                                                                |
| `docs/theory/`         | Guía del ingeniero de minas (**el norte del proyecto**): empezar por `01-DEVELOPER-GUIDE.md`, luego `references/R1-MINING-PRIMER.md`, `02-CALCULATION-SPEC.md` y `04-REFERENCE-CASES.md` |
| `CLAUDE.md`            | Reglas del proyecto para asistentes de IA                                                                                                                                                |
