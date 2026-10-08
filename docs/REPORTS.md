# Reportes de hito

Un bloque por hito con la plantilla de la guía (`docs/theory/01 §8.2`). Al cerrar una fase se agregan sus indicadores (I1–I7, guía `§10`).

## Fase 1: cierre (G9), medido el 2026-09-28

Semáforo **amarillo**: el código de G0–G8 está completo y verificado; faltan las mediciones que hacen personas (I1, I6) y la carga de CR-04, que queda pendiente (S-03: malla sintética y ANFO Pesado Famesa como sustitutos).

### Hitos

| Hito                    | Estado    | Casos de referencia                                     | Pendiente                                        |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------------------------ |
| G0 Comprensión y base   | ✅ código | —                                                       | Respuesta 3 de`docs/QUESTIONS.md` (CR-01 a mano) |
| G1 Modelo y unidades    | ✅        | Migraciones v1→v5 con test                              | —                                                |
| G2 Importación          | ✅        | CR-04 sintético (180 taladros, trampas de`03 §5`)       | Reproyección entre CRS                           |
| G3 Malla                | ✅        | CR-01 pasos 1–7 y 10, CR-02 fila 12, CR-03 (B, L, V)    | —                                                |
| G4 Explosivos y carga   | ✅        | CR-01 pasos 8–12, CR-02 filas 1–14 y 3 variantes, CR-03 | CR-04 a mano: fichas de HA73/HA64 (P-15)         |
| G5 Amarre y tiempos     | ✅        | CR-05 amarres 1–5 (tiempos, MIC, burden efectivo)       | Confirmar P-16                                   |
| G6 MIC y PPV            | ✅        | CR-06 (ejemplo a mano) e inversa                        | Registros reales de CR-06 (F4)                   |
| G7 Reporte y escenarios | ✅        | Comparación de escenarios; 60 pasos de deshacer         | Reporte de CR-04 (P-15)                          |
| G8 Idiomas              | ✅        | Todos los avisos del núcleo traducidos (test)           | —                                                |

### Indicadores (guía `§10`)

| Indicador                     | Meta                                                            | Medido                                                                                                                                                                                           | Estado         |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| **I1 Comprensión**            | 6 en G0 y 2 por hito, 100 % aprobadas                           | G0: 5/6 aprobadas (falta la 3). Por hito: 16 preguntas preparadas en`docs/QUESTIONS.md`, sin responder                                                                                           | 🟡             |
| **I2 Trazabilidad**           | 100 % de los requisitos con fuente → caso → prueba → pantalla   | 19/26 requisitos completos (✅), 7 parciales (🟡) y R-25 diferido (D-08). Detalle en`docs/ROADMAP.md §3`                                                                                         | 🟡             |
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

**Requisitos previos:** la malla sintética de CR-04 (`io/fixtures/cr04-sintetico.csv`) y el ANFO Pesado de Famesa como sustituto de HA73/HA64 (S-03). El ingeniero puede hacer la prueba sin esperar datos.

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

Hito: A6 · Cierre de F2 · Demostración con 3 pasos nuevos; ejemplos con RT, Vp y costo de perforación; revisión visual
en el navegador sin interfaz (semáforo, flechas, daño, fragmentación) sin errores de consola · Supuesto S-09 (B/Ø ≥ 7)

Hito: A7 (adelantado, D-17) · Reglas: FC-39 (R1), FC-40 (R0), FC-41 (R1), FC-42 (R1), FC-43 (R0), FC-44 (R1 + R0),
FC-45 (R1); RM-20 cita Yang & Kavetsky · Supuestos: S-19…S-24 · CR: — (sin caso publicado de forma de pila);
invariantes: volumen in situ 5600 m³ exacto, pila = in situ × 1,5 (error 3e-8), pendiente ≤ reposo, cono de reposo
±15 %, la secuencia invierte el sentido lateral, calibración recupera k = 14 y n = 1,2
Indicadores: I4 481 + 8 pruebas en verde (19 de la pila en el núcleo; 3 en workers: API y física); pila en < 1 s con
≈ 500 taladros; esquema v13 con migración probada
Revisión en el navegador sin interfaz: pila en planta y 3D (vóxeles por tamaño), sección con throw 14,7 m y drop
3,2 m, dominio transportado, animación rápida y física (1890 bloques en ≈ 8 s con render por software), sin errores
No verificado: forma de la pila contra un levantamiento real (F4 C3–C4); Rapier no es determinista entre equipos
(solo visual)

Seguimiento A7 (2026-09-30) · Caso «Banco sobre topografía (completo)», dos escalones: docs/MUCKPILE-REPORT.md
Correcciones: perímetro sin taladros ya no se vuela (in situ 89 214 → 70 750 m³, test nuevo); fuera del levantamiento
se prolonga su borde (throw 159,8 → 183,8 m, el material cae a 3355 y no a una pared falsa en 3370)
Abierta: P-23 (taladros con B/Ø < 7 quedan quietos) · Hallazgo: el escenario «En escalón» deja 79/107 taladros sin tiempo

Hito: A7b (cara libre configurable) · Reglas: FC-46 nueva (R1, geometría) · Supuestos: S-25 (energía solo en la roca),
S-26 (medición del talud) · Esquema v14 · Pruebas: cuña ½·H²·cot β·L a 75° y 60° (±1 %), cara propia de 6 m, burden
creciente hacia el pie, energía en el aire = 0, medición de un talud sintético de 65° (±2°); 490 + 8 en verde
Navegador: medición 69,8° y 15,0 m en el ejemplo (caras de 70° y 15 m); 3D sin caras y con la topografía recortada
```

**Comprensión A7** (paso 4 del ciclo):

1. _¿Por qué la dirección de salida de cada bloque depende de la secuencia y no solo de la cara libre dibujada?_ Porque
   un taladro que ya detonó deja un frente abierto: el burden efectivo (FC-22) mide la distancia a la superficie libre
   **en el instante del disparo**, y `toward` apunta a ella. Con salida desde el Oeste, cada taladro se alivia en su
   vecino del Oeste y la masa se abre hacia allí; al invertir el amarre se invierte el sentido lateral (test).
2. _¿Por qué la pila conserva exactamente el volumen aunque se relaje?_ Porque cada bloque deposita V·esponjamiento con
   pesos bilineales que suman 1 y la avalancha solo traslada material suelto entre celdas iguales (lo que sale de una
   entra en la otra), sin tocar el terreno fijo; el error medido es de redondeo (≈ 3·10⁻⁸).

### Cierre de la Fase 2 (2026-09-29)

Criterio de la guía: «casos de referencia de cada modelo reproducidos». Semáforo **verde en código**, con tres modelos
que siguen sin caso propio (se muestran como estimaciones).

| Modelo                  | Regla        | Estado | Caso reproducido                               |
| ----------------------- | ------------ | ------ | ---------------------------------------------- |
| Precorte y buffer       | FC-31, FC-32 | R3     | CR-01,`X-PRE`                                  |
| Burden efectivo (P-16)  | FC-22        | R3     | CR-05 (amarre 5 con 8 ms/m, S-06)              |
| Holmberg–Persson        | FC-28        | R3     | `R1` F25                                       |
| Daño por VPPc           | FC-33        | R1     | — (sin caso publicado)                         |
| Kuz-Ram                 | FC-26        | R2     | CR-02#15 y `X-D1` (regresión; CR-07 no existe) |
| Swebrec                 | FC-27        | R1     | — (identidades de la curva)                    |
| Semáforo de SDOB y taco | FC-34        | R3     | `R1` F12, CR-02 fila 13                        |
| Lundborg y sobrepresión | FC-29, FC-30 | R1     | — (estimaciones con parámetros del sitio)      |
| Velocidad de burden     | FC-36        | R3     | Zhang et al. (2021)                            |
| Alcance balístico       | FC-37        | R0     | Ejemplo de P-21 (regresión; k de calibración)  |
| Costo                   | FC-35        | R3     | CR-02#16, #17                                  |
| Doble cebado            | FC-38        | R3     | `R1` F19                                       |
| VOD(D)                  | FC-20        | R3     | `R2` F02                                       |

Indicadores: I3 todos los modelos con caso disponible dentro de tolerancia · I4 245 + 6 pruebas en verde, esquema v10
con migraciones probadas · I5 supuestos S-01…S-09 documentados, 0 preguntas abiertas.

## Realidad virtual (V0–V3, D-19), 2026-10-05

```
Hito: V0–V3 · Reglas: ninguna fórmula ni constante minera nueva (los cálculos no cambian) · CR: —
Supuestos: S-30…S-32 (parámetros de interfaz) · No verificado: visores reales
```

- **Pruebas unitarias** (Vitest): ubicación Z→Y y su inversa, maqueta 1:1000, giro alrededor de la cabeza (`placement.test.ts`); dirección del vuelo según la cabeza, velocidad y giro por saltos (`locomotion.test.ts`); rayo contra terreno plano, inclinado y sin cruce (`rayGround.test.ts`); fila del panel bajo el rayo (`XrPanel.test.ts`); loop continuo en XR y vuelta al render a demanda (`RenderLoop.test.ts`); sala WebSocket (sin sesión 401, proyecto ajeno 404, versión 0 400, reenvío de poses, estado solo del presentador, estado para quien entra tarde; `rooms.test.ts`); el espectador sigue la secuencia (arranque, desvío de 0,05 s sin corrección y de 0,15 s con corrección, pausa y reinicio; `room.test.ts`).
- **Emulador** (IWER, el motor del Immersive Web Emulator de Meta, simulando un Quest 3 en Chromium sin interfaz) con «Demo · Mina sobre levantamiento DXF» (TIN de 89 873 triángulos, 141 taladros):
  - Entrar en VR: terreno, taladros, menú y rayo; teletransporte al taladro 10 (pies sobre el terreno); giro de 30°; vuelo hacia adelante.
  - Apuntar el taladro 41: ficha «Carga 482,2 kg · Retardo 220 ms · Longitud 18,0 m · Diámetro 229 mm» y haz vertical.
  - Energía y vibración drapeadas en el terreno; secuencia con los 31 700 bloques de la pila en vuelo.
  - Maqueta a 1:1000 (y 1:667 con «más grande»); taladro 71 elegido sobre la maqueta.
  - AR: fondo transparente (`alpha-blend`) en modo maqueta; sin hit-test en el emulador, queda frente al usuario.
  - Salir: la escena vuelve a su lugar, las etiquetas a píxeles y la cámara 3D a su órbita.
  - Dos visores (Luis presenta, Rosa se une) contra el servidor real: avatares en ambos lados, el espectador ve «Sigues a Luis Diseñador», recibe la energía, el taladro 61 y la secuencia.
- **Errores encontrados y corregidos al probar:** el panel no se redibujaba al cambiar de cantidad de filas (la textura de GPU tiene tamaño fijo); la ficha se veía espejada al girar la mano (ahora los paneles miran a la cabeza); el espectador no calculaba la pila si la capa ya estaba prendida (cortaba la secuencia en el último disparo); un rechazo de `hit-test` quedaba sin manejar.
- **Rendimiento de escritorio** (5000 taladros, Chromium con SwiftShader): igual que `main`, con 0,4–0,7 ms de CPU por cuadro en planta y 3D; los fps absolutos los limita el render por software y deben medirse con GPU. `Scene3D.perf` sigue en verde. En XR el emulador da 7–10 cuadros por segundo con SwiftShader; la medición que vale es en el visor.
- **Pendiente:** Quest 3 y Quest 2 reales (72 fps con OVR Metrics, bloques de la pila en el Quest 2, ergonomía del menú) y dos visores en producción (nginx con `Upgrade`).

### V4: una entrada y tres escenarios (2026-10-06)

- **Pruebas unitarias:** arrastre de la maqueta (el punto tomado sigue a la mano y gira alrededor de ella; `placement.test.ts`), elección de la mesa (etiqueta primero, si no la altura y la cercanía; piso y estantes descartados; `planes.test.ts`), sala por proyecto con `claim`/`release` y poses con escala (`rooms.test.ts`).
- **Emulador, dos visores contra el servidor real:** un solo botón «Entrar en VR» en ambos; se entra a la maqueta sobre la mesa con passthrough. Luis pide presentar («Presentando · 1 conectados») y Rosa lo sigue. Luis toma la maqueta con el agarre izquierdo y la corre 30 cm. Rosa pasa a «Dentro de la voladura» (fondo opaco) y, mirando hacia Luis, lo ve como un gigante asomado sobre el tajo (escala 1000); Luis ve a Rosa chica sobre la maqueta (tamaño mínimo). «Maqueta aislada» deja el fondo opaco.
- **Errores encontrados y corregidos:** el cuadro XR de three es null en los primeros cuadros (rompía la búsqueda de mesa); en una sesión AR three limpia la pantalla en transparente aunque haya color de fondo (dentro de la voladura se veía la habitación), resuelto con una esfera de fondo.
- **No verificado:** la detección de mesas (el emulador no tiene planos sin su módulo de entorno sintético) y todo lo que depende del Quest real.

### V5: presencia desde la web y menú compacto (2026-10-06)

- **Prueba unitaria:** celda bajo el rayo en filas de varios botones (`XrPanel.test.ts`).
- **Emulador contra el servidor real (Luis en el visor, Rosa en la web, vista 3D):** el menú tiene 6 filas y está cerrado al entrar y al mirar a la derecha; se abre al mirar la mano izquierda. Rosa ve a Luis como gigante mientras él mira la maqueta (escala 1000, 628 m sobre el tajo) y como figura dentro del tajo cuando pasa a «Adentro» (tamaño mínimo por la distancia de la cámara). Luis ve la cámara de Rosa sobre su maqueta.
- **No verificado:** la ergonomía del menú en la mano con un Quest real.

### V6: VR interactivo (2026-10-08)

- **Pruebas unitarias:**
  - fila bajo el rayo con filas de distinto alto, y valor de un slider dentro de su celda (`XrPanel.test.ts`);
  - ficha del taladro con taco 4 m + ANFO 12,5 m en 16,5 m: la barra va de boca a fondo y suma 1, y el explosivo muestra 314,2 kg (25,133 kg/m de `charge.test.ts`) (`holeCard.test.ts`);
  - WAV PCM de 16 bits y corte de líneas (`voice.test.ts`);
  - el audio viaja como `inlineData` y no se reenvía en el turno siguiente (`agent.test.ts`).
- **Emulador** (IWER, Quest 3, Chromium sin interfaz con micrófono falso) contra el servidor real con «Demo · Mina sobre levantamiento DXF»:
  - Pestañas Vista, Capas y Secuencia.
  - El slider de escala arrastrado lleva la maqueta de 1:1000 a 1:8073 de forma continua y suelta sin clic.
  - El interruptor de energía la prende.
  - La línea de tiempo recorre la secuencia hasta t = 4570 ms.
  - Ficha del taladro 1: barra con taco, ANFO y ANFO pesado; «ANFO · 9,0 m · 296,5 kg», «ANFO pesado 30/70 · 3,0 m · 135,9 kg», iniciador, carga 432,9 kg, retardo 119 ms y factor de carga 0,649 kg/m³.
  - Dos mineros frente al usuario dentro de la voladura.
  - **Voz** (orden grabada «Change the diameter of the pointed hole to 250 millimeters» con el taladro 4 apuntado), en la maqueta y dentro de la voladura:
    - panel «Activando el micrófono → Escuchando» con el vúmetro;
    - después «Pensando» y la respuesta «Understood: change the diameter of hole 4 to 250 mm…» con «✓ Taladros editados»;
    - el diámetro pasa de 229 a 250 mm, la ficha se actualiza (carga 492,4 kg) y deshacer queda en «IA: editar 1 taladros».
- **Errores encontrados y corregidos:**
  - los emoji no tienen fuente en Chromium sin interfaz: se cambiaron por símbolos Unicode;
  - el vúmetro daba cero porque el `AudioContext` creado fuera de un clic queda suspendido;
  - el micrófono tarda unos 2 s en abrirse la primera vez: se agregó el estado «Activando el micrófono».
- **No verificado:** todo lo que depende del Quest real (permiso del micrófono en la sesión inmersiva, `speechSynthesis`, háptica, fps con mineros en el Quest 2).
