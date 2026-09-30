# Preguntas, supuestos y comprensión

Aquí hay tres cosas distintas:

1. **Decisiones del ingeniero:** dudas de dominio que se le preguntaron y lo que respondió. Ya no se abren preguntas nuevas salvo que sean críticas (D-12).
2. **Supuestos:** lo que se decidió sin preguntar, porque no apareció la fuente. Todos son parámetros editables.
3. **Comprensión:** examen que responde **el desarrollador** (no la IA) para demostrar que entiende lo construido; el ingeniero lo aprueba (indicador I1 de la guía).

## 1. Decisiones del ingeniero (P-01…P-22, todas respondidas)

El ingeniero fija decisiones de producto; la regla conserva su estado R0–R3 en `docs/RULES.md` hasta tener cita y caso.

| ID   | Tema                               | Decisión                                                                                                                                                                                    | Hito |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| P-01 | Densidad y SDOB con decks          | Densidad por tramo; SDOB con la carga más cercana a la superficie, al centro de sus primeros 10·Ø                                                                                           | G4   |
| P-02 | Modelo de burden efectivo          | Distancia a la superficie libre al detonar; un taladro previo alivia si detonó ≥ k·B antes (k = 3 ms/m roca dura, 5–6 blanda)                                                               | G5   |
| P-03 | Malla sin cara libre               | No bloquear: advertencia y aceptación explícita                                                                                                                                             | G3   |
| P-04 | Sin detonador / sin taco           | Sin detonador: error. Sin taco: advertencia en rojo con confirmación. Taco < 0,7·B o < 20·Ø: aviso                                                                                          | G4   |
| P-05 | Largo de taladro inclinado         | Geométrica (H + J)/cos α por defecto; López Jimeno como opción                                                                                                                              | G3   |
| P-06 | Volumen para el factor de carga    | Diseño con B·S·H (H vertical, sin cos α); real con el volumen cubicado. Mostrar ambos                                                                                                       | G3   |
| P-07 | Distancia para el PPV de un grupo  | Taladro más cercano; centroide solo informativo lejos                                                                                                                                       | G6   |
| P-08 | Kuz-Ram                            | n de Cunningham (1987), RWS; aviso con A fuera de 0,8–22                                                                                                                                    | F2   |
| P-09 | Agua en el taladro                 | Seco / agua estática (sin ANFO) / agua dinámica (solo emulsión); filtra y avisa, no bloquea                                                                                                 | G4   |
| P-10 | Ventana de MIC                     | Semiabierta [t, t + w); ventana ampliada para pirotécnicos                                                                                                                                  | G6   |
| P-11 | Retardo corto                      | Sin fórmula universal; guía de 3–8 ms/m                                                                                                                                                     | G5   |
| P-12 | Límites de PPV                     | Sin norma nacional: tabla por tipo de estructura con fuente (USBM RI 8507/OSM, DIN 4150), «por contrastar»                                                                                  | G6   |
| P-13 | Formatos                           | CSV, DXF y GeoJSON; IREDES es el siguiente (F4)                                                                                                                                             | F4   |
| P-14 | SDOB con cámara de aire            | El aire no confina: D = taco sólido + mitad de 10·Ø; la SDOB desde el collar solo como dato                                                                                                 | G4   |
| P-15 | HA73 y HA64                        | Heavy ANFO; no inventar densidades para el caso de validación. Sustituto en el catálogo: ANFO Pesado Famesa; carga de CR-04 pendiente (S-03)                                                | G4   |
| P-16 | Alivio del burden efectivo         | Alivia cualquier taladro previo (también de la misma fila) si la isócrona detonada está más cerca que la cara original y detonó ≥ k·B antes. Aviso con ≥ 2·B y aviso intermedio con ≥ 1,5·B | A1b  |
| P-17 | VPPc y validez de Holmberg–Persson | VPPc por retroanálisis o VPPc = RT·Vp/E (Persson–Holmberg–Lee); sin valor por defecto. H-P con R ≲ 2–3·L_carga; K, α de H-P calibrados en campo cercano                                     | A2   |
| P-18 | Presión del precorte y γ           | Pb = 110·f^n·ρ·VOD² (Crosby–Bauer, ISEE). γ en kg/m² con la columna cargada: en CR-01 vale **1,514 kg/m²** (el 1,53–1,54 de `docs/theory/04` es un error de unidades)                       | A1   |
| P-19 | Variantes de Kuz-Ram               | Xc al 63,2 %; X80 = X50·(ln 5/ln 2)^(1/n); A = 0,06·(RMD + JF + RDI + HF); RWS del proveedor o desde 3,7 MJ/kg                                                                              | A3   |
| P-20 | Onda aérea y proyección            | Sobrepresión: USBM RI 8485 (Siskind et al. 1980), β 1,2–1,5, k por sitio. Lundborg con d en pulgadas y fragmento T = 0,1·d^(2/3). SDOB con cortes en 0,62, 0,92, 1,44 y 1,84                | A4   |
| P-21 | Desplazamiento                     | Zhang, Chi & Yi (2021): v_B = √[π·c_B·ρ_e·e_e·c_e/(2·ρ_r·tan θ)]·(d/B), c_B = 0,12, θ = 45°; alcance por tiro parabólico; filas posteriores v·k^(n−1) con k de calibración                  | A5   |
| P-22 | Unidades del buffer                | W kg, FC g/t, H m, ρ_r t/m³: es W = FC·B·S·H·ρ_r                                                                                                                                            | A1   |

## 2. Supuestos (D-12)

Se toman sin preguntar cuando no aparece la fuente. Cada uno es un parámetro que el usuario puede cambiar.

| ID   | Supuesto                                                                                                                                                                                                                                                                                                                                                                    | Por qué                                                                                                                                       | Dónde                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| S-01 | Factor de reducción de velocidad por fila k = 0,7                                                                                                                                                                                                                                                                                                                           | Centro del rango 0,6–0,8 que da el ingeniero; no hay fuente publicada                                                                         | `calcParams.displacement` (A5)                                        |
| S-02 | En el precorte, ρ y VOD del tramo de explosivo más largo del taladro                                                                                                                                                                                                                                                                                                        | La fórmula es para un solo producto; los precortes usan uno solo                                                                              | `design/presplit.ts`                                                  |
| S-03 | CR-04 usa la **malla sintética** (180 taladros con la estructura y las trampas de `docs/theory/04`) como sustituto definitivo: el CSV real no se entregará. HA73/HA64 se sustituyen en el catálogo por el **ANFO Pesado de Famesa** (ficha FT-021, 1,23 g/cm³). La validación de la **carga de CR-04 queda pendiente**: el ingeniero pidió no inventar la densidad del caso | No hay ficha pública de HA73/HA64 (se buscó); la de Famesa es la única ficha real de heavy ANFO a mano                                        | `io/fixtures/cr04-sintetico.csv`, `model/library.ts`                  |
| S-04 | CR-07 (ejemplo publicado de Kuz-Ram) no existe todavía: Kuz-Ram queda como regresión con CR-02 #15                                                                                                                                                                                                                                                                          | Se revisó Cunningham (2005) y no trae un ejemplo numérico completo                                                                            | `fragmentation.test.ts` (A3)                                          |
| S-06 | CR-05 amarre 5 (B = 6,0 m) se reproduce con el alivio típico de 8 ms/m; con el valor por defecto de 3 ms/m, B2 y B3 se alivian con su vecino de fila (3,5 m)                                                                                                                                                                                                                | Con la regla de P-16 el vecino de fila alivia si detonó ≥ k·B antes; 17 ms bastan con 3 ms/m y no con 8                                       | `timing/cr05.test.ts`                                                 |
| S-07 | La eyección del taco (intervalo con la fila de adelante < 35 ms) es una nota informativa, no una advertencia                                                                                                                                                                                                                                                                | En salidas en V las «filas» efectivas son diagonales y salen con el conector entre taladros (17–25 ms); la regla de `R1` F27 no tiene caso    | `timing/timingChecks.ts`                                              |
| S-08 | Los avisos de SDOB usan los cortes de `R1` F12 (0,62 cráter; 0,92 incontrolada) en lugar de 0,4 / 1,2 de DF-20                                                                                                                                                                                                                                                              | Los de F12 tienen fuente de curso y los confirmó el ingeniero (P-20)                                                                          | `calcParams.checks.sdob`                                              |
| S-09 | La velocidad de burden de Zhang solo se aplica con B/Ø ≥ 7 (y carga acoplada)                                                                                                                                                                                                                                                                                               | Es el menor B/Ø de los casos citados del artículo (Malmberget, 0,8 m / 115 mm); por debajo v ∝ 1/B da alcances irreales (taladros de esquina) | `analysis/displacement.ts`                                            |
| S-10 | El catálogo base suma 7 explosivos y 2 boosters de Famesa con su ficha (fuente y versión) junto a los genéricos                                                                                                                                                                                                                                                             | Da datos reales de fabricante en lugar de valores de ejemplo (CT-01)                                                                          | `model/library.ts`                                                    |
| S-11 | La ficha de ANFO Pesado dice «3 140 cal/g»: se toma como 3 140 kJ/kg (con RWS 84 % frente al ANFO ≈ 3,8 MJ/kg). Famecorte E-20 no trae energía: RWS 74 % × 932 kcal/kg del ANFO de Famesa                                                                                                                                                                                   | Consistencia con el RWS de la misma ficha                                                                                                     | `model/library.ts`                                                    |
| S-05 | Ángulo de cara por defecto 75° para el ángulo de lanzamiento (α = 90° − cara)                                                                                                                                                                                                                                                                                               | Valor de los ejemplos del proyecto y del ingeniero (P-21)                                                                                     | `blast.bench.faceAngle`                                               |
| S-12 | En el historial de versiones, un taladro cuenta como movido si su collar se desplaza más de 0,01 m (bajo la precisión del replanteo)                                                                                                                                                                                                                                        | Sin fuente para una tolerancia de comparación entre versiones; no afecta cálculos, solo el resumen de cambios                                 | `DiffOptions.moveTolerance` (`core/src/history/diffProjects.ts`)      |
| S-13 | Al triangular puntos o curvas, se descartan triángulos con una arista mayor a 8 veces el espaciado típico de los puntos (evita puentear huecos del levantamiento)                                                                                                                                                                                                           | Sin fuente para un valor universal; depende de la densidad del levantamiento                                                                  | `TinOptions.maxEdgeFactor` (`core/src/topography/tin.ts`)             |
| S-14 | Las nubes de puntos (LAS/LAZ) se reducen a una celda de 0,5 m conservando la cota mínima por celda (el suelo, no equipos ni vegetación)                                                                                                                                                                                                                                     | Sin fuente; compromiso entre detalle para el diseño y memoria del navegador                                                                   | `DecimateOptions.cell` y `.keep` (`core/src/topography/decimate.ts`)  |
| S-15 | Una arista del perímetro es cara libre si su distancia a la línea de cresta es menor a 1,0 m                                                                                                                                                                                                                                                                                | Sin fuente; tolerancia de dibujo, editable al usarla                                                                                          | `freeFacesFromLine(..., tolerance)` (`core/src/document/commands.ts`) |
| S-16 | PSAD56 se lleva a WGS 84 con la traslación del registro EPSG para Perú (−288, 175, −376 m); falta contrastarla con un punto de control publicado por el IGN                                                                                                                                                                                                                 | Sin punto de control a mano; la prueba solo verifica la ida y vuelta y el orden de magnitud del corrimiento                                   | `CRS_DEFS` (`core/src/topography/reproject.ts`)                       |
| S-17 | Un DEM (GeoTIFF) se simplifica a un TIN con un error vertical máximo de 0,5 m (MARTINI)                                                                                                                                                                                                                                                                                     | Sin fuente; compromiso entre fidelidad del terreno y cantidad de triángulos                                                                   | `DEFAULT_DEM_TOLERANCE` (`workers/src/topography/raster.ts`)          |

## 3. Datos pendientes de entrega

| Dato                                                                 | Para qué                                 | Mientras tanto                                                        |
| -------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| Carga de CR-04 a mano (densidad real de HA73/HA64)                   | Cerrar la validación de carga de CR-04   | Pendiente: malla sintética y ANFO Pesado Famesa en el catálogo (S-03) |
| Registros de vibración de CR-06 con la carga por retardo de cada uno | Ajustar K y β (F4)                       | Ejemplo a mano de `docs/theory/04` (K = 1140, β = 1,6)                |
| Ejemplo publicado de Kuz-Ram (CR-07)                                 | Evidencia independiente de fragmentación | CR-02 #15 como regresión (S-04)                                       |
| Demo de JKSimBlast o I-Blast                                         | Indicador I7 (paridad ±2 %)              | —                                                                     |

## 4. Comprensión (la responde el desarrollador)

Guía `docs/theory/01 §18` y `§8.1` paso 4. El desarrollador contesta con sus palabras (la guía prohíbe delegarlo a una IA, `§11`) y el ingeniero aprueba.

**G0:** 5 de 6 aprobadas el 2026-09-28. Falta la **3 (CR-01 a mano)**: con Ø 311,15 mm, ANFO 0,78 t/m³, andesita 2,6 t/m³, K_B = 25, Kd = 0,95 y Ks = 1,10, calcular Ash (esperado 7,779 m) y Konya–Walter (8,194 m; sin Kd·Ks, 7,841 m).

<details>
<summary>Respuestas aprobadas de G0</summary>

#### 1. Taco y confinamiento

**Por qué confina.** El taco es el material inerte (detritus de perforación, grava angular) que se coloca sobre la carga, en la parte superior del taladro. Al detonar, los gases a alta presión buscan la salida más fácil, que es la boca del taladro. El taco la tapona por fricción contra las paredes y por su propia inercia. Eso retiene los gases el tiempo suficiente (milisegundos) para que abran y propaguen grietas en la roca. La energía de gas, que es la que desplaza el material, se aprovecha en la fragmentación y no se pierde por arriba.

**Si el confinamiento es insuficiente** (taco corto, o material fino o redondeado que «sale disparado»):

- Los gases escapan por la boca y se produce eyección del taco (_stemming ejection_).
- Aumentan la proyección de rocas (flyrock) y la onda aérea.
- La fragmentación empeora en la zona del collar: quedan bolones en la parte alta del banco.
- Baja el aprovechamiento energético, así que se necesita más explosivo para el mismo resultado.

Si el taco es excesivo, el problema es el contrario: queda roca sin fragmentar en el collar.

**Agua como taco.** Sí existe. Se llama _water stemming_ o taco hidráulico: bolsas o ampollas de plástico llenas de agua (o gel acuoso) que se colocan en el taladro. Se usa sobre todo en minería subterránea de carbón y en túneles, donde además suprime polvo y humos y reduce el riesgo de ignición de grisú y polvo de carbón.

Fuente: literatura de voladura subterránea en carbón, por ejemplo las normas de la DGMS (India) sobre taco en minas grisuosas, o el ISEE Blasters' Handbook. **Pendiente:** citar la referencia exacta. Ya hay fuentes verificadas en `docs/theory/05` (RM-01): 30 CFR 75 subparte N y OSTI, _plastic water stemming cartridges_.

#### 2. Cadena de iniciación

```
[Detonador] ──► [Booster / primer] ──► [Explosivo a granel (ANFO, emulsión)]
 pequeña carga     carga de alta            carga principal, poco sensible:
 muy sensible      potencia y velocidad     necesita un «golpe» fuerte para
                   (p. ej. pentolita)       detonar de forma estable
```

Cada eslabón es más potente y menos sensible que el anterior. El detonador por sí solo no aporta suficiente presión de choque para iniciar un agente de voladura a granel. El booster amplifica esa señal y entrega una onda de detonación intensa que establece la detonación estable del granel.

**Si faltara el booster:**

- El granel podría no detonar (tiro fallado), lo que deja explosivo sin reaccionar en el terreno. Es un riesgo grave de seguridad.
- También podría deflagrar o detonar a baja velocidad, con mala fragmentación y más humos tóxicos (NOx, CO).

#### 3. CR-01 a mano

**Pendiente.** La respuesta recibida explica bien el procedimiento, pero no lo resuelve: dice que faltan los datos, y los datos están en `docs/theory/04`, CR-01. Falta hacer el cálculo a mano y compararlo con el código (paso 2 de la guía `§2`).

Procedimiento recibido:

- **Ash:** B = K_B · D / 12, con B en pies y D en pulgadas (o B = K_B · D en las mismas unidades). K_B vale entre 20 y 40 según la roca y el explosivo, típicamente 25–30.
- **Konya–Walter (métrico):** B = 0,012 · (2·ρ_e/ρ_r + 1,5) · D_e, con B en m y D_e en mm. El factor 0,012 es 0,3048/25,4, la conversión de la forma en pies y pulgadas. CR-01 además multiplica por Kd·Ks.
- **Para comparar con el código:** unidades de D, redondeos intermedios y la misma ρ_e.
- Konya–Walter da algo más que Ash porque incorpora la relación de densidades.

Datos de CR-01: Ø = 12¼" = 311,15 mm; ANFO ρ_e = 0,78 t/m³; andesita ρ_r = 2,6 t/m³; K_B = 25; Kd = 0,95; Ks = 1,10.

Para completar, escribe los pasos con tus números y verifica contra:

- Ash: 7,779 m (25,52 ft).
- Konya–Walter: 8,194 m. Sin Kd·Ks, la forma métrica da 7,841 m.

La implementación en código llega en G3 (`core/src/design/burden.ts`), con estos valores como test.

#### 4. Cara libre

Una cara libre es una superficie de la roca expuesta al aire o a un vacío, hacia la cual el material puede desplazarse. La onda de compresión se refleja en ella como tracción, y la roca, que resiste mucho menos a tracción, se rompe. Sin cara libre la roca solo se tritura alrededor del taladro y no se arranca.

**Banco típico: dos caras libres.** Tiene la cara frontal (el talud vertical) y la superficie superior del banco. Por eso el material se rompe hacia el frente y se «esponja» hacia arriba con facilidad.

**Túnel: una sola cara libre (el frente).** Funciona porque la primera parte de la voladura, el cuele o _cut_, crea una segunda cara libre artificial. Los taladros del cuele, a menudo con taladros vacíos de gran diámetro, abren una cavidad central. Luego los taladros siguientes (ayudas, contorno) disparan con retardo hacia esa cavidad, que actúa como nueva cara libre.

#### 5. Amarre y retardo

- **Retardo:** es el tiempo (en ms) que tarda cada taladro en detonar respecto al inicio. Es una propiedad temporal, que dan el detonador o los conectores.
- **Amarre:** es el esquema de conexión que define la secuencia espacial de salida. Dice qué taladros salen antes y cuáles después, y por tanto hacia dónde se abre cada uno.

La misma malla con distinto amarre cambia la dirección del movimiento (↑ indica la cara libre; los números son el orden de salida):

```
Amarre 1: en línea (fila por fila)        Amarre 2: en «V» (chevron)
   Cara libre ↑                               Cara libre ↑
 1   1   1   1   1                          3   2   1   2   3
 2   2   2   2   2                          4   3   2   3   4
 3   3   3   3   3                          5   4   3   4   5
→ material avanza recto hacia el frente    → material converge al centro
  (pila extendida, más desplazamiento)       (pila alta y concentrada,
                                              menos proyección lateral)
```

#### 6. Vibración y distancias escaladas

- **PPV** (velocidad pico de partícula, en mm/s): mide cuán rápido se mueve el terreno. Es el indicador principal de daño estructural.
- **Frecuencia** (Hz): indica cuán rápido oscila el terreno. Las bajas frecuencias (menos de unos 10 Hz) son más peligrosas porque se acercan a la frecuencia natural de las casas. Por eso las normas fijan PPV admisibles en función de la frecuencia.
- **Onda aérea** (airblast, en dB(L) o Pa): es la sobrepresión que viaja por el aire, no por el terreno. Se origina por taco deficiente, cargas expuestas o desplazamiento de la cara. Rompe vidrios y causa molestias.

**Las dos distancias escaladas no son lo mismo:**

- **Distancia escalada de vibración:** SD = R / √W, donde R es la distancia al punto de interés y W la carga máxima por retardo. Predice la PPV en un receptor lejano, con la ley PPV = K·SD^(−β).
- **Profundidad escalada de enterramiento:** SDOB = d / W^(1/3), donde d es la distancia desde la superficie hasta el centro de la carga (considerando el taco) y W la masa de esa carga. Describe el confinamiento de la carga, es decir, qué tan probable es que se produzcan cráteres, flyrock u onda aérea.

La primera mide el efecto en el entorno. La segunda mide cuán bien contenida está la carga. Además usan exponentes distintos: raíz cuadrada frente a raíz cúbica.

</details>

**Preguntas por hito (sin responder):** escribir la respuesta debajo de cada una.

- **G1.** (1) ¿Por qué el proyecto guarda una copia congelada de los productos y qué pasaría con un diseño cerrado si cambia la densidad del ANFO del catálogo? (2) ¿Por qué no se importa sin EPSG y qué error típico evita en el hemisferio sur?
- **G2.** (1) Con `272,345.578`, ¿cómo decide Cronos si la coma es de miles, y qué pasa si todas las celdas son como `274,600`? (2) ¿Cómo se detecta Norte/Este intercambiados en UTM 18S?
- **G3.** (1) En CR-01, ¿por qué Konya–Walter da más burden que Ash y qué significa H/B = 1,875 «pobre»? (2) ¿Por qué el volumen de diseño es B·S·H sin cos α y cuándo se usa el cubicado?
- **G4.** (1) En CR-02, ¿por qué la densidad media de la emulsión gasificada es 1,2372 g/cc y no 1,38? (2) ¿Por qué la SDOB no cuenta la cámara de aire y en qué se diferencia de la distancia escalada de vibración?
- **G5.** (1) En CR-05 amarre 5, ¿por qué los taladros B tienen B_ef = 6,0 m y qué avisa el software? (2) ¿Por qué el alivio necesita k·B ms y qué pasa con Δ = 0?
- **G6.** (1) ¿Por qué la ventana de MIC es semiabierta y por qué hay una ventana ampliada para pirotécnicos? (2) Con K = 1140 mm/s y β = 1,6, ¿qué carga por retardo se admite a 200 m para no pasar 9,4 mm/s?
- **G7.** (1) ¿Qué cambia entre el factor de carga «de diseño» y el «real», y cuál se compara con los libros? (2) Entre la salida en V y en fila del ejemplo de producción, ¿qué indicador cambia y por qué?
- **G8.** (1) ¿Por qué el núcleo no traduce sus mensajes y cómo llegan traducidos? (2) ¿Qué términos se dejaron sin traducir y por qué?
- **A1.** (1) ¿Por qué el precorte se diseña con Pb ≈ UCS y qué pasa si queda muy por encima o por debajo? (2) En CR-01, ¿por qué f multiplica (D_c/D)² por 13/15 y qué diámetro de carga resulta?
- **A1b.** (1) En CR-05 amarre 5, ¿por qué B2 queda con 3,5 m con 3 ms/m y con 6,0 m con 8 ms/m? (2) ¿Qué es la «isócrona detonada» y por qué se mide la distancia a ella y no al taladro?
- **A2.** (1) ¿Por qué Holmberg–Persson solo vale cerca de la carga y qué pasa con K y α de la ley de campo lejano? (2) Con RT 8 MPa, Vp 4500 m/s y E 45 GPa, ¿cuánto vale VPPc y qué significa el contorno de ¼·VPPc?
- **A3.** (1) ¿Por qué Kuz-Ram queda como «regresión» y no como verificado? (2) ¿Qué cambia n entre una malla cuadrada, tresbolillo y equilátera?
- **A4.** (1) ¿Qué banda de SDOB tiene un taladro con SD = 0,85 y qué harías con el taco? (2) ¿Por qué la eyección del taco es solo una nota en una salida en V?
- **A5.** (1) ¿Por qué la velocidad de burden usa el burden efectivo y no el de diseño? (2) ¿Por qué la primera fila del ejemplo de producción proyecta más lejos que las demás?
