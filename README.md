# Cronos

Aplicación web para **diseñar** una voladura en banco, **simular** su secuencia y **predecir** sus resultados antes de disparar: carga por taladro, factor de carga, tiempos, carga máxima por retardo, vibración, energía y fragmentación. Cada cálculo cita su fuente y se verifica con un caso de referencia.

Todo corre en el navegador: el cálculo pesado va en Web Workers y la vista usa WebGL. Por ahora no hay backend.

## Demostración

El botón de la claqueta en la barra lanza un recorrido automático de 16 pasos (≈ 2 min) pensado para grabar un video tutorial: capítulo numerado, subtítulo y barra de progreso. Cubre diseño, carga, 3D, secuencia, burden efectivo, semáforo de proyección, desplazamiento, daño, fragmentación, vibración, escenarios, revisión e idiomas.

Controles: **← →** paso anterior o siguiente, **espacio** pausa, **Esc** sale; también con los botones del subtítulo o haciendo clic en la barra de progreso. Cada paso parte de una vista limpia, así que se puede retroceder o saltar a cualquiera.

## Ventanas flotantes

Las barras laterales no cambian. Los módulos con tablas o muchos campos juntos tienen un botón de expandir (⤢) en su título que los abre en una **ventana flotante**: se arrastra por el título, se agranda desde la esquina y se cierra con ✕ (vuelve a la barra). Están en la Librería (explosivos, detonadores, conectores, primas y tacos), el editor de columna, los grupos, el burden teórico, la fragmentación (con su gráfico), los puntos de monitoreo, los límites de PPV y los escenarios. Las posiciones se recuerdan en el navegador; durante la demostración todo vuelve a la barra.

## Requisitos

- Node ≥ 24
- pnpm (se usa **solo** pnpm; ver `packageManager` en `package.json`)

## Uso

```bash
pnpm install
pnpm dev         # aplicación web (Vite), sin login
pnpm dev:online  # con login, empresas, minas e historial (PostgreSQL con Docker)
pnpm test        # tests (core, engine, workers, web) y de rendimiento
pnpm typecheck   # tsc -b
pnpm lint
pnpm format
```

## Usuarios de desarrollo

Cuentas de la base local de `pnpm dev:online` (PostgreSQL de `docker-compose.dev.yml`), en
http://localhost:5173. **Solo para desarrollo**: en producción el superadministrador sale de su
propio `.env` y las demás cuentas las crea cada empresa.

| Correo                    | Contraseña           | Rol                                     |
| ------------------------- | -------------------- | --------------------------------------- |
| `plataforma@cronos.local` | `admin-cronos-dev`   | Superadministrador (dueño del software) |
| `qa@cronos.local`         | `qa-definitiva-1`    | Superadministrador                      |
| `admin@cronos.local`      | `admin-definitiva-1` | Administrador de Minera Sur             |
| `luis@cronos.local`       | `luis-definitiva-1`  | Diseñador de Minera Sur                 |
| `rosa@cronos.local`       | `rosa-definitiva-1`  | Revisora de Minera Sur (solo lectura)   |
| `beto@norte.local`        | `beto-definitiva-1`  | Administrador de Minera Norte           |

- **Superadministrador:** se define en `apps/server/.env` (`CRONOS_SUPERADMIN_EMAIL`,
  `CRONOS_SUPERADMIN_PASSWORD`, `CRONOS_SUPERADMIN_NAME`). El `.env` manda: al arrancar el servidor
  se crea o se actualiza con esa contraseña y no pide cambiarla. Para cambiarla, se edita el `.env`
  y se reinicia.
- **Restablecer otra cuenta:** `pnpm --filter @cronos/server reset-password <correo> <contraseña>`
  (temporal: se cambia al entrar); con `--permanente` queda fija.
- Las cuentas nuevas que crea un administrador (o el superadministrador al crear una empresa)
  reciben una contraseña temporal que se cambia al entrar.

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
