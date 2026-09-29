# Reportes de hito

Un bloque por hito con la plantilla de la guía (`docs/theory/01 §8.2`). Al cerrar una fase se agregan sus indicadores (I1–I7, guía `§10`).

## Fase 1: cierre (G9), medido el 2026-09-28

Semáforo **amarillo**: el código de G0–G8 está completo y verificado; faltan las mediciones que hacen personas (I1, I6) y los datos de CR-04 (P-15).

### Hitos

| Hito                    | Estado    | Casos de referencia                                     | Pendiente                                         |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------------------------- |
| G0 Comprensión y base   | ✅ código | —                                                       | Respuesta 3 de `docs/QUESTIONS.md` (CR-01 a mano) |
| G1 Modelo y unidades    | ✅        | Migraciones v1→v5 con test                              | —                                                 |
| G2 Importación          | ✅        | CR-04 sintético (180 taladros, trampas de `03 §5`)      | Reproyección entre CRS; CSV real de CR-04         |
| G3 Malla                | ✅        | CR-01 pasos 1–7 y 10, CR-02 fila 12, CR-03 (B, L, V)    | —                                                 |
| G4 Explosivos y carga   | ✅        | CR-01 pasos 8–12, CR-02 filas 1–14 y 3 variantes, CR-03 | CR-04 a mano: fichas de HA73/HA64 (P-15)          |
| G5 Amarre y tiempos     | ✅        | CR-05 amarres 1–5 (tiempos, MIC, burden efectivo)       | Confirmar P-16                                    |
| G6 MIC y PPV            | ✅        | CR-06 (ejemplo a mano) e inversa                        | Registros reales de CR-06 (F4)                    |
| G7 Reporte y escenarios | ✅        | Comparación de escenarios; 60 pasos de deshacer         | Reporte de CR-04 (P-15)                           |
| G8 Idiomas              | ✅        | Todos los avisos del núcleo traducidos (test)           | —                                                 |

### Indicadores (guía `§10`)

| Indicador                     | Meta                                                            | Medido                                                                                                                                                                                           | Estado         |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| **I1 Comprensión**            | 6 en G0 y 2 por hito, 100 % aprobadas                           | G0: 5/6 aprobadas (falta la 3). Por hito: 16 preguntas preparadas en `docs/QUESTIONS.md`, sin responder                                                                                          | 🟡             |
| **I2 Trazabilidad**           | 100 % de los requisitos con fuente → caso → prueba → pantalla   | 19/26 requisitos completos (✅), 7 parciales (🟡) y R-25 diferido (D-08). Detalle en `docs/ROADMAP.md §3`                                                                                        | 🟡             |
| **I3 Verificación numérica**  | 100 % de los CR aplicables dentro de tolerancia                 | CR-01, CR-02, CR-03, CR-05 y CR-06: 5/5 completos. CR-04: importación y conteo; carga y reporte esperan P-15. CR-07: fase F2                                                                     | 🟡 (por datos) |
| **I4 Calidad automática**     | Pruebas en verde; fórmulas con prueba externa; cobertura ≥ 85 % | 217 pruebas + 6 de rendimiento en verde; núcleo con 95,4 % de líneas (73,9 % de ramas); 24 de 32 fórmulas en R3; CI en cada push                                                                 | ✅             |
| **I5 Rigor de fuentes**       | 0 reglas sin cita y 0 preguntas críticas abiertas               | Constantes sin ficha: 8 (CT-01 a CT-08), todas registradas, como parámetro editable o avisadas en el informe PDF. Preguntas críticas abiertas: 0 (P-15 es un dato pendiente; P-16 no es crítica) | 🟡             |
| **I6 Tarea de punta a punta** | Línea base: un ingeniero reproduce CR-04 sin ayuda              | No medido: necesita al ingeniero y los datos de CR-04 (protocolo abajo)                                                                                                                          | ⏳             |
| **I7 Paridad con referencia** | Informativo, ±2 % frente a JKSimBlast o I-Blast                 | Sin demo del programa de referencia                                                                                                                                                              | —              |

**Fórmulas que siguen por debajo de R3**, todas de la fase F2 o sin caso de referencia:

- FC-20 VOD(D): R1.
- FC-26 Kuz-Ram: R0, regresión hasta tener CR-07.
- FC-27 Swebrec: R1.
- FC-28 Holmberg–Persson: R1.
- FC-29 Lundborg: R1.
- FC-30 Sobrepresión: R0.
- FC-31 Precorte: R1.
- FC-32 Buffer: R1.

**Requisitos parciales:**

- R-01 y R-27: falta reproyectar entre CRS; hoy solo se avisa.
- R-03: la topografía solo entra por DXF.
- R-06: falta el caso real de CR-04.
- R-10 y R-11: faltan fichas reales de proveedor y la mecha de seguridad.
- R-22: falta el reporte de CR-04.

### Reportes por hito (plantilla `§8.2`)

```
Hito: G0 · Reglas: FC-21, FC-23 (R2 → R3) · CR: CR-05 amarres 1–4 (0 ms de diferencia; MIC 100/200/200/100 kg)
Indicadores: I1 5/6 · I4 CI y cobertura · Preguntas: P-01…P-13 respondidas · No verificado: comprensión 3

Hito: G1 · Reglas: RM-02, RM-04, RM-18, RM-21 (modelo) · CR: ida y vuelta JSON y migraciones con test
Preguntas: P-09 respondida · No verificado: probar el autoguardado a mano en un navegador

Hito: G2 · Reglas: trampas de 03 §5 · CR: CR-04 sintético (180 taladros, 0 avisos) y cada trampa con test
Preguntas: P-13 respondida · No verificado: CSV real de CR-04; formatos de la operación (IREDES a F4)

Hito: G3 · Reglas: FC-01…FC-09, CK-01…CK-06 (→ R3 donde hay CR) · CR: CR-01 1–7 y 10, CR-02 12, CR-03
Preguntas: P-03, P-05, P-06 respondidas · No verificado: —

Hito: G4 · Reglas: FC-10…FC-19, CK-07…CK-09, RM-01, RM-05, RM-08 · CR: CR-01 8–12, CR-02 1–14 + 3 variantes, CR-03
Preguntas: P-01, P-04, P-14, P-15 respondidas · No verificado: CR-04 (faltan las fichas de HA73/HA64)

Hito: G5 · Reglas: FC-22 (→ R3), CK-10, DF-08, DF-19, DF-21 · CR: CR-05 amarres 1–5
Preguntas: P-02, P-11 respondidas; P-16 abierta (no crítica) · No verificado: —

Hito: G6 · Reglas: FC-24, FC-25 (→ R3), RM-21, DF-13, DF-14 · CR: CR-06 (9,4462 y 4,9375 mm/s, ±1 %)
Preguntas: P-07, P-10, P-12 respondidas · No verificado: ajuste de K y β con registros reales (F4)

Hito: G7 · Reglas: — · CR: comparación de escenarios y 60 pasos de deshacer con test
No verificado: reporte de CR-04

Hito: G8 · Reglas: — · CR: todos los avisos del núcleo con traducción (test)
No verificado: revisión de la terminología inglesa por el ingeniero
```

### Protocolo de la tarea de punta a punta (I6)

Un ingeniero que no participó en el desarrollo reproduce CR-04 sin ayuda. Se registran el éxito (sí/no), los bloqueos, los errores y el tiempo. La primera medición es la **línea base**, sin meta. El flujo es el de la guía, `§4`:

| #   | Paso                                                                                                       | Dónde en Cronos                                         | Tiempo | Bloqueo / error |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------ | --------------- |
| 1   | Crear el proyecto y declarar el CRS (EPSG)                                                                 | Archivo → Proyecto nuevo; Ajustes del proyecto          |        |                 |
| 2   | Importar los 180 taladros (y el polígono)                                                                  | Importar → Taladros desde CSV (vista previa en el mapa) |        |                 |
| 3   | Definir la cara libre                                                                                      | Herramienta C sobre el perímetro                        |        |                 |
| 4   | Ajustar la malla y los grupos (A, B, C, BF)                                                                | Diseño → Grupos (o «grupo por prefijo» al importar)     |        |                 |
| 5   | Cargar por tramos con productos del catálogo (producción, fila A con dos decks, buffer con cámara de aire) | Carguío → regla por grupo; editor de columna            |        |                 |
| 6   | Amarre y retardos (electrónicos)                                                                           | Tiempos → Electrónicos                                  |        |                 |
| 7   | Simular y revisar isotiempos                                                                               | Vista → secuencia e isócronas                           |        |                 |
| 8   | MIC y PPV en los puntos de monitoreo                                                                       | Vibración                                               |        |                 |
| 9   | Guardar escenario, duplicar y variar retardos                                                              | Escenarios                                              |        |                 |
| 10  | Comparar                                                                                                   | Escenarios → Comparar                                   |        |                 |
| 11  | Generar el reporte                                                                                         | Exportar → Informe PDF                                  |        |                 |

**Requisitos previos:** el CSV real de CR-04 y las fichas de HA73 y HA64 del proveedor (P-15), registradas con su densidad en taladro.

## Trazabilidad de requisitos de la Fase 1 (indicador I2)

Cadena: fuente → caso → prueba → pantalla. Estados: ✅ hecho y verificado con CR · 🟡 parcial o sin CR · ❌ falta.

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

## Fase 2

```
Hito: A0 · Reglas: FC-26…FC-32 completadas; FC-33, FC-34, FC-35 nuevas · CR: —
Preguntas: P-17…P-22 abiertas (no críticas) · No verificado: —

Hito: A1 · Reglas: FC-31, FC-32 (R1 → R3) · CR: CR-01 precorte (f 0,0664; 1,80"; f 0,0628; Pb 46,6 MPa;
E 1,127 m) y buffer (5,92; 6,9; 3,42 m); X-PRE (2,229 m; 42,2 mm; 1,54 kg/m; 0,691 kg/m²; 100 MPa), todo ≤ 1 %
Indicadores: I3 CR-01 completo salvo γ · I4 227 + 6 pruebas en verde · Preguntas: P-18 (γ de CR-01), P-22
γ de CR-01: el ingeniero confirma 1,514 kg/m² (P-18); falta corregir `04`. Interfaz revisada en el navegador sin interfaz
(buffer sugerido B 5,6 m y S 6,5 m en el ejemplo de producción; precorte con Pb, Ø sugerido y avisos)

Hito: A1b · Reglas: FC-22 (regla de P-16) · CR: CR-05 amarres 1, 2 y 5 (el 5 con 8 ms/m = 6,0 m; con 3 ms/m
B2 y B3 = 3,5 m, S-06); isócrona detonada a 3,0 m frente a 3,47 m al taladro
Indicadores: I4 229 + 6 pruebas en verde · No verificado: —

Hito: A2 · Reglas: FC-28 (R1 → R3), FC-33 (R1, implementada) · CR: ejemplo de R1 F25 (36,3; 183,9; 6,89; 2,60 mm/s
frente a 36; 184; 6,9; 2,6); grilla contra forma cerrada a 5, 10 y 20 m (±1 %); γ de CR-01 = 1,514 kg/m² (P-18)
Indicadores: I4 234 + 6 pruebas en verde · No verificado: FC-33 no tiene caso de referencia

Hito: A3 · Reglas: FC-26 (R0 → R2, regresión), CT-08 a parámetro · CR: CR-02 #15 (X50 25,5 cm; n 1,04; Xc 36,4 cm;
X80 57,5 cm; pasantes 23/49/75/94 % ± 1 punto) y X-D1 (X50 29,5 cm), todo ≤ 1 %
Indicadores: I4 235 + 6 pruebas en verde · No verificado: CR-07 (no hay ejemplo publicado, S-04)

Hito: A4 · Reglas: FC-34 (R1 → R3), FC-29 y FC-30 con fuente (R1) · CR: valores frontera de R1 F12; CR-02 fila 13
(taco inverso 7,30 m) · Supuestos: S-07, S-08
Indicadores: I4 237 + 6 pruebas en verde · No verificado: Lundborg y sobrepresión no tienen caso de referencia

Hito: A5 · Reglas: FC-36 (R1 → R3), FC-37 (R0), FC-35 (→ R3), FC-38 nueva (R3), FC-20 (R1 → R3), RM-20 (R0 → R1) · CR:
Zhang 2021 (57,6; 16,5; 19,5; 16,7; 10,6 m/s), P-21 (14,1 m/s; 22,7 m), CR-02 #16/#17 (321,40; 144; 0,1836 US$/t),
R1 F19 (doble cebado), R2 F02 (4029,6; 4548,1 m/s)
Indicadores: I4 245 + 6 pruebas en verde · No verificado: k por fila (calibración de sitio, S-01)
```
