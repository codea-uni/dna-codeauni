# Cronos

Aplicación web para **diseñar** una voladura en banco, **simular** su secuencia y **predecir** sus resultados antes de disparar: carga por taladro, factor de carga, tiempos, carga máxima por retardo, vibración, energía y fragmentación. Cada cálculo cita su fuente y se verifica con un caso de referencia.

El cálculo corre en el navegador (Web Workers y WebGL). Un servidor opcional agrega login, empresas, minas, historial de versiones y topografía compartida.

## Inicio rápido

1. Instalar [Node 24](https://nodejs.org), pnpm (`corepack enable`) y [Docker](https://www.docker.com).
2. En la carpeta del proyecto:

   ```bash
   pnpm install
   pnpm dev:online
   ```

3. Abrir <http://localhost:5173> y entrar con `luis@cronos.local` / `cronos123` (diseñador).
   Otras cuentas en [Usuarios predeterminados](#usuarios-predeterminados).
4. Entrar a la mina **Cuajone** y abrir **Demo · Banco sobre topografía**: una voladura sobre el
   terreno con ortofoto (en 3D, tecla **3**). También están **Demo · Mina sobre levantamiento DXF**
   (tajo real de un TIN, regenerable con `node scripts/topo-example.js`) y
   **Demo · Tajo con topografía**.

Ctrl+C lo detiene. Sin Docker, `pnpm dev` abre la aplicación sin login (se guarda en el navegador).

## Despliegue (VPS)

Para el agente de Claude en el VPS: el código está en `/opt/dna-codeauni` y se publica en
<https://dna.codeadevelopment.com>.

```sh
cd /opt/dna-codeauni
./deploy.sh                      # actualizar y desplegar con el .env existente
./deploy.sh --server             # primera activación de login y cuentas predeterminadas
curl -s https://dna.codeadevelopment.com/api/health              # debe responder status ok
```

El `.env` del VPS no se sube al repositorio; ahí están el superadministrador y los secretos.
Si acabas de recibir un commit con `amend`, usa el comando de primera actualización de
[`docs/DEPLOY.md`](docs/DEPLOY.md#primera-actualización-después-de-un-amend).
Detalle, respaldos y contraseñas olvidadas en [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Demostración

El botón 🎬 **Videos**, disponible también en producción, ofrece dos reproducciones:

- **Recorrido guiado:** 16 pasos (≈ 2 min), con capítulos, subtítulos y barra de progreso. Cubre
  diseño, carga, 3D, secuencia, burden efectivo, proyección, desplazamiento, daño, fragmentación,
  vibración, escenarios, revisión e idiomas.
- **Tráiler (presentación):** ≈ 58 s sobre la mina del levantamiento DXF, sin portada y en todo el
  lienzo. Muestra el terreno, 141 taladros agregados fila por fila, 140 amarres, el disparo,
  el desplazamiento de la maza en 3D y la pila final. Usa la animación cinemática.

Los videos usan un documento temporal: al salir se restaura el proyecto, su historial y sus
permisos. La presentación no se autoguarda ni se publica como versión del proyecto abierto.

Controles: **← →** paso anterior o siguiente, **espacio** pausa, **Esc** sale; también con los botones del subtítulo o haciendo clic en la barra de progreso. Cada paso parte de una vista limpia, así que se puede retroceder o saltar a cualquiera.

Para exportar el tráiler a MP4 (Node ≥ 24, Chromium headless de Playwright en caché y ffmpeg):

```sh
node scripts/record-trailer.js
# O reutilizar una web local abierta:
node scripts/record-trailer.js --url http://127.0.0.1:5173 --output artifacts/cronos-trailer.mp4
# Destino de esta presentación en Windows / WSL:
node scripts/record-trailer.js --output /mnt/c/Users/Augusto/Videos/cronos-trailer.mp4
```

El grabador inicia la app por el menú, avanza el tiempo virtual en pasos de 1/30 s y renderiza
un PNG por fotograma antes de codificar H.264 a 1920×1080, 30 fps. Guarda también capturas por
escena y metadatos junto al video. `--mode realtime` usa screencast con timestamps si el tiempo
virtual no está disponible; `--overwrite` permite reemplazar una salida anterior.
Cada ejecución escribe en un archivo temporal y valida la decodificación completa antes de
reemplazar el MP4 de destino.
Las librerías NSS se pueden extraer localmente sin instalarlas: instrucciones en la cabecera
de [`scripts/record-trailer.js`](scripts/record-trailer.js). Los videos no se versionan.

## Asistente IA

La pestaña **Asistente IA** de la cinta abre una conversación con un agente (Gemini) que diseña sobre
el proyecto abierto, por voz (micrófono; Chrome o Edge) o por escrito: malla cuadrada, rectangular
o al tresbolillo, diámetro, inclinación y sobreperforación, carga por taladro o por fila, amarre en
V, línea a línea o en escalón, electrónicos y retardos taladro por taladro. Siempre trabaja sobre el
perímetro activo; si no hay perímetro sugiere dibujarlo y solo lo crea si se le confirma. Cada
cambio es un paso de deshacer (Ctrl+Z o «deshaz eso») y después revisa el análisis (coincidencias,
kg, tiempos) para responder con datos.

Necesita el servidor (`pnpm dev:online` o producción) con la clave en `apps/server/.env` (o en el
`.env` de la raíz en el VPS): `GEMINI_API_KEY=` (de <https://aistudio.google.com/apikey>). El modelo
por defecto es `gemini-flash-latest` (`GEMINI_MODEL` para cambiarlo). La clave queda en el servidor:
el navegador habla con `/api/ai/generate` y solo con sesión iniciada.

## Ventanas flotantes

Las barras laterales no cambian. Los módulos con tablas o muchos campos juntos tienen un botón de expandir (⤢) en su título que los abre en una **ventana flotante**: se arrastra por el título, se agranda desde la esquina y se cierra con ✕ (vuelve a la barra). Están en la Librería (explosivos, detonadores, conectores, primas y tacos), el editor de columna, los grupos, el burden teórico, la fragmentación (con su gráfico), los puntos de monitoreo, los límites de PPV y los escenarios. Las posiciones se recuerdan en el navegador; durante la demostración todo vuelve a la barra.

## Requisitos

- Node ≥ 24
- pnpm (se usa **solo** pnpm; ver `packageManager` en `package.json`)

## Comandos de desarrollo

```bash
pnpm install
pnpm dev         # aplicación web (Vite), sin login
pnpm dev:online  # con login, empresas, minas e historial (PostgreSQL con Docker)
pnpm dev:seed    # vuelve a cargar los datos de demostración (solo lo que falte)
pnpm test        # tests (core, engine, workers, web) y de rendimiento
pnpm typecheck   # tsc -b
pnpm lint
pnpm format
```

## Usuarios predeterminados

Cuentas disponibles en desarrollo (`pnpm dev:online`, http://localhost:5173) y producción.
Se crean solas al arrancar, junto con las empresas, las minas y los proyectos de demostración
(`pnpm dev:seed` lo repite; solo agrega lo que falte y conserva las cuentas existentes).
`CRONOS_DEMO_DATA=false` desactiva esta carga. `deploy.sh --server` usa
`plataforma@cronos.local` si falta el correo y fija su contraseña en `cronos123`, sin cambio
obligatorio al entrar.

| Correo                    | Contraseña  | Rol                                     |
| ------------------------- | ----------- | --------------------------------------- |
| `plataforma@cronos.local` | `cronos123` | Superadministrador (dueño del software) |
| `qa@cronos.local`         | `cronos123` | Superadministrador                      |
| `admin@cronos.local`      | `cronos123` | Administrador de Minera Sur             |
| `luis@cronos.local`       | `cronos123` | Diseñador de Minera Sur                 |
| `rosa@cronos.local`       | `cronos123` | Revisora de Minera Sur (solo lectura)   |
| `beto@norte.local`        | `cronos123` | Administrador de Minera Norte           |

- **Superadministrador:** se define en `apps/server/.env` (`CRONOS_SUPERADMIN_EMAIL`,
  `CRONOS_SUPERADMIN_PASSWORD`, `CRONOS_SUPERADMIN_NAME`). El `.env` manda: al arrancar el servidor
  se crea o se actualiza con esa contraseña y no pide cambiarla. Para cambiarla, se edita el `.env`
  y se reinicia.
- **Restablecer otra cuenta:** `pnpm --filter @cronos/server reset-password <correo> <contraseña>`
  (queda fija); con `--temporal` se pide cambiarla al entrar.
- Las cuentas nuevas que crea un administrador (o el superadministrador al crear una empresa)
  entran con la contraseña indicada, sin tener que cambiarla.

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
