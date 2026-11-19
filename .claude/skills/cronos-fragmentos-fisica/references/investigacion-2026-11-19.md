# Fragmentos realistas para la pila de Cronos: tamaño, forma, velocidad y render

Investigación para pasar de **cubos iguales con color de Kuz-Ram** a **fragmentos de tamaños y formas variados, cada uno con su propia velocidad, ángulo y giro**. El caso principal es subterráneo (frentes y anillos); también cubre banco.

Fecha: 19/11/2026. Repositorio revisado (solo lectura): `/opt/dna-codeauni`, rama `origin/feat/ux-rediseno-sub`.

## Etiquetas de procedencia (úsalas al pasar esto a `docs/RULES.md`)

| Etiqueta | Significado |
|---|---|
| **[M]** | Dato **medido** en campo o en laboratorio, en una fuente que leí (o cuyo resumen leí). |
| **[F]** | **Fórmula publicada**. La forma es estándar y la cité de la fuente primaria o de una secundaria fiable. |
| **[NV]** | Lo cito de memoria o de una fuente secundaria. **No pude abrir el original** (muro de pago o 403). Hay que verificarlo antes de marcarlo R1. |
| **[S]** | **Supuesto o propuesta de implementación mía.** Es un parámetro calibrable, no un dato. |

Muchos PDF primarios (Springer, ScienceDirect, OneMine, Leoben, UPM) devolvieron 403 o muro de pago. Cada número indica de dónde salió.

---

## 0. Resumen ejecutivo (decisiones recomendadas)

1. **La curva no cambia, cambia cómo se muestrea.** Mantén KCO (Kuz-Ram + Swebrec), que ya está en `fragmentation.ts` y `underground/fragmentation.ts`. Pasa de *asignar un cuantil a un cubo* a *generar una población de fragmentos por clases de tamaño que conserva el volumen*. La curva es **en volumen (masa) pasante**: el número de fragmentos sale de dividir el volumen de cada clase por k_v·x³ (§1.5).
2. **Corte de render adaptativo por presupuesto.** Con x50 ≈ 8 cm (ronda típica de 16 m²), los fragmentos > 10 cm son unos **17 000**, pero solo el **40 % del volumen**. El resto va como **«grava» volumétrica**: la superficie de la pila con textura, más partículas proxy que cargan volumen (§1.6).
3. **Forma: biblioteca de 12 a 24 poliedros convexos** generados con **cortes planos sucesivos** de una caja. Se escalan por instancia con ejes L:I:S muestreados (medias I/L ≈ 0,72 y S/I ≈ 0,5) y se orientan al azar o según las familias de juntas. **No uses Voronoi de Poisson para la forma**: sus celdas tienen en promedio unas 15,5 caras, mientras que la roca natural fragmentada tiene unas 6,6 (Domokos et al. 2020, [M]) (§2).
4. **Velocidad por fragmento** = velocidad local del modelo actual × dispersión lognormal (σ_ln ≈ 0,25–0,35) × un término débil de tamaño (x/x50)^(−β), con β = 0–0,3 [S]. Solo el material de la zona del taco y de la cara cercana a la carga (proyecciones) sigue la ley v ∝ 1/T de Lundborg (§3).
5. **Ángulo:** dispersión de ±10–15° (1σ) en banco y de ±15–25° en el cuele [S]. **Giro:** |ω| ≈ κ·v/L con κ = 0,1–0,5 (unos 1–20 rad/s) [S]. **Arrastre:** despreciable para fragmentos ≥ 0,1 m en vuelos menores de 3 s. Úsalo solo en finos y proyecciones.
6. **Render:** una `InstancedMesh` por forma base (de 12 a 24 draw calls) o una `BatchedMesh`. Matriz por instancia T·R·S(L,I,S) y color por instancia. El vuelo parabólico conviene calcularlo **en el shader de vértices** a partir de (p0, v0, ω, t0) por instancia. En subterráneo, las trayectorias con rebote van como textura de puntos clave (§4). PRNG **sin estado, por contador**: hash(semilla, taladro, índice), como el `hash01` que ya existe.

---

## 1. Distribución de tamaños

### 1.1 Kuz-Ram (Cunningham 1983, 1987, 2005) [F]

Tamaño medio (Kuznetsov, modificado por Cunningham):

```
x50 [cm] = A · K^(−0,8) · Q^(1/6) · (115/RWS)^(19/30)        (1987)
x50 [cm] = A · A_T · K^(−0,8) · Q^(1/6) · (115/RWS)^(19/20) · C(n)   (2005, «Kuz-Ram 20 años después»)
```

- K: factor de carga [kg/m³]. Q: kg por taladro. RWS: potencia relativa en peso frente al ANFO (= 100).
- A: factor de roca, A = 0,06·(RMD + JF + RDI + HF) (Lilly 1986 / Cunningham 1987). Va de 0,8 a 22 y lo típico es 7–13.

Curva de Rosin-Rammler: R(x) = 1 − exp(−0,693·(x/x50)^n).

Índice de uniformidad, versión 1987 (como lo transcribe Fonseca de Castro 2021, [F]):

```
n = (2,2 − 14·B/d)·√((1 + S/B)/2)·(1 − W/B)·(|BCL − CCL|/L + 0,1)^0,1·(L/H)
```

La versión 2005 cambia el primer factor por n_s·√(2 − 30·B/d) e introduce n_s, que depende de la dispersión de retardos [NV en el detalle de n_s]. El repo ya la tiene (FC-UG5).

**Límites conocidos de la ley:**
- Kuz-Ram **subestima los finos**: es la motivación del CZM y del TCM (Kanchibotla et al. 1999; Djordjevic 1999) [F].
- La fórmula de Kuznetsov da en origen el tamaño **medio**, no la mediana. Ouchterlony la corrige con g(n) en KCO (Sanchidrián & Ouchterlony 2017) [F].
- Cunningham (2005) recomienda avisar cuando n queda fuera de 0,7–2. El repo ya avisa.

### 1.2 Swebrec y KCO (Ouchterlony 2005) [F]

```
P(x) = 1 / {1 + [ ln(xmax/x) / ln(xmax/x50) ]^b },   0 < x < xmax
b    = 2·ln2·ln(xmax/x50)·n                         (enlace KCO con el n de Cunningham)
x50  = g(n)·A·Q^(1/6)·(115/RWS)^(19/30) / K^0,8,    g(n) = (ln 2)^(1/n) / Γ(1 + 1/n)
xmax ≈ min(S, B) o (S + B)/2, o el tamaño del bloque in situ (lo que sea menor)
```

- Fuentes: Ouchterlony (2005) *Mining Technology* 114(1):A29–A44. Fonseca de Castro (2021) transcribe estas ecuaciones para frentes (abajo).
- Swebrec ajusta datos de cribado en 2 a 3 órdenes de magnitud con r² > 0,995 [M, según Ouchterlony citado por Fonseca de Castro].
- Ouchterlony et al. (2017) muestran que, para cumplir el «abanico fragmentación–energía», **b debe ser constante** para una roca. Eso permite calibrar b por sitio y no recalcularlo con n en cada taladro [F].
- **b típico:** 1,5–4. Con los valores del ejemplo de §1.6, b sale entre 3,2 y 3,9 [S, calculado].

**Inversa analítica de Swebrec** (para muestrear): con P en (0, 1),

```
x(P) = xmax · exp( −ln(xmax/x50) · (1/P − 1)^(1/b) )
```

Rosin-Rammler: x(P) = xc·(−ln(1 − P))^(1/n), con xc = x50/(ln 2)^(1/n). El repo ya tiene `swebrecSize` y `rosinRammlerSize`.

### 1.3 Finos: CZM y TCM (JKMRC) [F]/[NV]

- **Crush Zone Model** (Kanchibotla, Valery & Morrell 1999, EXPLO 99). Hay dos Rosin-Rammler:
  - la gruesa es Kuz-Ram para x > x_c;
  - la fina se ajusta para que pase por (x_c, P_c) y por (1 mm, V_triturado/V_total). Todos los finos bajo 1 mm salen del cilindro triturado alrededor del taladro.
- **Radio de la zona triturada** (Esen, Onederra & Bilgin 2003) [F, NV en las constantes]:
  - r_c = 0,812·r0·CZI^0,219;
  - CZI = Pb³/(K_r·σc²);
  - K_r = E_d/(2(1 + ν_d)).
- **Two-Component Model** (Djordjevic 1999): P(x) = 1 − F_c·exp(−(x/a)^b1) − (1 − F_c)·exp(−(x/c)^b2), con F_c la fracción triturada [F].
- **Cuidado:** simulaciones HiDEM indican que la mayor parte de los finos **no** se forma junto al taladro, como supone el CZM (resultado citado en búsqueda; Leoben, 2016) [NV].
- **Consecuencia para Cronos:** los finos bajo el corte de render no se dibujan como objetos. Basta con conocer su **volumen** (§1.6). Swebrec, que ya está, da una cola fina razonable.

### 1.4 Particularidades subterráneas

- **Frente por zonas** [M]. Fonseca de Castro (2021, *Underground Mining Engineering* 39:29–42, caso de la mina Kittilä, O-Pitblast):
  - divide la ronda en **arranque, zapateras, contorno y producción** (ayudas);
  - calcula Kuz-Ram y Swebrec por zona con su propio factor de carga;
  - mezcla las curvas ponderando por el volumen de cada zona (área × avance);
  - el arranque da muchos más finos, pero pesa poco en el volumen; la producción domina la curva;
  - contra la curva medida con Split Desktop, **Swebrec ajusta mejor por encima de x50**; abajo la foto no ve los finos;
  - datos del caso: perforación específica de 2,3 m/m³, factor de carga de 2,73 kg/m³ (tabla de la fuente).
  - **El repo ya hace exactamente esto** (FC-UG6, `faceFragmentationZones`).
- **Valores orientativos** para una ronda de desarrollo (cálculo propio con Kuz-Ram 1987) [S]:
  - producción con A = 10, K = 2,5 kg/m³, Q = 3 kg, RWS = 100: **x50 ≈ 6 cm**;
  - arranque con K = 6–10 kg/m³: **x50 ≈ 2–3 cm**;
  - xmax de la ronda ≈ 0,5–0,8 m, limitado por S y B de las ayudas y por la sección.
- **Anillos de tajeo:**
  - Oñederra & Chitombo (2007, *Mining Technology* 116(4):180–195, doi:10.1179/174328607X282244) proponen la metodología de diseño de anillos.
  - FRAGMENTO (Oñederra 2005) es un modelo por zona cercana y lejana para un solo anillo.
  - En abanicos, el burden y el espaciamiento de pie varían a lo largo del taladro. Conviene calcular la curva **por tramo del taladro** (cerca del collar el espaciamiento es pequeño y la fragmentación fina; en el pie es gruesa).
  - El repo usa un B y un S equivalentes por anillo, con calibración de C.
- **Contorno (voladura suave):** carga lineal baja, ≈ 90·d² kg/m. Da fragmentos **más grandes y en lajas** paralelas al perfil [S, cualitativo].

### 1.5 Cómo muestrear una población desde la curva (lo importante)

La curva P(x) es una **fracción de volumen (masa) pasante**. Si se sacan tamaños con la inversa de P y se le da a cada fragmento su propio volumen x³, la población queda sesgada hacia los grandes. Hay dos opciones correctas:

**A. Por clases (recomendado: determinista y conserva el volumen exactamente) [S]**

1. Toma clases log-espaciadas x_0 = x_corte < x_1 < … < x_M = xmax, con 8 a 16 clases por década.
2. Volumen de la clase: V_i = V_taladro·[P(x_{i+1}) − P(x_i)].
3. Número de fragmentos: N_i = V_i / (k_v·x̄_i³), con x̄_i = √(x_i·x_{i+1}). Redondea con arrastre del error a la clase siguiente, para que Σ V quede exacto.
4. Dentro de la clase, saca x con la inversa de P restringida a [P(x_i), P(x_{i+1})] usando el PRNG por contador. Después reescala los volúmenes de la clase para que sumen V_i.

**B. Densidad en número.** f_N(x) ∝ f_V(x)/x³, con f_V = dP/dx. Se tabula su CDF en una grilla logarítmica y se invierte. Es útil para un muestreo continuo, pero conserva el volumen solo en promedio.

**Factor de volumen k_v** (volumen = k_v·x³, con x = tamaño de criba) [S, a calibrar]:
- Una partícula pasa por una malla cuadrada x si su sección I×S cabe: aproximadamente I ≲ x.
- Con L:I:S = 1,4 : 1 : 0,5 y un poliedro que llena ≈ 0,6–0,7 de su caja, k_v ≈ 1,4·0,5·0,65 ≈ **0,45**.
- Rango defendible: 0,4–0,6.
- Para la masa: m = ρ·k_v·x³.

**Reparto espacial** (hoy es S-22: fino cerca de la carga, grueso en el taco) [S]:
- **Mantén el gradiente, pero con ruido.** Ordena las posiciones de los fragmentos por un puntaje s = d_carga/B + ζ, con ζ ~ N(0, 0,3).
- Asigna los tamaños ordenados a ese orden. Así se mezclan tamaños en todo el volumen, sin capas perfectas.
- La zona del taco sigue siendo la más gruesa (Kuz-Ram por tramos o la ley de Lundborg para la zona del collar).

### 1.6 Corte mínimo de render y volumen de finos

Cálculo con Swebrec y k_v = 0,5 (`references/nfrag.py`) [S, calculado]:

| Caso | V (m³) | x50 / xmax / n | Corte 5 cm | Corte 10 cm | Corte 20 cm | Corte 30 cm |
|---|---|---|---|---|---|---|
| Ronda de desarrollo, 16 m² × 4 m | 64 | 0,08 / 0,6 / 1,2 | 124 000 frag. (67 % vol.) | **17 200 (40 %)** | 970 (12 %) | 85 (3 %) |
| Solo el arranque, 1 m² × 4 m | 4 | 0,03 / 0,3 / 1,0 | 6 800 (31 %) | 360 (9 %) | ≈ 0 | 0 |
| Banco, un taladro 4,5 × 5 × 12 m | 270 | 0,30 / 2,0 / 1,5 | 161 000 (93 %) | 45 000 (86 %) | **10 200 (68 %)** | 3 300 (50 %) |
| Anillo de tajeo, 2,5 m × 150 m² | 375 | 0,25 / 2,0 / 1,3 | 290 000 (90 %) | 71 000 (80 %) | 13 500 (59 %) | 3 900 (41 %) |

**Conclusiones [S]:**
- **Corte adaptativo:** se elige x_corte de modo que Σ N(x > x_corte) ≈ presupuesto. Presupuesto recomendado: **30 000–80 000 instancias** en escritorio y 10 000–20 000 en móvil o en el Quest. Se resuelve por bisección sobre la tabla de clases.
  - En banco, un corte de 0,2–0,3 m ya muestra la mayor parte del volumen.
  - En frentes, la mayor parte del volumen es más fina que el corte: **la pila subterránea se ve sobre todo como grava**, con unos pocos cientos a pocos miles de bloques visibles. Es correcto físicamente.
- **Volumen bajo el corte (V_fino = V·P(x_corte)):**
  1. Se deposita en el heightmap de la pila, que ya existe. La superficie lleva un material de grava con un tamaño de textura ligado a x50 del material fino.
  2. Durante el vuelo, se representa con **partículas proxy** (puntos o sprites con alpha, o instancias pequeñas de tamaño ≈ x_corte). Cada una carga el volumen de muchos fragmentos: V_proxy = V_fino/N_proxy, con N_proxy ≈ 10–20 % del presupuesto. Pueden llevar polvo en el arranque.
- **Clases de tamaño en los indicadores:** se siguen calculando sobre la curva completa, no sobre lo dibujado.

---

## 2. Forma de los fragmentos

### 2.1 Datos medidos

| Fuente | Material | Resultado |
|---|---|---|
| Domokos, Jerolmack, Kun & Török (2020) PNAS 117(31):18178 | 556 fragmentos naturales de dolomita (más 3 728 en otro set) | Media de **6,63 caras y 8,93 vértices**: «el fragmento natural medio es un cuboide». El modelo de rotura binaria da 6,58 / 8,74. El Voronoi 3D exige tensión hidrostática triaxial y es raro en la fractura primaria [M] |
| Sun, Indraratna & Nimbalkar (2014) Géotech. Lett. 4:197 (escáner láser 3D) | Balasto de roca **triturada** de cantera | **I/L medio 0,70–0,78**, **S/I medio 0,40–0,55**, esfericidad 3D 0,7–0,8. La mayoría son «ligeramente alargados y moderadamente planos». Los más pequeños son más alargados y planos [M] |
| Ponencia WMC, Track 6 (IIMP), proyecciones de 5 minas escaneadas en 3D | Fragmentos proyectados reales | **Factor de forma ≈ 1,05** y **esfericidad media ≈ 0,78**. Lo usan como entrada del arrastre [M, sin detalle del método] |
| Linero et al. (ACG 2020) | Sobrecarga de BIF (sedimentaria laminada) | En roca laminada, **los grandes son más planos** (discoidales) que los chicos. Protocolo de Krumbein (1941) para L, I y S [M, cualitativo] |
| Estudio de túneles en Nepal (NepJOL, 853 fragmentos de 15 rondas controladas) | Voladura de túnel | Clasificación de Zingg y de Sneed-Folk (laja, disco, barra, esfera). No pude abrir los números [NV] |

**Síntesis de L:I:S** para roca volada competente, con el balasto como mejor dato medido de roca rota mecánicamente:
- **L : I : S ≈ 1 : 0,72 : 0,36** (I/L ≈ 0,72; S/I ≈ 0,5). La hipótesis del pedido, 1 : 0,7 : 0,4, es consistente.
- En roca con juntas o laminación marcadas, S/I baja a 0,3 y aparecen lajas.

### 2.2 Distribuciones recomendadas para muestrear [S]

- **I/L ~ Beta**, media 0,72, desviación estándar 0,10, recortada a [0,45; 0,98].
- **S/I ~ Beta**, media 0,50 (0,35 en roca con familia de juntas dominante), desviación estándar 0,12, recortada a [0,2; 0,95].
- **Correlación con el tamaño:** de serie es débil (los chicos algo más planos, según Sun 2014). En roca laminada se invierte (los grandes más planos, según Linero). Debe ser un parámetro del dominio.
- **Contorno:** los fragmentos de la zona del contorno salen con S/I − 0,1.

### 2.3 Juntas

- La forma del bloque in situ la dan los espaciamientos de las familias de juntas:
  - 3 familias ortogonales con espaciamientos s1 ≥ s2 ≥ s3 dan bloques de L:I:S ≈ s1:s2:s3;
  - Kalenchuk, Diederichs & McKinnon (2006), IJRMMS 43:1212, clasifican la forma de bloque con el diagrama α–β [NV].
- **Propuesta [S]:**
  - si el dominio tiene juntas (rumbo/manteo y espaciamiento), las razones medias I/L y S/I se toman de los espaciamientos (mezclados 50/50 con los valores de §2.2);
  - el eje S del fragmento se alinea con el polo de la familia de menor espaciamiento, con una dispersión de unos 15°;
  - sin juntas, la orientación es aleatoria uniforme (cuaternión uniforme, Shoemake).
- **xmax ≤ tamaño del bloque in situ** (el repo ya lo hace en FC-UG5).

### 2.4 Generación procedimental de geometrías

| Método | Caras medias | Pros | Contras | Uso recomendado |
|---|---|---|---|---|
| **Cortes planos sucesivos** de un cubo o caja (rotura binaria al estilo Domokos) | ≈ 6–8 | Coincide con lo medido. Convexo, barato y determinista | No llena el espacio por sí solo | **Biblioteca de formas base** (12–24 mallas de 8 a 30 triángulos) |
| Envolvente convexa (`ConvexGeometry` de three) de 8–14 puntos sobre un elipsoide con ruido | ≈ 6–12 | Trivial con three | Puede quedar demasiado redonda | Alternativa rápida |
| **Voronoi de Poisson** (voro++, Rycroft 2009) | ≈ 15,5 | Llena el espacio. Hay librerías | Demasiadas caras: aspecto de «grano», no de roca volada | Solo para fracturar en pantalla, no como forma estadística |
| **Laguerre o Voronoi ponderado** con pesos según los tamaños muestreados (Neper; Quey et al. 2011, 2018) | ≈ 13–15 | Llena el volumen in situ con la distribución de tamaños objetivo | Costoso (de segundos a minutos para 10⁵ celdas). Las caras siguen siendo muchas | Opcional para vistas «antes de volar» de alto detalle |
| **DFN + cortes** (juntas explícitas, luego cortes por voladura) | variable | Lo más físico: la forma hereda las juntas | Complejo | Fase posterior |

**Recomendación [S]:**
- **No hace falta teselar el volumen in situ para que el resultado sea realista.** Antes del disparo, la roca in situ se dibuja como el macizo actual: los cubos o el sólido de la excavación.
- En el instante en que sale cada taladro, esa porción se reemplaza por sus fragmentos. Cada uno nace en una posición dentro de la celda de Voronoi del taladro, que el repo ya calcula.
- Las posiciones se reparten con Poisson-disc de radio ∝ tamaño, o simplemente con jitter dentro de las celdas de la retícula actual (cada celda de blockSize se subdivide en sus fragmentos).
- El solapamiento inicial de unos pocos ms no se ve con el polvo ni con la velocidad.

### 2.5 Qué hacen los códigos DEM de voladura

| Código | Discretización | Fragmentos | Fuente |
|---|---|---|---|
| **DMC_BLAST** (Preece, Sandia, desde 1987) | Esferas en 3D o cilindros en 2D, integración explícita | Partículas unidas por enlaces que se rompen por tracción o corte. El gas fluye como en un medio poroso y empuja las partículas. Validado contra la velocidad de cara y el % de casting de una voladura real | OSTI 10162263, 10107551; Sandia SAND (1994, 1996, 1998) [M/F] |
| **Blo-Up / HSBM** (Itasca, JKMRC, consorcio desde 2001) | FLAC en el campo cercano, acoplado a un DEM de red (lattice) para la onda, la fragmentación y la pila | Los fragmentos son **grupos de nodos** que se separan. Validado en cubos de hormigón | Furtney et al. (2009, 2011); Oñederra et al. (2013) IJRMMS [F] |
| **SABREX** (ICI, Kirby y Harries) | Bloques rígidos con velocidad por gas | Pila empírica | Citado junto a DMC [NV] |
| BLASPA (Favreau 1969, 1983) | Elementos del burden con velocidad por expansión de gas | Velocidad por elemento | [NV] |
| «Bench Blast DEM», «MBM» | — | No encontré una fuente identificable con esos nombres. Habría que pedir la referencia exacta | — |

**Lección:** ningún código práctico usa poliedros «bonitos» para la pila a escala de voladura. Usan esferas o redes de nodos, y la forma se calibra por fricción o resistencia a la rodadura. Para Cronos, **la física del nivel 1 puede seguir con puntos**. La forma es visual y entra en la física solo por el k_v (volumen), el arrastre (área) y la restitución o rodadura en el nivel 2 (Rapier con colisionadores convexos de 8 a 16 vértices).

---

## 3. Velocidad por fragmento

### 3.1 Datos medidos de velocidad

| Fuente | Tipo | Resultado |
|---|---|---|
| Herrero, Sanchidrián, Gómez & Segarra (ISEE 2026). Cantera El Aljibe, 3 voladuras a 2 000 fps | Video de alta velocidad, cara del banco 2D | **Velocidad inicial de 4–17 m/s**; tiempo de respuesta de 0,7–21,7 ms. Su modelo analítico de velocidad inicial y tiempo de respuesta explica ≈ 87 % de la variabilidad [M] |
| Caso de la cuenca de Jharia (OSTI ETDE 20007183) | Video de alta velocidad en mina a cielo abierto | Fragmentos volando a **13,2–28,0 m/s** con **ángulos de 30° a 135°**. La mejor fragmentación se dio con una velocidad de burden ≈ 6 m/s [M] |
| Segarra et al. (2003), «Analysis of bench face movement in quarry blasting»; Sanchidrián, Segarra & López (2007) IJRMMS 44:130, «Energy components in rock blasting» | Video, sismógrafo y granulometría | Perfil escalonado de la velocidad en la altura del banco, constante dentro del burden. La energía cinética es una fracción del orden de 3–21 % de la energía del explosivo [NV en las cifras] |
| SLC en Kiruna (acelerómetros en el burden; en el repo como Petropoulos 2024) | Anillo subterráneo confinado | El burden se mueve casi como una unidad, con una aceleración rápida hasta un **máximo de 16–32 m/s** y luego frenado [M] |
| USBM RI 7356 (1970), citado en el repo | Galería de 2,1 × 3,7 m | Alcance de 13,7–23,5 m [M, según el repo] |
| Ensayos de spalling en laboratorio (ResearchGate 271208559) | Probetas | Fragmentos de hasta ≈ 26,6 m/s. Los que salen después son más lentos [M] |

**Tamaño frente a velocidad:**
- **No encontré ninguna medición a escala de voladura que relacione el tamaño de cada fragmento con su velocidad.**
- Lo más cercano son impactos hipervelocidad (el tamaño máximo baja al subir la velocidad, a 5–13 km/s, fuera de escala) y la ley de **Lundborg para proyecciones** [F/NV, citada en fuentes secundarias]:

```
L_max [m] = 260·d^(2/3)                       (d en pulgadas)
T [m]     = 0,1·d^(2/3)                       (tamaño del fragmento que alcanza L_max)
v [m/s]   = 10·d·2600 / (T·ρ_r)               (d en pulgadas, ρ_r en kg/m³)  → v ∝ 1/T
```

- Esto es una **envolvente de proyecciones** (fragmentos chicos de la zona del taco o de la cara débil), no la ley de la masa principal. El repo ya tiene L_max y T (FC-29).
- Richards & Moore (2004): v0 = k·(√m/B)^1,3, con k = 13,5 (roca blanda competente) a 27 (roca dura). Los valores medidos en 4 calizas van de 15,4 a 21,9.

### 3.2 Modelo recomendado de velocidad por fragmento [S]

```
v_i = v_local(p_i) · exp(σ·z_i − σ²/2) · clamp((x_i/x50)^(−β), 0,6, 1,6)
```

- **v_local(p_i):** la del modelo actual en la posición del fragmento (Zhang, carga escalada o Richards-Moore × exp(−λr/B) × taco × piso; en subterráneo, UG-P1 a UG-P3).
- **z_i ~ N(0, 1)** sale del PRNG por contador. **σ = 0,25–0,35**: reproduce el rango de Jharia (13–28 m/s, unas 2 veces entre extremos) y el de El Aljibe (4–17 m/s entre puntos de la cara). La corrección −σ²/2 mantiene la media.
- **β = 0,15 por defecto** (rango 0–0,3): da una dependencia débil del tamaño (de igual momento a igual velocidad).
  - Justificación física: el burden se mueve casi como un cuerpo (SLC, perfil escalonado de Segarra), así que β ≈ 0 para la masa principal.
  - Los fragmentos chicos se desprenden de la superficie libre y del taco con más velocidad (Lundborg, spalling), así que β > 0 en la cola.
- **Proyecciones explícitas:**
  - Una fracción f_p ≈ 10⁻⁴–10⁻³ del número de fragmentos del tramo del collar (de los más chicos, x < 0,1 m) sale con v = min(v_Lundborg(T = x), 3·v_local).
  - Se marcan como proyección y **se excluyen de los indicadores de la pila**, igual que hoy con los bloques sueltos más allá del throw.
- **Subterráneo:**
  - Cuele: v desde UG-P1 (3–25 m/s), dirección axial ±20° (1σ) [S].
  - Ayudas: hacia el hueco ya abierto ±15°.
  - Zapateras: un componente hacia arriba de 10–25° para «levantar» la pila (las zapateras van más cargadas para eso; R4 §1.2).
  - Contorno: v × 0,5 y dirección hacia el centro de la sección.
  - Anillos de tajeo: v = UG-P2 (2–8 m/s) hacia el slot y luego caída libre.

### 3.3 Ángulo de lanzamiento y dispersión [S]

- **Media:** la del modelo actual (de launchAngleFloor a launchAngleCrest, o 90° − β_cara).
- **Dispersión:** von Mises-Fisher (cono) alrededor de la dirección media, κ ≈ 15–30, lo que equivale a un σ angular de 10–15°. En el cuele, κ ≈ 8–12 (σ ≈ 17–20°).
- El rango de Jharia, 30–135°, es el **extremo** observado e incluye proyecciones. No es la desviación típica.

### 3.4 Giro (velocidad angular) [S]

- No encontré mediciones de ω en voladuras. Los modelos 6-DOF de fragmentos (Sandia, OSTI 1483211 y 1479217) muestran giro con precesión: los fragmentos que más lejos llegan se estabilizan presentando el canto [M, otro dominio].
- **Propuesta:**
  - ω_i = κ_ω·(v_i/L_i)·u_i, con u_i un eje aleatorio que favorece el eje transversal a v (u ⊥ v ± 30°);
  - **κ_ω = 0,1–0,5** (por defecto 0,25);
  - ejemplo: v = 20 m/s y L = 0,5 m dan ω ≈ 10 rad/s (≈ 1,6 vueltas/s);
  - origen físico: el gradiente de velocidad a través del fragmento (de la carga hacia la cara libre) es del orden de Δv ≈ v·L/B.
- **Física del nivel 2:** al chocar con el piso o la pila, los fragmentos reales ruedan. En Rapier se usan restitución 0,2–0,35 y fricción 0,5–0,7 (ya en UG-P4 y UG-P5). Rodar consume parte del alcance.

### 3.5 Arrastre aerodinámico

```
a_drag = (ρ_aire · C_d · A_proy · v²) / (2·m)      A_proy medio (tumbling) = área superficial / 4  (teorema de Cauchy)
```

- C_d ≈ 0,8–1,2 para cuerpos irregulares romos, con Re ≈ 10⁵–10⁶ [F/NV]. Moxnes & Frøyland (2017): el C_d de un fragmento irregular que gira es mayor que el de una esfera o un cubo.
- **Orden de magnitud** para una esfera equivalente, con ρ_r = 2 700, C_d = 1 y v = 20 m/s:
  - a_drag ≈ 0,44 m/s² (4,5 % de g) para d = 0,3 m;
  - ≈ 1,3 m/s² para d = 0,1 m;
  - ≈ 6,7 m/s² para d = 0,02 m.
- **Conclusión [S]:** se puede ignorar en fragmentos ≥ 0,1 m y vuelos < 3 s (banco y subterráneo). Hay que aplicarlo a proxies finos y proyecciones. En ese caso conviene integrar con RK2, o usar la solución cerrada con arrastre cuadrático solo en x.

### 3.6 Alcance y largo de la pila en subterráneo

- **Frentes de desarrollo:**
  - alcance de 10–25 m, con el grueso a menos de 15 m (USBM RI 7356: 13,7–23,5 m en una galería de 2,1 × 3,7 m) [M, según el repo, UG-P8];
  - comprobación por balance de volumen [S]: L_pila ≈ A·avance·η·S_w / (W·h̄). Ejemplo: 16 m² × 4 m × 0,9 × 1,6 / (4 m × 1,5 m) ≈ **15 m**, coherente con la medición;
  - regla práctica [S]: L_pila ≈ 3–6 × el avance.
- **Anillos de tajeo:** la roca cae al vacío del tajeo. El desplazamiento horizontal es de pocos metros (de 2 a 8 m/s × menos de 1 s). La pila la gobierna la gravedad y el ángulo de reposo (37°).
- **SLC:** 0,4–1,6 m de desplazamiento (Kiruna) [M, repo UG-P2b].

---

## 4. Render en tiempo real con three.js

### 4.1 Arquitectura recomendada [S]

1. **Biblioteca de formas:** 12–24 poliedros convexos normalizados a la caja unitaria (L = I = S = 1), generados una vez con semilla fija mediante cortes planos (§2.4). Cada uno tiene 8–30 triángulos, normales planas (`toNonIndexed` + `computeVertexNormals`) y UV triplanares en el shader.
2. **Dibujo:**
   - **Opción A:** una `THREE.InstancedMesh` por forma, de 12 a 24 draw calls.
     - `instanceMatrix` = T·R·S, con S = (L, I, S)·escala y R = cuaternión.
     - `setColorAt` lleva el color por tamaño, dominio o taladro.
     - `computeBoundingSphere()` tras actualizar, porque el culling es por malla completa.
   - **Opción B:** `THREE.BatchedMesh` (r159+), con todas las formas en un solo draw call, culling y ordenamiento por instancia.
   - **Opción C:** la librería `@three.ez/instanced-mesh` (InstancedMesh2), con culling por instancia, LOD y BVH.
3. **Animación sin costo de CPU por cuadro:**
   - Atributos `InstancedBufferAttribute` por instancia: p0, v0, ω (eje·ángulo/s), t0 (tiempo de salida), t_imp y p_final.
   - Shader de vértices (`onBeforeCompile` sobre `MeshStandardMaterial`):
     - p(t) = p0 + v0·τ + ½·g·τ², con τ = clamp(t − t0, 0, t_imp − t0);
     - rotación de Rodrigues con ángulo |ω|·τ;
     - después del impacto, interpolación hacia p_final (la posición asignada en la pila, S-23).
   - Con 50 000 instancias es trivial en GPU.
   - **Subterráneo** (trayectorias con rebote, `blocks.path`): los puntos de cada fragmento van en una `DataTexture` RGBA32F (fila = fragmento, columnas = K puntos clave con t), que se muestrea en el shader. O bien se calculan solo para fragmentos representativos y el resto hereda la trayectoria del bloque padre con un desfase rígido más su giro propio.
4. **LOD:**
   - (a) Por distancia: lejos, las formas de menos caras.
   - (b) Lejos y para los muy chicos, `THREE.Points` con tamaño en pantalla.
   - (c) La pila en reposo se fusiona en el heightmap con textura de grava, y solo los fragmentos > 2·x_corte quedan como instancias encima.
5. **Física del nivel 2 (Rapier):** colisionadores `convexHull` de las mismas formas (con 8–16 vértices basta), solo para fragmentos > percentil 80 o hasta unos 3 000 cuerpos. El resto sigue con el modelo cinemático.
6. **Transferencia desde el worker:** arreglos `Float32Array` planos (p0, v0, ω, L, I, S, cuaternión, forma, t0), enviados como transferables. Ya es el patrón de `MuckpileBlocks`.

### 4.2 PRNG determinista [S]

- Usa **hash sin estado por contador**: u = hash(semilla_voladura, idTaladro, idFragmento, canal). El resultado no depende del orden de ejecución ni de cuántos workers haya.
- El repo ya tiene `hash01(k, salt)` (Wang + xorshift) en `underground/muckpile.ts`: conviene **moverlo a un util común** de `core`.
- Alternativas probadas: splitmix32/64, mulberry32 o PCG-hash.
- **Canales:**

| Canal | Uso |
|---|---|
| 0 | Tamaño dentro de la clase |
| 1 | I/L |
| 2 | S/I |
| 3 | Forma base |
| 4–7 | Cuaternión uniforme (Shoemake: 3 números) |
| 8 | z de velocidad |
| 9–10 | Cono de dirección |
| 11–12 | Eje de giro |
| 13 | Posición dentro de la celda |

- Normales gaussianas por Box-Muller con dos canales. La Beta, por inversa numérica tabulada o por aproximación de Kumaraswamy (que tiene CDF inversa cerrada).

### 4.3 Presupuesto orientativo [S]

- 50 000 instancias × 20 triángulos = 1 M triángulos. Va bien en escritorio con WebGL2.
- El atributo por instancia (unos 20 floats) ocupa unos 4 MB.
- En el Quest o en móvil: 10 000–20 000 instancias y sombras solo en las grandes.

---

## 5. Qué cubren ya los documentos del repo y qué falta

Revisado en `origin/feat/ux-rediseno-sub`:
- `packages/core/src/muckpile/README.md`;
- `docs/MUCKPILE-REPORT.md`;
- `docs/theory/references/R4-UNDERGROUND.md`;
- `docs/theory/02-CALCULATION-SPEC.md`;
- y, de apoyo, `docs/RULES.md` (§9 UG-P, FC-26, 27, 29, 44, UG5 y UG6) y la lista de funciones de `fragmentation.ts` y `underground/muckpile.ts`.

**Lo que ya está bien cubierto:**
- Kuz-Ram 1987/2005 con el factor de roca de Lilly y el aviso de n fuera de 0,7–2 (FC-26).
- Swebrec y KCO con b = 2·ln2·ln(xmax/x50)·n y xmax = min(S, bloque in situ) (FC-27 y FC-UG5).
- Frente por zonas con mezcla ponderada por volumen (FC-UG6, que coincide con Fonseca de Castro 2021).
- Lundborg L_max y T (FC-29).
- Ley de velocidad UG (Richards-Moore) con topes, rebote con restitución, esponjamiento, reposo, alcance de 10–25 m (USBM RI 7356) y SLC (Petropoulos).
- Dispersión determinista de velocidad por hash (UG-P3).

**Huecos:**
1. **R4-UNDERGROUND.md no dice nada de fragmentación ni de la pila subterránea.** Solo trata diseño (método sueco, anillos). Lo subterráneo de la pila está en RULES §9, no en la teoría de referencia.
2. **02-CALCULATION-SPEC:**
   - la fila de corrección de finos (JKMRC/Swebrec) no trae ecuaciones;
   - RM-11 dice «✖ (hay Swebrec)»: **el CZM y el TCM no están implementados ni documentados** (faltan r_c de Esen 2003, la segunda Rosin-Rammler y F_c);
   - no menciona el g(n) mediana/media de KCO (Ouchterlony 2005; Sanchidrián & Ouchterlony 2017) ni la constancia de b (abanico fragmentación–energía).
3. **El tamaño es solo un atributo de color** (FC-44, S-22): un cuantil determinista por distancia a la carga. **No hay población de fragmentos.** Falta:
   - documentar que P(x) es en volumen y que el número es V_i/(k_v·x³);
   - el factor de volumen k_v;
   - el corte de render y el tratamiento del volumen bajo el corte.
4. **Forma: nada en ningún documento.** No hay L:I:S, ni efecto de las juntas, ni método de generación.
5. **Velocidad:** todos los bloques de un taladro comparten la ley salvo la atenuación espacial. En banco **no hay dispersión aleatoria** (en UG sí, UG-P3: 0,25–1,3), y no hay dependencia del tamaño ni proyecciones separadas por tamaño. Tampoco hay **dispersión del ángulo**, **giro** ni análisis de **arrastre**.
6. **Datos de velocidad medidos:** solo se citan Zhang y Richards-Moore como leyes. Faltan como rangos de validación El Aljibe (4–17 m/s), Jharia (13–28 m/s y 30–135°) y el SLC de 16–32 m/s (aunque UG-P2 cita «10–32 m/s»).
7. **Anillos:** la curva usa un B y un S equivalentes por anillo. Falta **variar la fragmentación a lo largo del abanico** (collar fino, pie grueso).
8. **Contorno o voladura suave:** sin tratamiento de forma ni de tamaño propio (lajas).
9. **MUCKPILE-REPORT:** las clases de tamaño de la pila (23 % < 10 cm, etc.) salen de cuantiles por bloque de 1,5 m. Con una población real, esas fracciones se conservan, pero hoy **no se puede ver** la variedad dentro de un bloque.

---

## 6. Parámetros por defecto propuestos (para `MuckpileParams` y `UgMuckpileParams`)

| Parámetro | Defecto | Rango | Procedencia |
|---|---|---|---|
| Curva | Swebrec (KCO) | Swebrec o Rosin-Rammler | [F] Ouchterlony 2005 |
| b | calculado con n; opción fija por roca | 1,5–4 | [F] |
| Clases por década | 12 | 8–16 | [S] |
| k_v (volumen = k_v·x³) | 0,45 | 0,4–0,6 | [S] |
| Presupuesto de instancias | 50 000 (escritorio) / 15 000 (Quest) | — | [S] |
| Corte mínimo x_corte | adaptativo; piso 0,03 m | — | [S] |
| Fracción de proxies finos | 15 % del presupuesto | 5–25 % | [S] |
| I/L | Beta, media 0,72, d.e. 0,10 | 0,45–0,98 | [M] Sun et al. 2014 (balasto) |
| S/I | Beta, media 0,50, d.e. 0,12 (0,35 con juntas) | 0,2–0,95 | [M] Sun 2014; [S] juntas |
| Formas base | 16 | 12–24 | [S]; caras medias ≈ 6–8 según [M] Domokos 2020 |
| Ruido del reparto espacial ζ | 0,3 (en unidades de B) | 0–0,6 | [S] |
| σ lognormal de la velocidad | 0,30 | 0,2–0,4 | [S] calibrado con los rangos [M] de Jharia y El Aljibe |
| β (tamaño) | 0,15 | 0–0,3 | [S] |
| Dispersión angular (1σ) | 12° en banco; 18° en cuele | 8–25° | [S] |
| κ_ω (giro) | 0,25 | 0,1–0,5 | [S] |
| C_d (solo x < 0,1 m) | 1,0 | 0,8–1,2 | [F/NV] |
| Fracción de proyecciones del tramo del collar | 5·10⁻⁴ | 10⁻⁴–10⁻³ | [S] |
| Restitución y fricción del nivel 2 | 0,25 / 0,6 | 0,2–0,35 / 0,5–0,7 | [CG] repo UG-P4 y UG-P5 |

---

## 7. Referencias

**Fragmentación**
- Cunningham, C.V.B. (1983). The Kuz-Ram model for prediction of fragmentation from blasting. *1st Int. Symp. Rock Fragmentation by Blasting*, Luleå, 439–454. https://cir.nii.ac.jp/crid/1573387449354221568
- Cunningham, C.V.B. (1987). Fragmentation estimations and the Kuz-Ram model – four years on. *2nd Fragblast*, Keystone, 475–487. [NV]
- Cunningham, C.V.B. (2005). The Kuz-Ram fragmentation model – 20 years on. *Brighton Conf. Proc. (EFEE)*, 201–210. [NV; la copia de Wits devolvió 404]
- Ouchterlony, F. (2005). The Swebrec© function: linking fragmentation by blasting and crushing. *Mining Technology* 114(1):A29–A44. doi:10.1179/037178405X44539
- Ouchterlony, F., Sanchidrián, J.A. & Moser, P. (2017). Percentile fragment size predictions for blasted rock and the fragmentation–energy fan. *Rock Mech. Rock Eng.* 50:751–779. doi:10.1007/s00603-016-1094-x
- Sanchidrián, J.A. & Ouchterlony, F. (2017). A distribution-free description of fragmentation by blasting based on dimensional analysis. *Rock Mech. Rock Eng.* 50:781–806. doi:10.1007/s00603-016-1131-9
- Ouchterlony, F. & Sanchidrián, J.A. (2019). A review of development of better prediction equations for blast fragmentation. *J. Rock Mech. Geotech. Eng.* 11(5):1094–1109. doi:10.1016/j.jrmge.2019.03.001 (acceso abierto)
- Kanchibotla, S.S., Valery, W. & Morrell, S. (1999). Modelling fines in blast fragmentation and its impact on crushing and grinding. *EXPLO 99*, AusIMM, 137–144. https://www.ausimm.com/publications/conference-proceedings/explo-99/modelling-fines-in-blast-fragmentation-and-its-impact-on-crushing-and-grinding/
- Djordjevic, N. (1999). A two-component model of blast fragmentation. *6th Fragblast*, SAIMM, 213–219. https://onemine.org/documents/a-two-component-model-of-blast-fragmentation
- Esen, S., Onederra, I. & Bilgin, H.A. (2003). Modelling the size of the crushed zone around a blasthole. *IJRMMS* 40(4):485–495. doi:10.1016/S1365-1609(03)00018-2 [NV]
- Fonseca de Castro, D. (2021). Comparative analysis of fragmentation models for underground blasting. *Underground Mining Engineering* 39:29–42 (Univ. de Belgrado). https://ume.rgf.bg.ac.rs/index.php/ume/article/download/164/143 (leído)
- Onederra, I. & Chitombo, G. (2007). Design methodology for underground ring blasting. *Mining Technology* 116(4):180–195. doi:10.1179/174328607X282244
- Onederra, I. (2005). Breakage and fragmentation modelling for underground production blasting applications. https://onemine.org/documents/breakage-and-fragmentation-modelling-for-underground-production-blasting-applications
- Met Dynamics Wiki, Blasting (KCO), implementación en Excel. https://wiki.metdynamics.com.au/view/Blasting_(KCO)

**Forma**
- Domokos, G., Jerolmack, D.J., Kun, F. & Török, J. (2020). Plato's cube and the natural geometry of fragmentation. *PNAS* 117(31):18178–18185. doi:10.1073/pnas.2001037117. https://pmc.ncbi.nlm.nih.gov/articles/PMC7414180 (leído)
- Sun, Y., Indraratna, B. & Nimbalkar, S. (2014). Three-dimensional characterisation of particle size and shape for ballast. *Géotechnique Letters* 4:197–202. doi:10.1680/geolett.14.00036. https://opus.lib.uts.edu.au/bitstream/10453/118183/1/geolett.14.00036.pdf (leído)
- Linero, S. et al. (2020). Influence of particle size-shape correlation on the shear strength of scaled samples of coarse mine waste. *Slope Stability 2020*, ACG. https://papers.acg.uwa.edu.au/d/2025_42_Linero/42_Linero.pdf (leído)
- Zingg, Th. (1935). Beitrag zur Schotteranalyse. *Schweiz. Mineral. Petrogr. Mitt.* 15:39–140. Sneed, E.D. & Folk, R.L. (1958). *J. Geology* 66:114–150. Krumbein, W.C. (1941). *J. Sed. Petrology* 11:64–72. Blott, S.J. & Pye, K. (2008). *Sedimentology* 55:31–63.
- Franklin, J. Fragment shape measurements in geology and blasting (cap.). doi:10.1201/9780203747919-6
- Kalenchuk, K.S., Diederichs, M.S. & McKinnon, S. (2006). Characterizing block geometry in jointed rockmasses. *IJRMMS* 43(8):1212–1225. doi:10.1016/j.ijrmms.2006.04.004 [NV]
- Ponencia WMC (IIMP), Track 6, n.º 84: factor de forma de proyecciones de ≈ 1,05 y esfericidad de ≈ 0,78 en 5 minas. https://iimp.org.pe/WMC/actas/Track-6-Mining-Engineering-and-Mine-Planning/84/
- Estudio de túneles en Nepal (Zingg/Sneed-Folk, 853 fragmentos). https://www.nepjol.info/index.php/aa/article/download/99161/74994/286361 [403, NV]
- Rycroft, C.H. (2009). VORO++: a three-dimensional Voronoi cell library in C++. *Chaos* 19:041111. doi:10.1063/1.3215722
- Quey, R., Dawson, P.R. & Barbe, F. (2011). Large-scale 3D random polycrystals for the finite element method (Neper). *CMAME* 200:1729–1745. doi:10.1016/j.cma.2011.01.002

**Velocidad, proyecciones y DEM**
- Herrero, Sanchidrián, Gómez & Segarra (2026). Modeling of rock fragments trajectories ejected from blasting based on high-speed video analysis. *ISEE*. https://onemine.org/documents/modeling-of-rock-fragments-trajectories-ejected-from-blasting-based-on-high-speed-video-analysis (resumen)
- Blast evaluation using high speed video camera: a case study in Jharia coalfield. https://www.osti.gov/etdeweb/biblio/20007183 (resumen)
- Segarra, P., Sanchidrián, J.A., López, L.M. et al. (2003). Analysis of bench face movement in quarry blasting. https://www.researchgate.net/publication/300395364_Analysis_of_bench_face_movement_in_quarry_blasting [NV]
- Sanchidrián, J.A., Segarra, P. & López, L.M. (2007). Energy components in rock blasting. *IJRMMS* 44(1):130–147. doi:10.1016/j.ijrmms.2006.05.002 [NV en las cifras]
- Chiappetta, R.F., Burchell, S.L. & Dailey, J.R. (1983). The use of high-speed motion picture photography in blast evaluation and design. *ISEE*. https://onemine.org/documents/the-use-of-high-speed-motion-picture-photography-in-blast-evaluation-and-design
- Chiappetta, R.F., Vandenberg & Foley. Blast designs and diagnostics using portable, solid state, high-speed videography systems. https://onemine.org/documents/blast-designs-and-diagnostics-using-portable-solid-state-high-speed-videography-systems
- Video analysis of the blast face at the El Aljibe quarry (tesis de máster, Leoben). https://pureadmin.unileoben.ac.at/portal/files/8834015/AC16513053.pdf [403]
- Lundborg, N. (1974/1981). Svedefo, Reports DS. Fórmulas citadas en https://brentbuffham.github.io/kirra-docs/analysis/flyrock.html (secundaria) [NV]
- Richards, A.B. & Moore, A.J. (2004). Flyrock control: by chance or design. *ISEE*. [en el repo como FC-45]
- St George, J.D. & Gibson, M.F.L. (2001). Estimation of flyrock travel distances: a probabilistic approach. *EXPLO 2001*, AusIMM. https://onemine.org/documents/estimation-of-flyrock-travel-distances-a-probabilistic-approach
- Little, T.N. & Blair, D.P. (2010). Mechanistic Monte Carlo models for analysis of flyrock risk. *Rock Fragmentation by Blasting (Fragblast 9)*, 641–647. Copia: https://es.scribd.com/document/168260856/Little-Flyrock-Risk [NV]
- Moxnes, J.F. & Frøyland, Ø. (2017). Projected area and drag coefficient of high velocity irregular fragments that rotate or tumble. https://openaccess.library.uitm.edu.my/Record/doaj-790547845ef9471a8e33e062d67c4deb
- Sandia: trayectorias 6-DOF de fragmentos (giro y precesión). https://www.osti.gov/servlets/purl/1483211 y https://www.osti.gov/servlets/purl/1479217
- Preece, D.S. et al. DMC_BLAST. https://www.osti.gov/servlets/purl/10162263 ; https://www.osti.gov/servlets/purl/10107551 ; https://www.sandia.gov/research/publications/details/computer-cast-blast-modelling-1994-07-01/
- Itasca, Blo-Up / HSBM. https://www.itascacg.com/staging/cn/software/blo-up ; Furtney et al. (2011), validation tests for Blo-Up 2.5: https://www.itascacg.com/staging/cn/technical-papers/numerical-modeling-of-rock-blasting-validation-tests-for-blo-up-2-5
- Burden movement experiments using the HSBM (EXPLO 2007). https://www.ausimm.com/publications/conference-proceedings/explo-2007/burden-movement-experiments-using-the-hybrid-stress-blasting-model-hsbm/
- High Speed Photography of Stope Blasting in South African Gold Mines (ISEE 1985). https://onemine.org/documents/high-speed-photography-of-stope-blasting-in-south-african-gold-mines [solo resumen]
- USBM RI 7356 (1970), alcance en galería [citado en el repo, UG-P8].

**Render**
- three.js InstancedMesh: https://threejs.org/docs/#api/en/objects/InstancedMesh
- three.js BatchedMesh: https://threejs.org/docs/#api/en/objects/BatchedMesh
- three.js ConvexGeometry: https://threejs.org/docs/#examples/en/geometries/ConvexGeometry
- @three.ez/instanced-mesh (culling por instancia, LOD, BVH): https://github.com/agargaro/instanced-mesh
- Shoemake, K. (1992). Uniform random rotations. *Graphics Gems III*, 124–132.
- Rapier, colisionadores convexos: https://rapier.rs/docs/user_guides/javascript/colliders

---

*Script de conteo usado en §1.6: `references/nfrag.py`.*
