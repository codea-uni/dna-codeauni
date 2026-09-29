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

### Fase 2: análisis avanzado (A0–A6, más A1b)

Guía `01 §3` y `§19`: energía y daño, fragmentación, onda aérea, desplazamiento y proyección. **Salida: el caso de referencia de cada modelo reproducido.** Primero se especifica cada modelo con fuente y caso; lo que no tiene fuente numérica queda como aviso configurable (regla de dominio 3). F2 no tiene R-xx ni H-xxx propios: las tareas salen de `02 §5`, `R1` F12 y F23–F28, `04` (CR-01, CR-02 #15–#17) y `reglas.md` (FC-26…FC-37). Estado al día en `docs/ESTADO.md`.

**Migración v5→v6** (en A1, con test, igual que `fillCalcParams` en `core/src/io/projectFile.ts`): `calcParams.fragmentation`, `calcParams.damage`, `calcParams.sdobBands` y `RockMass.vppc`, a medida que cada hito los necesite.

#### A0: especificación y preguntas ✅

- `reglas.md`: FC-26…FC-32 completadas; nuevas FC-33 (daño H-P), FC-34 (bandas SDOB), FC-35 (costo).
- `preguntas.md`: P-17…P-22 con su valor por defecto. Ninguna bloquea A1 ni A2.

#### A1: precorte y buffer (CR-01) ✅

- Núcleo `core/src/design/presplit.ts` (`R1` F26): f = (D_carga/D_pozo)², Pb = 110·f^n·ρ·VOD² (MPa, g/cc, km/s; n = 1,25 seco, 0,9 con agua), diámetro de carga imponiendo Pb = UCS·R, E ≤ D_pozo·(Pb + RT)/RT y factor de carga γ.
- Núcleo `core/src/design/buffer.ts` (`R1` A.2): B_buf, S_buf = 1,15·B_buf y DST.
- Tests: CR-01 precorte (f 0,0664 → 1,80"; con 1¾": f 0,0628, Pb 46,6 MPa, E 1,12–1,13 m; γ: el ingeniero confirma 1,514 kg/m², P-18, falta corregirlo en `04`); `X-PRE` (E 2,229 m, 1,54 kg/m, Pb 100 MPa); CR-01 buffer (5,9; 6,9; 3,4 m).
- Interfaz: el panel de grupos muestra el cálculo sugerido para grupos de precorte y buffer, con aviso si el diseño se sale; aviso en la revisión si el precorte no sale ≥ 100 ms antes que la producción. La roca muestra UCS, RT, E y A (hoy solo entran por archivo).
- **Salida:** FC-31 y FC-32 en R3. Hecho: `design/presplit.ts` (fórmulas, `presplitHole`, `presplitChecks` en la revisión con `calcParams.checks.presplitLead` = 100 ms, esquema v6), sugerencia en el panel de grupos y UCS, RT y E editables en Carguío. El γ de CR-01 del documento (1,53–1,54) no se reproduce; el ingeniero confirma que el valor comparable es 1,514 kg/m² (P-18); DST está en el núcleo pero no en el panel (necesita la quebradura Q_b).

#### A1b: burden efectivo por isócronas (respuesta P-16)

Corrección de G5 pedida por el ingeniero. Va antes que A2 porque toca un cálculo de F1 que ya está en R3.

- `core/src/timing/effectiveBurden.ts`: un taladro ya detonado alivia a **cualquier** taladro que dispare después (también los vecinos de fila) si (a) la distancia perpendicular a la isócrona de los taladros detonados es menor que la distancia a la cara original y (b) detonó al menos `reliefRate`·B antes (3 ms/m por defecto; típico 8–12). Reemplaza la aproximación «0,5·B más cerca de la cara», que queda documentada como la regla anterior.
- Aviso intermedio con B_ef ≥ 1,5·B (nuevo umbral en `calcParams.checks`, migración a v7) además del de ≥ 2·B.
- Tests: CR-05 amarres 1, 2 y 5 siguen dando lo mismo (B_ef = 6,0 m con el mismo retardo); caso nuevo con salida en V o escalón donde B2 se alivia con B1 (≈ 3,5 m o menos, P-16).
- Rendimiento: el cálculo corre en el worker; fixture de 5.000 taladros por debajo de 300 ms (`performance.perf.test.ts`).
- **Salida:** FC-22 con la regla de P-16, sin cambiar ningún valor de CR-05.

#### A2: Holmberg–Persson y criterio de daño

- Forma puntual de `R1` F25 (Δθ con la profundidad del geófono) junto al integrador de `energy/energy.ts`; mapa de daño PPV/VPPc por bandas ¼, 1, 4 y 8 (`R3` F14) en el worker.
- VPPc de la roca (P-17): dato del usuario (retroanálisis) o, si faltan, **VPPc = RT·Vp/E** calculada y rotulada como tal. Sin VPPc no hay mapa de daño. La roca gana Vp editable en Carguío.
- Validez (P-17): H-P solo con R ≲ 3·L_carga; más lejos, aviso de que manda la distancia escalada. K, α de H-P separados de los de la ley de PPV y rotulados «calibrar con mediciones cercanas».
- Test con el ejemplo de `R1` F25 (q = 75,75 kg/m, K = 982, α = 1,2068): 36 mm/s a 100 m; 184 a 50 m; 6,9 a 200 m; 2,6 a 300 m. Test de VPPc = RT·Vp/E con los datos de una roca de la fuente.
- Interfaz: conmutador PPV / daño en el panel de energía.
- **Salida:** FC-28 en R3; FC-33 en R1 (sin CR). Fixture de 5.000 taladros.

#### A3: Kuz-Ram y Swebrec regularizados

- Tests con CR-02 #15 (RWS 80,67): X50 25,5 cm, n 1,04, Xc 36,4 cm (±1 %); X80 ≈ 57,5 cm; pasante 23/49/75/94 % en 10/25/50/100 cm; cruce `X-D1` (29,5 cm; 1,056; 41,7 cm).
- P-19: Xc al 63,2 %, X80 = X50·(ln 5/ln 2)^(1/n), A = 0,06·(…) (ya es así en el código); RWS del proveedor si la ficha lo trae, si no desde energías con 3,7 MJ/kg.
- CT-08 a parámetros (`calcParams.fragmentation`): desviación de perforación, respaldo, sobretamaño y finos (hoy se pierden en `analysisStore`); el piso n ≥ 0,3 pasa a aviso. Usar `RockMass.swebrecB` si está.
- **Salida:** FC-26 en R2 (regresión) hasta CR-07, visible en la interfaz y el PDF.

#### A4: proyección y onda aérea

- Semáforo de proyección por SDOB con cortes en **0,62, 0,92, 1,44 y 1,84** (P-20) en `calcParams.sdobBands` y capa de color en planta; aviso con SD < 0,92 (`R1` F27).
- Aviso de eyección del taco con intervalo entre filas < 35 ms (`P5 p77`); taco sugerido por diseño inverso T = SD·W^(1/3) − Ø/200 (`R1` F06).
- Lundborg: se agrega el tamaño de fragmento T = 0,1·d^(2/3) (d en pulgadas, P-20). Sobrepresión con su fuente (USBM RI 8485, FC-30 en R1), k y β del sitio (β 1,2–1,5). Ambos siguen como estimaciones sin CR, rotulados así en la interfaz y el PDF. Traducir los textos que faltan (`VibrationPanel.tsx`, PDF).
- **Salida:** FC-34 en R3 con los valores frontera.

#### A5: desplazamiento y verificaciones

- **Velocidad de burden** (FC-36, Zhang, Chi & Yi 2021; P-21) por taladro con su burden efectivo: v_B = √[π·c_B·ρ_e·e_e·c_e/(2·ρ_r·tan θ)]·(d/B), c_B = 0,12 y θ = 45° como parámetros; aviso si la carga está desacoplada (fuera de validez). Tests: Malmberget 57,6 m/s; Tabla 2: 16,5; 19,5; 16,7; 10,6 m/s (±1 %).
- **Alcance** (FC-37): tiro parabólico del centroide con α = 90° − ángulo de cara y h = H/2 (ejemplo de P-21: 14,1 m/s → 22,7 m, solo regresión); filas posteriores con v·k^(n−1), k = 0,7 como parámetro de calibración (R0).
- Mapa vectorial en planta: dirección normal a la isócrona (`R1` F21) y largo = alcance; cálculo en el worker.
- Costo por taladro y por tonelada (CR-02 #16 = 321,40 US$/taladro, #17 = 144; `R1` F28 = 0,1836 US$/t) con precios como datos del catálogo.
- Doble cebado: dispersión entre detonadores < L_columna/VOD (`R1` F19), como aviso.
- Se aplazan: Monte Carlo de dispersión (DF-15) y JKMRC de finos (sin constantes públicas).
- **Salida:** FC-36 en R3; FC-37 en R0 hasta calibrar k con perfiles de pila reales (F4).

#### A6: cierre de F2

- Reporte `docs/hitos/cierre-fase-2.md`; demostración y ejemplos con precorte, daño y semáforo. Luego **Evaluación 2** con ingenieros externos.

### Evaluación 2 (después de A6)

Guía `01 §3`: «Ingenieros externos · grupo elegido por el ingeniero de minas; manual básico y registro de comentarios · **Salida: hallazgos críticos resueltos**».

- **E2.1 Manual básico** en `docs/manual/` (español; inglés al final): instalación (`README`), flujo de los 12 pasos de la guía `§4` con capturas, qué modelo usa cada resultado y su estado (R0–R3), límites conocidos. Las capturas se sacan con el navegador sin interfaz (ver «Herramientas» en `docs/ESTADO.md`).
- **E2.2 Registro de comentarios** sin backend (D-08): `docs/evaluaciones/evaluacion-2.md` con una tabla (evaluador, fecha, pantalla, hallazgo, severidad, estado) y un formulario externo o una exportación JSON. Los comentarios dentro de la aplicación esperan a F5.
- **E2.3 Sesión:** protocolo de I6 (`docs/hitos/cierre-fase-1.md §4`) con CR-01 y el ejemplo de producción; se mide éxito, bloqueos y tiempo.
- **Salida:** hallazgos críticos corregidos y registrados; `docs/hitos/evaluacion-2.md`.

### Fase 3: subterráneo (S0–S6)

Guía `01 §3`: «Frentes y anillos · método sueco para frentes; abanicos para anillos · **Salida: ronda completa dentro de sección; casos de referencia**». `01 §19`: ampliar el modelo con perfil de excavación y taladros de alivio. Fuente principal: `docs/theory/references/R4` (solo tiene §1 y §4). Benchmarks: `R3` F17 (2DRing), F18 (2DFace); `R2` F23. **Ninguna fórmula de `R4 §4.1` marcada `[GENERAL]` se programa sin verificarla contra Holmberg (1982) o López Jimeno** (regla de dominio 1); hasta entonces es un parámetro del usuario.

#### S0: fuentes y casos (solo docs)

- Conseguir Holmberg (1982) / López Jimeno (manual de perforación y voladura) y verificar cada `[GENERAL]` de `R4 §4.1` (líneas 103–108): avance H = 0,15 + 34,1·Φ2 − 39,4·Φ2²; B1 ≤ 1,7·Φ2 (práctico 1,7·Φ2 − F); q1 = 55·d·(B1/Φ2)^1,5·(B1 − Φ2/2)·(c/0,4)/PRP_ANFO; W_n = B_n·√2; zapateras B = 0,9·√(q·PRP/(c·f·(S/B))) con B ≤ 0,6·L. Registrarlas en `reglas.md` (FC-40…) con su estado.
- Casos de referencia nuevos (CR-S1 frente, CR-S2 anillo) tomados de un ejemplo resuelto del libro: ninguno existe hoy. Candidatos: la galería de `R1 §6` (40 taladros cargados + 2 de alivio, `P1-S4 p87-89`) y el ejemplo del manual de JKSimBlast (`R3` F18: 45 taladros de 3,2 m, 51 mm cargados y 102 mm de alivio) solo como verificación cruzada.
- Pregunta al ingeniero (`R1 §7` #23): qué literatura o curso se usa para el módulo subterráneo; mecha de seguridad (RM-15); normativa (DS 024-2016-EM, `R4 §1.3`).
- **Salida:** fórmulas en R1 con cita y al menos un CR por módulo.

#### S1: modelo de datos (esquema nuevo con migración)

- `Blast.bench` pasa a ser opcional o se agrega un tipo de voladura (`surface` / `face` / `ring`) con su contenedor: perfil de excavación (polilínea cerrada en el plano del frente, con tipos herradura, rectangular, arco-D y circular), avance, plano del frente; para anillos, plano del anillo (origen, rumbo de la normal, buzamiento), contorno del tajeo y galerías.
- Roles de taladro para frentes: arranque, alivio (vacío), ayuda, contorno (hastial, techo) y zapatera. Se agregan como `HoleGroupKind` nuevos o como campo `role`; el alivio no lleva carga.
- Taladros ascendentes: `holeToe` (`core/src/geometry/hole.ts`) ya es 3D; acotar la inclinación en el esquema (0–180°) y probarlo.
- Migración y test (patrón de `fillCalcParams`, `core/src/io/projectFile.ts`).

#### S2: frentes, diseño de la ronda (método sueco de 4 secciones)

- Parámetros: avance, Ø de carga, Ø y número de alivios (Φe2 = √N·Φe), desviación esperada, constante de roca c, PRP del explosivo.
- Generador: arranque en 4 secciones (B1, B2…; lado de la última sección < √avance; taco 10·d), ayudas (f = 1,45 sección B y 1,2 sección C, S/B = 1,25), contorno (sin voladura suave: f = 1,2, S/B = 1,25; con voladura suave: S = K·d con K = 15–16, S/B = 0,8, carga lineal ≈ 90·d² para Ø < 155 mm), zapateras (f = 1,45, S/B ≈ 1, B ≤ 0,6·L). Todo editable a mano sin perder el vínculo con los parámetros (`R4 §4.1` función 2).
- Validaciones (`R4 §4.1` función 6): alivio vacío mayor que el de carga (RM-13), burden del primer cuadrilátero ≤ 1,7·Ø equivalente, taladros dentro del perfil, distancias mínimas, retardos únicos y crecientes, cara libre disponible.
- Vista: el frente se dibuja en su propio plano (cámara ortográfica sobre el plano del frente); reutiliza InstancedMesh del engine.
- Tests con CR-S1.

#### S3: frentes, carga, secuencia y resultados

- Carga por grupo: encartuchado y granel (RM-14), carga desacoplada o cordón en el contorno, kg por taladro.
- Secuencia automática arranque → ayudas → contorno → zapateras con retardos largos entre grupos (`R4 §1.2`); simulación paso a paso (reutiliza `timing/`).
- KPIs (`R4 §4.1` función 5): avance ≈ 95 % del taladro con desviación ≤ 2 %; volumen y t por disparo; factor de carga kg/m³ y kg/t (típico 2–4 kg/m³, `R4 §1.1`); kg por m de avance; m perforados por m de avance; número de taladros; MIC (reutiliza FC-23).
- Daño del contorno con Holmberg–Persson (FC-28, FC-33 de F2).
- Exportar PDF a escala, CSV y DXF; escenarios lado a lado (reutiliza G7).
- **Salida parcial:** ronda completa dentro de la sección con CR-S1 reproducido.

#### S4: anillos (abanicos)

- Contorno del tajeo y galerías (polilíneas, importación DXF/CSV); abanico por ángulo igual o por espaciamiento de pie constante; varios centros de perforación; ascendentes y descendentes; recorte con stand-off contra el contorno (`R4 §4.2` funciones 1–3).
- Cálculo (función 4): metros perforados por anillo, volumen y t por anillo (burden × área de la sección), factor de carga kg/m³ y kg/t (típico 0,3–0,6 kg/m³), kg por taladro y por anillo, m/t.
- Reglas `[CURSO]`/`[GENERAL]` como parámetros con aviso: burden ≈ 25–35·Ø; espaciamiento de pie/burden 1,0–1,3; ~85 % cargado; sobreperforación 0–0,5·B según el pie.
- Validaciones (función 7): espaciamiento de pie en rango, largo máximo por equipo, desviación 1–2 % del largo, taladros que se cruzan; primer anillo con cara libre (slot).
- Secuencia desde la cara libre hacia afuera y entre anillos en retirada desde el slot.
- Exportación por anillo (PDF, CSV con collar, azimut, inclinación, largo, carga y retardo; DXF). Tests con CR-S2.

#### S5: análisis subterráneo

- Energía en el plano del anillo o del frente (`R3` F13: resolución 0,1 m en anillos, 0,02 m en frentes); fragmentación por anillo con Kuz-Ram (F2 A3) como estimación.
- Burden efectivo en frentes (FC-22 con las reglas de P-16).
- Fixture de rendimiento con un anillo grande y una ronda de 150 taladros.

#### S6: cierre de F3

- Reporte `docs/hitos/cierre-fase-3.md`; ejemplos (un frente de galería y un anillo) y pasos en la demostración; manual ampliado.
- **Salida (guía):** ronda completa dentro de la sección y los casos de referencia reproducidos.

### Fase 4: datos de campo (C0–C5)

Guía `01 §3`: «Calibrar con mediciones · importar perforación y sismógrafos, nube de puntos y dron · **Salida: un diseño calibrado con datos reales**». Principio `03 §1` #2: **diseño y realidad son datos distintos**. Benchmarks: `R2` F07 (desviación), F10 (sismógrafos), F14 (dron), F20 (MWD), F21 (auditorías). Muestras de formatos en `R2 §5`.

#### C0: formatos con la operación (solo docs)

- Confirmar con la operación qué formatos se usan (`03 §4`, guía `§17` #18): sismógrafos (marcas de `R2` F10: IDETEC, Instantel, NOMIS, Vibracord, White, ZTEX, Syscom, ASCII/CSV), sondas de desviación (Boretrak `.phd`, DeviaLim), MWD (`.lim` = ZIP con NetCDF, variables sin documentar, `R2 §7` Q4), IREDES (P-13).
- Pedir los registros de CR-06 con la carga por retardo de cada uno (sin ella no se ajusta K y β).

#### C1: as-drilled (perforado)

- El modelo ya tiene `Hole.actual` (`core/src/model/types.ts`, sin uso): se amplía con trayectoria de desviación (profundidad, azimut, inclinación por tramo, como `.phd`), estado del taladro (`HoleStatus` ya existe) y as-loaded (kg reales, densidad medida, taco medido; `R1 §1.2` etapa 7).
- Importadores: CSV de collares reales y `Voladura.xlsx`/`.phd` (`R2 §5`); emparejar por ID con el diseño y avisar huérfanos.
- Vista diseño frente a real: desplazamiento de la boca, largo y desviación; tolerancia de 30 cm (`R1` F30); taladros cercanos < 4 m que detonan juntos; distancias entre trayectorias en profundidad (`R2` F07, burbujas).
- Recalcular carga, tiempos, burden efectivo y Kuz-Ram con la geometría real (W = desviación real en (1 − W/B), `R1` F30; ejemplo: n de 1,04 a 0,94).
- IREDES: exportar el patrón para perforadoras e importar el perforado (P-13).

#### C2: sismógrafos y ajuste de K y β

- Importar registros CSV (ISO-8859-1, `;`, decimal `.`; 1024 muestras/s; canales acústico, radial, vertical y transversal, `R2 §5`); picos L/T/V, resultante (PVS), frecuencia (RM-21) y sobrepresión en dB.
- Entidad nueva de registro medido (voladura, punto, distancia, carga por retardo, PPV, frecuencia).
- Ajuste log-log de PPV = K·(R/√Q)^(−β) con r² e intervalo de confianza configurable (50 % en el ejemplo de `R2` F10: K = 179,4, α = −1, r² = 0,7); quitar atípicos a mano; guardar el ajuste como ley del sitio o del punto (FC-24).
- Tests: recuperar K y β de datos sintéticos generados con valores conocidos y, cuando lleguen, con los registros de CR-06.
- Retroanálisis de VPPc (P-17 vía 1) y calibración de k de sobrepresión (FC-30; 128 dB a 200 m y 116 dB a 300 m como primer punto).

#### C3: nube de puntos, dron y perfil de cara

- Importar nube (`.las/.laz/.ply/.csv`, `R2` F06; ejemplo de 4,2 M puntos) en el worker con submuestreo; ortofoto como fondo.
- Perfil de la cara y burden real en la base y a media altura (critical burden, `R2` F06); cara libre desde la nube.
- Rendimiento: la nube se dibuja por lotes; 60 fps con el fixture.

#### C4: calibración de modelos

- Fragmentación: comparar P50/P80 medidos (análisis de imagen, dato del usuario) con Kuz-Ram y ajustar A.
- Desplazamiento: calibrar k por fila (FC-37) con perfiles de pila reales.
- Informe «diseño frente a real» en PDF (auditoría, `R2` F21).

#### C5: cierre de F4

- Reporte `docs/hitos/cierre-fase-4.md` con un diseño calibrado con datos reales (salida de la guía).

### Fase 5: distribución y backend (D0–D4)

Guía `01 §3`: «Dejarlo listo para terceros · documentación de usuario, empaquetado, lista de verificación de lanzamiento · **Salida: lista aprobada**». Aquí se levanta D-08: usuarios, roles, comentarios, auditoría e historial (R-25, H-801, UC-09, UC-10, NF-07, NF-08).

#### D0: decisión de backend (nota D-12)

- Opciones: servidor Node con `@cronos/core` (D-02 lo permite tal cual) y base relacional; o servicio gestionado. Autenticación, cifrado en tránsito, variables de entorno sin credenciales en el repositorio (guía `§14`), licencias permisivas (NF-15). Despliegue sobre lo que ya existe (`Dockerfile`, `docker-compose.yml` con Traefik, `docs/DEPLOY.md`).

#### D1: usuarios y roles

- Roles de la guía `§1.4`: diseñador (crea, simula, compara, reporta), revisor (ve y comenta; **no edita**), administrador (usuarios, roles, catálogos). Entidad de `03 §2`: `id`, `nombre`, `correo`, `rol`, `idioma`.
- Pantalla de administración de usuarios (guía, pantalla mínima 11). Criterio de H-801: el revisor no puede editar; los cambios quedan en un registro.

#### D2: comentarios, auditoría e historial

- Comentarios del revisor asociados al escenario (`03 §2`, UC-09).
- Registro de auditoría: quién, cuándo, qué, por comando del DocumentStore (cada mutación ya es un comando).
- Historial de versiones en el servidor (NF-08), además del autoguardado local.
- Catálogos compartidos del administrador con copia congelada por proyecto (`03 §1` #6).

#### D3: documentación y empaquetado

- Manual de usuario completo (ES/EN) a partir del manual de E2.1; guía de instalación de un tercero (NF-01).
- Registro de errores y versiones (NF-13); compatibilidad Chrome y Edge (NF-04).
- Paquete de despliegue reproducible y lista de verificación de lanzamiento.

#### D4: cierre de F5

- Lista de verificación aprobada por el ingeniero (salida de la guía) y `docs/hitos/cierre-fase-5.md`.

**Fuera de alcance de todas las fases** (guía `01 §3`): ejecución en campo con tabletas, integración con perforadoras o camiones fábrica, gemelo digital 4D y aprendizaje automático.

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
