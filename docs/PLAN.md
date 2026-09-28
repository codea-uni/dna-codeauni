# Cronos: plan de desarrollo

Cronos (antes BlastLab) es una aplicación web para diseñar y simular voladuras. Este plan adapta el proyecto a la guía del ingeniero de minas en `docs/theory/`, que es el **norte y tiene prioridad sobre este plan y sobre `ARCHITECTURE.md`**: si se contradicen, gana la guía y la diferencia se corrige aquí o se registra en `docs/preguntas.md`.

| Documento                                              | Para qué                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `docs/theory/01 - Guia del desarrollador.md`           | Alcance, requisitos (R-xx), hitos (G0–G9), backlog (H-xxx), indicadores (I1–I7) |
| `docs/theory/02 - Especificacion de calculo.md`        | Fórmulas, unidades y verificaciones                                             |
| `docs/theory/03 - Modelo de datos e importacion.md`    | Entidades, catálogos, formatos, trampas de importación                          |
| `docs/theory/04 - Casos de referencia.md`              | CR-01…CR-07: valores esperados de los tests                                     |
| `docs/theory/05 - Reglas mineras y su verificacion.md` | RM-01…RM-23 con fuentes                                                         |
| `docs/theory/references/R1…R4`                         | Glosario, fichas F01–F30, benchmark I-Blast y JKSimBlast, subterráneo           |
| `docs/reglas.md`                                       | Registro vivo de reglas con estado R0–R4                                        |
| `docs/preguntas.md`                                    | Dudas para el ingeniero, cada una con su valor por defecto                      |
| `docs/decisiones/`                                     | Notas de decisión D-01…                                                         |
| `docs/ARCHITECTURE.md`                                 | Arquitectura, flujo de datos, vocabulario minero ↔ código                       |

## 1. Principios (guía §1.5)

1. **Correcto antes que vistoso.** Cada cálculo cita su fuente y se verifica con un caso de referencia.
2. **Explicable.** Al usuario se le muestra qué modelo se usó, con qué parámetros y por qué.
3. **Simple de usar.** El flujo guía paso a paso.
4. **Modular y bilingüe** (español e inglés).
5. **Sin copiar.** No se copian interfaz, textos ni constantes propietarias de JKSimBlast, I-Blast, SHOTPlus ni BlastLogic.

A estos se suman los de la arquitectura existente: fluidez (60 fps con 5.000 taladros), cálculo pesado en workers, un único modelo de dominio y ningún backend por ahora (D-08).

## 2. Estado heredado

BlastLab construyó en orden sus fases 0–9. Todo se reutiliza (D-07), pero ninguna fórmula cuenta como verificada hasta reproducir su caso de referencia.

| Fase BlastLab     | Qué hay                                                                                   | Hito de la guía          |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------ |
| 0 Bootstrap       | Monorepo, engine, workers, DocumentStore con undo/redo                                    | G0                       |
| 1 Editor de malla | Patrones cuadrado/rectangular/tresbolillo, recorte a polígono, selección, snapping        | G3                       |
| 2 Carguío         | Librería, decks, kg/taladro, factores, cubicación Voronoi                                 | G4                       |
| 3 Tiempos         | Dijkstra, electrónicos, plantilla en fila y en V, isócronas, animación, ventana 8 ms      | G5, G6                   |
| 4 CSV             | Importación con mapeo de columnas, exportación                                            | G2                       |
| 5 Energía         | Holmberg–Persson en planta, densidad de carga, contornos                                  | F2                       |
| 6 Fragmentación   | Kuz-Ram, Swebrec, curva, P50/P80                                                          | F2                       |
| 7 Vibración       | PPV por distancia escalada, sobrepresión, Lundborg, puntos de control                     | G6, F2                   |
| 8 DXF y PDF       | DXF R12 de entrada y salida, informe PDF vectorial                                        | G2, G7                   |
| 9 Vista 3D        | Banco, decks coloreados, topografía                                                       | G3 (vista 3D conmutable) |
| Extras            | Revisión del diseño (`core/src/diagnostics`), ejemplos configurados (`core/src/examples`) | G3–G6                    |

**Brechas más importantes (encontradas al contrastar con `docs/theory/`):**

- Ningún caso de referencia (CR-01…CR-06) está en los tests.
- ~~**Bug:** `chargePerDelay` (`packages/core/src/vibration/vibration.ts`) usaba una ventana centrada (t − w, t + w): en CR-05, amarre 3, daba un MIC de 300 kg en vez de 200.~~ Corregido en el Tramo 0.
- ~~**Bug:** `parseNumber` (`packages/core/src/io/csv.ts`) convertía `272,345.578` en 272.345578.~~ Corregido en el Tramo 0.
- No existen grupos de taladros, escenarios de diseño, estado de agua, límites de PPV, K/β por punto, SDOB, PD/PB, modelos de burden, burden efectivo, autoguardado, i18n ni GeoJSON.
- Faltan README, CI y cobertura.

## 3. Trazabilidad de requisitos (indicador I2)

Cadena: fuente → caso → prueba → pantalla. Estados: ✅ hecho y verificado con CR · 🟡 parcial o sin CR · ❌ falta. Ningún requisito llega todavía a ✅ completo: solo CR-05 (amarres 1–4) está en los tests.

| R    | Requisito                                  | Hito | Estado                                                                                     | Código actual                                            | CR           | Pantalla                               |
| ---- | ------------------------------------------ | ---- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------ | -------------------------------------- |
| R-01 | Importar polígonos (CSV, DXF, GeoJSON)     | G2   | 🟡 los tres formatos; sin reproyección                                                     | `core/src/io/dxf.ts`, `geojson.ts`                       | —            | menú Importar                          |
| R-02 | Importar taladros con detección de trampas | G2   | ✅ trampas de 03 §5 con test; CR-04 sintético                                              | `core/src/io/csv.ts`                                     | CR-04        | `CsvImportDialog`                      |
| R-03 | Importar topografía                        | G2   | 🟡 DXF 3DFACE                                                                              | `core/src/io/dxf.ts`                                     | —            | `DxfImportDialog`                      |
| R-04 | Cara libre y burden desde ella             | G3   | ✅ aristas del perímetro o líneas DXF/GeoJSON; burden desde la cara y burden efectivo (G5) | `geometry/boundary.ts`, `timing/effectiveBurden.ts`      | CR-01, CR-05 | `PatternPanel`, `BlastPanel`           |
| R-05 | Mallas cuadrada, tres bolillos, triangular | G3   | ✅ incluye equilátera (S = 2B/√3)                                                          | `core/src/patterns/pattern.ts`, `design/burden.ts`       | CR-01        | `PatternPanel`                         |
| R-06 | Malla en polígono cualquiera               | G3   | 🟡 hecho, sin CR                                                                           | `fitPatternToPolygon`                                    | CR-04        | `PatternPanel`                         |
| R-07 | Grupos (precorte, buffer, producción)      | G3   | ✅ grupos, asignación, color y regla de carga por grupo (G4)                               | `HoleGroup`, `GroupsPanel`, `ChargePanel`                | —            | `GroupsPanel`                          |
| R-08 | Taladros inclinados, sobreperforación      | G3   | ✅ geométrica o López Jimeno (P-05); chequeo J/B                                           | `core/src/geometry/hole.ts`                              | CR-03        | `BlastPanel`, `PropertiesPanel`        |
| R-09 | Burden efectivo según secuencia            | G5   | ✅ CR-05 amarres 1, 2 y 5; regla «delante» por confirmar (P-16)                            | `core/src/timing/effectiveBurden.ts`                     | CR-05        | `ViewPanel` (color), `PropertiesPanel` |
| R-10 | Catálogo base e importación                | G4   | 🟡 fuente y versión, CSV de entrada/salida; faltan fichas reales (CT-01)                   | `core/src/model/library.ts`, `io/catalogCsv.ts`          | —            | `LibraryPanel`                         |
| R-11 | Catálogo de accesorios                     | G4   | 🟡 fuente/versión en el modelo; sin mecha de seguridad                                     | `core/src/model/types.ts`                                | —            | `LibraryPanel`                         |
| R-12 | Carga por decks con taco de catálogo       | G4   | ✅ sin agua en superficie; esponjamiento y Ø efectivo                                      | `core/src/charging/charge.ts`                            | CR-01..03    | `DeckEditor`                           |
| R-13 | Cadena de iniciación posicionada           | G4   | ✅ editor de iniciadores y aviso sin booster                                               | `diagnostics/chargeChecks.ts`                            | —            | `DeckEditor`                           |
| R-14 | Kg, FC, tonelaje, metros, área             | G4   | ✅ real y de diseño, factor de energía, m³/m, por grupo                                    | `core/src/charging/chargeAnalysis.ts`                    | CR-01..03    | `ResultsPanel`                         |
| R-15 | Advertencia de confinamiento               | G4   | ✅ SDOB separada de la vibración, umbrales configurables                                   | `core/src/charging/sdob.ts`                              | CR-02        | `ResultsPanel`, `DeckEditor`           |
| R-16 | Amarre y retardos por separado             | G5   | ✅ conexiones (topología) y retardos (conector/override y de fondo) por separado           | `core/src/timing/`                                       | CR-05        | `TimingPanel`                          |
| R-17 | Tiempo por taladro y reproductor           | G5   | ✅ CR-05 amarres 1–5; tiempos relativos                                                    | `core/src/timing/timing.ts`                              | CR-05        | `ViewPanel`                            |
| R-18 | Taladro de inicio y amarre generado        | G5   | ✅ en fila, en V y en escalón; ciclos detectados                                           | `core/src/timing/tieUp.ts`, `timingChecks.ts`            | CR-05        | `TimingPanel`                          |
| R-19 | Carga máxima por retardo                   | G6   | ✅ ventana semiabierta y ampliada (P-10)                                                   | `timing.ts`, `vibration.ts`                              | CR-05        | `ResultsPanel`, `VibrationPanel`       |
| R-20 | PPV con K y β configurables                | G6   | ✅ del sitio o del punto                                                                   | `core/src/vibration/vibration.ts`                        | CR-06        | `VibrationPanel`                       |
| R-21 | Puntos de monitoreo con límites            | G6   | ✅ límite propio o por tabla con fuente; excedencia y MIC admisible                        | `ppvLimitFor`, `admissibleCharge`                        | CR-06        | `VibrationPanel`                       |
| R-22 | Reporte PDF                                | G7   | 🟡 con supuestos y revisión; CR-04 espera P-15                                             | `workers/src/report/pdfReport.ts`                        | CR-04        | menú Exportar                          |
| R-23 | Escenarios comparables                     | G7   | ✅ guardar, cargar y comparar lado a lado                                                  | `document/commands.ts`, `analysis/compareScenarios.ts`   | —            | `ScenariosPanel`                       |
| R-24 | Autoguardado y deshacer/rehacer            | G7   | ✅ autoguardado con historial; ≥ 50 pasos probados                                         | `DocumentStore.ts`, `apps/web/src/persistence/`          | —            | Versiones autoguardadas                |
| R-25 | Usuarios con rol                           | —    | ⏸ diferido (D-08)                                                                          | —                                                        | —            | —                                      |
| R-26 | Español e inglés                           | G8   | ✅ interfaz, mensajes del núcleo y del motor, e informe PDF                                | `apps/web/src/i18n/`, `workers/src/report/reportText.ts` | —            | Ajustes del proyecto                   |
| R-27 | SI y UTM consistentes                      | G1   | 🟡 SI, EPSG obligatorio para importar y unidades de visualización; falta reproyectar (G2)  | `core/src/units/units.ts`, `ProjectSettingsDialog`       | —            | Ajustes del proyecto                   |

## 4. Hoja de ruta

Se conservan los IDs de la guía (G, H, R, RM, CR). **Un hito a la vez; no se avanza sin aprobación.** Cada hito se cierra con su criterio de salida, los CR aplicables en verde y su reporte en `docs/hitos/Gx.md`.

### Tramo 0: base y correcciones críticas (cierra G0)

- [x] Documentación: este plan, `reglas.md`, `preguntas.md`, `decisiones/`, `comprension.md`, README.
- [x] **Bug MIC:** `chargePerDelay` usa ventanas semiabiertas [t, t + w). Test CR-05, amarres 1–4 (100/200/200/100 kg), en `packages/core/src/timing/cr05.test.ts`.
- [x] **Bug CSV:** `parseNumber` con miles con coma (`272,345.578` → 272345.578); `detectDelimiter` prioriza tab y `;` sobre la coma.
- [x] CI (`.github/workflows/ci.yml`): typecheck, lint, formato, tests con cobertura; los de rendimiento solo informan.
- [x] Cobertura v8 (`pnpm test:coverage`), umbral de 85 % de líneas en `core`. Línea base: 95 % de líneas, 71 % de ramas.
- [x] Renombrar a Cronos: paquetes `@cronos/*`, UI, informe PDF y `format: 'cronos-project'`. Los archivos `blastlab-project` se siguen abriendo (test). Las capas DXF conservan el prefijo `BL_`.
- [x] Infraestructura i18n (D-11) en `apps/web/src/i18n/`: `es.ts` (claves), `en.ts` (`satisfies`), `t()` y `useT()`. Migrado: grupo de archivo y deshacer de la barra. El resto se migra por panel cuando se toca; falta el selector de idioma (pantalla de ajustes, G1).
- [ ] H-002: `docs/comprension.md` respondido por el desarrollador y aprobado por el ingeniero.
- **Salida:** 6/6 respuestas aprobadas; un tercero clona, corre `pnpm install && pnpm test` y pasa; CI en verde.

### G1: modelo de datos y unidades (E1)

- [x] Esquema v3 con migración v2 → v3 y test (`packages/core/src/io/projectFile.ts`):
  - `HoleGroup { id, name, kind, color, template? }` en `blast.groups` y `Hole.groupId`;
  - `Hole.water: dry|static|dynamic` (opcional, RM-02, P-09);
  - `MonitoringPoint` con `ppvLimit?`, `k?` y `beta?`;
  - `Project.ppvLimits` `{ from, to?, ppvMax, source }` con la tabla de curso por defecto (DF-14);
  - `blast.calcParams`: ventana MIC, γ, Δ de alivio y umbrales de la revisión. La ventana ya se edita en la pestaña Vista y se guarda con el proyecto;
  - `RockMass`: `tensileStrength`, `vp`, `rqd`;
  - productos con `source` y `version`; `Explosive` con `densityRange`, `waterResistance`, `gassing`, `needsBooster` y `criticalDiameter`;
  - `StemmingMaterial`: `kind`, `angularity`, `grading`.
- [x] H-101: sin EPSG no se importa; el menú Importar abre los ajustes.
- [x] Ajustes del proyecto (`apps/web/src/dialogs/ProjectSettingsDialog.tsx`): nombre, EPSG (sugerencias UTM 17S–19S), unidades e idioma.
- [x] H-104: m/ft y mm/in en todos los campos y tablas de los paneles (`apps/web/src/hooks/useUnits.ts`). **Pendiente:** las reglas, la escala y la herramienta Medir del engine siguen en m.
- [x] H-102: autoguardado en IndexedDB (`apps/web/src/persistence/`): una versión por minuto como máximo, las 20 más recientes por proyecto, recuperación al abrir y diálogo «Versiones autoguardadas».
- [x] Renombrar `core/src/scenarios` a `examples`, para reservar "escenario" a las variantes de diseño (G7).
- Todavía sin UI (llegan en su hito): grupos (G3), estado de agua y catálogo con fuente (G4), límites y K/β por punto (G6).
- **Salida:** ida y vuelta JSON sin pérdidas con el esquema v3; migración v2 → v3 testeada; sin unidades mezcladas.

### G2: importación (E2; R-01 a R-03) ✅

**Existía:** mapeo de columnas por encabezado, unidades del archivo, valores por defecto de la plantilla, lista de filas con error; DXF con roles por capa (taladros, perímetros, caras libres, topografía 3DFACE).

- [x] H-201: trampas de `03 §5` en `packages/core/src/io/csv.ts`:
  - codificación (`decodeText`: UTF-8 estricto o Windows-1252/ISO-8859-1) y selector en el diálogo;
  - archivo sin encabezado (primera fila con números) y mapeo por posición «ID, Este, Norte, Cota»;
  - separador editable (tab y `;` tienen prioridad sobre la coma);
  - miles con coma a nivel de archivo (`detectThousands`);
  - IDs duplicados (en el archivo y contra la voladura) como error con la línea;
  - Norte/Este intercambiados (con rango UTM del EPSG, o por cantidad de cifras) con botón «Intercambiar Este/Norte»;
  - coordenadas fuera del rango del CRS;
  - cota vacía o cero, atípicos (a más de máx(10 × mediana, 1 km));
  - columna Grupo, o grupo desde el prefijo del ID (CR-04: A, B, C, BF).
- [x] Vista previa en el mapa: «Importar y ver en el mapa» aplica un solo comando; el diálogo muestra los avisos y ofrece «Aceptar», «Deshacer importación» o «Intercambiar Este/Norte».
- [x] H-202: GeoJSON de entrada y salida (`io/geojson.ts`): puntos = taladros, polígonos = perímetros con `free_face_edges`, líneas = cara libre; rechaza longitud/latitud; avisa si el `crs` del archivo es otro. Perímetros desde CSV.
- [x] Fixture sintético de CR-04 (`io/fixtures/cr04-sintetico.csv`): 180 filas sin encabezado, `;`, miles con coma, UTM 18S; test en `io/csvTraps.test.ts`.
- **Pendiente:** reproyectar entre CRS (necesitaría proj4; hoy solo se avisa). El CSV real de CR-04 sigue pendiente de entrega.

### G3: diseño de malla (E3; R-04 a R-08) ✅

**Existía:** mallas cuadrada, rectangular y tresbolillo; recorte a polígono y orientación por azimut; cara libre marcada en las aristas del perímetro (herramienta C) con «Alinear filas a la cara libre» y «1ª fila desde el borde» (burden medido desde la cara libre); inclinación y sobreperforación como parámetros; selección por lazo.

- [x] H-301: la cara libre sigue siendo la arista del perímetro (y `blast.freeFaces` de DXF/GeoJSON). Sin cara libre: advertencia en la revisión («voladura confinada», RM-06) y confirmación explícita al generar la malla (P-03).
- [x] H-302: botón «Equilátera (S = 2B/√3)» en tresbolillo.
- [x] H-303: panel de grupos (`apps/web/src/panels/GroupsPanel.tsx`): crear desde la selección (lazo = selección por polígono), asignar, quitar, seleccionar para cargar o dar tiempos, tipo y color; «Color de taladros: Grupo» en la vista. Pendiente para G4: regla de carga guardada por grupo (`HoleGroup.template`).
- [x] H-305: `core/src/design/burden.ts` (Ash, Konya–Walter, Andersen, S sugerido, H/B de Konya, T = 0,7·B y J = 0,3·B, tres bolillos, volumen nominal) con CR-01 pasos 1–7 y 10, CR-02 y CR-03; panel «Burden teórico» con referencia elegida y marca ±10 %.
- [x] H-304: longitud de taladro inclinado (P-05): geométrica por defecto, L = (H + J)/cos α; López Jimeno como opción en Voladura (`calcParams.subdrillConvention`). CR-03 se valida con López Jimeno (11,5 m).
- [x] Volumen nominal Σ B·S·H (H vertical, sin cos α; P-06) y factores de diseño en Resultados, junto al cubicado.
- [x] Chequeos de `02 §6` en `diagnostics/designChecks.ts`: rigidez, J/B, H/Ø, taco largo (> 1,3·B) y en diámetros, sin cara libre. Umbrales en `calcParams.checks`; advertencias o notas, nunca bloqueos.
- **Salida:** CR-01 pasos 1–7 y 10, CR-02 fila 12 y CR-03 (B, L y V_R con López Jimeno) reproducidos; CR-04 sintético con su conteo.

### G4: explosivos y carga (E4; R-10 a R-15) ✅

**Existía:** librería editable (explosivos, detonadores, conectores, boosters, tacos) copiada en el proyecto; decks por taladro con diagrama de columna; regla de carga aplicable en lote; kg/taladro, factores y cubicación.

- [x] H-401: cada producto de la librería base declara `source` y `version` (genérico sin ficha, R0: CT-01); tabla «Agua, iniciación y origen» en Librería; catálogo de explosivos por CSV de entrada y salida (`core/src/io/catalogCsv.ts`, energía en MJ/kg o kcal/kg).
- [x] H-402:
  - el agua ya no se ofrece como deck en superficie (RM-01);
  - cierre de tramos: `overcharged` (Σ > L) y `openColumn` (Σ < L), ambos error (R3);
  - masa por tramo DCL·(largo − esponjamiento) y densidad en taladro por tramo (P-01; CR-02 fila 7);
  - diámetro efectivo del cartucho (CR-03, +10 %).
- [x] H-403: editor de iniciadores (detonador, booster, profundidad y retardo; varios por taladro); aviso de carga continua con agente de voladura sin booster (`needsBooster`, RM-05).
- [x] H-404: `core/src/charging/sdob.ts` (Chiappetta, P-01), separado de la distancia escalada de vibración; avisos severa (< 0,4) y baja (< 1,2) configurables; se muestra en el editor de columna. El aire sobre la carga no confina (P-14, por confirmar).
- [x] `core/src/charging/pressures.ts`: PD = ρ·VOD²/(γ + 1), PB = 0,5·PD, VOD(D) con diámetro crítico (aviso `belowCriticalDiameter`).
- [x] H-405: nombres de D-10 (`loadingFactor`, `powderFactor`); en Resultados: factores reales (cubicado) y de diseño (nominal: loading/powder/energy factor, rendimiento m³/m) y tabla por grupo; `byRow` en el núcleo.
- [x] P-04: `noDetonator` error; `noStemming` en rojo con confirmación al aplicar taco 0.
- [x] P-09: estado de agua por taladro en Propiedades; aviso `waterIncompatible` y marca en el selector de explosivos.
- [x] Regla de carga guardada por grupo («Aplicar al grupo» / «Usar su regla»), pendiente de G3.
- **Salida:** CR-01 pasos 8–12, CR-02 filas 1–14 y las tres variantes con decks (incluida la SDOB corregida) y CR-03 completo (`core/src/charging/cases.test.ts`). **CR-04 a mano pendiente:** faltan las densidades de HA73 y HA64 (P-15).
- Pendiente menor: mostrar angularidad y granulometría del taco en la Librería (RM-04, el modelo ya las tiene).

### G5: amarre, tiempos y simulación (E5; R-09, R-16 a R-18) ✅

**Existía:** Dijkstra con retardos de superficie y de fondo, tiempos electrónicos, plantillas en fila y en V desde cualquier taladro (el conector entre filas es el «conectar filas»), amarre manual (herramienta de amarre), taladros sin iniciar, isócronas, animación y CR-05 amarres 1–4 (Tramo 0).

- [x] H-504: plantilla en escalón (`rowTieUp` con `mode: 'echelon'`); detección de ciclos del amarre (`cycleHoles`, error `tieCycle`); taladros sin conectar (`notInitiated`, ya existía).
- [x] H-502: tiempos relativos al primero en las etiquetas y en Propiedades; CR-05 al milisegundo.
- [x] H-503: `core/src/timing/effectiveBurden.ts` (en el worker, con índice espacial): distancia a la superficie libre más cercana al detonar; alivio por taladros que salieron al menos `reliefRate`·B antes (P-02, 3 ms/m) y que están delante (≥ 0,5·B más cerca de la cara, P-16). Avisos `unrelievedBurden` (B_ef ≥ 2·B), `invertedOrder` (CK-10) y `closeRelief` (informativo). Color por burden efectivo en la vista.
- [x] H-505: guía de retardos por metro configurable (entre taladros 3–8 ms/m, P-11; entre filas 6–12 ms/m), aviso informativo `delayGuide`.
- [x] Parámetros de la secuencia en la pestaña Tiempos (alivio y guía), guardados en `calcParams` (esquema v5).
- [x] Rendimiento: burden efectivo + revisión de tiempos de 5.000 taladros dentro del presupuesto de 300 ms (`performance.perf.test.ts`).
- **Salida:** CR-05 amarres 1–5 reproducidos (tiempos, MIC y burden efectivo 3,0/6,0 m con sus avisos) en `core/src/timing/cr05.test.ts`.
- Ajuste del ejemplo de producción: chaflán de 12 m (con 18 m quedaba un taladro de esquina sin alivio, detectado por la revisión nueva). La alineación de filas usa ahora la arista de cara libre más larga.

### G6: carga por retardo y PPV (E6; R-19 a R-21) ✅

**Existía:** PPV por distancia escalada en puntos de control y en grilla con la carga de la ventana de cada taladro, sobrepresión, Lundborg, puntos con la herramienta M, gráfico de carga por ventana; ventana de MIC corregida (Tramo 0) y guardada en `calcParams` (G1).

- [x] H-601: MIC con ventana semiabierta y ventana ampliada para pirotécnicos, w + 2·σ máx. (P-10).
- [x] H-602: K y β propios por punto; distancia al taladro más cercano del grupo de la ventana (P-07) con el PPV del centroide como dato informativo cuando R ≥ 5 × extensión del grupo; se reporta la carga y el inicio de la ventana que gobierna; límite por punto o por tabla (estructura y distancia, P-12) con marca de excedencia.
- [x] H-603: `admissibleCharge` (MIC admisible invirtiendo la ley) por punto.
- [x] Tabla de límites de PPV editable con su fuente, por tipo de estructura; configuración por punto (estructura, límite, K, β).
- **Salida:** CR-06 (9,4462 y 4,9375 mm/s, ±1 %) y su inversa en `vibration/vibration.test.ts`; CR-05 para la MIC.
- Pendiente de F4: ajuste de K y β con registros de sismógrafo (los de CR-06 no traen la carga por retardo).

### G7: reporte y escenarios (E7; R-22 a R-24) ✅

**Existía:** informe PDF vectorial en el worker (resumen, plano, carguío, fragmentación, vibración, retardos entre filas, tabla de taladros); deshacer y rehacer ilimitados; autoguardado (G1).

- [x] H-701: escenarios como copias guardadas del diseño en el proyecto (`Project.scenarios`): guardar, cargar (un paso de deshacer) y borrar; comparación lado a lado en el worker (`compareScenarios`: taladros, explosivo, factores de diseño, duración, MIC normal y ampliada, PPV máximo, excedencias, errores y advertencias), copiable a hoja de cálculo. Pestaña «Escenarios».
- [x] H-702: el PDF agrega los factores de diseño (B·S·H), límite, excedencia y carga admisible por punto, la MIC ampliada, la revisión del diseño y «Modelos, parámetros y supuestos» (con las constantes sin ficha y las reglas que solo avisan).
- [x] Plano a PNG (`engine.captureImage`) y tabla de taladros al portapapeles (TSV).
- [x] H-703: test de 60 pasos de deshacer y rehacer en malla, carga y amarre con estado idéntico.
- **Salida:** dos diseños comparados (test); **el reporte de CR-04 espera las fichas de HA73/HA64 (P-15).**

### G8: idiomas (E8; R-26) ✅

- [x] H-802: toda la interfaz en español e inglés, con selector en Ajustes del proyecto:
  - diccionarios por área en `apps/web/src/i18n/ns/*.ts` (≈ 900 claves); el inglés se declara con `satisfies`, así que una clave que falte o sobre no compila;
  - números con el separador del idioma (`useFormat`, `formatNumber`);
  - mensajes del núcleo (revisión del diseño con `params`, avisos y errores de importación, ejemplos, errores al abrir un proyecto) traducidos en `apps/web/src/i18n/coreText.ts`; test con todos los ejemplos (`coreText.test.ts`);
  - textos del motor (etiquetas de deshacer de las herramientas, brújula N/S/E/W, reglas) con `engine.setText`;
  - informe PDF con `language` (`packages/workers/src/report/reportText.ts`).
- No se traducen (a propósito): nombres propios y términos iguales en ambos idiomas (Swebrec, Rosin-Rammler, López Jimeno, Burden), unidades, los nombres de indicadores de D-10 y los datos del proyecto (nombres de productos, voladuras, puntos). Las etiquetas de deshacer quedan en el idioma en que se hizo la acción.
- Usuarios y roles (H-801, R-25) pasan a la fase con backend (D-08).
- **Salida:** la interfaz cambia de idioma sin textos sin traducir.

### G9: cierre de la Fase 1 🟡 (código listo; faltan las mediciones con el ingeniero)

- [x] Reporte de cierre con los indicadores I1–I7 medidos: `docs/hitos/cierre-fase-1.md`.
- [x] Ejemplos actualizados con lo de G1–G7 (grupos, agua, límites por estructura, escenarios guardados) y el de «problemas típicos» con los avisos de carga.
- [x] Modo demostración (botón de la claqueta en la barra): recorrido automático con subtítulos para grabar el avance.
- [x] Preguntas de comprensión por hito (2 por hito, I1) preparadas en `docs/comprension.md` para que las responda el desarrollador.
- [ ] I6: un ingeniero reproduce CR-04 de punta a punta sin ayuda (protocolo en el reporte de cierre). Necesita el CSV real y las fichas de HA73/HA64 (P-15).
- [ ] I1: aprobación del ingeniero (respuesta 3 de G0 y las de cada hito).
- [ ] I7: paridad con JKSimBlast o I-Blast si hay demo.
- Luego **Evaluación 1**: el ingeniero usa el producto y se resuelven los hallazgos críticos.

### Después de la Fase 1

| Fase                          | Contenido                                                                                                                                                                                                                                                                                                                              | Punto de partida                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **F2 Análisis avanzado**      | Regularizar lo ya hecho con fuente y CR: Kuz-Ram (variantes, P-08; CR-07 publicado), Swebrec (Ouchterlony 2005), Holmberg–Persson y criterio de daño ¼·VPPc, sobrepresión y Lundborg. Nuevo: precorte y buffer (CR-01), semáforo de proyección por SDOB, desplazamiento del material (buscar fuente, RM-20), Monte Carlo de dispersión | `02 §5`, `R1` F23–F27, `R3` F12–F15                                                  |
| **Evaluación 2**              | Ingenieros externos                                                                                                                                                                                                                                                                                                                    | —                                                                                    |
| **F3 Subterráneo**            | Frentes (método sueco, Langefors–Holmberg) y anillos (abanicos). El modelo se amplía con perfil de excavación, roles de taladro (arranque, alivio, ayuda, contorno, zapatera) y planos de anillo                                                                                                                                       | `R4 §4`; verificar cada fórmula `[GENERAL]` con Holmberg (1982) antes de programarla |
| **F4 Datos de campo**         | As-drilled (`Hole.actual` ya existe), sismógrafos (CSV ISO-8859-1 con `;`) y ajuste de K/β con r², diseño frente a realidad                                                                                                                                                                                                            | `R2` F07, F10; `03 §1` principio 2                                                   |
| **F5 Distribución + backend** | Usuarios y roles, comentarios del revisor, auditoría, historial en servidor, manual de usuario, empaquetado                                                                                                                                                                                                                            | D-08                                                                                 |

## 5. Ciclo de trabajo por hito (guía §8.1)

1. Ubicar o escribir el **caso de referencia** con su fuente y anotar las reglas en `reglas.md` con su estado.
2. Escribir la **prueba** con el valor de la fuente, antes que el código.
3. Implementar.
4. Contestar por escrito dos preguntas de comprensión sobre lo construido.
5. Llenar el reporte en `docs/hitos/Gx.md` y mostrar una demo al ingeniero.

```
Hito: G_
Reglas tocadas: R-xx (estado antes → después), con fuente
Casos de referencia reproducidos: CR-xx (resultado vs. esperado, diferencia)
Indicadores: I1 _ · I2 _ · I3 _ · I4 _ · I5 _
Preguntas abiertas (críticas / no críticas): _ / _
Qué no pude verificar y por qué: _
```

**Definición de hecho** (guía §13 más las reglas técnicas):

- Criterios de aceptación con prueba automática.
- Reglas en `reglas.md` con fuente y estado.
- CR aplicables dentro de tolerancia.
- Documentación actualizada.
- Código explicable.
- `typecheck`, `lint` y `test` en verde; sin `any`.
- Si toca engine o workers: fixture de 5.000 taladros a 60 fps.
- Commit convencional.
