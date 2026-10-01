# Hoja de ruta de Cronos

**Documento único de fases y estado.** Si abres un chat nuevo, basta con decir: **«Lee `docs/ROADMAP.md` y sigue con el hito marcado ▶»**. La guía del ingeniero (`docs/theory/`) manda sobre este plan.

## ▶ Dónde estamos (2026-09-29)

| Qué           | Valor                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| Fase          | **Evaluación 2** (F2 terminada en código; ver «Fase 2» en `docs/REPORTS.md`)     |
| Hito en curso | **▶ E2.1 Manual básico** (sección «Evaluación 2» más abajo)                      |
| Después       | E2.2 registro de comentarios → E2.3 sesión con ingenieros → F3 (S0)              |
| Fase 1        | Código completo; el cierre formal espera datos y aprobaciones (ver `REPORTS.md`) |

## Todas las fases

| Fase                          | Para qué (guía `01 §3`)                          | Hitos                                                                                                                        | Salida                                                 | Estado                   |
| ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------ |
| **F1** Diseño y simulación    | Diseñar, cargar, amarrar y reportar una voladura | G0 base · G1 modelo · G2 importación · G3 malla · G4 carga · G5 tiempos · G6 MIC y PPV · G7 reporte · G8 idiomas · G9 cierre | CR-01…CR-06 reproducidos; un ingeniero hace CR-04 solo | ✅ código · 🟡 cierre    |
| Evaluación 1                  | El ingeniero usa el producto                     | —                                                                                                                            | Hallazgos críticos resueltos                           | ⏳ espera datos de CR-04 |
| **F2** Análisis avanzado      | Predecir resultados                              | A0 · A1 · A1b · A2 · A3 · A4 · A5 · A6 · A7 (pila, adelantado D-17)                                                          | Caso de referencia de cada modelo reproducido          | ✅ código                |
| Evaluación 2                  | Ingenieros externos                              | **▶ E2.1** manual · E2.2 comentarios · E2.3 sesión                                                                           | Hallazgos críticos resueltos                           | ⏳ en curso              |
| **F3** Subterráneo            | Frentes y anillos                                | S0 fuentes · S1 modelo · S2 diseño de frentes · S3 carga y resultados · S4 anillos · S5 análisis · S6 cierre                 | Ronda completa dentro de sección; casos de referencia  | —                        |
| **F4** Datos de campo         | Calibrar con mediciones                          | C0 formatos · C1 perforado real · C2 sismógrafos · C3 nube y dron · C4 calibración · C5 cierre                               | Un diseño calibrado con datos reales                   | —                        |
| **F5** Distribución y backend | Dejarlo listo para terceros                      | D0 backend · D1 usuarios y roles · D2 comentarios y auditoría · D3 manual y paquete · D4 cierre                              | Lista de lanzamiento aprobada                          | —                        |

Fuera de alcance en todas las fases (guía `01 §3`): ejecución en campo con tabletas, integración con perforadoras o camiones fábrica, gemelo digital 4D y aprendizaje automático.

## Cómo trabajar

- **Un hito a la vez**, con el ciclo de abajo. Al cerrarlo: marcarlo ✅ aquí, mover el ▶, agregar su reporte en `docs/REPORTS.md` y actualizar `docs/RULES.md`.
- **Dudas de dominio (D-12):** buscar la fuente (web, `docs/theory/`); si no aparece, tomar un supuesto como parámetro editable y anotarlo en `docs/QUESTIONS.md` §2. No detenerse a preguntar.
- **Ramas:** `<tipo>/<tema>` en inglés y kebab-case (`feat/auth-login`, `fix/mesh-replace`, `docs/backend-decision`), creadas desde `main` y cortas. Antes de unir: `git rebase main` y pruebas en verde; se une con `git merge --ff-only` (historial lineal) y se borra la rama.
- **Commits:** unos 3 por hito (núcleo, web, docs); solo el asunto en español (Conventional Commits) y el trailer `Co-Authored-By`. Antes: `pnpm typecheck && pnpm lint && pnpm test` en verde, revisando la salida. `git push` solo si el usuario lo pide.
- **Documentos:** `docs/RULES.md` (estado R0–R4 de cada fórmula), `docs/QUESTIONS.md` (decisiones del ingeniero, supuestos, comprensión), `docs/DECISIONS.md`, `docs/REPORTS.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`.

## Fase 1 (G0–G9): resumen

Detalle y trazabilidad R-01…R-27 en `docs/REPORTS.md`.

| Hito                    | Qué quedó                                                                                      | Pendiente                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| G0 Base                 | CI, cobertura, bugs de MIC y CSV corregidos, nombre Cronos, i18n                               | Comprensión 3 (CR-01 a mano), la responde el desarrollador |
| G1 Modelo y unidades    | Esquema con grupos, agua, límites, `calcParams`; EPSG obligatorio; unidades m/ft; autoguardado | Reglas y escala del mapa en ft                             |
| G2 Importación          | Trampas de CSV de `03 §5`, GeoJSON, vista previa con deshacer, fixture sintético de CR-04      | Reproyección entre CRS                                     |
| G3 Malla                | Cara libre, equilátera, grupos, modelos de burden (CR-01, CR-02, CR-03), chequeos de `02 §6`   | —                                                          |
| G4 Carga                | Catálogo con fuente, decks, iniciación, SDOB, PD/PB, factores (CR-01…CR-03)                    | Carga de CR-04 pendiente (S-03)                            |
| G5 Tiempos              | Escalón, ciclos, burden efectivo, guía de ms/m (CR-05)                                         | Regla de alivio por isócronas → A1b                        |
| G6 MIC y PPV            | Ventana ampliada, K/β por punto, límites, carga admisible (CR-06)                              | Ajuste de K/β con registros reales → F4                    |
| G7 Reporte y escenarios | Escenarios comparables, PDF con supuestos, PNG y TSV                                           | Reporte de CR-04                                           |
| G8 Idiomas              | Español e inglés completos                                                                     | —                                                          |
| G9 Cierre               | Indicadores, ejemplos actualizados, modo demostración                                          | I1 e I6 con el ingeniero                                   |

## Fase 2: análisis avanzado (A0–A6, más A1b y A7)

Guía `01 §3` y `§19`: energía y daño, fragmentación, onda aérea, desplazamiento y proyección. **Salida: el caso de referencia de cada modelo reproducido.** Primero se especifica cada modelo con fuente y caso; lo que no tiene fuente numérica queda como aviso configurable (regla de dominio 3). F2 no tiene R-xx ni H-xxx propios: las tareas salen de `02 §5`, `R1` F12 y F23–F28, `04` (CR-01, CR-02 #15–#17) y `docs/RULES.md` (FC-26…FC-37).

**Migración v5→v6** (en A1, con test, igual que `fillCalcParams` en `core/src/io/projectFile.ts`): `calcParams.fragmentation`, `calcParams.damage`, `calcParams.sdobBands` y `RockMass.vppc`, a medida que cada hito los necesite.

### A0: especificación y preguntas ✅

- `docs/RULES.md`: FC-26…FC-32 completadas; nuevas FC-33 (daño H-P), FC-34 (bandas SDOB), FC-35 (costo).
- `docs/QUESTIONS.md`: P-17…P-22 con su valor por defecto. Ninguna bloquea A1 ni A2.

### A1: precorte y buffer (CR-01) ✅

- Núcleo `core/src/design/presplit.ts` (`R1` F26): f = (D_carga/D_pozo)², Pb = 110·f^n·ρ·VOD² (MPa, g/cc, km/s; n = 1,25 seco, 0,9 con agua), diámetro de carga imponiendo Pb = UCS·R, E ≤ D_pozo·(Pb + RT)/RT y factor de carga γ.
- Núcleo `core/src/design/buffer.ts` (`R1` A.2): B_buf, S_buf = 1,15·B_buf y DST.
- Tests: CR-01 precorte (f 0,0664 → 1,80"; con 1¾": f 0,0628, Pb 46,6 MPa, E 1,12–1,13 m; γ: el ingeniero confirma 1,514 kg/m², P-18, falta corregirlo en `04`); `X-PRE` (E 2,229 m, 1,54 kg/m, Pb 100 MPa); CR-01 buffer (5,9; 6,9; 3,4 m).
- Interfaz: el panel de grupos muestra el cálculo sugerido para grupos de precorte y buffer, con aviso si el diseño se sale; aviso en la revisión si el precorte no sale ≥ 100 ms antes que la producción. La roca muestra UCS, RT, E y A (hoy solo entran por archivo).
- **Salida:** FC-31 y FC-32 en R3. Hecho: `design/presplit.ts` (fórmulas, `presplitHole`, `presplitChecks` en la revisión con `calcParams.checks.presplitLead` = 100 ms, esquema v6), sugerencia en el panel de grupos y UCS, RT y E editables en Carguío. El γ de CR-01 del documento (1,53–1,54) no se reproduce; el ingeniero confirma que el valor comparable es 1,514 kg/m² (P-18); DST está en el núcleo pero no en el panel (necesita la quebradura Q_b).

### A1b: burden efectivo por isócronas (respuesta P-16) ✅

Corrección de G5 pedida por el ingeniero. Va antes que A2 porque toca un cálculo de F1 que ya está en R3.

- `core/src/timing/effectiveBurden.ts`: un taladro ya detonado alivia a **cualquier** taladro que dispare después (también los vecinos de fila) si (a) la distancia perpendicular a la isócrona de los taladros detonados es menor que la distancia a la cara original y (b) detonó al menos `reliefRate`·B antes (3 ms/m por defecto; típico 8–12). Reemplaza la aproximación «0,5·B más cerca de la cara», que queda documentada como la regla anterior.
- Aviso intermedio con B_ef ≥ 1,5·B (nuevo umbral en `calcParams.checks`, migración a v7) además del de ≥ 2·B.
- Tests: CR-05 amarres 1, 2 y 5 siguen dando lo mismo (B_ef = 6,0 m con el mismo retardo); caso nuevo con salida en V o escalón donde B2 se alivia con B1 (≈ 3,5 m o menos, P-16).
- Rendimiento: el cálculo corre en el worker; fixture de 5.000 taladros por debajo de 300 ms (`performance.perf.test.ts`).
- **Salida:** FC-22 con la regla de P-16. Hecho: alivio por cualquier taladro previo con la distancia al segmento del frente detonado; aviso `partialRelief` (≥ 1,5·B, esquema v7). CR-05 amarre 5 da 6,0 m con 8 ms/m y 3,5 m en B2 y B3 con 3 ms/m (S-06). El ejemplo «Cerca de infraestructura» pasó a chaflán de 6 m.

### A2: Holmberg–Persson y criterio de daño ✅

- Forma puntual de `R1` F25 (Δθ con la profundidad del geófono) junto al integrador de `energy/energy.ts`; mapa de daño PPV/VPPc por bandas ¼, 1, 4 y 8 (`R3` F14) en el worker.
- VPPc de la roca (P-17): dato del usuario (retroanálisis) o, si faltan, **VPPc = RT·Vp/E** calculada y rotulada como tal. Sin VPPc no hay mapa de daño. La roca gana Vp editable en Carguío.
- Validez (P-17): H-P solo con R ≲ 3·L_carga; más lejos, aviso de que manda la distancia escalada. K, α de H-P separados de los de la ley de PPV y rotulados «calibrar con mediciones cercanas».
- Test con el ejemplo de `R1` F25 (q = 75,75 kg/m, K = 982, α = 1,2068): 36 mm/s a 100 m; 184 a 50 m; 6,9 a 200 m; 2,6 a 300 m. Test de VPPc = RT·Vp/E con los datos de una roca de la fuente.
- Interfaz: conmutador PPV / daño en el panel de energía.
- **Salida:** FC-28 en R3; FC-33 en R1 (sin CR). Hecho: `holmbergPerssonPpv` (F25 ±1 %), la grilla coincide con la forma cerrada en campo cercano (±1 %), `criticalPpv` y `RockMass.vppc` (opcional, sin cambio de versión), contornos de daño con sus bandas en Energía, Vp y VPPc editables. Rendimiento sin cambios (la grilla es la misma).

### A3: Kuz-Ram y Swebrec regularizados ✅

- Tests con CR-02 #15 (RWS 80,67): X50 25,5 cm, n 1,04, Xc 36,4 cm (±1 %); X80 ≈ 57,5 cm; pasante 23/49/75/94 % en 10/25/50/100 cm; cruce `X-D1` (29,5 cm; 1,056; 41,7 cm).
- P-19: Xc al 63,2 %, X80 = X50·(ln 5/ln 2)^(1/n), A = 0,06·(…) (ya es así en el código); RWS del proveedor si la ficha lo trae, si no desde energías con 3,7 MJ/kg.
- CT-08 a parámetros (`calcParams.fragmentation`): desviación de perforación, respaldo, sobretamaño y finos (hoy se pierden en `analysisStore`); el piso n ≥ 0,3 pasa a aviso. Usar `RockMass.swebrecB` si está.
- **Salida:** FC-26 en R2 (regresión) hasta CR-07, visible en la interfaz y el PDF. Hecho: tests con CR-02 #15 (X50, n, Xc, X80, pasantes) y `X-D1`; f_m con 1,15 para la equilátera; `calcParams.drillDeviation` y `checks.uniformityRange` (esquema v8); `RockMass.swebrecB` se usa; sin el piso n ≥ 0,3. Sobretamaño y finos siguen como preferencia de pantalla (no se guardan).

### A4: proyección y onda aérea ✅

- Semáforo de proyección por SDOB con cortes en **0,62, 0,92, 1,44 y 1,84** (P-20) en `calcParams.sdobBands` y capa de color en planta; aviso con SD < 0,92 (`R1` F27).
- Aviso de eyección del taco con intervalo entre filas < 35 ms (`P5 p77`); taco sugerido por diseño inverso T = SD·W^(1/3) − Ø/200 (`R1` F06).
- Lundborg: se agrega el tamaño de fragmento T = 0,1·d^(2/3) (d en pulgadas, P-20). Sobrepresión con su fuente (USBM RI 8485, FC-30 en R1), k y β del sitio (β 1,2–1,5). Ambos siguen como estimaciones sin CR, rotulados así en la interfaz y el PDF. Traducir los textos que faltan (`VibrationPanel.tsx`, PDF).
- **Salida:** FC-34 en R3 con los valores frontera. Hecho: `sdobBand` y color «Semáforo de proyección (SDOB)» en la vista; avisos de SDOB con los cortes de F12 (S-08); taco sugerido para SD = 0,92 en el editor de columna (CR-02 fila 13: 7,30 m); nota de eyección del taco con < 35 ms (S-07); tamaño de fragmento de Lundborg; fuente de la sobrepresión en la interfaz. Esquema v9 (`sdobBands`, `minInterRowDelay`).

### A5: desplazamiento y verificaciones ✅

- **Velocidad de burden** (FC-36, Zhang, Chi & Yi 2021; P-21) por taladro con su burden efectivo: v_B = √[π·c_B·ρ_e·e_e·c_e/(2·ρ_r·tan θ)]·(d/B), c_B = 0,12 y θ = 45° como parámetros; aviso si la carga está desacoplada (fuera de validez). Tests: Malmberget 57,6 m/s; Tabla 2: 16,5; 19,5; 16,7; 10,6 m/s (±1 %).
- **Alcance** (FC-37): tiro parabólico del centroide con α = 90° − ángulo de cara y h = H/2 (ejemplo de P-21: 14,1 m/s → 22,7 m, solo regresión); filas posteriores con v·k^(n−1), k = 0,7 como parámetro de calibración (R0).
- Mapa vectorial en planta: dirección normal a la isócrona (`R1` F21) y largo = alcance; cálculo en el worker.
- Costo por taladro y por tonelada (CR-02 #16 = 321,40 US$/taladro, #17 = 144; `R1` F28 = 0,1836 US$/t) con precios como datos del catálogo.
- Doble cebado: dispersión entre detonadores < L_columna/VOD (`R1` F19), como aviso.
- Se aplazan: Monte Carlo de dispersión (DF-15) y JKMRC de finos (sin constantes públicas).
- **Salida:** FC-36 en R3; FC-37 en R0 hasta calibrar k con perfiles de pila reales (F4). Hecho: `analysis/displacement.ts` (en el análisis del worker), dirección desde `effectiveBurden.toward`, capa de flechas en la vista con c_B y k editables; costo de perforación y US$/t en Resultados (CR-02 #16, #17 y 0,1836 US$/t); aviso de doble cebado (F19); VOD(D) con los ejemplos de `R2` F02 (FC-20 en R3). Esquema v10.

### A6: cierre de F2 ✅

- Hecho: reporte y tabla de cierre en la sección «Fase 2» de `docs/REPORTS.md`; demostración tipo tutorial con capítulos, barra de progreso y navegación ← → (16 pasos, ≈ 2 min); módulos con tablas en ventanas flotantes; ejemplos con RT, Vp (VPPc calculada) y costo de perforación; revisión visual en el navegador sin interfaz. Luego **Evaluación 2**.

### A7: pila de material (adelantado, D-17) ✅

Pedido del usuario fuera del orden de hitos (E2.1 sigue en curso). Módulo en `core/src/muckpile/`, con su README (fórmulas, supuestos y limitaciones).

- **Nivel 1, modelo cinemático** (Yang & Kavetsky, FC-39):
  - bloques Voronoi a la cota de cada bloque;
  - salida al detonar hacia la superficie libre de ese instante (burden efectivo, FC-22);
  - velocidad intercambiable: Zhang FC-36 por defecto, ley de potencia FC-40 en R0 o Richards & Moore FC-45;
  - tiro parabólico contra la superficie actual;
  - depósito esponjado (FC-41: 1,5) y relajación al reposo (FC-42: 37°) conservando el volumen.
- **Salidas:** superficie de la pila, vectores por bloque y por taladro, throw, drop, esponjamiento lateral, altura máxima, volumen in situ frente al esponjado, perfil en cualquier sección y clases de tamaño.
- **Atributos:** tamaño de fragmento (Kuz-Ram por taladro repartido por cuantiles, FC-44) y dominios de material (`Blast.domains`, dilución).
- **Nivel 2, animación:**
  - modo rápido que interpola las trayectorias en `BlocksLayer`;
  - modo física con Rapier en `workers/src/physics/` (worker aparte, cargado al pedirlo);
  - reproductor sincronizado con la secuencia de 0,1× a 2×.
- **Interfaz:** pestaña **Pila**.
  - Parámetros y botón «Calcular desplazamiento».
  - Resultados y tabla de fragmentación.
  - Capas: pila (transparencia), techo in situ, vectores, vóxeles y dominios.
  - Colores por tamaño, desplazamiento, dominio, salida o error.
  - Herramientas de sección (perfil con throw y drop) y de dominio.
  - Exportación XYZ, OBJ, STL y vectores CSV.
  - Calibración contra un levantamiento post-voladura de la mina (mapa de error, RMSE y búsqueda de k y n).
- **Esquema v13:** `calcParams.muckpile` y `Blast.domains`, con migración y test.
- **Salida:** FC-39 y FC-45 en R1, FC-40 y FC-43 en R0 (calibración, F4 C4), FC-41 y FC-42 en R1 con fuente, FC-44 en R1 + R0. Ejemplo «Pila de material» (demostración, no CR).
- **Informe del caso de dos escalones** (`docs/MUCKPILE-REPORT.md`): matemática paso a paso, registro del diagnóstico del «lado derecho que sale lejos» (burden frontal de 2,24 m contra la cresta curva) y dos correcciones: perímetros sin taladros no se vuelan, y fuera del levantamiento se prolonga su borde.
- **Pendiente:**
  - P-23: taladros fuera de la validez de Zhang (B/Ø < 7) hoy quedan quietos;
  - calibrar con perfiles reales de pila (F4 C3–C4);
  - un CR publicado de forma de pila (Yang & Kavetsky 1989–1990 no dan números en el resumen; tesis de Yang, UQ, doi 10.14264/366174);
  - dominios desde un modelo de bloques (CSV).

### A7b: cara libre configurable (pedido del usuario) ✅

- **Ángulo y alto de la cara:**
  - Ángulo de cara (talud) del banco, editable en Diseño (antes no estaba en la interfaz).
  - Ángulo y alto **propios por perímetro** (`BlastBoundary.faceAngle`, `faceHeight`, esquema v14), en la tabla «Cara libre (talud)».
  - Botón que los **mide en la topografía** del banco (S-26). En el ejemplo sintético mide 69,8° y 15,0 m sobre caras de 70° y 15 m.
- **Se usan en** (FC-46):
  - la vista 3D (caras hasta su pie);
  - el alcance de A5 (α = 90° − β del perímetro);
  - la energía (sin valor en el aire delante de la cara o sobre el terreno, S-25);
  - la pila: roca bajo el talud, burden que crece hacia el pie (la base del frente sale más lenta) y lanzamiento según la cara (`launchFromFace`).
- **3D:** conmutadores para ocultar las caras libres y los planos del banco. Con la pila calculada, la topografía se recorta en los perímetros volados y su talud, así se ve la pila también delante de la cara.
- **Caso de dos escalones** (`docs/MUCKPILE-REPORT.md` §9): in situ 75 647 m³ (+4897 m³ de cuña); throw de 183,8 a 72,8 m.

## Evaluación 2 (después de A6)

Guía `01 §3`: «Ingenieros externos · grupo elegido por el ingeniero de minas; manual básico y registro de comentarios · **Salida: hallazgos críticos resueltos**».

- **E2.1 Manual básico** en `docs/manual/` (español; inglés al final): instalación (`README`), flujo de los 12 pasos de la guía `§4` con capturas, qué modelo usa cada resultado y su estado (R0–R3), límites conocidos. Las capturas se sacan con el navegador sin interfaz (ver «Herramientas» en `docs/ROADMAP.md`).
- **E2.2 Registro de comentarios** sin backend (D-08): `docs/evaluaciones/evaluacion-2.md` con una tabla (evaluador, fecha, pantalla, hallazgo, severidad, estado) y un formulario externo o una exportación JSON. Los comentarios dentro de la aplicación esperan a F5.
- **E2.3 Sesión:** protocolo de I6 (`docs/REPORTS.md («Protocolo… I6»)`) con CR-01 y el ejemplo de producción; se mide éxito, bloqueos y tiempo.
- **Salida:** hallazgos críticos corregidos y registrados; `docs/REPORTS.md`.

## Fase 3: subterráneo (S0–S6)

Guía `01 §3`: «Frentes y anillos · método sueco para frentes; abanicos para anillos · **Salida: ronda completa dentro de sección; casos de referencia**». `01 §19`: ampliar el modelo con perfil de excavación y taladros de alivio. Fuente principal: `docs/theory/references/R4` (solo tiene §1 y §4). Benchmarks: `R3` F17 (2DRing), F18 (2DFace); `R2` F23. **Ninguna fórmula de `R4 §4.1` marcada `[GENERAL]` se programa sin verificarla contra Holmberg (1982) o López Jimeno** (regla de dominio 1); hasta entonces es un parámetro del usuario.

### S0: fuentes y casos (solo docs)

- Conseguir Holmberg (1982) / López Jimeno (manual de perforación y voladura) y verificar cada `[GENERAL]` de `R4 §4.1` (líneas 103–108): avance H = 0,15 + 34,1·Φ2 − 39,4·Φ2²; B1 ≤ 1,7·Φ2 (práctico 1,7·Φ2 − F); q1 = 55·d·(B1/Φ2)^1,5·(B1 − Φ2/2)·(c/0,4)/PRP_ANFO; W_n = B_n·√2; zapateras B = 0,9·√(q·PRP/(c·f·(S/B))) con B ≤ 0,6·L. Registrarlas en `docs/RULES.md` (FC-40…) con su estado.
- Casos de referencia nuevos (CR-S1 frente, CR-S2 anillo) tomados de un ejemplo resuelto del libro: ninguno existe hoy. Candidatos: la galería de `R1 §6` (40 taladros cargados + 2 de alivio, `P1-S4 p87-89`) y el ejemplo del manual de JKSimBlast (`R3` F18: 45 taladros de 3,2 m, 51 mm cargados y 102 mm de alivio) solo como verificación cruzada.
- Literatura del módulo subterráneo (`R1 §7` #23): buscar Holmberg (1982) y López Jimeno; si no se consiguen, supuesto (D-12): usar las fórmulas de `R4 §4.1` como parámetros editables con aviso «sin verificar». Mecha de seguridad (RM-15) y normativa (DS 024-2016-EM, `R4 §1.3`) igual.
- **Salida:** fórmulas en R1 con cita y al menos un CR por módulo.

### S1: modelo de datos (esquema nuevo con migración)

- `Blast.bench` pasa a ser opcional o se agrega un tipo de voladura (`surface` / `face` / `ring`) con su contenedor: perfil de excavación (polilínea cerrada en el plano del frente, con tipos herradura, rectangular, arco-D y circular), avance, plano del frente; para anillos, plano del anillo (origen, rumbo de la normal, buzamiento), contorno del tajeo y galerías.
- Roles de taladro para frentes: arranque, alivio (vacío), ayuda, contorno (hastial, techo) y zapatera. Se agregan como `HoleGroupKind` nuevos o como campo `role`; el alivio no lleva carga.
- Taladros ascendentes: `holeToe` (`core/src/geometry/hole.ts`) ya es 3D; acotar la inclinación en el esquema (0–180°) y probarlo.
- Migración y test (patrón de `fillCalcParams`, `core/src/io/projectFile.ts`).

### S2: frentes, diseño de la ronda (método sueco de 4 secciones)

- Parámetros: avance, Ø de carga, Ø y número de alivios (Φe2 = √N·Φe), desviación esperada, constante de roca c, PRP del explosivo.
- Generador: arranque en 4 secciones (B1, B2…; lado de la última sección < √avance; taco 10·d), ayudas (f = 1,45 sección B y 1,2 sección C, S/B = 1,25), contorno (sin voladura suave: f = 1,2, S/B = 1,25; con voladura suave: S = K·d con K = 15–16, S/B = 0,8, carga lineal ≈ 90·d² para Ø < 155 mm), zapateras (f = 1,45, S/B ≈ 1, B ≤ 0,6·L). Todo editable a mano sin perder el vínculo con los parámetros (`R4 §4.1` función 2).
- Validaciones (`R4 §4.1` función 6): alivio vacío mayor que el de carga (RM-13), burden del primer cuadrilátero ≤ 1,7·Ø equivalente, taladros dentro del perfil, distancias mínimas, retardos únicos y crecientes, cara libre disponible.
- Vista: el frente se dibuja en su propio plano (cámara ortográfica sobre el plano del frente); reutiliza InstancedMesh del engine.
- Tests con CR-S1.

### S3: frentes, carga, secuencia y resultados

- Carga por grupo: encartuchado y granel (RM-14), carga desacoplada o cordón en el contorno, kg por taladro.
- Secuencia automática arranque → ayudas → contorno → zapateras con retardos largos entre grupos (`R4 §1.2`); simulación paso a paso (reutiliza `timing/`).
- KPIs (`R4 §4.1` función 5): avance ≈ 95 % del taladro con desviación ≤ 2 %; volumen y t por disparo; factor de carga kg/m³ y kg/t (típico 2–4 kg/m³, `R4 §1.1`); kg por m de avance; m perforados por m de avance; número de taladros; MIC (reutiliza FC-23).
- Daño del contorno con Holmberg–Persson (FC-28, FC-33 de F2).
- Exportar PDF a escala, CSV y DXF; escenarios lado a lado (reutiliza G7).
- **Salida parcial:** ronda completa dentro de la sección con CR-S1 reproducido.

### S4: anillos (abanicos)

- Contorno del tajeo y galerías (polilíneas, importación DXF/CSV); abanico por ángulo igual o por espaciamiento de pie constante; varios centros de perforación; ascendentes y descendentes; recorte con stand-off contra el contorno (`R4 §4.2` funciones 1–3).
- Cálculo (función 4): metros perforados por anillo, volumen y t por anillo (burden × área de la sección), factor de carga kg/m³ y kg/t (típico 0,3–0,6 kg/m³), kg por taladro y por anillo, m/t.
- Reglas `[CURSO]`/`[GENERAL]` como parámetros con aviso: burden ≈ 25–35·Ø; espaciamiento de pie/burden 1,0–1,3; ~85 % cargado; sobreperforación 0–0,5·B según el pie.
- Validaciones (función 7): espaciamiento de pie en rango, largo máximo por equipo, desviación 1–2 % del largo, taladros que se cruzan; primer anillo con cara libre (slot).
- Secuencia desde la cara libre hacia afuera y entre anillos en retirada desde el slot.
- Exportación por anillo (PDF, CSV con collar, azimut, inclinación, largo, carga y retardo; DXF). Tests con CR-S2.

### S5: análisis subterráneo

- Energía en el plano del anillo o del frente (`R3` F13: resolución 0,1 m en anillos, 0,02 m en frentes); fragmentación por anillo con Kuz-Ram (F2 A3) como estimación.
- Burden efectivo en frentes (FC-22 con las reglas de P-16).
- Fixture de rendimiento con un anillo grande y una ronda de 150 taladros.

### S6: cierre de F3

- Reporte `docs/REPORTS.md`; ejemplos (un frente de galería y un anillo) y pasos en la demostración; manual ampliado.
- **Salida (guía):** ronda completa dentro de la sección y los casos de referencia reproducidos.

## Fase 4: datos de campo (C0–C5)

Guía `01 §3`: «Calibrar con mediciones · importar perforación y sismógrafos, nube de puntos y dron · **Salida: un diseño calibrado con datos reales**». Principio `03 §1` #2: **diseño y realidad son datos distintos**. Benchmarks: `R2` F07 (desviación), F10 (sismógrafos), F14 (dron), F20 (MWD), F21 (auditorías). Muestras de formatos en `R2 §5`.

### C0: formatos con la operación (solo docs)

- Formatos (supuesto si la operación no responde, D-12): soportar primero CSV genérico con mapeo de columnas y los formatos de muestra de `R2 §5`. Formatos a cubrir (`03 §4`, guía `§17` #18): sismógrafos (marcas de `R2` F10: IDETEC, Instantel, NOMIS, Vibracord, White, ZTEX, Syscom, ASCII/CSV), sondas de desviación (Boretrak `.phd`, DeviaLim), MWD (`.lim` = ZIP con NetCDF, variables sin documentar, `R2 §7` Q4), IREDES (P-13).
- Registros de CR-06: si no llegan con la carga por retardo, el ajuste se prueba con datos sintéticos y se deja listo.

### C1: as-drilled (perforado)

- El modelo ya tiene `Hole.actual` (`core/src/model/types.ts`, sin uso): se amplía con trayectoria de desviación (profundidad, azimut, inclinación por tramo, como `.phd`), estado del taladro (`HoleStatus` ya existe) y as-loaded (kg reales, densidad medida, taco medido; `R1 §1.2` etapa 7).
- Importadores: CSV de collares reales y `Voladura.xlsx`/`.phd` (`R2 §5`); emparejar por ID con el diseño y avisar huérfanos.
- Vista diseño frente a real: desplazamiento de la boca, largo y desviación; tolerancia de 30 cm (`R1` F30); taladros cercanos < 4 m que detonan juntos; distancias entre trayectorias en profundidad (`R2` F07, burbujas).
- Recalcular carga, tiempos, burden efectivo y Kuz-Ram con la geometría real (W = desviación real en (1 − W/B), `R1` F30; ejemplo: n de 1,04 a 0,94).
- IREDES: exportar el patrón para perforadoras e importar el perforado (P-13).

### C2: sismógrafos y ajuste de K y β

- Importar registros CSV (ISO-8859-1, `;`, decimal `.`; 1024 muestras/s; canales acústico, radial, vertical y transversal, `R2 §5`); picos L/T/V, resultante (PVS), frecuencia (RM-21) y sobrepresión en dB.
- Entidad nueva de registro medido (voladura, punto, distancia, carga por retardo, PPV, frecuencia).
- Ajuste log-log de PPV = K·(R/√Q)^(−β) con r² e intervalo de confianza configurable (50 % en el ejemplo de `R2` F10: K = 179,4, α = −1, r² = 0,7); quitar atípicos a mano; guardar el ajuste como ley del sitio o del punto (FC-24).
- Tests: recuperar K y β de datos sintéticos generados con valores conocidos y, cuando lleguen, con los registros de CR-06.
- Retroanálisis de VPPc (P-17 vía 1) y calibración de k de sobrepresión (FC-30; 128 dB a 200 m y 116 dB a 300 m como primer punto).

### C3: nube de puntos, dron y perfil de cara

- Importar nube (`.las/.laz/.ply/.csv`, `R2` F06; ejemplo de 4,2 M puntos) en el worker con submuestreo; ortofoto como fondo.
- Perfil de la cara y burden real en la base y a media altura (critical burden, `R2` F06); cara libre desde la nube.
- Rendimiento: la nube se dibuja por lotes; 60 fps con el fixture.

### C4: calibración de modelos

- Fragmentación: comparar P50/P80 medidos (análisis de imagen, dato del usuario) con Kuz-Ram y ajustar A.
- Desplazamiento: calibrar k por fila (FC-37) con perfiles de pila reales.
- Informe «diseño frente a real» en PDF (auditoría, `R2` F21).

### C5: cierre de F4

- Reporte `docs/REPORTS.md` con un diseño calibrado con datos reales (salida de la guía).

## Fase 5: distribución y backend (D0–D4)

Guía `01 §3`: «Dejarlo listo para terceros · documentación de usuario, empaquetado, lista de verificación de lanzamiento · **Salida: lista aprobada**». Aquí se levanta D-08: usuarios, roles, comentarios, auditoría e historial (R-25, H-801, UC-09, UC-10, NF-07, NF-08).

**Adelantado (2026-09-30, D-14):** login, empresas con minas, roles e historial de versiones de cada mina, fuera del orden de hitos. **Hecho:** servidor (`apps/server`) y contratos (`packages/api`); login sin registro público con contraseña temporal; empresas, usuarios con rol, minas con acceso restringible y auditoría inalterable; proyectos por mina con versiones inmutables, concurrencia optimista, restaurar, borrador local; historial de la mina y comparación de versiones en el plano. **Pendiente de D2:** comentarios del revisor por escenario (UC-09) y catálogos compartidos del administrador (`03 §1` #6). D3 y D4 siguen en su lugar.

**Topografía (2026-09-30, D-16):** se adelanta parte de C3 (nube y dron) junto con R-03/H-202: levantamientos por mina con fecha, importación de DXF, Surpac, CSV/TXT, LandXML, GeoTIFF y LAS/LAZ, reproyección y herramientas de diseño sobre la topografía (perímetro desde línea, cara libre desde la cresta, collares sobre el terreno). Ramas `feat/topography-*` y `feat/mine-surveys`.

### D0: decisión de backend (nota D-14)

- Opciones: servidor Node con `@cronos/core` (D-02 lo permite tal cual) y base relacional; o servicio gestionado. Autenticación, cifrado en tránsito, variables de entorno sin credenciales en el repositorio (guía `§14`), licencias permisivas (NF-15). Despliegue sobre lo que ya existe (`Dockerfile`, `docker-compose.yml` con Traefik, `docs/DEPLOY.md`).

### D1: usuarios y roles

- Roles de la guía `§1.4`: diseñador (crea, simula, compara, reporta), revisor (ve y comenta; **no edita**), administrador (usuarios, roles, catálogos). Entidad de `03 §2`: `id`, `nombre`, `correo`, `rol`, `idioma`.
- Pantalla de administración de usuarios (guía, pantalla mínima 11). Criterio de H-801: el revisor no puede editar; los cambios quedan en un registro.

### D2: comentarios, auditoría e historial

- Comentarios del revisor asociados al escenario (`03 §2`, UC-09).
- Registro de auditoría: quién, cuándo, qué, por comando del DocumentStore (cada mutación ya es un comando).
- Historial de versiones en el servidor (NF-08), además del autoguardado local.
- Catálogos compartidos del administrador con copia congelada por proyecto (`03 §1` #6).

### D3: documentación y empaquetado

- Manual de usuario completo (ES/EN) a partir del manual de E2.1; guía de instalación de un tercero (NF-01).
- Registro de errores y versiones (NF-13); compatibilidad Chrome y Edge (NF-04).
- Paquete de despliegue reproducible y lista de verificación de lanzamiento.

### D4: cierre de F5

- Lista de verificación aprobada por el ingeniero (salida de la guía) y `docs/REPORTS.md`.

**Fuera de alcance de todas las fases** (guía `01 §3`): ejecución en campo con tabletas, integración con perforadoras o camiones fábrica, gemelo digital 4D y aprendizaje automático.

## Ciclo de trabajo por hito (guía §8.1)

1. Ubicar o escribir el **caso de referencia** con su fuente y anotar las reglas en `docs/RULES.md` con su estado.
2. Escribir la **prueba** con el valor de la fuente, antes que el código.
3. Implementar.
4. Contestar por escrito dos preguntas de comprensión sobre lo construido.
5. Llenar el reporte en `docs/REPORTS.md` y mostrar una demo al ingeniero.

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
- Reglas en `docs/RULES.md` con fuente y estado.
- CR aplicables dentro de tolerancia.
- Documentación actualizada.
- Código explicable.
- `typecheck`, `lint` y `test` en verde; sin `any`.
- Si toca engine o workers: fixture de 5.000 taladros a 60 fps.
- Commit convencional.

## Herramientas para el agente

- **Ver la aplicación sin intervención del usuario:** `pnpm dev` en segundo plano y un script de Playwright con el Chromium sin interfaz de `~/.cache/ms-playwright/chromium_headless_shell-*`. En este WSL le faltan `libnspr4`/`libnss3`: se bajan sin sudo con `apt-get download libnspr4 libnss3`, `dpkg -x` en una carpeta temporal y `LD_LIBRARY_PATH` apuntando a su `usr/lib/x86_64-linux-gnu`. `playwright-core` se instala en una carpeta temporal (no en el repo).
- **Fuentes en PDF:** se leen con `pypdf` en un entorno virtual temporal (no hay `pdftotext`). ScienceDirect bloquea la descarga automática (403): el artículo de Zhang et al. (2021) hay que bajarlo a mano desde el navegador si se quiere archivar.
