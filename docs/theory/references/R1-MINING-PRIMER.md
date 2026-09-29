# Primer de dominio — Diseño y simulación de voladuras (superficie)
### Puente minero → desarrollador · BORRADOR para validación del ingeniero de minas

> **Cómo leer este documento.** Todo lo que lleva una cita del tipo `[P4-C4 p5]` proviene del material de cursos de perforación y voladura (ver sección 0) y está resumido con palabras propias. Lo marcado **[GENERAL]** es conocimiento general del oficio que *no* aparece en ese material (o aparece de forma incompleta) y debe validarse. Lo marcado **[DUDA]** remite a la sección 7. Las unidades importan: casi todo el material mezcla pulgadas (diámetro de taladro), metros, kg, g/cc y ms; un software debe fijar unidades internas (recomendado SI) y convertir en los bordes.

## 0. Cómo leer las citas

Las claves entre corchetes (por ejemplo `[P4-C4 p5]`, `[X-DP K12]`, `[V2-04-1 p16]`) remiten a **material de un curso de perforación y voladura** (presentaciones y hojas de cálculo) que **no se entrega**. Cada valor que necesitas para programar está reproducido en este texto y en `04 - Casos de referencia`. Las claves solo sirven para que el ingeniero de minas ubique el origen de una cifra si le preguntas.

| Prefijo | Tipo de material |
|---|---|
| `P1`–`P5` | Presentaciones del curso principal (mecánica de rocas, fundamentos, diseño y accesorios, propiedades de explosivos); `p` = página |
| `V1`, `V2` | Diapositivas de un segundo curso (introducción y ejecución de voladuras a tajo abierto); `p` = página |
| `X-...` | Hojas de cálculo del curso (diseño de carga, burden por autores, Kuz-Ram, precorte, granulometría) |

---|---|---|
| **P1-S2 … S6** | `PV4\1 Mecánica de Rocas…\Sesion0N_PeryVol4.0_Dino Yancachajlla.pdf` (S1 es .pptx de imágenes) | p = página del PDF |
| **P2-01** | `PV4\2 Fundamentos…\01 FUNDAMENTOS_DE_PERFORACIÓN_Y_VOLADURA.pptx` | s = lámina |
| **P2-C34** | `PV4\2 Fundamentos…\FUNDAMENTOS DE PERFORACIÓN Y VOLADURA_CLASE 3 Y 4.pptx` (emulsiones, ANFO) | s = lámina |
| **P2-C5 / C7 / C8 / C9** | `PV4\2 Fundamentos…\…CLASE 5.pdf` (mecanismo de fragmentación), `CLASE 7.pdf` (primado y carguío), `CLASE 8.pdf` (perforación), `CLASE 9.pdf` (terminología y ensayos) | p |
| **P4-C1 … C8** | `PV4\4 Diseño y Accesorios…\DISEÑO Y ACCESORIOS CLASE N.pdf` (C1 accesorios, C2 sistemas de iniciación, C3-C4 diseño, C5 SD y tiempos, C6 variables de diseño, C7 repaso de cálculos y sincronización, C8 controles y precorte) | p |
| **P5** | `PV4\5 Propiedades de Explosivos…\CODEAUNI PROPIEDADES EXPLOSIVOS.pdf` | p |
| **V1-01E, 01P, 02A, 02S, 03P, 03A, 04M, 04T, PRE** | `TA\1 Introducción…\` : *Clase 01 Explosivos y clases* (01E), *Clase 01 Propiedades de los explosivos* (01P), *Clase 02 Accesorios – Sistemas de iniciación* (02A), *Clase 02 Selección de explosivos* (02S), *Clase 03 P&V en Minería Superficial* (03P), *Clase 03 Perforación Autónoma* (03A), *Clase 04 Diseño de mallas* (04M), *Clase 04 Termoquímica* (04T), *PRECORTE.pdf* (PRE) | p |
| **V2-01-1, 01-2, 02-1, 02-2, 03-1, 03-2, 04-1, 04-2** | `TA\2 Ejecución…\` : equipos rotativos (01-1), elección de aceros (01-2), diseño de mallas (02-1), conminución y predicción de fragmentación (02-2), secuencia de iniciación (03-1), configuración de carga (03-2), energía (04-1), costos (04-2) | p |
| **X-DP** | `TA\2 Ejecución…\DISEÑO PROPUESTO.xlsx` (hojas *Diseños de Carga*, *PRECIO POR TALADRO*, *SD Frank*, *TRABAJOUTILQUANTEX*, *Cálculo ABS Y AWS*, *PB*) | celda |
| **X-D2** | `TA\1 Introducción…\Diseño_2.xlsx` (misma estructura que X-DP, título "Fase VI B2") | celda |
| **X-D1** | `TA\1 Introducción…\Diseño_1.xls` (≈45 hojas: burden por autores, Kuz-Ram, precorte, Holmberg, retardos, etc.) | hoja!celda |
| **X-PRE** | `TA\1 Introducción…\Diseño_Precorte.xls` | hoja |
| **X-QTX** | `PV4\1 Mecánica…\Simulación de carga Quantex.xlsx` | hoja!celda |
| **X-TACO** | `TA\2 Ejecución…\Control_de_taco_chiapeta.xlsx` (hoja *calculos*) | celda |
| **X-GRAN** | `TA\2 Ejecución…\Planilla de Granulometría.xls` | celda |

Cobertura real: los PDF/PPTX de las carpetas pedidas se leyeron con extracción de texto; buena parte de las láminas de mecánica de rocas (P1-S1…S5) son imágenes y se leyeron con OCR automático o renderizadas (ver "Qué quedó fuera" al final de la sección 7). Los Excel se leyeron **con fórmulas**, no sólo con valores.

---

## 1. El ciclo de perforación y voladura en una página

### 1.1 Qué es y para qué sirve
Una **voladura de banco** en un tajo abierto consiste en perforar una malla de taladros verticales (o inclinados) en un escalón de roca (el *banco*), rellenarlos con explosivo en cantidades y posiciones calculadas, y hacerlos detonar en un **orden y con tiempos** precisos para que la roca se fragmente y se desplace hacia una **cara libre**, quedando lista para que la pala la cargue. Se dice que la razón principal de una voladura es la fragmentación, pero no puede diseñarse sin restricciones de seguridad (proyecciones, vibración, onda aérea, estructuras) `[P5 p4-5]`. Diseñar es "especificar cada elemento de la voladura de modo que pueda implementarse en terreno": lugar/tamaño/forma del volumen, tamaño y orientación de taladros y malla, tipo y distribución de explosivo, y secuencia/tiempos `[P4-C3 p4]`.

### 1.2 Etapas, responsables y datos

| # | Etapa | Quién decide / ejecuta | Datos que entran | Datos que se generan |
|---|---|---|---|---|
| 0 | **Planeamiento y diseño minero** (banco, fase, límites, cresta y pie de diseño) | Planeamiento mina; Geología/Geotecnia dan dureza, dominios, orientación de estructuras `[V2-02-1 p3-6; P1-S5 p5-6]` | Topografía, diseño de fase, litología, alteración, leyes, durezas, fallas, bootlegs (restos de taladros no detonados) | Polígono/proyecto de voladura, tipo de material (mineral/desmonte) |
| 1 | **Preparación del área** | Operaciones + Geotecnia (estabilidad) + supervisión P&V | Condición del piso | Área nivelada, bermas perimetrales `[V1-04M p19]` |
| 2 | **Diseño de malla** (B, S, diámetro, inclinación, alturas) | Ingeniero de P&V con software de diseño (p. ej. MS3D en el curso) `[V2-02-1 p19-21]` | Diámetro de broca disponible, H banco, UCS/dureza, condiciones de agua, fragmentación objetivo | Coordenadas x-y-z de cada taladro (archivo tipo `.DES`) y su ID `[V1-04M p20]` |
| 3 | **Marcado (staking) topográfico** | Topografía, en coordinación con supervisión de campo | Malla de diseño | Estacas con ID; envío al sistema de despacho (Dispatch) para que el perforista lo vea en pantalla `[V1-04M p20]` |
| 4 | **Perforación** | Perforista / supervisor P&V; parámetros: pulldown, RPM, presión y velocidad de barrido `[P2-C8; V1-03P]` | Taladros de diseño, tipo de broca (tricono/DTH/top hammer), UCS | Profundidad real, desviación, ROP (m/h), reporte diario de perforación `[P2-C8 p18]`. Tolerancia de referencia: ±30 cm respecto al diseño `[V1-04M p21]` |
| 5 | **Medición/QA-QC de taladros** | Supervisión P&V | Profundidad, agua, obstrucciones | Malla "as-drilled" (real), ajustes de carga por taladro `[V1-04M p21; P4-C8 p7]` |
| 6 | **Diseño de carga y de secuencia** | Ingeniero P&V (con asesor/proveedor del explosivo) | Producto, densidad, energía, VOD, taco, decks, cebado, retardos, geotecnia (Blast Index, Vp, K y α de vibración) `[V1-04M p23-25]` | Plano de carga por taladro (kg, longitudes), tabla de tiempos (isotiempos), predicciones de vibración/energía/fragmentación |
| 7 | **Carguío y cebado** | Cargadores + camión fábrica (MMU); control de calidad | Densidad medida, calibración de camión, primas | Kg reales por taladro, densidad final, taco medido `[P2-C7 p14-19]` |
| 8 | **Amarre y verificación** | Personal de amarre / blaster | Plan de amarre, tipo de accesorio (no eléctrico, electrónico) | Malla amarrada, prueba de continuidad (electrónicos) `[P4-C7 p20]` |
| 9 | **Disparo** | Blaster (punto seguro) | Zona de exclusión, avisos | Registro de disparo (`[GENERAL]`: hora, MIC, tiros quedados) |
| 10 | **Evaluación post-voladura** | P&V, Geotecnia, Planta | Vibración (geófonos), granulometría (WipFrag, cámaras), perfil de pila, sobre-rotura, tiros quedados | P80, PPV, backbreak, tasa de excavación de la pala (t/h), throughput del chancado/molienda `[V2-02-2 p6-14]` |
| 11 | **Mejora continua** | Todo el equipo | Comparación diseño vs. resultado | Nuevo diseño base (ciclo "diseñar, implementar, medir, comparar") `[P4-C3 p6]` |

### 1.3 Para qué existe un software de diseño de voladuras
El ingeniero debe **repartir energía** (explosivo) en el volumen de roca de modo que se cumplan, a la vez, objetivos que compiten entre sí. Un software existe para (a) calcular rápidamente la geometría y las cargas, (b) **predecir** los resultados antes de disparar, y (c) comparar alternativas por costo y riesgo. Lo que se **optimiza** y lo que se **evita**:

| Resultado | Se busca | Se evita | Qué variable de diseño lo gobierna (resumen) |
|---|---|---|---|
| **Fragmentación** | Tamaño (P50/P80) que maximiza rendimiento de pala, camión, chancado y molienda; poco sobretamaño (bolones) y pocos finos excesivos | Sobretamaño (voladura secundaria), finos que se pierden o dificultan la operación | Factor de carga/energía, malla B×S, tiempos, tipo de explosivo `[V2-02-2 p3-10]` |
| **Desplazamiento y perfil de pila** | Pila suelta o apretada según la pala/cargador; dirección de tiro | Pila "apretada" difícil de excavar; roca lanzada fuera de la zona | Retardos entre filas (ms/m de burden), secuencia `[P5 p68-71; P4-C7 p16]` |
| **Vibración (PPV)** | PPV bajo el umbral de daño a talud/estructuras/comunidad | Excesiva carga por retardo (MIC), coincidencia de ondas | Kg por retardo, tiempos entre taladros, secuencia `[V1-04M p24-25; X-D1 HOLMBERG Fit]` |
| **Onda aérea (airblast)** | Nivel bajo en zonas pobladas | Taco insuficiente, cordón detonante expuesto | Taco (SD), tipo de iniciación `[P4-C5 p7]` |
| **Proyección de rocas (flyrock)** | Ninguna fuera del área de exclusión | Taco muy corto, burden insuficiente, secuencia invertida | Taco, burden, SD `[P4-C5 p7, C6 p20]` |
| **Daño a la pared / sobre-excavación** | Talud estable, crestas y bermas según diseño | Backbreak, fracturas nuevas tras la última fila | Precorte, filas buffer/trim, cargas reducidas junto a paredes `[P4-C8 p9-17; V2-02-1 p22-26]` |
| **Costo** | Mínimo costo **global** (perforación + voladura + carga + acarreo + chancado + molienda), no mínimo costo del explosivo | Optimizar sólo $/kg de explosivo | $/t total; "existe un grado de fragmentación que representa un menor costo global de la mina" `[V2-02-2 p9; V2-04-2 p12]` |
| **Seguridad y operación** | Cero tiros quedados, gases nitrosos mínimos ("humos naranja") | Misfires, desensibilización, presión de muerte en taladros vecinos | Cebado, resistencia al agua, tiempos entre filas, control de densidad `[P2-C7; P5 p73]` |

**Idea clave para el desarrollador.** P&V es la operación unitaria de **menor costo por tonelada** de toda la cadena (perforación → voladura → carguío → acarreo → chancado → molienda) y, dentro de la conminución (reducción de tamaño), la que **menos energía consume** `[V2-02-2 p3-4]`; por eso una voladura "más cara" puede bajar el costo total. Ejemplo del propio curso: pasar de malla 7×8 m a 5.5×6.5 m (factor de potencia 0.37 → 0.58 kg/t) subió el costo de P&V de 0.30 a 0.48 US$/t, pero redujo el P80 de 22.2 a 13.4 cm y aumentó el rendimiento de chancado en 10.2 % y de molienda en 7.6 % `[V2-02-2 p3-4, 12-14; V1-04M p29-33]`.

---

## 2. Glosario español / inglés

Formato: **español / English** — definición simple. Sin marca = definido en el material del curso (fuente entre corchetes); **[GENERAL]** = añadido por el redactor.

### 2.1 Geometría del banco y de la malla

1. **Banco / Bench** — escalón horizontal de roca (con cara vertical o inclinada) del que se extrae material; su altura es H. `[P2-01 s5; P5 p6]`
2. **Cara libre / Free face** — superficie de roca expuesta hacia la que se mueve y se rompe la roca cuando detona un taladro; sin cara libre la voladura "no tiene a dónde ir". `[P4-C3 p26; P4-C6 p17]`
3. **Cresta / Crest** — borde superior del banco. `[P2-01 s5]`
4. **Pie del banco / Toe** — base de la cara libre; es donde la roca está más confinada y suele concentrarse la carga de fondo. `[P2-01 s5]`
5. **Burden (piedra) / Burden** — distancia del taladro a la cara libre, medida perpendicular a la fila. `[P2-01 s7; P2-C9 p3]`
6. **Burden efectivo / Effective burden** — distancia del taladro a la cara libre *más cercana en el instante en que detona*, según el orden de iniciación. En una malla equilátera el burden perforado es 0.87·S y con iniciación "V1" el efectivo es 0.29·S. `[P2-01 s7; P2-C9 p3]` **[DUDA 9]**
7. **Burden dinámico / Dynamic burden** — burden considerando el tiempo entre que se crea una cara libre nueva y se libera el bloque; burdenes dinámicos muy grandes "se congelan" y no se desplazan. `[P4-C3 p33-34]`
8. **Burden de alivio (ms/m) / Relief burden (timing)** — tiempo de retardo entre filas expresado por metro de burden; mide cuánto "alivio" da una fila antes de que detone la siguiente. `[P4-C5 p18-20, 30; P4-C8 p4-5]`
9. **Espaciamiento / Spacing (S)** — distancia entre taladros de una misma fila. `[P2-01 s5]`
10. **Malla cuadrada / rectangular / triangular (trabada) / Square, rectangular, staggered pattern** — disposición de taladros en el plano; en la triangular equilátera S = 1.15·B. `[P4-C4 p3; P4-C6 p10-13]`
11. **Relación S/B (SBR) / Spacing-to-burden ratio** — cociente espaciamiento/burden; el curso usa 1.0 (cuadrada), 1.15 (triangular) y tolera 1-2. `[P4-C4 p3; X-D1 K-R 1 fila 7]`
12. **Razón de esbeltez o rigidez del burden H/B / Stiffness ratio** — altura de banco entre burden; la tabla de Konya califica H/B = 1 pobre, 2 regular, 3 bueno, 4 excelente para fragmentación, proyección, vibración y onda aérea. `[P4-C3 p39; P4-C5 p3-5; X-D1 K-R 1 fila 28]`
13. **Sobreperforación (pasadura) / Subdrilling (J)** — tramo que se perfora por debajo del nivel de piso del banco para que la carga rompa bien el pie. `[P2-01 s5; P4-C4 p4]`
14. **Taco / Stemming (T)** — tramo superior del taladro que se rellena con material inerte (detritus o gravilla) para confinar los gases. `[P2-01 s8; P4-C4 p5]`
15. **Collar (boca) del taladro / Collar** — comienzo o parte no cargada del taladro. `[P2-01 s8]`
16. **Diámetro de taladro / Hole diameter (D, Ø)** — diámetro de la broca; en el curso se da en pulgadas (p. ej. 12¼", 10⅝", 9⅞") o mm. `[V2-01-1 p4]`
17. **Longitud de taladro / Hole length (L)** — altura de banco + sobreperforación (si es vertical). `[P4-C3 p26]`
18. **Inclinación y desviación de taladro / Hole angle, deviation (W)** — ángulo respecto a la vertical y error de posición del fondo respecto al diseño; ambos alteran burden y espaciamiento reales. `[P4-C6 p18-24]`
19. **Volumen (área) de influencia / Volume of influence** — B × S × H, la roca que "le toca" a cada taladro. `[P4-C7 p10; P5 p10]`
20. **Fila buffer, trim, pre-trim / Buffer, trim, pre-trim rows** — filas de amortiguación cercanas al talud, con malla y carga reducidas, que se disparan entre la producción y el precorte. `[V1-04M p7-9; V2-02-1 p22-25]`
21. **Precorte / Presplit** — fila de taladros de pequeño espaciamiento y baja carga lineal, disparada antes que la producción, que crea un plano de fractura que protege el talud y filtra vibración y gases. `[P4-C8 p10-13; V1-PRE p5-9]`
22. **Voladura amortiguada / Buffer (cushion) blast** — voladura de menor diámetro/malla que la de producción, junto a la pared, con más control y menor fragmentación. `[P4-C6 p45]`
23. **Sobrerotura (backbreak) y sobre-excavación (overbreak)** — roca quebrada más allá del límite de diseño (hacia atrás o lateralmente). `[P2-01 s8; P5 p69-72]`
24. **Pata (repie) / Toe problem, hard toe** — roca que queda sin romper en el pie del banco, típicamente por burden en el pie excesivo o poca sobreperforación. `[P4-C6 p26-28; P2-C5 p37-39]`
25. **Berma / Berm** — plataforma horizontal entre bancos que retiene caídas de roca. `[P1-S5 p13]`; su función de retener caídas es **[GENERAL]**.
26. **Bootleg / Restos de taladro** — fondo de un taladro que no rompió; se busca antes de la siguiente voladura. `[V2-02-1 p3, 20]`

### 2.2 Carga y medidas de consumo de explosivo

27. **Carga de fondo / Bottom charge (BCL)** — tramo inferior del taladro, con explosivo de mayor densidad/energía, pensado para romper el pie. `[P4-C6 p26-28; P5 p10]`
28. **Carga de columna / Column charge (CCL)** — resto de la columna explosiva sobre la de fondo, generalmente de menor energía/densidad. `[P5 p10]`
29. **Deck (carga en decks) / Decking** — explosivo colocado en el taladro **separado por taco intermedio**. `[P2-01 s8; P4-C3 p13]`
30. **Cámara de aire / Air deck** — espacio vacío deliberado dentro de la columna; baja la tensión máxima pero la sostiene más tiempo y en más volumen de roca. `[V2-03-2 p6-8; P4-C6 p29]`
31. **Separador (gravilla) / Spacer, stem plug** — accesorio o gravilla que separa decks o sostiene la carga sobre una cámara de aire. `[V1-04M p29; V2-02-1 p30]`
32. **Densidad lineal de carga (DCL) / Linear charge density** — kg de explosivo por metro de taladro: DCL = 0.507·D²·ρ (D en pulgadas, ρ en g/cc, resultado kg/m). `[P2-01 s17; V1-01P p4]`
33. **Densidad del explosivo / Explosive density** — g/cc; controla cuánta energía cabe en el taladro; si es < 1 flota en agua. `[V1-01P p3]`
34. **Densidad media, inicial y de copa / Average, initial, cup density** — de una emulsión gasificada: p. ej. media ≈ 1.26, inicial 1.30-1.31, "copa" (medida en un vaso de muestra) 1.16-1.18 g/cc. `[P2-01 s16]`
35. **Esponjamiento (de la carga) / Gassing swell** — aumento de altura de una columna de emulsión gasificada al ir gasificándose dentro del taladro (baja la densidad, sube la altura ocupada). Aparece como "Esponjamiento (m)" en las hojas de diseño de carga. `[X-DP Diseños de Carga filas 23, 25; P2-C7 p21-22]` **[GENERAL]** en cuanto a la interpretación.
36. **Factor de carga / Loading (charge) factor** — en el curso aparece tanto como **kg de explosivo por m³ de roca** `[P4-C7 p11; P4-C4 p6]` como **kg por tonelada** `[P2-01 s8; P4-C3 p28]` **[DUDA 12]**.
37. **Factor de potencia / Powder factor (PF)** — kg de explosivo por tonelada de roca: carga total / (densidad roca × volumen del taladro). `[P4-C7 p8-9; X-DP fila 34]`
38. **Factor de energía / Energy factor** — MJ de energía del explosivo por tonelada de roca (p. ej. 0.66 y 0.87 MJ/t en dos casos de la mina del curso). `[V1-04M p24; V2-02-1 p28]`
39. **Profundidad escalada de enterramiento (SD) / Scaled depth of burial** — distancia del centro de una carga de referencia (10 diámetros de carga bajo el taco) a la superficie, dividida por la raíz cúbica de su peso; indica si la energía "escapa" (proyección) o queda contenida. `[P4-C5 p6-7; X-DP SD Frank]`
40. **Carga máxima instantánea (MIC) / Maximum instantaneous charge** — kg que detonan en el mismo retardo; es el peso que entra en las leyes de vibración. `[P4-C6 p39 (voladura de taladro único); P5 p75]`

### 2.3 Explosivos, energía y propiedades

41. **ANFO** — nitrato de amonio poroso + petróleo diésel (≈ 94/6) balanceado en oxígeno; barato, sin resistencia al agua. `[P2-C34 s30]`
42. **ANFO pesado (Heavy ANFO, HA) / Heavy ANFO** — mezcla de ANFO con emulsión; la emulsión llena los huecos entre prills, sube la densidad y da resistencia al agua. Ejemplos: AP-73 = 70 % emulsión + 30 % ANFO `[P2-C34 s20, 36-37]`; el Excel modela el HA-46 como 40 % emulsión + 60 % ANFO `[X-DP Cálculo ABS Y AWS L30]`.
43. **Emulsión matriz / Emulsion matrix** — mezcla agua-en-aceite de nitrato de amonio, densidad ≈ 1.40-1.45 g/cc, **no detonable** por sí sola (oxidante ONU 5.1) hasta sensibilizarla. `[V1-01E p28, 31]`
44. **Emulsión gasificada / Gassed emulsion** — emulsión a la que se le baja la densidad con burbujas químicas (nitrito de sodio) para hacerla sensible; la densidad final se alcanza en minutos a decenas de minutos. `[P2-C34 s14-15; P2-C7 p18-21]`
45. **Hidrogel (watergel, slurry) / Slurry** — explosivo de fase acuosa continua con aceite disperso; buena resistencia al agua. `[V1-01E p18]`
46. **Dinamita / Dynamite** — explosivo sensibilizado con nitroglicerina/nitroglicol; hoy sobre todo en diámetros pequeños. `[V1-01E p19-20]`
47. **Agente de voladura / Blasting agent** — explosivo que por diseño no detona con un detonador común y necesita cebo (ANFO, emulsiones, anfos pesados); la emulsión matriz es "insensible al fulminante". `[V1-01E p28; P5 p14]`; el criterio exacto del detonador N° 8 es **[GENERAL]**.
48. **Booster / Primer (cebo, prima)** — cartucho de alta presión de detonación (pentolita) que recibe al detonador y **inicia** a la columna. "Cebo/primer" = booster + detonador. `[P2-01 s8; P4-C2 p14-15]`
49. **Detonador / Detonator (fulminante, cap)** — cápsula con explosivos primarios (azida de plomo) + carga base (PETN) que inicia al booster. `[P4-C1 p14; P5 p45]`
50. **Detonación vs. deflagración / Detonation vs. deflagration** — la detonación se autosostiene con onda supersónica; la deflagración es una combustión rápida sin onda de choque (explosivo que "solo se quema"). `[P2-01 s14; P5 p82]` **[DUDA 1]**
51. **Velocidad de detonación (VOD) / Velocity of detonation** — velocidad con que avanza la onda de detonación por la columna (m/s); depende de composición, diámetro, confinamiento y densidad. `[P2-01 s21; V1-01P p8]`
52. **Presión de detonación (PD) / Detonation pressure** — presión en el frente de reacción; PD ≈ 0.25·ρ·VOD². `[P5 p24; V1-01P p13]` **[DUDA 2]**
53. **Presión de taladro (borehole pressure, PB)** — presión que los gases ejercen sobre la pared del taladro; ≈ 50 % de PD (rango 30-70 %). `[V1-01P p13; P2-C9 p18]`
54. **Diámetro crítico / Critical diameter** — diámetro mínimo de carga cilíndrica que aún detona de forma estable; por debajo la VOD cae o se apaga. `[P2-01 s20; V1-01E p32]`
55. **Sensibilidad / Sensitivity y simpatía / Sympathetic detonation** — facilidad con que un explosivo reacciona a un iniciador; y capacidad de transmitir la detonación a la carga vecina. `[P2-C9 p19-21; P5 p30]`
56. **Resistencia al agua / Water resistance** — capacidad de detonar después de estar expuesto al agua: nula (ANFO), buena (hidrogeles), excelente (emulsiones). `[P2-01 s19]`
57. **Balance de oxígeno / Oxygen balance** — oxígeno sobrante o faltante para oxidar completamente el combustible; ≠ 0 produce CO o NOx. `[P2-C9 p3; P5 p32]`
58. **Gases nitrosos, humos naranja / Nitrous fumes, orange fumes (NOx)** — gas tóxico de color ocre/anaranjado por exceso de oxígeno o mala reacción. `[V1-01P p10; P2-C34 s21]`
59. **Potencia absoluta en peso / volumen (AWS, ABS) / Absolute weight (bulk) strength** — energía del explosivo por gramo (cal/g = kcal/kg) o por cm³ (cal/cm³ = AWS × densidad). `[V1-01E p17; V2-04-1 p11, 16]`
60. **Potencia relativa en peso / volumen (RWS, RBS) / Relative weight (bulk) strength** — AWS o ABS respecto al ANFO estándar (=100 %). `[P5 p21; V2-04-1 p16]` **[DUDA 3]**
61. **Energía efectiva y REE / Effective energy, relative effective energy** — parte de la energía liberada a presiones sobre ≈ 100 MPa (la útil para romper); REE = energía efectiva respecto al ANFO. `[P2-01 s25-28]`
62. **Energía de choque / Shock energy** — trabajo hidrodinámico de los gases al inicio de la detonación, estimado con PD y un "ratio de Gurney". `[V2-04-1 p8-9]`
63. **Presión de muerte (dead pressing) / Dynamic desensitization** — una carga que ha sido comprimida por la detonación de un taladro vecino (o por agua a presión) queda tan densa que ya no detona. `[P2-01 s8; P5 p73]`
64. **Camión fábrica (MMU) / Mobile manufacturing unit** — camión que fabrica y carga el explosivo a granel (ANFO, HA, emulsión gasificada) en el sitio. `[P2-C34 s38-39; P2-C7 p15-17]`

### 2.4 Iniciación y tiempos

65. **Detonador no eléctrico (tubo de choque) / Non-electric detonator, shock tube (NONEL, Exsanel)** — detonador cuyo retardo es pirotécnico y que recibe la señal por un tubo plástico de ≈ 3 mm con ≈ 0.015 g/m de HMX+Al, a ≈ 2000 m/s. `[P4-C1 p14-25; P5 p48]`
66. **Detonador electrónico / Electronic detonator** — el retardo lo fija un microchip (0-20 000 ms en pasos de 1 ms según el fabricante del curso); se programa y se prueba antes del disparo; sin dispersión pirotécnica. `[P5 p56-59; V2-03-1 p10-14]`
67. **Conector de superficie / Surface delay connector** — accesorio que pone retardo (17, 25, 42, 65 ms…) entre taladros o filas a lo largo de la línea troncal. `[P4-C2 p4-13]`
68. **Cordón detonante / Detonating cord** — cordón con núcleo de PETN (3-80 g/m, ≈ 7000 m/s) que inicia sin fulminante; sin control de retardo, ruidoso. `[P5 p41-43; P4-C1 p9-11]`
69. **Mecha de seguridad y mecha rápida / Safety fuse, igniter cord** — sistema pirotécnico antiguo de iniciación, hoy de uso limitado. `[P4-C1 p35-38, 54-56]`
70. **Retardo / Delay** — tiempo (ms) entre la señal y la detonación de un taladro; puede ser en el fondo del taladro (down-the-hole), entre taladros de una fila o entre filas. `[V2-03-1 p8]`
71. **Dispersión (precisión) / Scatter, timing accuracy** — variación aleatoria del tiempo real respecto al nominal (± % del retardo); alta en pirotécnicos (1-7 %), casi nula en electrónicos. `[V2-03-1 p8, 12-14; P5 p78]` **[DUDA 15]**
72. **Secuencia de iniciación (fila a fila, V, chevron, echelon, taladro a taladro, taladro único) / Firing sequence (row-by-row, V, echelon, hole-by-hole, single hole)** — orden espacial de los retardos. `[P4-C6 p35-40; P4-C7 p21-33]`
73. **Isotiempos (líneas de igual tiempo) / Isochrones (time contours)** — curvas que unen taladros que detonan en el mismo instante; deben ser lo más paralelas posible a la cara libre y perpendiculares a la pared que se quiere cuidar. `[P4-C5 p29; P4-C8 p3, 6]`
74. **Doble primado / Double priming** — dos boosters por taladro (fondo y superior) para asegurar la iniciación; sólo funciona si la diferencia de tiempo entre ambos detonadores es menor que el tiempo de la onda entre ellos. `[P2-C7 p10-12]`
75. **Tiro quedado / fallado, tiro cortado / Misfire, cut-off** — explosivo o detonador que no detonó según el plan; "cut-off" = corte de la señal antes de iniciar. `[P2-01 s8]`
76. **Blast box / logger / programador (DRB, DBD, Tagger)** — equipos que programan, prueban y disparan una red de detonadores electrónicos. `[P4-C2 p26-29; P4-C4 p36-43]`

### 2.5 Vibración, onda aérea y daño

77. **Velocidad pico de partícula (PPV) / Peak particle velocity** — máxima velocidad de vibración del terreno en un punto (mm/s); es el indicador principal de daño por vibración. `[P2-01 s7; V1-04M p24]`
78. **Campo cercano / Near field** — zona a menos de ≈ 5 longitudes de carga; la vibración exige ecuaciones complejas y hay riesgo de fracturas nuevas. `[P2-C9 p5; P2-01 s7]`
79. **Campo lejano / Far field** — zona donde vale la ley convencional de "peso de carga escalar"; el daño ocurre sobre todo por deslizamiento en discontinuidades existentes. `[P2-C9 p5]`
80. **Distancia escalar / Scaled distance** — distancia dividida por una raíz del peso de carga (típicamente raíz cuadrada, rango 0.3-0.5). `[P2-C9 p6]`
81. **Ondas P y S / P and S waves** — ondas de compresión y de corte; las dirigidas hacia la cara libre fragmentan, las que van hacia atrás producen vibración y daño. `[P5 p85]`
82. **Onda aérea (sobrepresión) / Airblast** — pulso de presión en el aire; aumenta si el taco es insuficiente o hay cordón detonante expuesto. `[P5 p5; V1-01E p11]`
83. **Proyección de rocas / Flyrock** — fragmentos lanzados fuera del área de exclusión; causas: taco corto, burden insuficiente, secuencia inconveniente, detonación por simpatía. `[P4-C5 p9]`
84. **Geófono / Geophone** — sensor que registra la vibración. `[V2-02-1 p35-36; X-D1 Dist. min ubic geof]`

### 2.6 Roca y fragmentación

85. **Resistencia a la compresión simple (UCS) / Unconfined compressive strength** — esfuerzo que rompe una probeta de roca (MPa); referencia principal de dureza. `[P2-C8 p3-4]`
86. **Resistencia a la tracción / Tensile strength (UTS, Rt)** — la roca es mucho más débil a tracción; la fragmentación por reflexión en la cara libre es un quiebre por tracción. `[P2-C5 p10]`
87. **Módulo de Young / Young's modulus (E)** — rigidez elástica de la roca. `[P2-C8 p3-5]`
88. **Coeficiente de Poisson / Poisson's ratio** — cuánto se deforma lateralmente la roca bajo carga; alto = plástica, absorbe energía. `[P2-C8 p3-5]`
89. **RQD / RMR / discontinuidades (diaclasas) / Joints** — índices de fracturamiento y calidad del macizo; las discontinuidades controlan por dónde se fuga el gas y qué tamaño de bloque queda. `[P2-C5 p34-39; P1-S3]`
90. **Índice de volabilidad (Blast Index) / Blastability index** — número que resume qué tan fácil es fragmentar una roca (usa UCS, densidad, estructuras); en el caso de estudio valía 45 y 59; el índice clásico de Hino (1959) es UCS/tracción. `[V1-04M p24; V2-02-1 p28; P1-S5 p21]`
91. **Factor de roca (A o F) / Rock factor** — parámetro empírico de la ecuación de Kuznetsov; sube con la dureza y el fracturamiento desfavorable. `[P5 p10; P1-S6 p12]`
92. **Perforabilidad / Drillability** — facilidad de perforar la roca (varía inversamente con UCS: 80 m/h a 100 MPa ≈ 32 m/h a 250 MPa). `[P1-S2 p77-78]`
93. **X50, P80 / Median size, 80 % passing size** — tamaño por el que pasa el 50 % o el 80 % en peso de la roca volada. `[P5 p10; P1-S6 p34]`
94. **Rosin-Rammler / curva granulométrica / Size distribution curve** — ecuación de la fracción acumulada pasante en función del tamaño. `[P1-S6 p11]`
95. **Índice de uniformidad n (Cunningham) / Uniformity index** — pendiente de la curva; n mayor = tamaños más homogéneos. `[P1-S6 p16-19]`
96. **Kuz-Ram** — modelo de fragmentación que combina Kuznetsov (X50), Rosin-Rammler (curva) y Cunningham (n). `[P1-S6 p8]`
97. **Sobretamaño / Oversize, bolones; finos / Fines** — fragmentos mayores que el tamaño máximo admisible de la pala/chancadora; y partículas muy pequeñas. `[V2-02-2; P4-C3 p8]`
98. **Conminución, Mine to Mill / Comminution** — reducción de tamaño desde la mina hasta la molienda; optimización conjunta. `[V2-02-2 p3-10]`
99. **Índice de trabajo de Bond (Wi/BWi) / Bond work index** — energía (kWh/t) para moler la roca; indicador de dureza para planta. `[V2-02-2 p11; P1-S6 p32-34]`

### 2.7 Perforación

100. **Broca tricónica / Tricone bit** — herramienta de rotación con tres conos de insertos de carburo; el método rotativo dominante en tajo abierto. `[V1-03P p10; V2-01-2 p7-13]`
101. **Pulldown (empuje) y RPM / Pulldown, rotary speed** — fuerza sobre la broca (kN o lb) y revoluciones por minuto; roca dura = mucho pulldown y bajas RPM; roca blanda = poco pulldown y altas RPM. `[P2-C8 p7-10, 22]`
102. **ROP / Penetration rate** — velocidad de penetración en m/h. `[P2-C8 p44-45]`
103. **Velocidad de barrido / Bailing (sweep) velocity** — velocidad del aire que sube por el espacio anular y evacúa los detritus (5000-7000 ft/min en material seco; 7000-9000 con agua). `[P2-C8 p12-14; V1-03P p14-15]`
104. **Costo total de perforación (TDC) / Total drilling cost** — TDC = B/M + CH/ROP (US$/m): precio de broca / metros de vida + costo horario / velocidad. `[P2-C8 p45; V1-03P p20]`
105. **Pit Viper, DTH, top hammer** — familias de perforadoras: rotativa de gran diámetro, martillo en fondo y martillo en cabeza. `[V2-01-1 p3-14]`

---

## 3. Fichas de concepto (30)

Cada ficha tiene exactamente los ocho campos pedidos. El **ejemplo numérico común** para las fichas de geometría y carga es el diseño "MEQ73 11 pulg" de `X-DP` (hoja *Diseños de Carga*, columna K): banco H = 15 m, sobreperforación J = 1 m, diámetro 11" (279.4 mm), espaciamiento S = 8.5 m, burden B = S/1.15 = 7.391 m, roca 2.69 t/m³, mezcla explosiva 1.38 g/cc inicial, carga de fondo 7.8 m (+ 0.9 m de esponjamiento por gasificación), taco 7.3 m. El cálculo completo está en la sección 5.

---

### F01 · Concepto (ES/EN): Altura de banco / Bench height (H)
- **En una frase:** es el espesor vertical de roca que se dispara de una vez; fija la longitud del taladro y, junto con el burden, qué tan "rígida" es la roca frente a la carga.
- **Fórmula o regla y unidades:** longitud de taladro L = H + J (m, taladro vertical). El material lo escribe también como L = H + 0.3·J `[P1-S5 p43]` (**[DUDA 6]**). Altura impuesta por el alcance de la pala y la dilución del mineral; para palas de cable, H = 10 + 0.57·(C − 6) (C = capacidad de la cuchara; lectura de la lámina) `[P1-S5 p38]`. Relaciones con el diámetro: Ø_máx = 15·H (Ø en mm, H en m) `[P5 p8]`; H entre 50 y 70 diámetros `[P5 p10]`; D(pulg) = H(pies)/10 (Atlas), D = H/40 roca dura, D = H/66 roca blanda (Hoek y Bray) `[P4-C3 p38]`.
- **Rangos típicos o reglas prácticas según las fuentes:** por seguridad la altura máxima aconsejada en minas y canteras es 15 m (20 m sólo en aplicaciones especiales como escollera) `[P1-S5 p17]`; para taladros de 65-150 mm, bancos de 8-10 m (Ø 65-90 mm) y 10-15 m (Ø 100-150 mm) `[P1-S5 p18, tabla 20.2]`; en el caso de mina del curso H = 15 m con Ø 12¼" `[V1-04M p30]`. Perforadoras: Pit Viper 271 hasta 17 m de una pasada y 32 m de profundidad máxima; Pit Viper 351 hasta 20 m y 41 m `[V2-01-1 p13-14]`.
- **Decisión que apoya al ingeniero:** cuántos bancos/dobles bancos volar, qué diámetro y perforadora son compatibles, y si el burden puede escogerse para mantener H/B en un rango sano (ver F09).
- **Qué pasa si se hace mal:** banco muy bajo respecto al burden → mala fragmentación, proyección, vibración y onda aérea (tabla de Konya) `[P4-C3 p39]`; banco muy alto → más desviación de taladros, que altera el burden real: en la lámina (banco de 20 m dibujado como 10 m + 10 m) un burden de diseño de 5 m queda en 4.3 m a media altura y en 3.0 m al pie `[P4-C6 p6]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** H = 15 m, J = 1 m → L = 16 m. Ø = 279.4 mm → H/Ø = 15 000/279.4 = 53.7 (dentro de 50-70). Chequeo de "Ø_máx = 15·H": 15 × 15 = 225 mm < 279.4 mm, es decir, la regla **no** se cumple aunque el diseño de la propia mina es válido → **[DUDA 8]**.
- **Fuente (archivo + página o lámina):** `P1-S5 p17-18, p43`; `P4-C3 p38-39`; `P5 p8, p10`; `V2-01-1 p13-14`; `X-DP Diseños de Carga!K10:K12`.

### F02 · Concepto (ES/EN): Diámetro de taladro / Hole diameter (Ø, D)
- **En una frase:** el ancho de la broca determina cuántos kg de explosivo caben por metro, el burden y el espaciamiento posibles y el costo de perforar.
- **Fórmula o regla y unidades:** área = π/4·D²; densidad lineal DCL = 0.507·D²·ρ (D pulg, ρ g/cc → kg/m); métrico: kg/m = ρ·D²(mm)/1275 `[X-DP SD Frank!G11]`. Burden como múltiplo del diámetro (F03).
- **Rangos típicos o reglas prácticas según las fuentes:** flota rotativa de gran diámetro 12¼" (P&H 320XPC, CAT MD6640, Bucyrus 49HR), 9⅞" (Sandvik D75KS), DTH 5" y top hammer 4½" `[V2-01-1 p4]`. "Pequeño diámetro" = 65-165 mm, y el costo de perforación por metro suele bajar al subir el diámetro `[P1-S5 p16]`. Brocas por UCS: muy agresivas < 100 MPa, agresivas 75-125, medias 100-290, duras > 300 `[V2-01-2 p10]`. Con el mismo factor de carga, un diámetro grande reparte peor la energía y da peor rendimiento que uno pequeño `[P4-C6 p8-9]`.
- **Decisión que apoya al ingeniero:** qué broca/perforadora usar y, por ende, qué mallas son físicamente posibles; equilibrio entre costo de perforación por tonelada (baja con el diámetro) y control de fragmentación (mejora con diámetro menor).
- **Qué pasa si se hace mal:** diámetro demasiado grande para el banco → concentración de energía, bloques entre taladros; demasiado pequeño → más taladros, más metros y más costo; ambos cambian el costo por tonelada (lámina de costo vs. diámetro) `[P4-C3 p14]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** con ρ = 1.38: 11" → 0.507 × 1.38 × 11² = 84.66 kg/m; 12¼" → 105.0 kg/m (`X-DP J17`). Relación (12.25/11)² = 1.24: el taladro grande lleva 24 % más kg por metro.
- **Fuente (archivo + página o lámina):** `V2-01-1 p4`; `V2-01-2 p10`; `P1-S5 p16, p18`; `P4-C3 p14`; `P4-C6 p8-9`; `X-DP Diseños de Carga!J17:M17`.

### F03 · Concepto (ES/EN): Burden (piedra) / Burden (B)
- **En una frase:** la distancia del taladro a la cara libre; el material lo llama "el parámetro más crítico" porque manda sobre la fragmentación, la proyección y la vibración.
- **Fórmula o regla y unidades:** hay varias escuelas (todas empíricas):
  - Andersen: B(pies) = √[Ø(pulg) · L(pies)].
  - Ash: B(pies) = Kb · Ø(pulg) / 12, con Kb = 20-40 según roca (blanda/media/dura) y densidad-potencia del explosivo (baja 0.8-0.9 g/cc: 30/25/20; media 1.0-1.2: 35/30/25; alta 1.2-1.6: 40/35/30).
  - Konya: B(pies) = 3.15 · Ø_e(pulg) · (ρ_e/ρ_r)^(1/3), con factores de corrección Kd (orientación de estratos: 1.18 hacia el corte, 0.95 hacia la cara, 1.00 otros) y Ks (fracturamiento: 1.30, 1.10, 0.95).
  - Langefors: B = (Ø/33)·√[P·s / (c·f·(E/B))] (Ø en mm, B en m; P = grado de compactación 1.0-1.6 kg/dm³, s = potencia relativa del explosivo, c = constante de roca 0.45-1.0, f = 1 en taladro vertical, E/B = S/B) `[P1-S5 p47]`; el Excel usa c = 0.3/0.4/0.5 según roca blanda/dura/muy dura y f = 1 / 0.9 / 0.85 según inclinación `[X-D1 Diseño Varios Autores!L35:L40]`.
  - Konya-Walter (segunda forma): B(pies) = (2·ρ_e/ρ_r + 1.5)·Ø_e(pulg)·Kd·Ks `[P1-S5 p56, p66]`.
  - López Jimeno: B = 0.76·Ø·F, con F = f_roca · f_explosivo (incluye densidades, VOD y velocidad sísmica Vp del macizo) `[P1-S5 p56]`.
  - Regla del diámetro: B = k·Ø con k ≈ 38-40 (dinamita/roca blanda) hasta 21-28 (ANFO), y B = 33-39 Ø según UCS (tabla 20.3, pequeño diámetro).
- **Rangos típicos o reglas prácticas según las fuentes:** B = 21 Ø (ANFO, roca muy dura) a 40 Ø (dinamita, roca blanda) `[P1-S5 p45; P5 p8]`. "El resultado debe operativizarse; un valor razonable está dentro del 110 % del valor de la teoría" `[P1-S5 p57]`. Maximizar la interacción entre taladros `[V1-04M p5]`. Hoja `Diseño Varios Autores` de `X-D1` compara ocho autores para Ø 10.625", H 15 m: 4.7-9.9 m, promedio ≈ 7.2 m.
- **Decisión que apoya al ingeniero:** el burden nominal de la malla; luego se reparte el espaciamiento y se ajusta el burden **efectivo** con la secuencia de tiempos (F21).
- **Qué pasa si se hace mal:** burden muy pequeño → exceso de energía, proyección de fragmentos, fragmentación fina; muy grande → resistencia excesiva, formación de cráter, más vibración, fragmentación gruesa `[P1-S5 p54]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** Ø = 11", L = 16 m (52.5 pies), ρ_e = 1.237, ρ_r = 2.69. Andersen: √(11 × 52.5) = 24.0 pies = **7.32 m**. Ash (Kb = 30): 30 × 11/12 = 27.5 pies = **8.38 m**. Konya: 3.15 × 11 × (1.237/2.69)^(1/3) = 26.7 pies = **8.15 m**. Diseño real: 7.39 m (= 8.5/1.15). **Ejemplo del curso ("Mina Esperanto", Ø 12¼", andesita 2.6, ANFO 0.78, VOD 4 700):** Ash (Kb = 25) = 7.8 m, Konya-Walter = 8.2 m → burden operativo 8 m `[P1-S5 p65-66]` (sección 5, ejemplo A).
- **Fuente (archivo + página o lámina):** `P1-S5 p43-49, p54-57`; `P5 p8`; `V1-04M p5`; `X-D1 Diseño Varios Autores!C53, C57, C65, C84, C89, C93`.

### F04 · Concepto (ES/EN): Espaciamiento y tipo de malla / Spacing and drilling pattern (S, S/B)
- **En una frase:** la distancia entre taladros de la misma fila y la forma de la malla; controla qué tan bien se traslapan las zonas de fractura.
- **Fórmula o regla y unidades:** malla cuadrada S = B; triangular equilátera (al tresbolillo) S = 1.15·B = 2B/√3; rectangular S = 1.3-1.5·B; para banco bajo (H/B < 4) con retardo S = (H + 7B)/8; para banco alto (H/B ≥ 4) S = 1.4·B; precorte/buffer S = 0.5-0.8·B `[P1-S5 p59]`. Relación S/B = "SBR".
- **Rangos típicos o reglas prácticas según las fuentes:** S = (1 a 2)·B (común) `[P4-C4 p3]`; "la relación S/B nunca debe exceder 2" y refleja la malla de perforación, no la de iniciación `[P1-S6 p18]`; el mejor esquema es el triángulo equilátero por su distribución de energía `[P1-S5 p42]`.
- **Decisión que apoya al ingeniero:** cuadrada o trabada, y si se acepta una malla más ancha en un sentido según la secuencia.
- **Qué pasa si se hace mal:** S muy pequeño → exceso de trituración y cráteres en la boca; S muy grande → fragmentación inadecuada, lomos al pie y nueva cara muy irregular `[P1-S5 p59]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** B = 7.391 m → S = 1.15 × 7.391 = 8.50 m. Chequeo Konya: H/B = 15/7.391 = 2.03 < 4 → S = (15 + 7 × 7.391)/8 = 8.34 m (≈ 8.5 ✓).
- **Fuente (archivo + página o lámina):** `P1-S5 p42, p59`; `P4-C4 p3`; `P1-S6 p18`; `X-DP Diseños de Carga!K8:K9`.

### F05 · Concepto (ES/EN): Sobreperforación (pasadura) / Subdrilling (J)
- **En una frase:** metros que se perforan por debajo del piso para que el pie del banco se rompa al nivel del piso y quede plano.
- **Fórmula o regla y unidades:** J = 0.2-0.5·B (Atlas), J = 0.3·B (Konya), J = 0.2-0.3·B (Hoek y Bray) `[P4-C4 p4]`; J = 0.1·H `[P5 p8]`; J = 0.3·B `[P1-S5 p58]`; J = 10-12·Ø según UCS (tabla 20.3, pequeño diámetro) `[P1-S5 p18]`.
- **Rangos típicos o reglas prácticas según las fuentes:** las reglas dan resultados muy distintos (ver ejemplo); en los Excel del curso se usa J = 1 m con banco de 15 m `[X-DP Diseños de Carga!J11]`; en X-D1 aparecen J = 1.5 y 2 m `[X-D1 K-R 1!C20:D20]` y J = 2 m en `Diseño Varios Autores!J12`.
- **Decisión que apoya al ingeniero:** longitud total del taladro y carga de fondo debajo del piso.
- **Qué pasa si se hace mal:** muy pequeña → lomos y no se logra el corte al nivel de piso; muy grande → daño en la cresta del banco inferior, sobre-excavación y mayor costo de perforación `[P1-S5 p58]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** B = 7.391, H = 15, Ø = 279.4 mm: 0.3·B = 2.22 m; 0.1·H = 1.50 m; 12·Ø = 3.35 m (regla de pequeño diámetro, no extrapolable); el diseño usa 1.0 m ≈ 0.135·B → conviene que el ingeniero valide **[DUDA 7]**.
- **Fuente (archivo + página o lámina):** `P4-C4 p4`; `P5 p8`; `P1-S5 p18, p58`; `X-DP Diseños de Carga!K11`.

### F06 · Concepto (ES/EN): Taco / Stemming (T)
- **En una frase:** el tramo superior del taladro sin explosivo, relleno de material inerte, que retiene los gases el tiempo suficiente para que trabajen sobre la roca en lugar de escaparse por la boca.
- **Fórmula o regla y unidades:** T = 0.7-1.3·B (Atlas), T = 15-25·Ø (común) `[P4-C4 p5]`; T = 0.7·B con Lt/B entre 70 y 100 % `[P5 p8, p10; P1-S5 p58]`; T = 30-35·Ø (tabla del manual) `[P5 p8]`; tamaño del material 0.05·Ø (Konya) a 0.15·Ø (Atlas) `[P4-C4 p5]`. Hoja `Taco` de `X-D1`: T = 0.508·z·Ø(pulg)·f_d / UCS^0.31 · (Pot_peso% · ρ_e)^(1/3), con z = 1 (sin riesgo), 1.2 (cerca de estructuras), 1.5 (edificios públicos) y f_d = 1 si se usa el detritus de la perforación, 25/30 en otro caso.
- **Rangos típicos o reglas prácticas según las fuentes:** ver reglas; también el criterio SD (F12) para que la energía quede "controlada". Ver también el efecto de la posición de la carga superior sobre SD en F12.
- **Decisión que apoya al ingeniero:** longitud y material del taco; posición de la carga superior o de los decks (F10).
- **Qué pasa si se hace mal:** muy corto → fuga de gases, proyección de rocas, onda aérea y cráter; muy largo → fragmentación pobre en la parte alta (bolones) y más fracturación en el fondo `[P1-S5 p58; P4-C6 p20]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** B = 7.391 m, Ø = 279.4 mm: 0.7·B = 5.17 m; 1.0·B = 7.39 m; 15-25·Ø = 4.19-6.98 m; 30-35·Ø = 8.38-9.78 m; el diseño usa 7.30 m (T/B = 0.99, T/Ø = 26). Fórmula de `X-D1 Taco` con Ø 7.875", UCS 100 MPa, ρ 0.9, potencia 100 %, z = 1, sin detritus: 3.58 m (T/Ø = 18); con z = 1.5 sube a 5.37 m.
- **Fuente (archivo + página o lámina):** `P4-C4 p5`; `P5 p8, p10`; `P1-S5 p41, p58`; `P4-C6 p20`; `X-D1 Taco!C12`; `X-DP Diseños de Carga!K19`.

### F07 · Concepto (ES/EN): Densidad lineal y carga por taladro / Linear charge density and charge per hole (DCL, Q)
- **En una frase:** cuántos kilogramos de explosivo hay en cada metro de columna y, multiplicando por la longitud cargada, en todo el taladro.
- **Fórmula o regla y unidades:** DCL[kg/m] = 0.507·D²[pulg]·ρ[g/cc] = (π/4)·D²·ρ; Q[kg] = Σ (DCL_tramo × longitud_tramo). Con gasificación: la densidad media en el taladro es ρ_med = Q / [(L_carga + L_esponjamiento)·0.507·D²] (se ve en `X-DP J16`).
- **Rangos típicos o reglas prácticas según las fuentes:** 0.507 (o 0.5067 en Excel) es π/4 con unidades convertidas. Ejemplos del curso: taladro 6½" en 4 m: ANFO 68.5 kg, HA-37 85.7 kg, HA-64 113.1 kg `[V1-01P p3]`; HA-64 en 9⅞": 65 kg/m `[V1-01P p4]`; HA-64 en 12¼" y ρ = 1.31: 99.7 kg/m `[P2-01 s17]`. Densidad media de la emulsión gasificada ≈ 1.26 g/cc `[P2-01 s16]`.
- **Decisión que apoya al ingeniero:** cuánto explosivo pedir por taladro, qué longitud de carga cabe con el taco elegido y qué tan lejos está el resultado del factor de potencia objetivo.
- **Qué pasa si se hace mal:** usar la densidad de fábrica en lugar de la real del camión falsea todos los kg; el material insiste en medir densidad antes de cargar y no cargar sin ese dato `[P2-C7 p15-19]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** Ø = 11", ρ₀ = 1.38 → DCL = 0.507 × 1.38 × 121 = **84.66 kg/m**; carga de fondo 7.8 m → **Q = 660.34 kg**; ρ_med = 660.34 / [(7.8 + 0.9) × 0.507 × 121] = **1.237 g/cc** (ρ₀/ρ_med = 1.116).
- **Fuente (archivo + página o lámina):** `P2-01 s17`; `V1-01P p3-4`; `P4-C7 p10`; `X-DP Diseños de Carga!K16:K18`.

### F08 · Concepto (ES/EN): Factor de carga, de potencia y de energía / Loading factor, powder factor, energy factor
- **En una frase:** cuánto explosivo (o energía) se gasta por unidad de roca; es la métrica más usada para comparar diseños y costos, aunque por sí sola es engañosa.
- **Fórmula o regla y unidades:** factor de carga FC = Q/(B·S·H) [kg/m³] `[P4-C7 p11]`; factor de potencia PF = Q/(B·S·H·ρ_r) [kg/t] `[P4-C7 p9]`; factor de energía FE = Q·(energía en MJ/kg)/(toneladas) [MJ/t]. En Excel y otras láminas se expresa también en g/t. Para precorte se usa kg/m² `[P1-S5 p60]`.
- **Rangos típicos o reglas prácticas según las fuentes:** FC (kg/m³): carbón 0.2, esquisto 0.3, arenisca 0.5, basalto fracturado 0.4, granito resistente 0.8 `[P4-C4 p6]`. Caso de mina de roca dura: PF 0.37 kg/t (malla 7×8) → 0.58 kg/t (malla 5.5×6.5) `[V1-04M p30]`; en otro proyecto PF 0.18-0.24 kg/t y FE 0.66-0.87 MJ/t `[V1-04M p24; V2-02-1 p28]`. En los Excel el PF va de 0.26 a 0.50 kg/t `[X-DP Diseños de Carga!J34:M34]`.
- **Decisión que apoya al ingeniero:** nivel global de energía del diseño y, con la malla, cuánto explosivo se puede reducir sin perder fragmentación.
- **Qué pasa si se hace mal:** demasiado bajo → tronadura deficiente; demasiado alto → más gasto y riesgo de seguridad `[P1-S5 p60]`. El propio curso advierte que el factor de carga es ambiguo, ignora las propiedades dinámicas del macizo y no considera la secuencia ni el tiempo `[P4-C4 p7]`; la lámina muestra dos mallas (2.5 × 3.0 m con Fortis y 3.1 × 3.6 m con ANFO) con el mismo FC = 0.6 kg/m³ pero factor de energía de 100 % y 115 % `[P4-C6 p25]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** volumen = 7.391 × 8.5 × 15 = 942.4 m³; toneladas = 942.4 × 2.69 = 2 535 t; FC = 660.34/942.4 = **0.701 kg/m³**; PF = 660.34/2 535 = **0.260 kg/t**; energía = 660.34 × 3.036 MJ/kg = 2 005 MJ → FE = **0.79 MJ/t** (3.036 MJ/kg = 726 kcal/kg del MEQ-73).
- **Fuente (archivo + página o lámina):** `P4-C7 p8-11`; `P4-C4 p6-7`; `P4-C6 p25`; `P1-S5 p60`; `V1-04M p24, p30`; `X-DP Diseños de Carga!K33:K34`; `X-DP Cálculo ABS Y AWS!H18`.

### F09 · Concepto (ES/EN): Rigidez del burden (razón de esbeltez) / Stiffness ratio (H/B)
- **En una frase:** cuántas veces cabe el burden en la altura del banco; dicta qué tan bien se reparte la energía y cuánto puede ceder la roca.
- **Fórmula o regla y unidades:** I = H/B (adimensional). Tabla de Konya: I = 1 pobre, 2 regular, 3 bueno, 4 excelente (para fragmentación, proyección, vibración y onda aérea) `[P4-C3 p39]`. Ver F04 para los espaciamientos que se derivan de I.
- **Rangos típicos o reglas prácticas según las fuentes:** el "índice de rigidez" del burden mala/aceptable/buena distribución de energía ilustrado en `[P4-C5 p3-5]` (mismo factor de energía, distinto reparto). En las hojas de X-D1 (Kuz-Ram) aparecen valores de 1.1 a 2.2 `[X-D1 K-R 1 fila 28]`.
- **Decisión que apoya al ingeniero:** elegir malla más apretada o diámetro menor cuando H/B es bajo; decidir si conviene doble banco.
- **Qué pasa si se hace mal:** I ≤ 2 → mala distribución de energía, más proyección y vibración por energía atrapada en un burden rígido.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** H/B = 15/7.391 = 2.03 ("regular"). Con la malla 5.5 × 6.5 del caso de mina (B = 6.5/1.15 = 5.65 m) I = 2.65.
- **Fuente (archivo + página o lámina):** `P4-C3 p39`; `P4-C5 p3-5`; `P1-S5 p59`; `X-D1 K-R 1`.

### F10 · Concepto (ES/EN): Configuración de la carga: fondo, columna y decks / Charge configuration: bottom, column, decks
- **En una frase:** cómo se reparte la energía a lo largo del taladro (más energía abajo donde hay más confinamiento, menos arriba, con separadores o aire para ahorrar y mejorar la distribución).
- **Fórmula o regla y unidades:** longitudes que suman el taladro: L = T + Σ carga_i + Σ deck_i + Σ aire_i (+ esponjamientos). Q = Σ DCL_i × longitud_i. El taco final se calcula por diferencia (`X-DP K19`).
- **Rangos típicos o reglas prácticas según las fuentes:** longitud de la carga de fondo l_f = 30·Ø (roca blanda < 70 MPa), 35·Ø (media), 40·Ø (dura) y 46·Ø (muy dura > 180 MPa), tabla 20.4 de pequeño diámetro `[P1-S5 p72]`; finalidad: optimizar el uso de explosivo (menor costo), mejorar distribución de energía y fragmentación y bajar el PF manteniendo la malla `[V2-03-2 p3]`. Carga de fondo densa (p. ej. HA-64/Quantex) y columna liviana; en ejemplos del curso la carga de fondo mide 7.8-10.4 m en taladros de 15-17 m `[X-DP; X-D1 Fragmentacion!E6]`. El primer taladro del banco a disparar y el tipo de carga de pie deben evitar "excesiva pata" `[P4-C6 p26-28]`.
- **Decisión que apoya al ingeniero:** qué producto va en el fondo y cuál en la columna, si hay deck o cámara de aire y dónde se coloca el taco intermedio.
- **Qué pasa si se hace mal:** fondo insuficiente → pata dura; carga alta excesiva → proyección y sobre-rotura; decks mal ubicados → cortes o simpatía entre cargas.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** `X-DP`, diseño "L" (Ø 11", 16 m): fondo 4.9 m (+ 0.45 esponjamiento), deck 1.3 m, carga superior 3.9 m (+ 0.45), taco 5.0 m (16 − 4.9 − 0.45 − 1.3 − 3.9 − 0.45 = 5.0 ✓); kg = 84.66 × (4.9 + 3.9) = 745.0; PF = 0.377 kg/t; costo 0.270 US$/t. Diseño "M": aire inferior 1.0 m, fondo 4.9, superior 3.9 (+ 0.9), taco 5.3 m.
- **Fuente (archivo + página o lámina):** `V2-03-2 p3-5`; `P4-C3 p13`; `P4-C6 p26-29`; `X-DP Diseños de Carga!J19:M27`.

### F11 · Concepto (ES/EN): Cámara de aire / Air deck
- **En una frase:** un tramo vacío dentro de la columna que reduce la tensión máxima sobre la roca pero la mantiene más tiempo y sobre más volumen.
- **Fórmula o regla y unidades:** no hay fórmula cerrada en el material; se define por su longitud y su posición (inferior, intermedia o superior) y suele requerir un separador (gravilla, air-bag) `[V1-04M p29-30; V2-02-1 p30]`.
- **Rangos típicos o reglas prácticas según las fuentes:** en el escenario recomendado de un caso de mina, el taladro de amortiguamiento lleva taco 4.5 m + cámara de aire 7.5 m + 4 m de HA-64; la fila A, taco 5.9 m + 2.1 m HA-64 + 1.7 m de detritus + 4.3 m HA-64; y producción, taco 7.0 m + 10 m de HA-73G `[V2-02-1 p33]`; en `X-DP` (diseño M) hay 1.0 m de aire en el fondo `[X-DP M20]`.
- **Decisión que apoya al ingeniero:** cuándo sustituir carga por aire para bajar PF y vibración (cerca de contornos, buffer) sin perder fragmentación.
- **Qué pasa si se hace mal:** aire mal dimensionado → zonas de debilidad, fractura horizontal y pérdida de energía útil en el fondo; flujo de detonación hacia el fondo `[V2-03-2 p6-7]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** longitud sin explosivo = 1.0 m de aire → ahorro de carga = 84.66 kg/m × 1.0 m = 84.7 kg (0.033 kg/t). (Cálculo de ahorro; el efecto en fragmentación no es calculable con las fórmulas del material.)
- **Fuente (archivo + página o lámina):** `V2-03-2 p6-9`; `V2-02-1 p30-33`; `P4-C6 p29-30`; `X-DP Diseños de Carga!M20`.

### F12 · Concepto (ES/EN): Profundidad escalada de enterramiento (SD) / Scaled depth of burial (Chiappetta)
- **En una frase:** un número que compara el taco con el tamaño de la carga superior y anticipa si la energía escapa por arriba (proyección, ruido) o queda contenida (fragmentación gruesa).
- **Fórmula o regla y unidades:** SD = D / W^(1/3), donde W = kg de explosivo en 10 diámetros de carga bajo el taco = ρ·Ø³/127 500 (Ø en mm, ρ en g/cc, W en kg) y D = taco + 5 diámetros (½ de 10Ø). Unidades m/kg^(1/3) (métrico) o ft/lb^(1/3). Diseño inverso: W = (D/SD)³ y taco = SD·W^(1/3) − Ø/200.
- **Rangos típicos o reglas prácticas según las fuentes:** SD 0-0.60 y 0.64-0.88: energía incontrolada (proyección violenta, onda aérea, polvo, fragmentación muy fina, cráter); 0.92-1.40: energía controlada (buena fragmentación, máximo volumen roto en el collar, buen "heave"); 1.44-1.80: muy controlada (fragmentación mayor, menos desplazamiento, sin proyección); 1.84-2.40 y > 2.40: efectos mínimos en superficie, zona sin rotura `[P4-C5 p7]`. Equivalencias imperiales: 0-1.5, 1.6-2.2, 2.3-3.5, 3.6-4.5, 4.6-6.0, > 6.0 ft/lb^(1/3).
- **Decisión que apoya al ingeniero:** longitud del taco (y del deck superior) coherente con el riesgo de proyección del sitio.
- **Qué pasa si se hace mal:** SD bajo → proyección y airblast; SD alto → sobretamaño y pila menos esponjada.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** ejemplo de la lámina: Ø 230 mm, ρ 1.15, taco 5.0 m → 47.1 kg/m, W = 2.3 m × 47.1 = 108 kg, D = 5.0 + 1.15 = 6.15 m, SD = 6.15/108^(1/3) = **1.3** `[P4-C5 p6]`. Diseño de `X-DP` (K): ρ_med 1.237, Ø 279.4 → 75.75 kg/m, W = 211.65 kg, D = 7.3 + 1.397 = 8.697 m → SD = **1.46** ("muy controlada"; el Excel usa el exponente 0.333 y da 1.462; con 1/3 exacto: 1.459). Para diseños con decks (L y M) ver **[DUDA 4]**. Hoja `X-TACO`: Ø 12.25", taco 6.5 m, Q73G ρ 1.25 → SD = 1.209.
- **Fuente (archivo + página o lámina):** `P4-C5 p6-7`; `X-DP SD Frank!C11:G16, F54:G62`; `X-TACO calculos!G9:H24`.

### F13 · Concepto (ES/EN): Emulsión gasificada, densidad y esponjamiento / Gassed emulsion density and swelling
- **En una frase:** una emulsión matriz no detona hasta que se le baja la densidad con burbujas químicas; esa gasificación ocurre dentro del taladro y cambia la altura ocupada y la energía por metro.
- **Fórmula o regla y unidades:** coeficiente de gasificación = ρ_inicial / ρ_final ≈ 1.0-1.10; densidad final tras 4-5 min o hasta 20 min `[P2-C34 s15]`. Solución gasificadora: nitrito de sodio al 10 % (p. ej. 10 kg de NaNO₂ en 90 kg de agua = 100 kg de solución); control con densímetro (10 %: 1.06-1.07 g/cc; 12 %: 1.08-1.09; 15 %: 1.10-1.11) `[P2-C7 p18-19]`.
- **Rangos típicos o reglas prácticas según las fuentes:** tiempo máximo de la columna en el taladro: 72 h con agua, 96 h en seco (después la VOD, la energía y los humos naranja ya no están garantizados) `[P2-C34 s21]`. Ejemplo de proyecto: Fortis Advantage 65/35 gasificado con densidad inicial 1.300 y final 1.155 g/cc (VOD 5 883 m/s); Fortis Mex 64/40 con 1.310 g/cc (VOD 4 855 m/s) `[P2-C7 p22]`. Factores que influyen: formulación de la emulsión, su temperatura, pH del agua, concentración de la solución, calibración del camión y personal `[P2-C7 p23]`.
- **Decisión que apoya al ingeniero:** longitud inicial que hay que cargar para que, tras gasificar, la columna termine a la altura del diseño; ventana de tiempo entre carguío y disparo.
- **Qué pasa si se hace mal:** demasiado tiempo en el taladro o mala solución → densidad y VOD fuera de rango, humos naranja; sub-gasificación → columna más corta y más densa de lo diseñado.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** `X-DP K`: ρ₀ = 1.38, carga inicial 7.8 m → tras esponjar 0.9 m ocupa 8.7 m con ρ_med = 1.237 (ρ₀/ρ_med = 1.116, algo más que 1.10). `X-QTX F3`: Quantex 12¼", 8.3 m + 1.2 m de esponjamiento, ρ = 1.4 → 905 kg vs. HA-55 (11", 10.5 m, 1.28) 824.5 kg.
- **Fuente (archivo + página o lámina):** `P2-C34 s10-17, s21`; `P2-C7 p18-23`; `X-DP Diseños de Carga!K16, K22:K23`; `X-QTX F3 (PRUEBA)!C9:J23`.

### F14 · Concepto (ES/EN): Velocidad de detonación y diámetro crítico / Velocity of detonation (VOD) and critical diameter
- **En una frase:** qué tan rápido avanza la detonación por la columna y el diámetro mínimo bajo el cual ya no avanza de forma estable.
- **Fórmula o regla y unidades:** VOD en m/s (o km/s); medición: método D'Autriche (con cordón detonante de VOD conocida: VOD = V_cordón · d / 2a), cable resistivo en el taladro, registradores tipo Shottrack `[P2-C9 p14-15; V1-01P p9; P5 p23]`. Diámetro crítico en mm/pulg.
- **Rangos típicos o reglas prácticas según las fuentes:** la VOD fluctúa 2 438-7 925 m/s `[V1-01P p8]`; ANFO 3 800-4 500, HA-28 4 400-4 800, HA-64 4 500-4 800, MEQ-73 4 800-5 200, MEQ-82 5 300-5 900, Slurrex LC 5 700-5 900 m/s `[X-DP Cálculo ABS Y AWS!I11:J22]`. Diámetro crítico: HA-28 2.0", HA-37 2.5", HA-46 3.0", HA-55 3.5-4.0", HA-64 5.0", emulsión gasificada 3.5", AP-73 4.0" `[V1-01E p32]`; productos Advantage 3.5-5.9" `[P2-01 s20]`. Roca dura → VOD alta; roca blanda → menor VOD y más energía de gas `[P4-C6 p4; V1-01P p8]`. Diámetros < 51 mm: preferir emulsión o dinamita sobre ANFO `[V1-02S p13]`.
- **Decisión que apoya al ingeniero:** qué producto puede usarse en el diámetro de broca disponible y cuál se acopla mejor a la dureza de la roca.
- **Qué pasa si se hace mal:** carga bajo el diámetro crítico → falla de propagación (tiro quedado) o deflagración; una VOD menor que la nominal baja la presión de detonación con el cuadrado.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** el explosivo baja de 4 400 a 4 200 m/s por diámetro menor: VOD −4.5 %, presión de detonación (4 200/4 400)² = 91.1 % (−8.9 %) `[P2-01 s23]`.
- **Fuente (archivo + página o lámina):** `P2-01 s20-23`; `V1-01P p7-9`; `V1-01E p32`; `P4-C6 p4`; `X-DP Cálculo ABS Y AWS!I11:J22`.

### F15 · Concepto (ES/EN): Presión de detonación y presión de taladro / Detonation pressure and borehole pressure (PD, PB)
- **En una frase:** la presión que crea la onda de detonación (útil para elegir el iniciador y medir la agresividad del explosivo) y la presión que los gases ejercen sobre la pared (la que realmente fractura la roca).
- **Fórmula o regla y unidades:** PD = 0.25·ρ·VOD² (ρ en g/cc, VOD en m/s → PD = 0.25·ρ·VOD²·10⁻⁶ en GPa) `[P5 p24; V1-01P p13]`; PB ≈ 0.5·PD (rango 30-70 %) `[V1-01P p13; P2-C9 p18]`. Otra forma (Cooper): PD = ρ·VOD²/(γ+1) con γ = 2 (ANFO) a 3.2 (emulsión pura) `[V2-04-1 p9]`.
- **Rangos típicos o reglas prácticas según las fuentes:** PD del booster mucho mayor que la del ANFO; el gráfico de iniciación del ANFO relaciona la presión del cebo (240, 135, 50, 40, 7 kbar) con la VOD de régimen a distancia del punto de iniciación `[P2-C34 s33-34]`. Para precorte, PB ≈ UCS de la roca (F26).
- **Decisión que apoya al ingeniero:** cebo/booster adecuado por producto, y si la carga daña o no la pared del taladro.
- **Qué pasa si se hace mal:** iniciador de baja PD → la columna de ANFO tarda en llegar a régimen o no llega; PB por encima de la resistencia dinámica en la pared → triturado inútil que roba energía de tensión `[P1-S4 p9]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** ρ_med = 1.237, VOD = 5 400: PD = 0.25 × 1.237 × 5 400² × 10⁻⁶ = **9.02 GPa** (90.2 kbar); PB ≈ 50 % = **4.51 GPa** (45.1 kbar). La hoja `PB` de `X-DP` calcula ρ·VOD²/(8·10⁵) = 45.1 kbar (correcto) pero luego divide por 10 y lo rotula "MPa" (4.51): en realidad son GPa → **[DUDA 2]**.
- **Fuente (archivo + página o lámina):** `P5 p24`; `V1-01P p12-13`; `P2-C9 p18`; `P2-01 s23`; `V2-04-1 p9`; `X-DP PB!C20:D23`.

### F16 · Concepto (ES/EN): Energía y potencia relativa del explosivo / Explosive energy and relative strength (AWS, ABS, RWS, RBS, REE)
- **En una frase:** cuánta energía entrega un explosivo por kilogramo o por litro, y cuánto de eso trabaja realmente sobre la roca, siempre comparado con el ANFO.
- **Fórmula o regla y unidades:** AWS = energía absoluta por peso (cal/g = kcal/kg; 1 kcal = 4.184 kJ); ABS = AWS × ρ (cal/cm³); RWS = AWS/AWS_ANFO; RBS = ABS/ABS_ANFO = RWS × ρ/ρ_ANFO `[V2-04-1 p11, 16; P5 p21]`. Criterio de Langefors: PR_peso = (1/6)(V/V₀) + (5/6)(Q/Q₀), con Q el calor liberado (kcal/kg) y V el volumen de gases (L/kg) `[P4-C7 p5]`. Energía por taladro (MJ) = Q[kg] × energía[MJ/kg]. Energía efectiva = energía liberada a presiones por encima de ≈ 100 MPa; REE = E_efectiva/E_ANFO `[P2-01 s25-28]`.
- **Rangos típicos o reglas prácticas según las fuentes:** ANFO ≈ 900-969 kcal/kg según la lámina (912, 913, 900 o 969 en distintas fuentes → **[DUDA 3]**). Tabla `X-DP` (AWS kcal/kg; ρ g/cc): ANFO 900 (0.80), HA-28 865 (0.90), HA-37 843.9 (1.00), HA-46 825 (1.15), HA-55 803.6 (1.27), HA-64 769.5 (1.30), MEQ-73 726 (1.37), MEQ-82 683 (1.36 o 1.16), Slurrex LC 560 (1.325). Emulsión 873 kcal/kg (78.2 % NA + 15.9 % agua + 0.9 % emulsificante + 5 % diésel) `[V2-04-1 p18-19]`. Fortan Extra 50: energía total 3.53 MJ/kg, efectiva 2.93 MJ/kg, REE 127, RBS 201 `[V2-04-1 p21]`. Sólo comparar productos del mismo fabricante `[V2-04-1 p11]`.
- **Decisión que apoya al ingeniero:** qué producto elegir para una energía por metro objetivo, y cómo convertir kg de un explosivo en "kg equivalentes de ANFO" (entra en Kuznetsov, F23).
- **Qué pasa si se hace mal:** mezclar definiciones de potencia relativa o comparar catálogos de fabricantes distintos lleva a subestimar/sobreestimar la energía; usar sólo energía total ignora que las emulsiones desarrollan más de su energía a alta presión.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** ejemplo de la lámina (Langefors): Q = 650.1, V = 1 017, ρ = 1.15 frente a ANFO (913; 965; 0.8): RWS = (1/6)(1 017/965) + (5/6)(650.1/913) = 0.769 → **77 %**; RBS = 0.769 × 1.15/0.8 = 1.105 → **110 %** ✓. Con la definición simple del Excel: MEQ-73 → RWS = 726/900 = 80.7 %; ABS = 726 × 1.37/1000 = 0.995 kcal/cc; RBS = 0.995/0.72 = 138 %. Energía del taladro de ejemplo: 660.34 kg × 3.036 MJ/kg = **2 005 MJ** (regla del ejercicio del curso: 500 kg × 3 036 kJ/kg = 1 518 MJ `[P4-C7 p4]`).
- **Fuente (archivo + página o lámina):** `V2-04-1 p4-21`; `P5 p21`; `P2-01 s24-28`; `P4-C7 p4-5`; `V1-01E p17`; `X-DP Cálculo ABS Y AWS!B7:H22`; `X-DP TRABAJOUTILQUANTEX`.

### F17 · Concepto (ES/EN): Balance de oxígeno, gases y humos / Oxygen balance, gases and fumes
- **En una frase:** una mezcla explosiva óptima tiene el oxígeno justo para quemar su combustible; si sobra o falta, cae la energía y aparecen gases tóxicos (CO o NOx anaranjados).
- **Fórmula o regla y unidades:** balance de oxígeno en % del peso (0 = ideal). ANFO ideal: 3 NH₄NO₃ + CH₂ → 7 H₂O + CO₂ + 3 N₂ (≈ 940 cal/g); déficit de combustible → NO, NO₂ (610 cal/g en el ejemplo); exceso de combustible → CO (820 cal/g) `[P5 p32]`. Energía por ingredientes: AWS(mezcla) = Σ fracción × kcal/kg de cada ingrediente (nitrato 381, combustible 10 185, emulsificante 7 357, agua 0) `[V2-04-1 p18-20]`.
- **Rangos típicos o reglas prácticas según las fuentes:** ANFO = 94 % nitrato + 6 % diésel ("94:6, no 94.3:5.7") `[V2-04-1 p19]`. Humos naranja se asocian a tiempo excesivo en el taladro, agua o mala gasificación `[P2-C34 s21; P5 p73]`.
- **Decisión que apoya al ingeniero:** elegir productos y ventanas de tiempo que mantengan bajos los humos; incluir avisos de riesgo por permanencia larga con agua.
- **Qué pasa si se hace mal:** humos tóxicos (gas anaranjado NO₂) y pérdida de energía; riesgo para personas y ambiente `[V1-01P p6-10]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** AWS del ANFO = 0.94 × 381 + 0.06 × 10 185 = **969 kcal/kg (4.05 MJ/kg)**; emulsión: 0.782 × 381 + 0.009 × 7 357 + 0.05 × 10 185 = 298 + 66.2 + 509.2 = **873.4 kcal/kg** `[V2-04-1 p18-19]`.
- **Fuente (archivo + página o lámina):** `P5 p32-33`; `V1-01P p5-6, p10`; `V2-04-1 p18-20`; `P2-C34 s21`.

### F18 · Concepto (ES/EN): Resistencia al agua y selección de explosivo / Water resistance and explosive selection
- **En una frase:** el tipo de explosivo se escoge según el agua del taladro, el diámetro, la calidad de la roca y el costo **por tonelada** (no por kilogramo).
- **Fórmula o regla y unidades:** criterio: menor costo operativo en $/m, $/t o $/m³ que cumpla la condición de terreno `[V1-02S p10]`.
- **Rangos típicos o reglas prácticas según las fuentes:** ANFO: sin resistencia al agua (a partir de ≈ 10 % de humedad queda inservible); hidrogeles: buena; emulsiones: excelente; mezclas ANFO-emulsión: a más ANFO menos resistencia; en agua muy afluente usar emulsión/hidrogel a granel o anfos pesados 60/40 o 70/30, o encartuchados `[P2-01 s19; V1-02S p17-19]`. Agua dinámica → mangas `[P2-01 s19]`. Por diámetro: < 51 mm emulsión o dinamita; 51-102 mm ANFO adecuado como carga de columna; > 102 mm sin problema con ANFO, con columnas selectivas en roca dura `[V1-02S p13-14]`. Roca muy fisurada: mejor un explosivo de mucha energía de gas (ANFO) porque la energía de tensión se fuga; roca en bloques: ANFO aluminizado o pesado por su efecto expansivo `[V1-02S p7-9]`. Estabilidad: emulsión mala bajo 4.5 °C, ANFO mala sobre 32.2 °C `[P5 p31]`.
- **Decisión que apoya al ingeniero:** producto por taladro (seco, con agua, agua dinámica) y estrategia de carga (bombeable vs vaciable).
- **Qué pasa si se hace mal:** ANFO en agua → falla de detonación y humos; explosivo de baja densidad flotando; emulsión demasiado tiempo → humos y pérdida de VOD.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** regla de decisión (a validar): agua estática > 0 y ANFO → descartado; Fortan Extra 50 = "taladros secos y desaguados, vaciable"; Fortis Extra 65 = "taladros con agua, bombeable" `[V2-04-1 p21]`.
- **Fuente (archivo + página o lámina):** `P2-01 s19`; `V1-02S p7-19`; `V2-04-1 p21`; `P5 p31`.

### F19 · Concepto (ES/EN): Cebado (booster y doble primado) / Priming (booster, double priming)
- **En una frase:** el booster con su detonador ("prima" o "cebo") es lo que arranca la detonación de la columna; se ubica dentro de la carga, de preferencia en el fondo.
- **Fórmula o regla y unidades:** condición del doble primado: la diferencia esperada de tiempos entre ambos detonadores debe ser menor que el tiempo que tarda la onda en recorrer la columna entre primas. Tiempo de la columna = longitud/VOD.
- **Rangos típicos o reglas prácticas según las fuentes:** iniciar en el fondo del taladro `[P2-C5 p10]`; primar al centro del taladro, fijar el detonador al booster con cinta, no tirar los productos `[P2-C7 p4-6]`; cebo de ANFO: cuanto mayor la presión de detonación del cebo mayor su capacidad de iniciar `[P2-C34 s33]`; booster de pentolita con dos orificios paralelos (uno con tope para el detonador) `[P4-C2 p14-15]`. Control de cable: con un detonador i-kon de 20 m, taladro de 16 m y taco de 6 m, el cable superior debe quedar ≈ 13 m y el inferior ≈ 4 m `[P2-C7 p12]`.
- **Decisión que apoya al ingeniero:** número y posición de primas (fondo, superior, intermedia), booster por diámetro/producto y tipo de detonador de cada prima.
- **Qué pasa si se hace mal:** prima fuera de la carga (p. ej. "subiendo") → tiro quedado; doble primado con retardos largos y detonadores de dispersión mayor que el tiempo de columna → puede no funcionar.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** dos detonadores de 1 000 ms con dispersión de 0.005 %: 999.95 y 1 000.05 ms → diferencia 0.1 ms; columna de 8 m a 5 500 m/s = 1.45 ms → **el doble primado funciona**. Con 20 000 ms: 19 999 y 20 001 ms → diferencia 2 ms > 1.5 ms → **puede no funcionar** `[P2-C7 p10-11]`.
- **Fuente (archivo + página o lámina):** `P2-C7 p2-12`; `P2-C5 p10`; `P4-C2 p14-15`; `P2-C34 s7, s32-34`.

### F20 · Concepto (ES/EN): Retardos entre taladros y entre filas; burden de alivio / Inter-hole and inter-row delays; relief burden
- **En una frase:** el tiempo (ms) que se deja entre taladros vecinos y entre filas para que cada carga tenga una cara libre creada por la anterior; los retardos entre filas mueven el material y los de la misma fila fragmentan.
- **Fórmula o regla y unidades:** burden de alivio [ms/m] = retardo entre filas [ms] / burden [m]. Retardo entre taladros para interacción de ondas (tiempos "cortos"), T en ms con S en m y Vp en m/s: Chiappetta T = 600·S/Vp y Lagrange T = 2 500·S/Vp `[P4-C7 p12]`; otra lámina da T = 0.7·(S/Vp)·1 000 = 700·S/Vp `[V1-04M p10]`, y otra T = 0.5·(S/Vs)·1 000 con la onda S `[P4-C5 p27]`; S = espaciamiento, Vp o Vs = velocidad de onda de la roca **[DUDA 14]**. Función de cada tiempo: entre taladros fragmenta; entre filas desplaza; de inicio evita superposición con otra detonación; entre proyectos da tiempo de atenuación; hacia el buffer cuida la vibración `[V2-03-1 p19]`.
- **Rangos típicos o reglas prácticas según las fuentes:** pirotécnico: 3-9 ms/m de espaciamiento entre taladros y 10-15 ms/m de burden entre filas (3 ms/m en condiciones adversas); programable: 0.3-9 y 1.2-15 ms/m `[P4-C5 p19-20]`; burden de alivio 15-20 ms/m en roca dura, 20-25 en media-blanda, 30-40 para contornos `[P4-C5 p30]`; producción < 60 ms/m y < 150 ms/m para evitar la "muerte por presión dinámica" `[P4-C8 p5]`; pila apretada 6-12 ms/m (pala), suelta 12-30 ms/m (cargador frontal), < 6 ms/m sobre-excavación `[P5 p69-71]`; entre filas ≥ 2-3 veces el retardo entre taladros `[P5 p67]`; > 150 ms entre filas puede perder confinamiento y < 35 ms provoca eyección del taco y flyrock; < 42 ms entre taladros de la última fila daña la pared trasera `[P5 p77-80]`. Roca fracturada/estructurada → ≤ 60 ms entre filas; roca blanda ≥ 75 ms `[P5 p72]`. Caso de mina: 17 ms entre taladros y 162 ms entre filas (malla 7 × 8) → 9 ms y 148 ms (malla 5.5 × 6.5) `[V1-04M p30]`.
- **Decisión que apoya al ingeniero:** valores de retardo por tipo de conector o programación, según dureza, tipo de pala, objetivo de fragmentación y sensibilidad del entorno.
- **Qué pasa si se hace mal:** tiempos demasiado cortos → el taladro rompe hacia el interior de la roca antes de que salgan los siguientes, sobre-quiebre; demasiado largos → la cara se mueve, se pierde el confinamiento y las fracturas alivian al taladro siguiente antes de detonar `[P4-C5 p11-17]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** B = 7.39 m, S = 8.5 m. Filas: 6-12 ms/m → 44-89 ms (apretada); 12-30 ms/m → 89-222 ms (suelta); ≤ 60 ms/m → ≤ 443 ms. Entre taladros pirotécnicos 3-9 ms/m × 8.5 = 25-77 ms. Con Vp = 4 800 m/s: Chiappetta 8.5/4 800 × 600 = 1.06 ms, la fórmula 0.7 → 1.24 ms, Lagrange 4.4 ms — valores sólo alcanzables con detonadores electrónicos (los pirotécnicos empiezan en 17 ms).
- **Fuente (archivo + página o lámina):** `P4-C5 p8-20, p27-30`; `P4-C7 p12-16`; `P4-C8 p3-8`; `P5 p64-80`; `V1-04M p10`; `V2-03-1 p19`.

### F21 · Concepto (ES/EN): Secuencia de iniciación / Firing sequence and time contours
- **En una frase:** el orden espacial en que detonan los taladros (por filas, en V, en chevrón, echelon, taladro a taladro, taladro único) que decide hacia dónde se mueve la roca y cuánta carga detona a la vez.
- **Fórmula o regla y unidades:** tiempo de cada taladro t(i,j) = Σ retardos acumulados a lo largo de su camino de iniciación; MIC = Σ Q de los taladros con el mismo t (o dentro de una ventana ≈ 8 ms `[GENERAL]`).
- **Rangos típicos o reglas prácticas según las fuentes:** el patrón para iniciar filas debe ser perpendicular a la dirección de desplazamiento deseada; las isolíneas de tiempo deben ser lo más paralelas posible a la cara libre y perpendiculares a la pared que se cuida; isolíneas en punta de flecha dan material grueso `[P4-C5 p29; P4-C8 p6; P5 p75]`. Retardos cortos entre taladros y largos entre filas → más espacio y lanzamiento más lejano; lo contrario → menos `[P4-C7 p16]`. Reglas de secuencia: S ≤ H y 2 < S/B < 4 (para la diagonal de la nueva secuencia) `[P4-C5 p28]`; si hay disparos en distintos bancos, disparar primero el inferior `[P4-C8 p8]`. Buffer, cresta y contacto con plataforma: no retardar demasiado los taladros perimetrales `[P4-C8 p5]`.
- **Decisión que apoya al ingeniero:** el tipo de secuencia y las direcciones de salida; puntos de inicio y "burden de alivio" uniforme.
- **Qué pasa si se hace mal:** taladros fuera de secuencia (por mala planificación o conexiones sueltas) → mala fragmentación, proyecciones, vibración alta, disrupción de columnas; conexiones incorrectas → tiro quedado `[P4-C4 p26; P4-C7 p20]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** 3 filas × 4 taladros, retardo entre taladros 25 ms y entre filas 100 ms: fila 1 = 0, 25, 50, 75 ms; fila 2 = 100, 125, 150, 175; fila 3 = 200, 225, 250, 275. Burden de alivio = 100/7.39 = 13.5 ms/m (pila "suelta"). MIC (fila a fila) = 4 × 660 = 2 641 kg; MIC (taladro a taladro) = 660 kg (si cada taladro tiene su retardo). Este esquema es análogo al de `P4-C2 p13` (100 ms entre filas, 25 ms entre taladros).
- **Fuente (archivo + página o lámina):** `P4-C6 p35-40`; `P4-C7 p21-33`; `P4-C5 p21-30`; `P4-C8 p3-8`; `V2-03-1 p20-30`; `P5 p64-79`.

### F22 · Concepto (ES/EN): Precisión y dispersión de los detonadores / Detonator accuracy and scatter
- **En una frase:** un detonador pirotécnico nunca sale exactamente en su tiempo nominal; la variación aleatoria (dispersión) puede invertir el orden previsto y hacer que dos taladros "compitan"; el electrónico casi la elimina.
- **Fórmula o regla y unidades:** variación = ± (precisión %) × retardo nominal (ms).
- **Rangos típicos o reglas prácticas según las fuentes:** no eléctricos: entre taladros 17, 25, 35, 42, 50, 65 ms (precisión 3-5 %); entre filas 42, 65, 84, 100, 175, 200, 230, 300 ms (2-4 %); en el fondo 500, 600, 800, 1 000, 1 200 ms (1-2 %) `[V2-03-1 p8]`. Electrónico: programable 0-20 000 ms en pasos de 1 ms, precisión 0.01 % (diseño flexible, verificación por pruebas) vs. 1-5 % del no eléctrico `[P5 p59; V2-03-1 p11]`; otras láminas citan 0.005 % `[P2-C7 p10-11]` **[DUDA 15]**. Detonadores de baja precisión 0-7 % (un 50 ms puede salir entre 46.5 y 53.5) y de alta precisión 0-2 % `[P5 p78]`. La precisión de los retardos puede aumentar o disminuir la vibración en 20-50 % `[V2-03-1 p11]`. Con pirotécnicos, el acoplamiento entre taladros depende del número de filas, del tiempo de fondo y del tamaño de la voladura; con electrónicos no `[V2-03-1 p11]`.
- **Decisión que apoya al ingeniero:** pirotécnico vs. electrónico, y qué tiempos de fondo evitar (deben ser bajos para no acumular dispersión).
- **Qué pasa si se hace mal:** taladros fuera de secuencia → mala fragmentación, posible proyección, más vibración y onda aérea, disrupción de la columna (ejemplo con tiempos reales de nonel `[P4-C4 p25-26]`).
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** 17 ms con 5 % → ±0.85 ms; 42 ms con 5 % → ±2.1 ms; 800 ms con 2 % → ±16 ms `[V2-03-1 p8, p13]`. Un tiempo de fondo de 500 ms con 2 % (±10 ms) puede coincidir con el inicio de la fila siguiente.
- **Fuente (archivo + página o lámina):** `V2-03-1 p8-14`; `P5 p56-63, p78`; `P4-C4 p17-26`; `P2-C7 p10-11`; `X-D1 Traslape!A3:C7`.

### F23 · Concepto (ES/EN): Fragmentación Kuz-Ram / Kuz-Ram fragmentation model
- **En una frase:** un modelo empírico que predice el tamaño medio de la roca volada (X50) con la ecuación de Kuznetsov y toda la curva granulométrica con Rosin-Rammler y el índice de uniformidad de Cunningham.
- **Fórmula o regla y unidades:** X50 [cm] = A · (V/Q)^0.8 · Q^(1/6) · (115/RWS)^0.633, con V = volumen por taladro B·S·H [m³], Q = kg de explosivo por taladro, RWS = potencia relativa en peso vs. ANFO (ANFO = 100), A = factor de roca. Curva: R(x) = 100·[1 − exp(−0.693·(x/X50)^n)]; tamaño característico Xc = X50/0.693^(1/n) (por Xc pasa 63.2 %). Índice de uniformidad (versión de las hojas): n = f_m · (2.2 − 14·B/Ø_mm) · √[(1+S/B)/2] · (1 − W/B) · (|L_fondo − L_col|/(L_fondo + L_col) + 0.1)^0.1 · (L_carga_sobre_piso/H), con W = desviación (m), f_m = 1.0 malla cuadrada/rectangular, 1.1 triangular, 1.15 equilátera (en los Excel 1.0 ó 1.1 según "malla trabada"). X80 = Xc · [ln(1/(1−0.8))]^(1/n).
- **Rangos típicos o reglas prácticas según las fuentes:** A = 0.06·(RMD + JPS + JPA + RDI + HF) (Cunningham; ver F24); A entre 3 y 13 (rocas muy blandas → duras homogéneas) `[P1-S6 p12]`, o "factor de volabilidad" F de 1 a 15 `[P5 p10]`. n mayor = distribución más homogénea; n baja al subir B (Ø fijo) y al subir S/B; S/B nunca > 2 `[P1-S6 p18]`. Relación L_t/B entre 70 y 100 %; H entre 50 y 70 Ø `[P5 p10]`. Alternativas: JKMRC (dos fracciones, mejor en finos), Swebrec, Shuman-Gaudin; otros X50: Larsson (1973) y SveDeFo `[P1-S6 p21-27; X-GRAN]`. X50 es proporcional al diámetro y decrece con el factor de carga `[P1-S6 p10]`.
- **Decisión que apoya al ingeniero:** estimar el P50/P80 de una malla y carga candidatas antes de perforar, y recalibrar el factor de roca A con mediciones (WipFrag/análisis de imágenes).
- **Qué pasa si se hace mal:** un A mal calibrado sesga todo el modelo (es el parámetro más importante junto con n); el modelo subestima finos (por eso JKMRC) y no incluye la influencia real de la secuencia de tiempos.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** V = 942.4 m³, Q = 660.34 kg, RWS = 80.7 (726/900), A = 5.2 (valor ilustrativo de `X-D1 Fragmentacion!B19`): X50 = 5.2 × (1.427)^0.8 × 660.34^(1/6) × (115/80.7)^0.633 = 5.2 × 1.331 × 2.951 × 1.253 = **25.5 cm**. n con W = 0.3 m, sólo carga de fondo, longitud de carga sobre piso (8.7 − 1.0)/15: n = 1.1 × 1.830 × 1.037 × 0.959 × 1.010 × 0.513 = **1.04**; Xc = 25.5/0.693^(1/1.04) = 36.4 cm; pasantes: 10 cm → 23 %, 25 cm → 49 %, 50 cm → 75 %, 100 cm → 94 %; X80 ≈ 57.5 cm. Chequeo cruzado con la hoja `Fragmentacion` de `X-D1` (H 15, B 9, S 10.3, Ø 270 mm, Q 771 kg, A 5.2, RWS 90): X50 = 29.5 cm, n = 1.056, Xc = 41.7 cm.
- **Fuente (archivo + página o lámina):** `P1-S6 p7-27`; `P5 p10`; `X-D1 Fragmentacion!B28:B30, E16:E26`; `X-D1 Fragmentación_energía!F18:F20`; `X-GRAN Curvas Granulométricas!B14:D17`; `V2-02-2 p3-15`.

### F24 · Concepto (ES/EN): Propiedades de la roca que gobiernan el diseño / Rock properties that drive blast design
- **En una frase:** la resistencia, la rigidez, las discontinuidades y la velocidad sísmica de la roca dicen cuánta energía y de qué tipo hace falta, y qué tan fácil se perfora y se fragmenta.
- **Fórmula o regla y unidades:** UCS (MPa), módulo de Young E (GPa), coeficiente de Poisson ν (–), resistencia a tracción (MPa), densidad (t/m³ o g/cc), Vp (m/s), RQD/RMR, espaciamiento y orientación de discontinuidades. Factor de roca de Cunningham: A = 0.06·(RMD + JPS + JPA + RDI + HF), con RDI = 25·ρ_r − 50 (influencia de la densidad), HF = E/3 si E < 50 GPa, si no UCS/5, JPS = f(espaciamiento de diaclasas: 10, 15, 20 ó 30), JPA = 20/30/40 según buzamiento (fuera de la cara/perpendicular/hacia la cara) y RMD = 10 (pulverulenta), JPS + JPA (diaclasas verticales) o 50 (masiva). McKenzie usa 0.04 en lugar de 0.06 `[X-D1 Factor de Roca!A1:M21]`. RQD (%) = 100 × Σ longitud de trozos de testigo ≥ 10 cm / longitud del tramo (testigo NX de 54.7 mm) `[P1-S3 p26]`; estimación por Jv (discontinuidades por m³): RQD ≈ 115 − 3.3·Jv (RQD = 100 si Jv < 4.5) `[P1-S3 p33]`; Q = (RQD/Jn)·(Jr/Ja)·(Jw/SRF) `[P1-S3 p36]`.
- **Rangos típicos o reglas prácticas según las fuentes:** clases de RQD: 0-25 muy mala, 25-50 mala, 50-75 regular, 75-90 buena, 90-100 excelente (depende de la dirección del sondaje y no informa el tamaño de bloque) `[P1-S3 p26-32]`; sistemas de clasificación citados: RQD, RMR (Bieniawski), MRMR (Laubscher), Q (Barton), GSI (Hoek) `[P1-S3 p22-23]`; clases por UCS: blanda < 70 MPa, media 70-120, dura 120-180, muy dura > 180 `[P1-S5 p18]`; UCS de referencia por roca en la tabla de brocas: arcilla ≈ 55 MPa, andesita/riolita ≈ 110-124, granito ≈ 152-165, basalto ≈ 221, skarn ≈ 234, gabro ≈ 303, anfibolita ≈ 414 (valores aproximados por lectura de tabla) `[P2-C8 p17]`. Vp típica: granito 4.0-5.6 km/s, basalto 5.0-6.6, caliza 2.8-7.1, arcilla 1.2-2.5 `[P4-C7 p12]`. Perforabilidad inversamente proporcional al UCS: 80 m/h a 100 MPa → 32 m/h a 250 MPa `[P1-S2 p78]`. Las resistencias dinámicas son 5-13 veces las estáticas y la dinámica a tracción es 5-10 % de la dinámica a compresión `[P1-S4 p7, p12]`; una carga que supera la resistencia dinámica a compresión sólo tritura la roca alrededor del taladro (≈ 1 % o menos del aporte a la fragmentación según Hagan (1978)) y desperdicia energía de tensión `[P1-S4 p9]`. Siete modos de fragmentación: trituración cercana, agrietamiento radial, rotura por reflexión, liberación de carga, apertura de grietas por gas, cizallamiento y colisión de fragmentos `[P1-S4 p6]`. Tabla de propiedades geomecánicas del propio curso (UCS MPa / E en unidades de 10 GPa / Vp m/s / ν / densidad t/m³): basalto 149 / 6.2 / 5 230 / 0.275 / 2.88; caliza 158 / 5.52 / 5 000 / 0.25 / 2.68; granito 186 / 4.3 / 4 850 / 0.327 / 2.70; granodiorita 220 / 5.1 / 6 100 / 0.33 / 2.70; mármol 251 / 10.6 / 6 710 / 0.284 / 3.04; taconita 251 / 9.3 / 6 143 / 0.249 / 2.95; dolomía 54.7 / 2.83 / 4 025 / 0.25 / 2.68; arenisca (Virginia) 134 / 0.69 / 3 935 / 0.309 / 1.87 `[P1-S4 p26]` (contiene erratas evidentes → **[DUDA 17]**). Relaciones sísmicas: con ν = 0.25, Vp ≈ 1.73·Vs; E y ν se calculan mejor con métodos dinámicos (Vp, Vs, ρ) que con estáticos; el módulo de Bulk (de Vp, ρ y ν) sirve para estimar la proyección porque la presión de los gases en las grietas empuja la roca hacia la cara libre `[P1-S4 p15-20]`. Cuanto mayor la velocidad sísmica, más energía (consumo específico) hace falta para la misma fragmentación; criterio de **acoplamiento de impedancias**: comparar ρ_roca·Vp con ρ_explosivo·VOD para maximizar la transferencia de energía (en una mina de cobre bajó los costos de P&V hasta 17 %) `[P1-S4 p22-24]`. E alto → los gases encuentran más resistencia; ν bajo → mejor fragmentación para un nivel de energía dado `[P1-S4 p19]`. Porosidad intergranular: atenúa la onda y reduce la resistencia dinámica (más finos) → usar explosivo con alta energía de burbuja (ANFO) o desacoplar; cavidades kársticas: usar taco espaciador intermedio y redistribuir carga `[P1-S4 p27-32]`. Con agua: sube Vp ≈ 300 m/s y bajan las resistencias; en helada, Vp medida puede subir 600 m/s `[P1-S4 p25, p47]`. **Pirita:** el ANFO puede reaccionar de forma exotérmica con pirita/sulfatos desde 80-120 °C (≈ 5 % de urea lo evita hasta 180 °C) `[P1-S4 p48-49]`.
- **Decisión que apoya al ingeniero:** dominio geotécnico → tipo de explosivo (VOD alta en roca dura; energía de gas en roca blanda o muy fracturada), malla y factor de energía; orientación del frente respecto a las diaclasas; qué hacer en cambios litológicos (mismo esquema con distinta carga, o esquemas distintos con igual carga por taladro) `[P4-C6 p4; P1-S5 p22-25]`.
- **Qué pasa si se hace mal:** ignorar diaclasas → fuga de gases, bolones, sobre-excavación y debilitamiento del talud; sobrecarga en roca blanda → sobretriturado y proyección.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** RQD de un tramo de 200 cm con trozos de 25, 18, 12, 8, 30, 15, 6, 40 y 22 cm: cuentan los ≥ 10 cm (25 + 18 + 12 + 30 + 15 + 40 + 22 = 162) → RQD = 162/200 = **81 %** ("buena") **[CALC]**. Factor de roca: roca con ρ_r 2.6, E = 30 GPa, UCS 70, diaclasas verticales con espaciamiento 0.2 m, buzamiento 20 (fuera de la cara): RDI = 25 × 2.6 − 50 = 15; HF = 30/3 = 10; JPS = 15; JPA = 20; RMD = JPS + JPA = 35 → A = 0.06 × (35 + 15 + 20 + 15 + 10) = **5.7** (con 0.04: 3.8) `[X-D1 Factor de Roca!D16, F16]`.
- **Fuente (archivo + página o lámina):** `P1-S3 p22-36`; `P1-S4 p3-49` (texto de López Jimeno, escaneado); `P1-S5 p20-25`; `P1-S2 p74-78`; `P2-C8 p3-5, p17`; `P4-C7 p12`; `X-D1 Factor de Roca`.

### F25 · Concepto (ES/EN): Vibración del terreno (PPV) / Ground vibration (PPV)
- **En una frase:** la vibración que llega al talud, a estructuras y a la comunidad crece con la carga que detona por retardo (MIC) y decrece con la distancia; se controla con retardos, secuencia y cargas por retardo menores.
- **Fórmula o regla y unidades:** campo lejano: ley de distancia escalar PPV = K·(R/W^a)^(−β), a = 0.3-0.5 (típico 0.5) `[P2-C9 p6]` (forma general **[GENERAL]**). Campo cercano (≤ 5 longitudes de carga) → Holmberg-Persson: PPV = K·[(q/R)·Δθ]^α, con q = kg/m de carga, R = distancia horizontal, Δθ = ángulo subtendido por la columna (rad): Δθ = φ − atan(tan φ − L_c/R), φ = atan((D_pozo − G)/R) `[X-D1 HOLMBERG Fit!I17:K17]`. Velocidad crítica de vibración por cuña (Wong-Pang): PPV_c = √[(9.8/0.91)·δ_máx·sen(ψ)·(FS/2 + 1/(2FS) − 1)] con δ_máx = L/500·(JRC/L)^0.33 `[X-D1 Wong Pang!D9:D10]`.
- **Rangos típicos o reglas prácticas según las fuentes:** caso de mina: K = 982, α = 1.2068, VPPc = 3 110 mm/s y ¼·VPPc = 777.5 mm/s (otro banco: 1 186 y 296 mm/s) `[V1-04M p24; V2-02-1 p28]`. Ajuste regresivo de `X-D1`: K = 2 159, β = −2.31 (R² = 0.85). En campo cercano el daño es por fracturas nuevas; en campo lejano por deslizamiento de discontinuidades existentes `[P2-C9 p5]`. Los detonadores electrónicos permiten evitar coincidencia de ondas (estudio de onda elemental) `[V2-03-1 p17]`.
- **Decisión que apoya al ingeniero:** MIC máximo admisible, retardos y dónde colocar los geófonos; si hace falta precorte/buffer.
- **Qué pasa si se hace mal:** daño al talud (nuevas fracturas paralelas), problemas con la comunidad, factor de seguridad de cuñas < 1 (ejemplo de `X-D1 FS planar`: FS 1.22 → 0.99 al sumar la aceleración).
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** q = 75.75 kg/m, columna 8.7 m, hoyo de 16 m, geófono en superficie (G = 0), K = 982, α = 1.2068: R = 100 m → φ = 0.1587, Δθ = 0.0858 rad, (q/R)·Δθ = 0.0650, PPV = 982 × 0.0650^1.2068 = **36 mm/s**; R = 50 m → 184 mm/s; 200 m → 6.9 mm/s; 300 m → 2.6 mm/s. (Aplicación indicativa: los parámetros K y α son de otra mina.)
- **Fuente (archivo + página o lámina):** `P2-C9 p5-6`; `P2-01 s7`; `V1-04M p24-25`; `V2-02-1 p28-36`; `X-D1 HOLMBERG Fit, Dist. min ubic geof, Wong Pang, FS planar`.

### F26 · Concepto (ES/EN): Precorte y voladura amortiguada / Presplit and buffer blasting
- **En una frase:** una fila de taladros de pequeño espaciamiento y carga liviana disparada antes que la producción crea un plano de fractura que protege el talud; las filas buffer amortiguan entre ese plano y la producción.
- **Fórmula o regla y unidades:** presión de taladro Pb [MPa] = 110·f^n·ρ_e·VOD² (ρ_e g/cc, VOD km/s, f = (D_carga/D_pozo)² relación de desacople, n = 1.25 pozo seco, 0.9 pozo con agua). Se busca UCS·R ≈ Pb con R ≈ 1 (Pb del orden de la resistencia a compresión pero menor que ésta). Espaciamiento E ≤ D_pozo·(Pb + RT)/RT (RT = resistencia a tracción). Factor de carga γ [kg/m²] = (π/4)·D_pozo/(12R + 1) · R^(1/n)·D_e^(1−1/n)·UCS^(1/n)/(110^(1/n)·VOD^(2/n)) (con σc/σt = 12). Forma alternativa de Pb: Pb = 0.125·ρ·VOD²·[(r_c/r)·√C]^2.4 `[V1-PRE p9]` (**[DUDA 22]**). Buffer: B_buf = [W·1000/(FC·K_BP·H·ρ_r·SBR)]^0.5, S_buf = 1.15·B_buf.
- **Rangos típicos o reglas prácticas según las fuentes:** requisitos: pequeño espaciamiento, baja densidad lineal de carga y simultaneidad; precorte 100 ms o más antes de la producción `[P4-C6 p44; P4-C8 p12-13]`; S_precorte/buffer = 0.5-0.8·B `[P1-S5 p59]`. Tabla de parámetros iniciales de recorte (manual del especialista, 17ª ed.): Ø 3" (76 mm) → 0.5 kg/m, burden 1.5 m, espaciamiento 1.2 m; Ø 6" (152 mm) → 1.9 kg/m, 2.9/2.4 m; Ø 12¼" (311 mm) → 8.1 kg/m, 5.5/4.6 m `[P5 p9]`. Hoyo seco 1.25 / con agua 0.9 `[X-PRE Precorte JRyan!A10]`. Se evalúa midiendo % de filtro de vibración, verificando fracturas nuevas, calidad de cresta y estado de pared `[P4-C8 p16]`.
- **Decisión que apoya al ingeniero:** diámetro y tipo de carga de precorte (cartuchos, cordón, producto especial), espaciamiento, tiempo de salida, distancia precorte-buffer.
- **Qué pasa si se hace mal:** Pb muy alta → triturado alrededor del taladro y daño de pared; muy baja → no se fractura entre taladros; tiempos entre taladros no simultáneos → no se forma el plano; primado defectuoso → tiros quedados (casos de "Mina Brasil") `[P4-C8 p20-25]`.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** `X-PRE Precorte CMcK`: Dh = 6.5" (165.1 mm), UCS 100 MPa, RT 8 MPa, ρ = 1.1, VOD 5 km/s, seco (n = 1.25), R = 1: E = (100 + 8) × 0.1651/8 = **2.229 m**; γ = 0.691 kg/m²; kg/m = 0.691 × 2.229 = **1.54 kg/m**; diámetro de carga = 42.2 mm; f = (42.2/165.1)² = 0.0654; Pb = 110 × 0.0654^1.25 × 1.1 × 25 = **100 MPa** ✓ (= UCS·R). Con 16 m de columna: 24.6 kg por taladro.
- **Fuente (archivo + página o lámina):** `P1-S5 p53, p59-63`; `P4-C6 p41-45`; `P4-C8 p9-25`; `P5 p9`; `V1-PRE p2-9`; `X-PRE Precorte CMcK, Precorte JAV, Precorte_factor_carga, Precorte varios`.

### F27 · Concepto (ES/EN): Proyección de rocas y onda aérea / Flyrock and airblast
- **En una frase:** los dos efectos peligrosos "hacia arriba y afuera" de una voladura; se previenen sobre todo con un taco y un burden adecuados, una secuencia sin inversiones y una zona de exclusión bien dimensionada.
- **Fórmula o regla y unidades:** no hay una fórmula de alcance en el material; se usan indicadores: SD (F12), T/B, H/B (F09) y el factor de seguridad z de la fórmula de taco (F06).
- **Rangos típicos o reglas prácticas según las fuentes:** causas de flyrock: proyección arriba o abajo de taladros aliviados, secuencia inconveniente, detonación por simpatía; causas de tiros quedados: geología, frente de iniciación vs. de detonación, secuencia impropia `[P4-C5 p9]`. Taco muy corto → flyrock; muy largo → bolones `[P4-C6 p20]`. Roca dura → mayor zona de exclusión `[P4-C6 p4]`. Cordón detonante: ruido y perturbación del taco `[P5 p43]`. Un taladro "subconfinado" produce proyectil de roca y uno "superconfinado" vibración excesiva `[P2-C5 p31]`. Intervalos entre filas < 35 ms → eyección del taco `[P5 p77]`.
- **Decisión que apoya al ingeniero:** taco mínimo, zona de exclusión, uso de mallas/mantas y secuencia cerca de estructuras o vías.
- **Qué pasa si se hace mal:** daño a personas y equipos, denuncias; sanciones operativas.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** diseño K: SD = 1.46 (energía muy controlada → sin proyección esperada), T/B = 0.99. Para diseños con SD < 0.92 (como L y M de `X-DP` según el Excel, 0.88 y 0.89, aunque corregidos dan 1.07 y 1.16 → **[DUDA 4]**) el software debería mostrar advertencia de proyección.
- **Fuente (archivo + página o lámina):** `P4-C5 p6-9`; `P4-C6 p20`; `P2-C5 p31`; `P5 p43, p77`; `X-D1 Taco`.

### F28 · Concepto (ES/EN): Costo de perforación y voladura / Drilling and blasting cost
- **En una frase:** el costo por taladro (perforar + explosivo + accesorios) dividido entre las toneladas que rompe da un $/t comparable entre diseños; pero el objetivo es el costo global mina-planta, no el de P&V aislado.
- **Fórmula o regla y unidades:** costo de voladura por taladro = Q·(US$/kg de la mezcla) + Σ (cantidad × precio de accesorios) `[X-DP PRECIO POR TALADRO!D26]`; costo de perforación = US$/m × longitud del taladro; $/t = costo por taladro / (B·S·H·ρ_r); TDC = B/M + CH/ROP (US$/m) con B = precio de la broca, M = metros de vida, CH = costo horario, ROP = m/h `[P2-C8 p45; V1-03P p20]`. Utilidad = ingresos − costos operacionales − costos fijos; valor unitario = ley·recuperación·precio/(1 + dilución) `[V2-04-2 p13]`.
- **Rangos típicos o reglas prácticas según las fuentes:** en el Excel: perforación 9 US$/m, Slurrex G 0.443 US$/kg, nitrato Quantex 0.401, nitrato grado ANFO 0.519, D2 0.484 (para el diésel); Exsanel 1.71 US$/pza, booster 5.34, detonador electrónico 23.80, Taponex 3.866, cable de disparo 0.37 US$/m, cordón 0.14 US$/m `[X-DP PRECIO POR TALADRO!B3:C23]`. Costo P&V en el caso de mina 0.30 → 0.48 US$/t `[V1-04M p30]`. "El costo de la broca no es tan importante como el ahorro logrado por mayor ROP"; el driver del TDC es la ROP `[P2-C8 p44, p50]`. Gráfico de distribución de costos de P&V con seis categorías (suministros, perforación en mineral, adicionales, perforación en estéril, voladura en mineral y en estéril) con 55, 21, 9, 8, 5 y 2 % (la asignación exacta de cada porcentaje es sólo gráfica) `[V2-04-2 p14]`.
- **Decisión que apoya al ingeniero:** comparar alternativas por $/t de P&V **y** por el efecto aguas abajo (pala, chancado, molienda).
- **Qué pasa si se hace mal:** elegir el explosivo de menor precio por kg y no el de menor costo operativo (caso del ANFO en agua) `[V1-02S p10]`; ahorrar en voladura y perder en molienda.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** diseño K (`X-DP`): mezcla 0.4313 US$/kg × 660.34 kg = 284.80; accesorios: Exsanel 1.71 + booster 5.34 + cable 0.37 × (8.5 × 1.2/2 = 5.1 m) = 1.89 + detonador electrónico 23.80 + Taponex 3.866 = 36.60; total voladura = **321.40 US$/taladro** → 321.40/2 535 = 0.1268 US$/t; perforación = 9 × 16 = 144 US$ → 0.0568 US$/t; **total 0.1836 US$/t**. Diseño L: 0.2698; M: 0.3591; "actual" J: 0.2377 US$/t (columna M: +51 % de "inversión en voladura").
- **Fuente (archivo + página o lámina):** `X-DP PRECIO POR TALADRO!B3:G26; Diseños de Carga!J37:M50`; `P2-C8 p44-52`; `V1-03P p20`; `V2-04-2 p3-16`; `V1-02S p10`.

### F29 · Concepto (ES/EN): Parámetros de perforación rotativa / Rotary drilling parameters (pulldown, RPM, air, ROP)
- **En una frase:** empuje, giro y aire con que se opera el tricono determinan la velocidad de penetración, la vida de la broca y el costo por metro.
- **Fórmula o regla y unidades:** empuje máximo PD_max = (lb/pulg de diámetro del modelo de broca) × Ø_broca(pulg); velocidad de barrido VB[pie/min] = CFM·183.4/(Ø_broca² − Ø_barra²); TDC = B/M + CH/ROP; perforabilidad ∝ 1/UCS.
- **Rangos típicos o reglas prácticas según las fuentes:** roca dura → RPM bajas y pulldown alto; roca blanda → RPM altas y pulldown bajo `[P2-C8 p9, p22]`; RPM entre 60 y 120 `[V1-03P p12]`; presión de aire mínima 40 psi en la broca (40-50 psi recomendado) `[P2-C8 p11, p14]`; VB 5 000-7 000 pie/min en material seco y ligero, 7 000-9 000 con agua o material pesado `[P2-C8 p13; V1-03P p14]`; primer taladro con broca nueva: 1/3 y 2/3 del pulldown y RPM normales `[P2-C8 p20]`; sin agua en la broca (un exceso reduce la vida a 1/3) `[P2-C8 p16]`. Pit Viper 271: pulldown máx 70 klb; 351: 120 klb `[V2-01-1 p13-14]`.
- **Decisión que apoya al ingeniero:** tipo de broca y parámetros por dominio de dureza; qué tan rápido cae la producción (m/turno) y cuántos taladros se pueden entregar al plan.
- **Qué pasa si se hace mal:** poco aire → baja ROP y desgaste de labios; demasiado RPM → pérdida de insertos en la fila externa; demasiado pulldown → rotura de insertos en la fila interna `[P2-C8 p23]`; mala limpieza → remolienda.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** PD_max = 6 500 lb/pulg × 10.625 pulg = 69 063 lb ≈ 70 000 lb; VB: compresor 2 600 CFM a 3 000 msnm (corregido a 1 794 CFM, 70 %), broca 10⅝", barra 8⅝": VB = 1 794 × 183.4/(112.89 − 74.39) = **8 546 pie/min** (la lámina da 8 559; dentro de 7 000-9 000 exigido con agua). Regla de perforabilidad: 80 m/h a 100 MPa → 80 × 100/250 = 32 m/h a 250 MPa.
- **Fuente (archivo + página o lámina):** `P2-C8 p3-50`; `V1-03P p10-20`; `V2-01-1 p13-14`; `V2-01-2 p9-17`; `P1-S2 p77-78`.

### F30 · Concepto (ES/EN): Precisión de perforación y control de calidad (QA/QC) / Drilling accuracy and QA/QC
- **En una frase:** el error de posición, inclinación y profundidad de cada taladro respecto al diseño cambia el burden, el espaciamiento y la carga reales; el control de calidad busca mantenerlos dentro de una tolerancia.
- **Fórmula o regla y unidades:** en Kuz-Ram entra como (1 − W/B) en el índice de uniformidad n (W = desviación en m).
- **Rangos típicos o reglas prácticas según las fuentes:** tolerancia de perforación de 30 cm respecto al diseño; equipos con profundímetros y GPS correctamente calibrados `[V1-04M p21]`; desviación de taladros con levantamiento topográfico; evaluar detonación simultánea de taladros cercanos (< 4 m) y redistribuir carga; reducir carga en taladros de empalme o contorno donde la desviación reduce el área `[P4-C8 p5, p7]`. Errores típicos: en pasadura, espaciamiento, burden y desviación `[P4-C6 p22-23]`; caso de mina con QA/QC + accesorios (air bag, separadores, doble booster): P80 de 22.2 → 13.4 cm `[V1-04M p30]`. Excel: exactitud de perforación 0.1-0.3 m `[X-D1 Fragmentacion!B18; K-R 1 fila 19]`.
- **Decisión que apoya al ingeniero:** tolerancias por tipo de taladro (producción, buffer, precorte) y qué taladros se recargan o se cancelan tras el as-drilled.
- **Qué pasa si se hace mal:** burden efectivo menor que el diseñado (cerca de proyección) o mayor (pata, bolones); taladros que se juntan (sobrecarga local) y zonas sin taladros.
- **Cómo verificarlo/calcularlo con un ejemplo numérico:** B = 7.39 m: con W = 0.3 m el factor (1 − W/B) = 0.959; con W = 1.0 m = 0.865 → n baja ≈ 10 % (de 1.04 a 0.94), con lo que aumenta la fracción de sobretamaño.
- **Fuente (archivo + página o lámina):** `V1-04M p19-21`; `P4-C6 p18-24`; `P4-C8 p5-7`; `V2-02-1 p13-18`; `X-D1 Fragmentacion!B18`.

---

## 4. Familias de explosivos y accesorios de iniciación (explicado para un no minero)

### 4.1 Idea general
Una voladura usa **dos clases de productos** que conviene modelar por separado:

1. **La carga principal** (agente o explosivo "secundario"): es la masa que rompe la roca (ANFO, emulsiones, anfos pesados, dinamitas). Es relativamente **insensible**: por sí sola no detona con un golpe o una llama, y necesita un **cebo**.
2. **El sistema de iniciación** (explosivos "primarios" y accesorios): detonadores, boosters, cordón detonante, conectores y equipos de disparo. Son **sensibles**, pequeños y llevan el **tiempo** (retardo) de cada taladro.

El material clasifica: *primarios* = detonadores, pentolita (TNT 50 % + PETN 50 %), PETN (cordón detonante), HMX + Al y azida de plomo; *secundarios* = ANFO, ANFO pesado, emulsiones, dinamitas `[V1-01E p13-14; P4-C1 p4-5]`. Por régimen de velocidad hay **deflagración** (sólo se quema; VOD baja) y **detonación** (onda supersónica autosostenida) `[P2-01 s14]` **[DUDA 1]**. Los explosivos comerciales se pueden ver como un oxidante más un combustible que, al iniciarse, generan una reacción exotérmica rapidísima con gases a alta presión y temperatura `[P2-01 s10]`. Reaccionan con: fuerte impacto (tritura/agrieta), gran volumen de gas (desplaza), y como efectos indeseados vibración y onda aérea `[V1-01E p11]`.

### 4.2 Familias de carga principal (con los datos que un software necesita)

| Familia | Qué es (en simple) | Densidad típica (g/cc) | VOD (m/s) | Energía (AWS) | Agua | Diámetro crítico | Cómo se carga | Fuente |
|---|---|---|---|---|---|---|---|---|
| **ANFO** | Nitrato de amonio poroso (prills) + diésel 94:6; barato, seguro de manipular, sin resistencia al agua | 0.77-0.85 (0.8 en Excel) | 3 800-4 500 (baja y depende del diámetro) | 900-969 kcal/kg (según fuente) → RWS = 100 (ref.) | **Nula** (inservible con ≈ 10 % de humedad) | no figura en el material [GENERAL: depende del confinamiento] | A granel, camión fábrica (vaciable) o neumático; ideal en taladros secos > 51 mm | `P2-C34 s30-35; V1-02S p13-18; X-DP Cálculo ABS Y AWS!B11:J11; X-TACO calculos!L4` |
| **ANFO aluminizado (Al/ANFO)** | ANFO con aluminio para subir la energía | no figura | no figura | mayor que ANFO (no hay cifra) | Nula | — | Como ANFO | `V1-01E p18; V1-02S p9` |
| **Emulsión matriz** | Gotitas de solución de nitrato de amonio en aceite; **no detonable** por sí sola (oxidante clase 5.1) | 1.40-1.45 | — | — | Excelente | — | Se transporta en camión fábrica; sólo se vuelve explosivo al sensibilizarla | `V1-01E p22-31; P2-C34 s3-14` |
| **Emulsión gasificada** (p. ej. Slurrex G, "Extra") | La matriz se sensibiliza con un gasificante (solución de nitrito de sodio) al cargar; la densidad baja de ≈ 1.4 a 1.1-1.3 en 4-20 min | inicial 1.30-1.31, copa 1.16-1.18, media ≈ 1.26; final ≈ 1.15 en un ejemplo | ≈ 5 500 típico; 4 855 y 5 883 en dos ejemplos | ≈ 873 kcal/kg (emulsión de ejemplo); 560 kcal/kg (Slurrex LC en Excel) | **Excelente** | 3.5" (gasificada); 3.5-5.9" (Advantage) | **Bombeable** (para taladros con agua) | `P2-C34 s14-22; P2-C7 p18-23; V2-04-1 p18` |
| **Emulsión con microesferas / poliestireno** | Sensibilización con esferas huecas de vidrio/cerámica o con poliestireno para dar consistencia (baja la energía y sensibilidad) | no figura | ≈ 5 500 (gasificada) | baja con poliestireno | Excelente | 3.5" (gasificada) | A granel o encartuchada | `V1-01E p7, p24` |
| **ANFO pesado (Heavy ANFO, HA)** | Mezcla de ANFO con emulsión que llena los huecos entre prills; sube la densidad y da resistencia al agua. Nomenclatura del curso: HA-19 … HA-64, AP-73 | HA-28 0.88-0.90; HA-37 0.97-1.0; HA-46 1.15-1.17; HA-55 1.22-1.27; HA-64 1.30 | HA-28 4 400-4 800; HA-37 4 800-5 100; HA-46 5 000-5 200; HA-55 5 200-5 400; HA-64 4 500-4 800 | HA-28 865 → HA-64 769.5 kcal/kg | Media a buena (mejora al subir la fracción de emulsión; 60/40 y 70/30 sirven en agua) | HA-28 2.0"; HA-37 2.5"; HA-46 3.0"; HA-55 3.5-4.0"; HA-64 5.0"; AP-73 4.0" | Vaciable (brazo telescópico) o **bombeable** (manguera, agua) | `P2-C34 s13, s36-41; V1-01E p29, p32; X-DP Cálculo ABS Y AWS!B12:J16; X-TACO calculos!J3:L12` |
| **Mezclas Quantex "MEQ"** | Mezclas emulsión + nitrato de baja densidad de composición variable; "MEQ-73" ≈ 70 % emulsión (γ = 2.24), MEQ-82 ≈ 80 % (2.56), MEQ-91 ≈ 90 % (2.88), Slurrex LC 100 % (3.2) | MEQ-73 1.37-1.38; MEQ-82 1.16-1.36; Slurrex LC 1.325 | MEQ-73 4 800-5 600 (5.6 km/s en la hoja de trabajo útil); MEQ-82 5 300-5 900; Slurrex LC 5 700-5 900 | MEQ-73 726; MEQ-82 683; Slurrex LC 560 kcal/kg (3.036 / 2.856 / 2.343 MJ/kg) | Alta | — | Bombeable/gasificable a granel | `V1-01E p7; X-DP TRABAJOUTILQUANTEX; Cálculo ABS Y AWS!B17:J22` |
| **Hidrogeles (watergels/slurries)** | Fase acuosa continua con aceite disperso; sensibilizantes distintos al ANFO | no figura | no figura | no figura | **Buena** | no figura | Cartucho o granel | `V1-01E p18; P2-01 s19` |
| **Dinamitas** | Explosivos con nitroglicerina/nitroglicol (5-90 %), nitrocelulosa y sales; gelatinas resisten agua, pulverulentas no | no figura (los explosivos en general: 0.5-1.5 g/cc) | "desde baja hasta muy alta" | 1 080 cal/g (gelatina amoniacal) | Baja a excelente | pequeña (sin cifra) | Cartuchos; hoy sobre todo en diámetros pequeños y voladura subterránea | `V1-01E p17-21; V1-02S p13-16` |
| **Encartuchados de precorte (Exsaline, Senatel, Powersplit)** | Emulsión encartuchada de pequeño diámetro pegada a un cordón detonante de 10 g/m | densidad media | alta | — | Excelente | sensible al detonador N° 8 | En tiras dentro del taladro | `P2-C34 s9; P4-C8 p20-25` |

Notas para el modelo de datos:
- **La densidad no es un número** sino tres: inicial/de fábrica, "de copa" (medida en campo) y media final en el taladro (tras gasificar); además, el "esponjamiento" cambia la altura de la columna (F13).
- **La VOD depende del diámetro** (y del confinamiento y la densidad): ANFO 3 800-4 500 m/s, emulsiones 5 000-5 900; guardar rango y diámetro de referencia. Un explosivo pierde VOD en un diámetro menor: 4 400 → 4 200 m/s baja la presión de detonación 8.9 % `[P2-01 s23]`.
- **Energía** debe guardarse con su definición: total vs. efectiva (a > 100 MPa), por peso vs. por volumen, y contra qué ANFO se relativiza (F16, **[DUDA 3]**).
- **Resistencia al agua**: escala cualitativa (nula, regular, buena, excelente) más regla de uso para agua estática vs. dinámica (mangas) `[P2-01 s19]`.
- **Tiempo de permanencia**: la columna gasificada debe dispararse en ≤ 72 h con agua y ≤ 96 h en seco `[P2-C34 s21]`.
- **Estabilidad** por temperatura: emulsión mala bajo 4.5 °C, ANFO mala sobre 32.2 °C `[P5 p31]`.
- **Almacenamiento/garantía**: emulsiones 12 meses, Slurrex G 2 meses, dinamitas 18 meses `[V1-01E p21, p23; P2-C34 s22]`.
- **Precio** por kg y composición de la mezcla (p. ej. MEQ-73 = 70 % Slurrex G + 29.1 % nitrato + 0.9 % diésel D2 + 0.3 % solución gasificante; 0.4313 US$/kg) `[X-DP PRECIO POR TALADRO!B3:G10]`.
- **Clase de riesgo** (ONU 5.1 comburente para nitrato y emulsión matriz; UN 3375) `[P2-C34 s22, s25]`.

### 4.3 Accesorios y sistemas de iniciación

**Booster / cebo (prima).** Cartucho de pentolita (TNT + PETN) de alta presión de detonación, con dos orificios: uno para el detonador y otro para el tubo/cordón. Es el "puente" que convierte la señal del detonador en detonación estable de la columna; su presión debe ser suficiente para el explosivo (el ANFO exige cebo potente y bien ubicado) `[P4-C2 p14-15; P2-C34 s33]`. Datos: tipo, masa, precio (US$/pza en `X-DP`: 5.34), posición en el taladro, número por taladro (1 ó 2).

**Detonadores.**
- *Fulminante simple (N° 8, N° 12) + mecha de seguridad.* Cápsula de aluminio con carga primaria (azida de plomo) y base (PETN); N° 12: PETN 780 mg + azida 150 mg, Ø 7.5 mm, longitud 53.3-99.6 mm. Mecha: núcleo de pólvora 6.1 ± 0.7 g/m, combustión 160 ± 10 s/m. Uso limitado, sin control de tiempo `[P4-C1 p14, p35-49; P5 p45-46]`.
- *Eléctricos.* Se inician con corriente; pueden verificarse por resistencia antes del disparo; sensibles/insensibles/muy insensibles; instantáneos, microrretardo, retardo; susceptibles a rayos y corrientes espurias `[P5 p51-55]`.
- *No eléctricos (tubo de choque; p. ej. EXSANEL, NONEL).* Tubo plástico de 3.0 mm (int. 1.1 mm) con ≈ 15-18 mg/m de HMX + Al (90/10) que transmite la señal a ≈ 2 000 ± 200 m/s, silenciosa, tracción > 200 N; se conecta a un detonador con retardo pirotécnico. Se estira hasta 5 veces sin perder capacidad; no se ve afectado por electricidad estática; **no permite verificar** continuidad `[P4-C1 p14-25; P5 p47-50]`. Series: conectores de superficie 17, 25, 42, 65 ms, etc.; detonadores de fondo de 200 a 10 700 ms (16 niveles) o 500-8 600 ms; "dual" 17/600 ms (dos detonadores en un tubo) `[P4-C1 p26, p32; P4-C2 p4-5]`.
- *Electrónicos (i-kon, Daveytronic, Smartshot, Digishot, HotShot, WebGen inalámbrico).* Un microchip fija el retardo (0-20 000 ms en pasos de 1 ms; 1-25 000 ms según fabricante), cada detonador tiene un **ID único**, se **programa y prueba** antes del disparo (comunicación bidireccional con Tagger/logger, Bench Box/DRB/DBD), voltaje bajo (< 50 V), inmunes a estática y RF, con detección de "detonadores intrusos" y de corte de línea; el sistema puede disparar hasta 1 500 detonadores por unidad y aceptar hasta 3 unidades de programación de 1 000 detonadores `[P5 p56-59; P4-C4 p27-43]`. Precio del detonador electrónico en `X-DP`: 23.80 US$/pza frente a 1.71 US$ del Exsanel.

**Cordón detonante (PETN).** Cordón con núcleo de PETN, VOD ≈ 6 800-7 000 m/s, 3-80 g/m; NP 03 (4.3 g/m, Ø 3.3 mm), NP 05 (5.5 g/m, 3.9 mm), NP 10R (10.5 g/m, 4.8 mm). Sirve como línea troncal y para iniciar en toda la longitud (precorte). Carga máxima de cordón por diámetro de taladro: Ø 25-127 mm → 2.1 g/m; 127-204 mm → 5.3 g/m; 204-381 mm → 10.7 g/m `[P4-C1 p9-11; P5 p41-44]`. Ventajas: bajo precio, iniciación axial instantánea; desventajas: ruido, perturba el taco y la columna, requiere doble fuego y sólo se verifica visualmente.

**Conectores de superficie (retardo).** Unidireccionales (retardo entre taladros/filas en la superficie) y bidireccionales (para troncales de cordón); tiempos nominales 17-100 ms y más `[P4-C1; P4-C2 p13-19]`.

**Ensambles típicos por taladro** (para costo y lista de materiales): (a) no eléctrico: 1 booster + 1 Exsanel de fondo + conectores de superficie + línea; (b) electrónico: 1-2 boosters + 1-2 detonadores electrónicos + cable de disparo (en `X-DP`: 1.2 m de cable por cada 2 m de espaciamiento) + tapón de taco (Taponex 3.87 US$) `[X-DP PRECIO POR TALADRO!B16:G25]`.

**Datos que un software necesita para accesorios:** familia (no eléctrico/electrónico/cordón/mecha), retardo nominal (ms), precisión (± %), rango programable (electrónico) y paso, uso (fondo, superficie entre taladros, superficie entre filas), longitud de cable/tubo, número por taladro, precio, y restricciones (p. ej. el tiempo de fondo debe ser bajo por la dispersión: 500 ms con 2 % → ± 10 ms `[V2-03-1 p13]`).

### 4.4 Cómo llega el explosivo al taladro (operación)
- **Camión fábrica (MMU)**: fabrica ANFO, HA o emulsión gasificada en el sitio; se calibra, se mide la **densidad** de la mezcla antes de cargar y **no se carga sin ese dato**; se mide el taco durante todo el carguío y se marca el taladro cargado (spray) `[P2-C7 p14-17]`.
- **Sistema vaciable (gravedad/brazo)** para taladros secos; **bombeable (manguera)** para taladros con agua: bombear con la manguera sumergida en el producto y "iniciar y soplar fuera del taladro" `[P2-C7 p15-17]`.
- **Control de la solución gasificadora**: 10 kg de NaNO₂ en 90 kg de agua (100 kg de solución); densidad de control 1.06-1.07 g/cc para el 10 % `[P2-C7 p18-19]`.

---

## 5. Ejemplos de diseño de banco resueltos paso a paso

Se dan tres ejemplos. **A** es el ejemplo resuelto del propio curso (sólo fórmulas simples; ideal para primeras pruebas de código). **B** es un diseño tomado de los Excel `DISEÑO PROPUESTO.xlsx` / `Diseño_2.xlsx` (más completo: carga, energía, SD, Kuz-Ram, costo). **C** es un caso de pequeño diámetro (para probar las tablas 20.3 y 20.4). Todos los números de A y C están en las láminas; los de B en las celdas del Excel. Se marca **[CALC]** lo calculado por el redactor aplicando las fórmulas del material.

### Ejemplo A — "Mina Esperanto" (curso `P1-S5 p65-69`, taladros verticales, roca media-dura)

**Datos.** Estratos de andesita, ρ_roca = 2.6 t/m³, buzando hacia la cara, baja presencia de estructuras; explosivo ANFO de 0.78 t/m³ y VOD = 4 700 m/s; taladro Ø = 12¼" (0.311 m); banco H = 15 m.

**A.1 Producción**

| Paso | Fórmula | Resultado |
|---|---|---|
| 1. Burden de Ash | B = Kb·Ø(pulg)/12 en pies; Kb = 25 (roca media, densidad-potencia baja) | 25 × 12.25/12 = 25.5 pies = **7.8 m** |
| 2. Burden de Konya-Walter | B = (2·ρ_e/ρ_r + 1.5)·Ø_e·Kd·Ks; Kd = 0.95 (estratos hacia la cara), Ks = 1.10 (capas delgadas bien cementadas) | (2 × 0.78/2.6 + 1.5) × 12.25 × 0.95 × 1.10 = 26.9 pies = **8.2 m** |
| 3. Burden operativo | se redondea (regla: dentro de ≈ ±10 % del teórico) | **B = 8 m** |
| 4. Taco | T = 0.7·B | **5.6 m** |
| 5. Sobreperforación | J = 0.3·B | **2.4 m** |
| 6. Espaciamiento | H/B = 1.9 < 4 → S = (H + 7B)/8 | (15 + 56)/8 = **8.9 m** |
| 7. Carga | Q = π/4·D²·L_carga·ρ_e con L_carga = H + J − T = 15 + 2.4 − 5.6 = 11.8 m | π/4 × 0.312² × 11.8 × 780 kg/m³ = **≈ 700 kg** (el cálculo con 0.311 m da 700.1 kg) |
| 8. Factor de carga | FC = Q/(V·ρ_r), V = H·B·S | 700/(15 × 8 × 8.9 × 2.6) = **253 g/t** (0.253 kg/t; 0.657 kg/m³) |

**A.2 Voladura amortiguada (buffer)** — pozos de 9⅞" con W = 380 kg/pozo y quebradura Q_b = 5 m: B_buf = [W·1000/(FC·K_BP·H·ρ_r·SBR)]^0.5 con K_BP = 1, SBR = S/B = 8.9/8 ≈ 1.1: [380 000/(253 × 1 × 15 × 2.6 × 1.1)]^0.5 = **5.9 ≈ 6 m**; S_buf = 1.15 × 6 = **6.9 m**; distancia precorte-buffer DST = [K_BP·(D_buf·S_buf·B_buf)/(D_prod·S_prod·B_prod)]^0.5·Q_b = [(9.875 × 6.9 × 6)/(12.25 × 8.9 × 8)]^0.5 × 5 = **3.4 m**.

**A.3 Precorte** — Ø 6½", explosivo tipo Enaline ρ = 1.1 g/cc, VOD 3.5 km/s, UCS 50 MPa, RT 8 MPa, pozo seco (n = 1.25), 2 m superiores sin carga (l_exp = 13 m de 15 m). Imponiendo Pb = UCS: f = (UCS/(110·ρ·VOD²))^(1/n) = 0.0664; D_exp = √(f·D_pozo²·l_pozo/l_exp) = **1.80" → se adopta 1¾"**; con 1¾": f = 0.0628 → Pb = 110·f^n·ρ·VOD² = **46.6 MPa**; espaciamiento E ≤ D_pozo·(Pb + RT)/RT = 0.1651 × (46.6 + 8)/8 = **1.12-1.13 m**; factor de carga γ ≤ **1.53-1.54 kg/m²**. `[P1-S5 p69]`; verificado por [CALC].

### Ejemplo B — Diseño "MEQ73 11 pulg" de `X-DP` (columna K de *Diseños de Carga*)

**Datos de entrada (celdas):** banco H = 15 m (`K10`); sobreperforación J = 1 m (`K11`); Ø = 11" (`K13`); espaciamiento S = 8.5 m (`K9`); burden B = S/1.15 (`K8`); densidad de roca 2.69 t/m³ (`K7`); densidad de la mezcla 1.38 g/cc (`PRECIO POR TALADRO!K6`); carga de fondo 7.8 m (`K22`) y esponjamiento 0.9 m (`K23`); sin carga superior, decks ni aire; potencia MEQ-73: 726 kcal/kg = 3.036 MJ/kg (`Cálculo ABS Y AWS!D18, H18`); VOD 5 400 m/s (`PB!E9`); precios y accesorios de la hoja `PRECIO POR TALADRO`.

| # | Cálculo | Fórmula | Valor |
|---|---|---|---|
| 1 | Burden | B = S/1.15 | **7.391 m** |
| 2 | Longitud de taladro | L = H + J | **16 m** |
| 3 | Volumen por taladro | V = B·S·H | **942.39 m³** |
| 4 | Toneladas por taladro | V·ρ_r | **2 535.03 t** |
| 5 | Densidad lineal | DCL = 0.507·ρ·D² | 0.507 × 1.38 × 121 = **84.659 kg/m** |
| 6 | Carga por taladro | Q = DCL × 7.8 | **660.34 kg** |
| 7 | Densidad media tras gasificar | ρ_med = Q/[(7.8 + 0.9) × 0.507 × 11²] | **1.2372 g/cc** |
| 8 | Taco | T = L − 7.8 − 0.9 | **7.30 m** |
| 9 | Factor de carga | Q/V | **0.7007 kg/m³** |
| 10 | Factor de potencia | Q/(V·ρ_r) | **0.2605 kg/t** |
| 11 | Energía por taladro y factor de energía | Q × 3.036 MJ/kg; ÷ toneladas | **2 004.8 MJ**; **0.791 MJ/t** |
| 12 | Razones geométricas | H/B; S/B; T/B; J/B; T/Ø | 2.03; 1.15; 0.99; 0.135; 26.1 |
| 13 | SD de Chiappetta | kg/m = ρ_med·Ø²/1275 = 75.75; L_w = 10·Ø = 2.794 m; W = 211.65 kg; D = T + L_w/2 = 8.697 m; SD = D/W^(1/3) | **1.459** (Excel: 1.462 con exponente 0.333) → "muy controlada" |
| 14 | Presión de detonación / de taladro | PD = 0.25·ρ_med·VOD²·10⁻⁶ ; PB = 0.5·PD | **9.02 GPa** ; **4.51 GPa** (45.1 kbar) |
| 15 | Kuz-Ram (A = 5.2 ilustrativo, W = 0.3 m, f_m = 1.1) | X50 = A·(V/Q)^0.8·Q^(1/6)·(115/RWS)^0.633, RWS = 80.67 | **X50 = 25.5 cm**; n = 1.04; Xc = 36.4 cm; X80 ≈ 57.5 cm; pasante a 25 cm = 49 % **[CALC]** |
| 16 | Costo de voladura | Q × 0.4313 US$/kg + accesorios (1.71 + 5.34 + 0.37 × 5.1 + 23.8 + 3.866 = 36.603) | 284.80 + 36.60 = **321.40 US$/taladro** |
| 17 | Costo de perforación | 9 US$/m × 16 m | **144 US$/taladro** |
| 18 | Costo total unitario | (321.40 + 144)/2 535 | **0.1836 US$/t** (voladura 0.1268 + perforación 0.0568) |
| 19 | Retardos (ejemplo de diseño) | filas: 6-12 ms/m × B; entre taladros: 3-9 ms/m × S (pirotécnicos) | filas 44-89 ms (apretada) o 89-222 ms (suelta); taladros 25-77 ms |
| 20 | PPV a 100 m (K = 982, α = 1.2068; ilustrativo) | PPV = K·[(q/R)·Δθ]^α con q = 75.75 kg/m, columna 8.7 m, hoyo 16 m | **≈ 36 mm/s** **[CALC]** |

**Verificaciones "de cordura" (lo que el software debería marcar):** H/B = 2.03 (regular según Konya); S = 8.5 vs. S = (H + 7B)/8 = 8.34 m (coherente); taco 7.3 m ≈ 1.0·B (dentro de 0.7-1.3 B) y ≈ 26 Ø (encima del rango 15-25 Ø); J = 1.0 m (0.135·B: bajo frente a 0.2-0.5·B; **[DUDA 7]**); PF = 0.26 kg/t; SD = 1.46; burden vs. autores: Andersen 7.32 m, Ash (Kb 30) 8.38 m, Konya 8.15 m.

**Comparación con los otros tres diseños de la misma hoja** (mismos precios; valores del Excel, salvo la columna "SD corregido" **[CALC]**):

| Diseño (col.) | Ø | S (m) | B (m) | Carga | Q (kg) | Ton/taladro | FC (kg/m³) | PF (kg/t) | SD Excel | SD corregido | US$/t total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| "Actual" (J) | 12¼" | 8.0 | 6.96 | fondo 7.8 (+0.9), aire sup. 1.3, taco 6.0 | 818.9 | 2 245.6 | 0.981 | 0.365 | 1.141 | 1.14 | 0.2377 |
| MEQ73 (K) | 11" | 8.5 | 7.39 | fondo 7.8 (+0.9), taco 7.3 | 660.3 | 2 535.0 | 0.701 | 0.260 | 1.462 | 1.46 | 0.1836 |
| MEQ73 (L) | 11" | 7.5 | 6.52 | fondo 4.9 (+0.45), deck 1.3, sup. 3.9 (+0.45), taco 5.0 | 745.0 | 1 973.6 | 1.015 | 0.377 | 0.879 | 1.07 | 0.2698 |
| MEQ73 (M) | 11" | 6.5 | 5.65 | aire inf. 1.0, fondo 4.9, sup. 3.9 (+0.9), taco 5.3 | 745.0 | 1 482.4 | 1.352 | 0.503 | 0.893 | 1.16 | 0.3591 |

`X-D2` repite la estructura con títulos "Fase VI B2" y, en las columnas L y M, Ø = 10.625" y S = 6.5 m.

**Notas sobre el Excel (para no replicar sus errores):** (i) en L y M la "densidad media" (`L16`, `M16`) divide la carga **total** (incluye la carga superior) entre sólo la altura de la carga de fondo → da 2.27 y 2.48 g/cc, físicamente imposibles, y contamina `SD Frank` y `PB` (PB de Slurrex LC = 104 kbar); (ii) `J19` resta un peso (`J27`, kg) de una longitud (m); (iii) `PB!D20:D23` divide kbar por 10 y lo rotula MPa (son GPa); (iv) `M47:M50` mezclan $/taladro con $/t. Ver sección 7.

### Ejemplo C — Pequeño diámetro (cantera), tablas 20.3 y 20.4 (`P1-S5 p70-72`)
Roca con UCS = 150 MPa ("dura", 120-180), banco H = 10 m, perforación con martillo en cabeza Ø = 89 mm inclinada 20°; hidrogel encartuchado de 75 mm (1.2 g/cc) para el fondo y ANFO a granel (0.8 g/cc) en la columna.
- Sobreperforación J = 12·D = 1.1 m; longitud de taladro L = H/cos 20° + (1 − 20/100)·J = 10.64 + 0.88 ≈ **11.5 m**.
- Taco T = 32·D = **2.8 m**; burden B = 35·D = **3.1 m**; espaciamiento S = 43·D = **3.8 m** (tabla 20.3, fila "dura").
- Volumen arrancado V_R = B·S·H/cos 20° = **125.4 m³**; rendimiento de arranque = V_R/L = 10.9 m³/m.
- Carga de fondo l_f = 40·D = **3.6 m** (tabla 20.4, "dura"); el peso de la columna aplasta los cartuchos y su diámetro medio sube 10 % → q_f = π/4 × 0.0825² × 1 200 = 6.4 kg/m; Q_f = **23.0 kg**.
- Carga de columna l_c = 11.5 − 2.8 − 3.6 = **5.1 m**; q_c = π/4 × 0.089² × 800 = 5.0 kg/m; Q_c = **25.5 kg**; Q_barreno = **48.5 kg**; consumo específico CE = 48.5/125.4 = **0.387 kg/m³**.

### Referencia de código para contrastar el ejemplo B (Python, unidades del Excel)

```python
import math
def banco(H=15, J=1, D_in=11, S=8.5, rho_r=2.69, rho0=1.38, Lf=7.8, Lsw=0.9,
          mj_kg=3.036, rws=80.667, A=5.2, W=0.3, fm=1.1):
    B = S/1.15; L = H+J; V = B*S*H; ton = V*rho_r
    dcl = 0.507*rho0*D_in**2; Q = dcl*Lf
    rho_med = Q/((Lf+Lsw)*0.507*D_in**2); T = L-Lf-Lsw
    D_mm = D_in*25.4; kgm = rho_med*D_mm**2/1275; Lw = 10*D_mm/1000
    SD = (T+Lw/2)/(Lw*kgm)**(1/3)
    X50 = A*(V/Q)**0.8*Q**(1/6)*(115/rws)**0.633
    n = fm*(2.2-14*B/D_mm)*math.sqrt((1+S/B)/2)*(1-W/B)*((abs(Lf-0)/(Lf+0)+0.1)**0.1)*((Lf+Lsw-J)/H)
    Xc = X50/0.693**(1/n)
    return dict(B=B, V=V, ton=ton, dcl=dcl, Q=Q, rho_med=rho_med, T=T,
                FC=Q/V, PF=Q/ton, FE=Q*mj_kg/ton, SD=SD, X50=X50, n=n, Xc=Xc,
                PD_GPa=0.25*rho_med*5400**2*1e-6)
# esperado: B 7.391, Q 660.34, rho_med 1.2372, T 7.30, FC 0.7007, PF 0.2605,
#           FE 0.791, SD 1.459, X50 25.5 cm, n 1.04, PD 9.02 GPa
```

---

## 6. Mapa concepto → función de software

**Módulos sugeridos** (nombres de trabajo): **M1** Proyecto y sitio · **M2** Biblioteca de roca/dominios · **M3** Biblioteca de explosivos · **M4** Biblioteca de accesorios · **M5** Equipos de perforación · **M6** Editor de malla · **M7** Editor de carga por taladro · **M8** Secuencia y tiempos · **M9** Predicciones (fragmentación, vibración, energía, riesgo) · **M10** Contorno (precorte/buffer) · **M11** Costos y comparación · **M12** Reportes y exportación · **M13** QA/QC de campo. (Sugerencia del redactor. El material del curso usa como referencia MS3D/Minesight para la malla, JKSimBlast para simulación, WipFrag para granulometría y Dispatch para enviar la malla a los equipos `[V2-02-1 p19-21, p28; V1-04M p20]`; y presenta I-Blast EVO (diseño, simulación de desplazamiento, fragmentación, vibración y onda aérea, fotogrametría, MWD, optimización de carga y tiempos, inventario digital de explosivos, dashboard e informes) e I-Blast ULT (modelado 4D del movimiento de la roca, fragmentación y vibración; "gemelo digital de la voladura") como productos de referencia `[PV4\10 Optimización y Simulación…\Clase 01 - Presentación I-Blast.pdf p6-9]`.)

| Ficha / concepto | Pantalla o módulo | Dato de entrada | Cálculo o función | Salida / validación |
|---|---|---|---|---|
| F01 Altura de banco | M1 (banco) + M6 | H, tipo de pala, taladro máx. de la perforadora | L = H + J; H/B; chequeo H vs Ø vs equipo de carga | Aviso si H > 15 m (seguridad) o H/Ø fuera de 50-70; taladro > longitud máxima del equipo |
| F02 Diámetro | M5 + M6 | Ø broca (pulg/mm), diámetros disponibles | Ø → DCL, área; sugerencia B = k·Ø según UCS y explosivo; compatibilidad con producto (Ø crítico) | Lista de brocas válidas; alerta Ø < Ø crítico |
| F03 Burden | M6 | Ø, ρ_e, ρ_r, Kd, Ks, UCS, Vp, tipo de explosivo | Módulo "burden por autores": Andersen, Ash, Konya(-Walter), Langefors, López Jimeno, k·Ø; promedio/rango | Tabla comparativa; usuario elige burden operativo; se marca burden fuera de ±10 % |
| F04 Espaciamiento y malla | M6 | Tipo de malla, S/B, H/B | S = f(B, H/B, tipo); generación de la malla (x, y) trabada/cuadrada; ángulo de la malla | Coordenadas de taladros, ID, área de influencia |
| F05 Sobreperforación | M6 | Regla elegida (0.3B, 0.1H, k·Ø) | J; L = H + J | Longitud de perforación por taladro; advertencia si J/B fuera de rango |
| F06 Taco | M7 | Regla (0.7B, 15-25Ø, SD objetivo), material | T por regla o por SD objetivo (T = SD·W^(1/3) − Ø/200) | T recomendado y su rango; alerta de taco corto (flyrock) |
| F07 DCL y carga | M7 | Producto por tramo, Ø, longitudes, densidad medida | DCL = 0.507·ρ·D²; Q = ΣDCL·L; ρ_med tras esponjamiento | Kg por taladro, kg por retardo (MIC) |
| F08 FC / PF / FE | M7 → tablero de indicadores | Q, B, S, H, ρ_r, MJ/kg | FC, PF, FE por taladro, por fila y por voladura | Indicadores con rangos de referencia por tipo de roca |
| F09 Rigidez H/B | M6 tablero | H, B | I = H/B, clasificación de Konya | Semáforo (pobre/regular/bueno/excelente) |
| F10 Configuración de carga | M7 | Tramos (fondo, columna, deck, aire), longitudes | Editor gráfico del taladro; suma de longitudes = L | Plano de carga; error si no cierra longitud |
| F11 Cámara de aire | M7 | Posición y longitud, separador | Ahorro de carga; distribución de energía | Resumen de carga sustituida y de energía por metro |
| F12 SD | M7 + M9 | Taco, Ø, ρ_med | W = ρØ³/127 500; D = T + 5Ø; SD | Categoría 6 rangos (colores) y aviso de proyección |
| F13 Gasificación | M3 + M7 | ρ inicial, ρ final, esponjamiento, tiempo en taladro | Longitud inicial a cargar → altura final; control de solución | Alerta de tiempo > 72 h con agua o 96 h seco |
| F14 VOD / Ø crítico | M3 | Curvas VOD-Ø del producto, Ø crítico | Interpolación VOD(Ø); validación | Bloquea productos por debajo de Ø crítico |
| F15 PD/PB | M3 + M9 | ρ, VOD, γ, desacople | PD = ρ·VOD²/4 (o /(γ+1)); PB ≈ 0.5·PD | Verifica cebo suficiente; PB vs UCS en precorte |
| F16 Energía y potencia | M3 | AWS, ρ, gasificación; ANFO de referencia | RWS, RBS, energía por taladro, MJ/t; E efectiva | Comparador de productos (con aviso de fabricante) |
| F17 Balance de O₂/humos | M3 + M13 | Composición, tiempo en taladro, agua | Banderas de riesgo de NOx; energía por ingredientes | Alerta de humos |
| F18 Selección de explosivo | M3 + M7 | Agua (seca/estática/dinámica), Ø, roca, temperatura | Reglas de compatibilidad producto-taladro | Filtra productos; recomienda manga o emulsión |
| F19 Cebado | M7 + M4 | Posición y número de primas, tipo de detonador | Verificación de doble primado (Δt dispersión < t_columna) | Alerta; lista de cables/longitudes |
| F20 Retardos y alivio | M8 | Retardos por conector o programación | ms/m de burden, ms/m de espaciamiento, comprobación de rangos | Tabla de tiempos, alertas por fuera de rango |
| F21 Secuencia | M8 | Punto de inicio, patrón (V, echelon, filas), conectores | Cálculo de t(i,j); isotiempos; detección de orden invertido | Mapa de isotiempos, animación, MIC por ventana |
| F22 Dispersión | M8 + M9 | Precisión del accesorio | Monte Carlo del orden real; cobertura de secuencia | Probabilidad de taladros fuera de secuencia, PPV esperado ± |
| F23 Fragmentación | M9 | A, Q, V, RWS, n, curva | Kuz-Ram (X50, n, curva), también Swebrec/JKMRC | Curva granulométrica, P50/P80, % sobretamaño; calibración con WipFrag |
| F24 Roca | M2 | UCS, RT, E, ν, ρ, Vp, RQD/RMR, JPS/JPA, alteración | Factor de roca A (McKenzie/Cunningham), Blast Index, VPPc | Dominios con presets; alertas de litología/agua/pirita |
| F25 Vibración | M9 | K, α o β, MIC, distancias, Vp, geometría | PPV lejano y cercano (Holmberg-Persson), ¼·VPPc, FS de cuña | Isolíneas de PPV, PPV en puntos de control, MIC máximo admisible |
| F26 Precorte / buffer | M10 | UCS, RT, Ø, producto, agua, H, taco | Pb = 110·f^n·ρ·VOD²; E ≤ D(Pb + RT)/RT; γ; B_buf; DST | Diámetro de carga, kg/m, espaciamiento, tiempo previo ≥ 100 ms |
| F27 Flyrock / airblast | M9 | T, B, SD, secuencia, estructuras cercanas | Semáforo de riesgo; zona de exclusión | Advertencias en el resumen |
| F28 Costos | M11 | Precios ($/kg, $/pza, $/m), ROP, CH | $/taladro, $/t, TDC; comparación de alternativas; efecto en dig rate/throughput | Tabla comparativa y gráfico costo vs. P80 |
| F29 Perforación rotativa | M5 | UCS, broca, pulldown, RPM, aire, CFM | Pulldown máx., VB, ROP relativo, TDC | Recomendación de parámetros por dominio |
| F30 Precisión y QA/QC | M13 | Malla real (as-drilled), profundidad medida, densidad, taco medido | Diseño vs. real, desviación W, recálculo de carga por taladro | Reporte de conformidad ±30 cm; taladros a recargar |

**Datos maestros mínimos** (para no perderse): *taladro* (id, x, y, z, inclinación, azimut, profundidad, diámetro, agua), *carga* (lista ordenada de tramos con producto, longitud, densidad medida, masa), *accesorio* (tipo, retardo nominal, precisión, posición), *evento de tiempo* (taladro, ms, origen), *roca-dominio* (propiedades y factor de roca), *producto* (densidades, VOD-Ø, energía, agua, Ø crítico, precio).
**Extensión posterior (subterráneo):** el material toca de pasada el diseño de galería (burden y espaciamiento del pie; ejemplo de 40 taladros cargados + 2 de alivio, con retardos escalonados) `[P4-C3 p27; P1-S4 p87-89]`; queda fuera de este primer borrador.

---

## 7. Dudas, contradicciones y fórmulas ambiguas (para que el ingeniero de minas las resuelva)

Cada punto indica **qué dicen las fuentes**, **por qué importa para el software** y **qué decisión se pide**. Los números entre corchetes remiten a las páginas o celdas.

**1. Umbral de deflagración y rango de VOD.** `P2-01 s14` dice que hay deflagración con VOD < 1 000 m/s; `V1-01P p8` dice que la VOD fluctúa entre 2 438 y 7 925 m/s y que < 2 000 m/s "se dice que el explosivo deflagra". El ANFO en taladro pequeño reporta ≈ 3 900 m/s `[V1-01P p9]`. *Decisión:* ¿qué umbral usa la alerta del software (1 000 ó 2 000 m/s) y con qué diámetro de referencia?

**2. Presión de detonación: fórmula y unidades.** (a) `P2-C9 p18`: PD = ρ·VOD²·10⁻⁵/4 "en MPa o kbar" (con ρ g/cc y VOD m/s el resultado sale en kbar); (b) `P4-C7 p3`: Pd = 250·ρ·VOD² con VOD en km/s y Pd en MPa; (c) `P5 p24`: Pd = 0.25·ρ·VOD²·10⁻⁶ en GPa con VOD en m/s; (d) `V2-04-1 p9` y `X-DP TRABAJOUTILQUANTEX!D9`: PD = ρ·VOD²/(γ + 1) con γ = 2.24 → 11.13 GPa para MEQ-73, frente a 9.02 GPa con 0.25 (γ = 3) para ρ = 1.15 y VOD = 5.6 km/s. (e) `X-DP PB!C20`: ρ·VOD²/(8·10⁵) → 45.1 kbar (50 % de PD) pero la columna `D` divide entre 10 y dice "MPa" (son GPa: 4.51). (f) La presión de taladro se toma como 50 % de PD (rango 30-70 %) `[V1-01P p13]`. *Decisión:* ¿qué expresión es la oficial del curso, en qué unidad se muestra, y cuándo se usa γ variable?

**3. "Potencia relativa": dos definiciones y ANFO de referencia cambiante.** Definición simple RWS = AWS/AWS_ANFO y RBS = ABS/ABS_ANFO `[V2-04-1 p16; P5 p21; X-DP Cálculo ABS Y AWS]`; definición de Langefors PR = (1/6)(V/V₀) + (5/6)(Q/Q₀) `[P4-C7 p5]` (con ella el ejemplo da 77 % y 110 %). Energía del ANFO de referencia: 900 kcal/kg `[X-DP C8; P5 p10]`, 912 `[V1-01E p17]`, 913 `[P4-C7 p5]`, 969 kcal/kg (4.05 MJ/kg) `[V2-04-1 p17-19]`; densidad de referencia 0.8 ó 0.82 `[P5 p10]`; el propio curso avisa de que cada fabricante usa un valor `[V2-04-1 p11]`. Además Kuznetsov usa RBS en `P5 p10` pero RWS en `P1-S6 p9` y en las hojas (ver 13). *Decisión:* definición por defecto, valor de energía del ANFO y "AWS" del explosivo con que se calibrará el software; si habrá modo por fabricante.

**4. Densidad media, SD y decks en `X-DP` / `X-D2`.** En las columnas L y M (con carga superior) `L16`/`M16` dividen la carga total (fondo + superior) entre sólo la altura de la carga de fondo → 2.27 y 2.48 g/cc, imposibles para una emulsión gasificada (rango físico ≈ 0.9-1.4). Esos valores alimentan `SD Frank` (SD = 0.879 y 0.893, casi "incontrolada") y `PB` (PB Slurrex LC = 104 kbar). Con la densidad por tramo (fondo 1.264 y superior 1.237/1.121 g/cc) el SD sale ≈ 1.07 y 1.16 ("controlada"). *Decisión:* confirmar que la densidad debe calcularse por tramo y **qué carga define el SD en un taladro con decks** (¿la superior bajo el taco? ¿la más cercana a la superficie incluyendo aire?).

**5. Otras inconsistencias de los Excel.** (i) `X-DP Diseños de Carga!J19` resta `J27` (kg) de una longitud; `K19` no lo incluye; (ii) filas 47-50: `M47` se rotula "$/ton" pero calcula `L37 − J37` en $/taladro, `M48` usa `K47` (vacía) → 0; `M50` es "+51 %" sólo para la columna M; (iii) `X-QTX F3!J23` = D14/J14 (cociente) pero `J49` = D40 − J40 (diferencia), ambos rotulados "kg excedidos de ME"; (iv) `X-D1 Diseño Varios Autores`: la columna de Ash usa Ø = 7.125" y las demás 10.624" pero el promedio `N16` las mezcla; `C96` (segundo Konya) da `#REF!`; Langefors usa c' = c + 0.75 (`C86`) — el valor habitual es c + 0.05 para B ≥ 1.4 m o c + 0.75/B para B < 1.4 m **[GENERAL]**; (v) `X-D1 Diseño K-R 1` tiene valores en caché incoherentes (burden 1.0 m con banco de 15 m, factor de carga 13 560 g/t): parece guardada a mitad de un cálculo con Solver; (vi) varias hojas devuelven `#VALUE!` (p. ej. `Fragmentación_energía!I5:I15`) por rangos nombrados no resueltos. *Decisión:* ¿cuáles hojas son "oficiales" para validar código y cuáles sólo material de clase?

**6. Longitud de taladro con sobreperforación.** `P1-S5 p43` escribe L = H + 0.3·J (probablemente un error de notación; la misma presentación usa J = 0.3·B en `p58` y `p40`); el resto del material usa L = H + J `[P4-C3 p26; X-DP K12]`. *Decisión:* L = H + J.

**7. Reglas de sobreperforación incompatibles.** 0.2-0.5·B (Atlas), 0.3·B (Konya), 0.2-0.3·B (Hoek y Bray) `[P4-C4 p4]`; 0.1·H `[P5 p8]`; 0.3·B `[P1-S5 p58]`; 10-12·Ø (tabla 20.3) `[P1-S5 p18]`; Excel: 1 m. Para el ejemplo B (B = 7.39 m; Ø = 279.4 mm) dan 1.5-3.7 m según la regla. *Decisión:* regla por defecto y si se permite J = 0 en estratos horizontales con buen despegue `[P1-S4 p40]`.

**8. Relación diámetro-altura de banco.** `P5 p8`: Ø_máx = 15·H (Ø mm, H m); `P5 p10`: H = 50-70·Ø; `P4-C3 p38`: D(pulg) = H(pies)/10 (Atlas), D = H/40 (roca dura) y D = H/66 (blanda) (Hoek y Bray). Con H = 15 m: 225 mm; Ø entre 214 y 300 mm; 4.9" (125 mm); 375 mm y 227 mm. La mina del curso perfora 311 mm en 15 m. *Decisión:* qué regla activa la alerta y cuál queda como referencia.

**9. Burden efectivo.** `P2-C9 p3`: en malla equilátera el burden perforado es 0.87·S y con iniciación "V1" el burden efectivo es 0.29·S; también se define el efectivo como la distancia a la cara libre más cercana al instante de detonar `[P2-01 s7]`. No se da fórmula general. *Decisión:* ¿el software calcula el burden efectivo de cada taladro por geometría del orden de iniciación (recomendado) y con qué definición de "cara libre" en cada tiempo?

**10. Reglas de taco.** 0.7-1.3·B (Atlas) y 15-25·Ø `[P4-C4 p5]`; 0.7·B `[P5 p8; P1-S5 p58]`; Lt/B entre 70 y 100 % `[P5 p10]`; 30-35·Ø `[P5 p8]` y 30-32·Ø; "al menos 20·d" y material de 1/17·d `[P1-S4 p45]`; tamaño del material 0.05·Ø (Konya) o 0.15·Ø (Atlas) `[P4-C4 p5]`; fórmula de `X-D1 Taco` con UCS y factor z; criterio SD. En el ejemplo B (Ø 279.4 mm, B 7.39 m) van de 4.2 m a 9.8 m. *Decisión:* ¿cuál es el método por defecto y cuál el de verificación (SD)?

**11. Espaciamiento y malla.** S = 1.15·B `[P4-C4 p3; X-DP]`, 2B/√3 = 1.1547·B y "E = 1.4·B" `[P5 p8]`, S = (1-2)·B `[P4-C4 p3]`, S = (H + 7B)/8 (H/B < 4) y 1.4·B (H/B ≥ 4) `[P1-S5 p59]`, "S/B nunca > 2" `[P1-S6 p18]`, "2 < S/B < 4" para la diagonal de la secuencia nueva `[P4-C5 p28]`. Además el umbral de rigidez es H/B = 3 (Ash) en `P1-S5 p39` y 4 en `p59`. *Decisión:* fórmula y umbral por defecto.

**12. Terminología del "factor de carga".** Como kg/m³ `[P4-C7 p11; P4-C4 p6; P4-C3 p28 (relación peso explosivo/peso roca)]`, como kg/t `[P2-01 s8]`, como g/t `[P1-S5 p60; X-D1 K-R 1]`, "consumo específico" kg/m³ `[P1-S5 p71]`; el "factor de potencia" es kg/t `[P4-C7 p9; X-DP fila 34]`. En `X-DP` la fila 33 "Factor de Carga (kg/m³)" usa `J29/(B·S·H)` (carga total) en J y `K18/(B·S·H)` (sólo fondo) en K, y `L29`, `M29` en las otras. *Decisión:* nombres y unidades internos (sugerencia: `loading_factor_kg_m3`, `powder_factor_kg_t`, `energy_factor_MJ_t`) y cómo tratar la carga superior.

**13. Kuz-Ram: variantes de fórmula.** (a) Índice de uniformidad n: `P5 p10` incluye un factor E/B dentro del paréntesis elevado a 0.1 y multiplica por L/H; `P1-S6 p16` y `X-D1` usan |BCL − CCL|/L (o /(Lf + Lc)) y la fracción (L_carga sobre piso)/H; `X-D1 K-R 1` usa además Rc = (H − T)/H; f_m = 1.0/1.1/1.15 en `P5 p10` pero sólo 1.0 ó 1.1 en los Excel. (b) En Kuznetsov, el término (115/RBS)^0.633 en `P5 p10` frente a (115/E)^0.633 con E = potencia relativa **en peso** en `P1-S6 p9` y las hojas; y hay una versión con TNT (constante 167) en `P1-S6 p9`. (c) Xc "corresponde al 62.9 % pasante" en `P1-S6 p11` (matemáticamente 63.2 %). (d) X80 en `X-GRAN B17`: "X80 = Xc·Potencia(ln(1/1−0.8))" está escrito sin paréntesis completos y sin el exponente 1/n. (e) Factor de roca: A = 0.06·(...) (Cunningham) vs 0.04 (McKenzie) `[X-D1 Factor de Roca]`, "F de 1 a 15" `[P5 p10]` vs "A de 3 a 13" `[P1-S6 p12]`, y valores 2.3-11 usados en los Excel. *Decisión:* versión canónica de n y de Kuznetsov (peso/volumen) y el rango de A.

**14. Fórmulas de "tiempos cortos" entre taladros.** Chiappetta: T = (S/Vp)·600 y Lagrange: T = (S/Vp)·2 500 `[P4-C7 p12]`; T = 0.7·(S/Vp)·1 000 `[V1-04M p10]`; y en `P4-C5 p27` "Fórmula 1.1 (F. Chiappetta, 2003)": T = 0.5·(S/Vs)·1 000 con Vs = velocidad de la onda **S** y S = espaciamiento nominal. Las constantes (0.5, 0.6, 0.7, 2.5) y la onda usada (P o S) difieren; los resultados son del orden de 1-4 ms, inferiores a cualquier retardo pirotécnico. *Decisión:* qué fórmula, con Vp o Vs, y si sólo se ofrece para electrónicos.

**15. Precisión de los detonadores.** Electrónico: 0.01 % `[V2-03-1 p11]`, 0.005 % `[P2-C7 p10-11]`, "0-2 % alta precisión" `[P5 p78]`; `X-D1 Traslape` usa 2 % de desviación; no eléctricos 3-5 % (entre taladros), 2-4 % (entre filas), 1-2 % (fondo) `[V2-03-1 p8]`, "1-5 %" `[V2-03-1 p11]`; baja precisión 0-7 % `[P5 p78]`. Rango programable: 0-20 000 ms `[P5 p59]`, 1-25 000 ms `[P5 p56]`. *Decisión:* valores por defecto por familia y si la dispersión es normal, uniforme, etc.

**16. Burden de alivio (ms/m) con rangos distintos.** 3-9 ms/m de espaciamiento y 10-15 ms/m de burden (pirotécnico), 0.3-9 y 1.2-15 (programable) `[P4-C5 p19-20]`; 15-20 (duro), 20-25 (medio-blando), 30-40 (contornos) `[P4-C5 p30]`; < 60 y < 150 ms/m `[P4-C8 p5]`; 6-12 y 12-30 `[P5 p69-71]`; escala 0-36 ms/m `[P5 p76]`; entre filas ≥ 2-3× el retardo entre taladros `[P5 p67]` frente a 9.5× (17/162 ms) y 16× (9/148 ms) del caso de mina `[V1-04M p30]`. *Decisión:* qué tabla de rangos por tipo de roca/pala se codifica.

**17. Erratas o datos dudosos en las láminas.** `P1-S4 p26`: gneis de Canadá con densidad 0.26 t/m³ (¿2.60?), arenisca de Virginia con 1.87 t/m³ y E = 0.69 (× 10 GPa); `V1-04M p24`: Vp = 7 656 "mm/s" (debe ser m/s); `P2-C9 p18`: "MPa o kbar" (ver 2); `V2-04-2 p14`: gráfico de costos con seis porcentajes sin leyenda explícita; `P2-C8 p49`: el ejemplo de TDC (4.0596 vs 4.0864 US$/m) no puede reproducirse porque el costo horario y otros datos están en imágenes o faltan. *Decisión:* qué datos se corrigen antes de usarlos como "tablas semilla".

**18. Tablas 20.3 y 20.4 (López Jimeno) son de "pequeño diámetro" (65-165 mm).** Se usan también como reglas generales (p. ej. sobreperforación 10-12·Ø y B = 33-39·Ø en `P5 p8`). Aplicadas a Ø 279 mm dan B = 10.3 m, S = 13.1 m, T = 9.5 m y J = 3.1 m (roca media 70-120 MPa), muy por encima de los diseños reales de 7.4 m/8.5 m/7.3 m/1 m. *Decisión:* si el software debe limitar la vigencia de estas tablas por rango de diámetro.

**19. Un mismo producto con distintos datos.** Densidades: HA-28 0.90 vs 0.88, HA-37 1.00 vs 0.97, HA-46 1.15 vs 1.17, HA-55 1.27 vs 1.22 (`X-DP Cálculo ABS Y AWS` vs `X-TACO calculos!J4:L12`); ANFO 0.80, 0.77 y 0.78 (Esperanto) y 0.82 (referencia RBS); MEQ-73/Q73G: 1.37, 1.38, 1.25, 1.15 y 1.40 g/cc según hoja; emulsión matriz 1.40 vs 1.45. Accesorios: tubo de choque 15 mg/m `[P5 p48]` vs 18 mg/m `[P4-C1 p25]`; fulminante simple con 600 mg de PETN + 200 mg de azida `[P5 p45]` frente a N° 12 con 780 + 150 mg `[P4-C1 p14]` (el N° 8 aparece sin gramajes); la emulsión matriz "insensible al fulminante N° 6" `[V1-01E p28]` vs "sensible al detonador N° 8" (Exsaline). *Decisión:* de dónde saldrá el catálogo oficial (fichas técnicas del fabricante) y cómo se versiona.

**20. Interpolación de γ (Cunningham) y ratio de Gurney.** `X-DP TRABAJOUTILQUANTEX`: γ = 3.2 × %emulsión/100 (2.24 para 70 %), lo que daría γ = 0 en 0 % y no 2 (ANFO); el ratio de Gurney usa X = 0.68 − 0.21ρ (ANFO/HA) o X = 0.20 + 0.37ρ (gasificadas) y ρ_CJ = (4/3)·ρ fijo. *Decisión:* si se implementa este modelo de energía de choque útil y con qué interpolación.

**21. Constantes y aproximaciones numéricas.** DCL con 0.507 `[P2-01 s17]`, 0.5067 `[X-D1]`, ρ·D²/1275 (D en mm) `[X-DP SD Frank]` y 0.3405 (lb/ft); `X-D1 Precorte varios!B10` usa D²/12 140 sin identificar; exponente 0.333 en lugar de 1/3 (SD 1.462 vs 1.459); π ≈ 3.1416/3.141516 en `FS planar`. *Decisión:* usar constantes exactas y documentar la conversión.

**22. Vibración: falta de umbrales y de criterio único.** El material da K, α (982; 1.2068), VPPc = 3 110 mm/s y ¼·VPPc = 777.5 mm/s como criterio de daño en campo cercano `[V1-04M p24]`, y una hoja de ajuste K, β (2 159; −2.31) `[X-D1 HOLMBERG Fit]`, pero **no** da límites normativos de PPV para estructuras/comunidad ni la definición exacta de VPPc. La presión de taladro del precorte se da en dos formas: `V1-PRE p9`: Pb = 0.125·ρ·VOD²·[(r_c/r)·√C]^2.4 (r_c/r = relación de radios de carga y pozo, C = razón de longitud de carga; unidades no indicadas) y `P4-C8 p13`/`P1-S5 p62`: Pb = 110·f^n·ρ·VOD² (f = razón de volúmenes, n = 1.25 seco o 0.9 con agua, VOD en km/s → MPa); las dos tienen 0.5·ρ·VOD²/4 como base, pero difieren en el exponente (2.4 sobre el radio vs. 2.5 con n = 1.25). *Decisión:* qué límites de PPV y qué modelo (distancia escalar vs. Holmberg-Persson) se implementan primero.

**23. Alcance subterráneo.** El material de superficie trae sólo un ejemplo de galería (40 taladros cargados + 2 de alivio) `[P1-S4 p87-89]` y menciones de "burden y espaciamiento del pie" `[P4-C3 p27]`. *Decisión:* qué literatura/curso se usará para el módulo subterráneo (no incluida en este borrador).

---
