# Cronos

Aplicación web para **diseñar** una voladura en banco, **simular** su secuencia y **predecir** sus resultados antes de disparar: carga por taladro, factor de carga, tiempos, carga máxima por retardo, vibración, energía y fragmentación. Cada cálculo cita su fuente y se verifica con un caso de referencia.

Todo corre en el navegador: el cálculo pesado va en Web Workers y la vista usa WebGL. Por ahora no hay backend.

## Demostración

El botón de la claqueta en la barra lanza un recorrido automático con subtítulos por las funciones principales (diseño, carga, 3D, secuencia, burden efectivo, vibración, escenarios, revisión e idiomas), pensado para grabar un video de avance. Esc sale; también se puede pausar o saltar pasos.

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

Orden de lectura sugerido (adaptado de la guía, `docs/theory/01 §2`):

1. `docs/theory/01 - Guia del desarrollador.md`: qué se construye, requisitos, hitos y reglas de trabajo. **Es el norte del proyecto.**
2. `docs/theory/references/R1 - Primer minero a desarrollador.md`, §1, §2 y §5: ciclo de voladura, glosario ES/EN y ejemplos resueltos.
3. `docs/theory/02 - Especificacion de calculo.md` y `04 - Casos de referencia.md`: fórmulas y valores esperados.
4. `docs/theory/03 - Modelo de datos e importacion.md`.
5. `docs/theory/05 - Reglas mineras y su verificacion.md`.
6. `docs/theory/references/R2` (I-Blast) y `R3` (JKSimBlast), como consulta al construir cada pantalla; `R4` para subterráneo.

Documentos de trabajo del repositorio:

| Documento              | Para qué                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `docs/PLAN.md`         | Estado, trazabilidad de requisitos y hoja de ruta por hitos |
| `docs/ARCHITECTURE.md` | Arquitectura, flujo de datos, vocabulario minero ↔ código   |
| `docs/reglas.md`       | Registro de reglas y fórmulas con estado R0–R4              |
| `docs/preguntas.md`    | Dudas para el ingeniero de minas, con el valor por defecto  |
| `docs/decisiones/`     | Notas de decisión (D-01…)                                   |
| `docs/comprension.md`  | Ejercicio de comprensión (G0) y preguntas por hito          |
| `docs/hitos/`          | Reportes de hito y cierre de la Fase 1                      |
| `CLAUDE.md`            | Reglas del proyecto para asistentes de IA                   |
