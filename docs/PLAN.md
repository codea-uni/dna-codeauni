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

| R    | Requisito                                  | Hito | Estado                                                              | Código actual                          | CR        | Pantalla          |
| ---- | ------------------------------------------ | ---- | ------------------------------------------------------------------- | -------------------------------------- | --------- | ----------------- |
| R-01 | Importar polígonos (CSV, DXF, GeoJSON)     | G2   | 🟡 solo DXF                                                         | `core/src/io/dxf.ts`                   | —         | `DxfImportDialog` |
| R-02 | Importar taladros con detección de trampas | G2   | 🟡 separador y miles con coma sí; codificación, N/E y duplicados no | `core/src/io/csv.ts`                   | CR-04     | `CsvImportDialog` |
| R-03 | Importar topografía                        | G2   | 🟡 DXF 3DFACE                                                       | `core/src/io/dxf.ts`                   | —         | `DxfImportDialog` |
| R-04 | Cara libre y burden desde ella             | G3   | 🟡 bordes de perímetro, no línea libre                              | `engine/src/tools/FreeFaceTool.ts`     | CR-01     | `PatternPanel`    |
| R-05 | Mallas cuadrada, tres bolillos, triangular | G3   | 🟡 sin opción equilátera explícita                                  | `core/src/patterns/pattern.ts`         | CR-01     | `PatternPanel`    |
| R-06 | Malla en polígono cualquiera               | G3   | 🟡 hecho, sin CR                                                    | `fitPatternToPolygon`                  | CR-04     | `PatternPanel`    |
| R-07 | Grupos (precorte, buffer, producción)      | G3   | ❌                                                                  | —                                      | CR-04     | —                 |
| R-08 | Taladros inclinados, sobreperforación      | G3   | 🟡 fórmula distinta (ver `preguntas.md` P-05)                       | `core/src/geometry/hole.ts`            | CR-03     | `PropertiesPanel` |
| R-09 | Burden efectivo según secuencia            | G5   | ❌                                                                  | —                                      | CR-05     | —                 |
| R-10 | Catálogo base e importación                | G4   | 🟡 librería sin fuente ni versión; sin importación                  | `core/src/model/library.ts`            | —         | `LibraryPanel`    |
| R-11 | Catálogo de accesorios                     | G4   | 🟡 sin fuente, longitud ni velocidad de mecha                       | `core/src/model/types.ts`              | —         | `LibraryPanel`    |
| R-12 | Carga por decks con taco de catálogo       | G4   | 🟡 ofrece agua (RM-01)                                              | `core/src/charging/charge.ts`          | CR-01..03 | `DeckEditor`      |
| R-13 | Cadena de iniciación posicionada           | G4   | 🟡 sin editor de varios boosters ni aviso                           | `InHoleInitiator`                      | —         | `DeckEditor`      |
| R-14 | Kg, FC, tonelaje, metros, área             | G4   | 🟡 sin factor de energía ni agregados por grupo                     | `core/src/charging/chargeAnalysis.ts`  | CR-01..03 | `ResultsPanel`    |
| R-15 | Advertencia de confinamiento               | G4   | ❌ (solo taco < 0,7·B)                                              | `core/src/diagnostics/designChecks.ts` | CR-02     | `ResultsPanel`    |
| R-16 | Amarre y retardos por separado             | G5   | 🟡                                                                  | `core/src/timing/`                     | CR-05     | `TimingPanel`     |
| R-17 | Tiempo por taladro y reproductor           | G5   | 🟡 CR-05 amarres 1–4; falta el 5 (burden efectivo)                  | `core/src/timing/timing.ts`            | CR-05     | `ViewPanel`       |
| R-18 | Taladro de inicio y amarre generado        | G5   | 🟡 fila y V; falta escalón y ciclos                                 | `core/src/timing/tieUp.ts`             | CR-05     | `TimingPanel`     |
| R-19 | Carga máxima por retardo                   | G6   | 🟡 CR-05 amarres 1–4; ventana aún no persistida                     | `timing.ts`, `vibration.ts`            | CR-05     | `ResultsPanel`    |
| R-20 | PPV con K y β configurables                | G6   | 🟡 K/β global, no por punto                                         | `core/src/vibration/vibration.ts`      | CR-06     | `VibrationPanel`  |
| R-21 | Puntos de monitoreo con límites            | G6   | 🟡 sin límites                                                      | `MonitoringPoint`                      | CR-06     | `VibrationPanel`  |
| R-22 | Reporte PDF                                | G7   | 🟡 sin sección de supuestos                                         | `workers/src/report/pdfReport.ts`      | CR-04     | menú              |
| R-23 | Escenarios comparables                     | G7   | ❌                                                                  | —                                      | —         | —                 |
| R-24 | Autoguardado y deshacer/rehacer            | G7   | 🟡 undo sí; autoguardado no                                         | `core/src/document/DocumentStore.ts`   | —         | —                 |
| R-25 | Usuarios con rol                           | —    | ⏸ diferido (D-08)                                                   | —                                      | —         | —                 |
| R-26 | Español e inglés                           | G8   | ❌                                                                  | —                                      | —         | —                 |
| R-27 | SI y UTM consistentes                      | G1   | 🟡 SI sí; CRS opcional                                              | `core/src/model/types.ts`              | —         | —                 |

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

- [ ] Migración de esquema v2 → v3, con test, que agrega:
  - `HoleGroup { id, name, kind: presplit|buffer|production|other, color, defaults }` y `Hole.groupId`;
  - `Hole.water: dry|static|dynamic` (opcional; filtra productos, RM-02);
  - `MonitoringPoint` con `ppvLimit?`, `k?` y `beta?` (sobrescriben los del sitio);
  - tabla de límites de PPV `{ from, to, ppvMax, source }` (fuente obligatoria);
  - `calcParams` persistidos por voladura: ventana MIC, γ, K/β del sitio, tiempo mínimo de alivio Δ y umbrales de los chequeos;
  - en `RockMass`: `tensileStrength`, `vp`, `rqd`;
  - en `Explosive`: `source` (URL o cita), `version`, `densityMin/Max`, `waterResistance: none|limited|high`, `gassing { initialDensity, finalDensity }`, `needsBooster`, `criticalDiameter` (renombra `minDiameter`);
  - en `StemmingMaterial`: `kind`, `angularity`, `gradingMm`.
- [ ] H-101: CRS (EPSG) obligatorio antes de importar.
- [ ] Pantalla de ajustes del proyecto: CRS, unidades de visualización (`displayUnits` ya está en el modelo) e idioma.
- [ ] H-104: conmutador m/ft y mm/in que no altera los datos.
- [ ] H-102: autoguardado en IndexedDB con las últimas N versiones recuperables. Hoy cerrar el navegador pierde el trabajo.
- [x] Renombrar `core/src/scenarios` a `examples`, para reservar "escenario" a las variantes de diseño (G7).
- **Salida:** ida y vuelta JSON sin pérdidas con el esquema v3; migración v2 → v3 testeada; sin unidades mezcladas.

### G2: importación (E2; R-01 a R-03)

- [ ] H-201: trampas de `03 §5`:
  - codificación (`TextDecoder` UTF-8 `fatal`, con respaldo windows-1252);
  - archivo sin encabezado (primera fila numérica);
  - separador editable;
  - IDs duplicados (error con la lista);
  - Norte/Este intercambiados (aviso y botón para intercambiar);
  - Z vacía o cero;
  - atípicos (aviso);
  - columna de grupo.
- [ ] Vista previa en el mapa: la importación entra como un solo comando y el diálogo ofrece «Aceptar / Deshacer».
- [ ] H-202: GeoJSON de entrada y salida (polígonos, líneas, puntos) con `JSON.parse` y zod, sin dependencias nuevas; polígonos por CSV.
- [ ] Fixture sintético de CR-04: 180 filas sin encabezado (A 32, B 32, C 32, BF 84) con las trampas de `03 §5`.
- **Salida:** CR-04 sintético cae en su posición; cada trampa se detecta o se rechaza con un mensaje claro.

### G3: diseño de malla (E3; R-04 a R-08)

- [ ] H-301: cara libre dibujada como polilínea. `Blast.freeFaces` ya existe; hoy solo se marcan bordes del perímetro. Una sola cara libre → advertencia (RM-06). Si generar malla sin cara libre se bloquea o no, se decide en P-03.
- [ ] H-302: opción «triangular equilátera» (S = 2B/√3); la no equilátera ya se logra con tresbolillo y S ≠ 1,1547·B.
- [ ] H-303: grupos de taladros (creación, asignación con lazo o polígono, carga y retardo por grupo, color).
- [ ] H-305: nuevo `core/src/design/burden.ts` con:
  - Ash (Kb), Konya–Walter (Kd, Ks tomados de la fuente) y Andersen;
  - S sugerido, (H + 7B)/8 o 1,4·B;
  - rigidez H/B con el semáforo de Konya;
  - T = 0,7·B y J = 0,3·B como **parámetros**;
  - marca de burden fuera de ±10 %.
- [ ] H-304: longitud de taladro inclinado según la resolución de P-05; CR-03.
- [ ] Volumen nominal B·S·H (/cos α) junto al cubicado por Voronoi (P-06).
- [ ] Chequeos de `02 §6`: rigidez, J/B, H/Ø, taco 0,7–1,3·B y 15–25·Ø, burden ±10 %. Umbrales en `calcParams`, siempre advertencias.
- **Salida:** CR-01 pasos 1–7 y geometría de CR-03 dentro de tolerancia; conteo y área de CR-04.

### G4: explosivos y carga (E4; R-10 a R-15)

- [ ] H-401: catálogo base con `source` y `version` en cada producto; los valores sin ficha quedan marcados R0 en `reglas.md`. Importación y exportación del catálogo por CSV (columnas de `03 §3`).
- [ ] H-402:
  - quitar «agua» de los decks en superficie (RM-01; el tipo sigue en el modelo para subterráneo de carbón);
  - cierre de tramos en ambos sentidos (suma ≠ L → error; R3);
  - ρ media por tramo con esponjamiento (CR-02 paso 7);
  - diámetro efectivo de cartucho (+10 % en CR-03).
- [ ] H-403: editor de la cadena de iniciación con varios boosters y detonadores posicionados; aviso de tramo de granel sin booster (`needsBooster`).
- [ ] H-404: nuevo `core/src/charging/sdob.ts` (profundidad escalada de enterramiento, Chiappetta), con nombre y campo **distintos** de la distancia escalada de vibración (RM-08). Advertencia con rangos configurables. Con decks se toma la carga más cercana a la superficie (P-01).
- [ ] Presión de detonación y de taladro con γ configurable; VOD(D) con diámetro crítico (advertencia).
- [ ] H-405:
  - factor de energía;
  - m³ por metro perforado;
  - agregados por taladro, fila, grupo y voladura;
  - nombres de indicadores según D-10.
- [ ] Revisar la severidad de los chequeos existentes: por debajo de R3 no hay errores (P-04).
- **Salida:** CR-01 pasos 8–12, CR-02 pasos 1–14 y sus tres variantes con decks, y CR-03 dentro de tolerancia. CR-04 calculado a mano (valores escritos por el desarrollador y revisados por el ingeniero).

### G5: amarre, tiempos y simulación (E5; R-09, R-16 a R-18)

- [ ] H-504: plantilla en escalón (echelon); herramienta «conectar filas»; detección de ciclos (error) y de taladros sin conectar.
- [ ] H-502: tiempos relativos al primero; CR-05, amarres 1–3, al milisegundo (tolerancia 1e-9 s).
- [ ] H-503: nuevo `core/src/timing/effectiveBurden.ts` (en worker). Es la distancia a la superficie libre más cercana al detonar: caras libres más los taladros ya detonados como puntos, con Δ configurable. Avisos de B_ef > 2·B y de orden invertido. CR-05, amarres 1 y 5.
- [ ] H-505: tabla configurable de ms/m entre filas y entre taladros, con aviso fuera de rango.
- [ ] Mostrar el burden efectivo en la planta (color por taladro).
- **Salida:** CR-05, amarres 1–5, reproducido.

### G6: carga por retardo y PPV (E6; R-19 a R-21)

- [ ] H-601: MIC (ventana corregida en el Tramo 0) con la ventana en `calcParams`; gráfico de carga por ventana (ya existe).
- [ ] H-602:
  - PPV por punto con K/β propios;
  - distancia al taladro más cercano del grupo de la ventana (por defecto) o al centroide;
  - reportar el PPV máximo y la ventana que lo causa;
  - tabla de límites con fuente y marca de excedencia.
- [ ] H-603: MIC admisible para un PPV dado, invirtiendo la ley.
- **Salida:** CR-06 (9,4462 y 4,9375 mm/s) con ±1 %; CR-05 para el MIC.

### G7: reporte y escenarios (E7; R-22 a R-24)

- [ ] H-701: escenario = voladura variante (`variantOf`). Comando para duplicar y vista de comparación lado a lado: tiempos, MIC, PPV, FC.
- [ ] H-702: el PDF agrega «Modelos, parámetros y supuestos», los chequeos y el estado de las reglas usadas; reproduce CR-04.
- [ ] Copiar tablas como TSV; exportar el plano a PNG.
- [ ] H-703: comprobar ≥ 50 pasos de undo en malla, carga y amarre.
- **Salida:** dos escenarios con distintos retardos comparados; el reporte coincide con CR-04.

### G8: idiomas (E8; R-26)

- [ ] H-802: diccionario `en.ts` completo. El tipado impide claves faltantes.
- Usuarios y roles (H-801, R-25) pasan a la fase con backend (D-08).
- **Salida:** toda la interfaz cambia de idioma sin textos sin traducir.

### G9: cierre de la Fase 1

- Indicadores I1–I5 en verde en todos los hitos.
- I6: un ingeniero reproduce CR-04 de punta a punta sin ayuda (línea base).
- I7 si hay demo de JKSimBlast o I-Blast.
- Luego **Evaluación 1**: el ingeniero usa el producto; se resuelven los hallazgos críticos.

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
