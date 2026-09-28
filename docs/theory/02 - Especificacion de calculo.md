# 02 — Especificación de cálculo (Fase 1)

Qué calcula el motor, con qué fórmula, en qué unidades y con qué ejemplo se comprueba. Cada bloque indica su **estado de regla** (R0–R4, guía sección 9) y el **caso de referencia** que lo prueba (`04 - Casos de referencia`).

**Lo que no está aquí no es una fórmula aceptada.** Si necesitas otra, se registra en `reglas.md` con fuente y pasa por los estados de la guía antes de usarse como bloqueo.

## 0. Convenciones

| Tema | Convención |
|---|---|
| Unidades internas | SI: m, kg, s, ms para tiempos, kg/m³, Pa, J. Conversión solo en la entrada y la salida (m/ft, mm/in, g/cc ↔ kg/m³, kcal/kg ↔ MJ/kg: 1 kcal = 4,184 kJ). |
| Constantes | Exactas (π/4, no 0,507 ni 0,7854 redondeados). Las hojas y láminas de origen usan 0,507 (con Ø en pulgadas y ρ en g/cc) o ρ·Ø²/1275 (Ø en mm): las diferencias (≈ 0,07 %) están dentro de la tolerancia de los casos. |
| Coordenadas | Este (E), Norte (N), Cota (Z) en metros, en el CRS (código EPSG) del proyecto. Z crece hacia arriba. |
| Ángulos | Azimut: grados desde el Norte, sentido horario, 0–360. Inclinación: grados desde la **vertical** (0 = vertical). |
| Diámetro | Ø del taladro en metros internamente. |
| Nombres internos de indicadores | `loading_factor_kg_m3` (Q/V), `powder_factor_kg_t` (Q/(V·ρ_r)), `energy_factor_MJ_t`. Nunca "factor de carga" sin unidad: en la literatura se usa como kg/m³, kg/t o g/t. |
| Redondeo | El motor no redondea. Solo la presentación redondea. |
| Nombres honestos | No llamar "energía" o "daño" a un valor normalizado sin unidades. |

## 1. Geometría de malla y volumen (G3) — estado R2, CR-01, CR-04

| Magnitud | Fórmula | Notas |
|---|---|---|
| Longitud del taladro | L = H + J (vertical). Inclinado α desde la vertical: L = H/cos α + J_α, con J_α la sobreperforación medida a lo largo del taladro. Una fuente (López Jimeno) usa J_α = (1 − α/100)·J con α en grados (CR-03). | Una lámina escribe L = H + 0,3·J: es errata; la misma fuente usa J = 0,3·B. |
| Volumen por taladro | V = B·S·H (vertical). Inclinado: V = B·S·H/cos α (CR-03). | B y S se miden **desde la cara libre** y entre taladros, no desde una constante. |
| Tonelaje por taladro | t = V·ρ_r | ρ_r en kg/m³ → t en kg (÷1000 para toneladas). |
| Rigidez del burden | I = H/B | Tabla de Konya: I = 1 pobre, 2 regular, 3 bueno, 4 excelente (fragmentación, proyección, vibración y onda aérea); I ≤ 2 implica mala distribución de energía. Los umbrales son configurables (las fuentes usan 3 y 4 como límite del espaciamiento). |
| Relación S/B | S/B | Para malla triangular equilátera (tres bolillos): S = 2B/√3 = 1,1547·B. |

**Tipos de malla.** Cuadrada/rectangular (filas y columnas ortogonales, S y B independientes), tres bolillos y triangular no equilátera (filas desfasadas S/2; equilátera si S = 1,1547·B). La malla se genera **dentro de un polígono cualquiera**, orientada por un ángulo, y cada taladro guarda su fila y su posición. El usuario puede mover, agregar y borrar taladros a mano sin perder el vínculo con los parámetros.

**Burden teórico (referencia para el usuario; no bloquea).** Se muestran varios modelos para que el usuario elija el burden operativo; el software marca un burden operativo fuera de ±10 % de la referencia elegida.

| Modelo | Fórmula | Valores del ejemplo CR-01 |
|---|---|---|
| Ash | B[ft] = Kb·Ø[in]/12; Kb = 25 (roca media, densidad-potencia baja), 30 estándar | 7,78 m (Kb 25) |
| Konya–Walter | B[ft] = (2·ρe/ρr + 1,5)·Ø[in]·Kd·Ks; Kd = 0,95 (estratos hacia la cara), Ks = 1,10 (capas delgadas bien cementadas); las tablas completas de Kd y Ks están en Konya & Walter (1990): tomarlas de la fuente | 8,19 m |
| Andersen | B[ft] = √(Ø[in]·L[ft]) | CR-02: 7,32 m |

**Espaciamiento sugerido.** S = (H + 7B)/8 si H/B < 4; S = 1,4·B si H/B ≥ 4 (CR-01: 8,875 m). Otras reglas (S = 1,15·B, S = 1–2·B) son opciones del usuario.

**Reglas de taco y sobreperforación por defecto** (pendientes de confirmación, R0–R1; ver guía sección 17): T = 0,7·B; J = 0,3·B. **Son parámetros del usuario**, no constantes: las fuentes traen reglas incompatibles (J desde 0 hasta 0,5·B; T de 0,7 a 1,3·B, o 15–25·Ø, o 30–35·Ø).

## 2. Carga por taladro (G4) — estado R2, CR-01, CR-02, CR-03

Un taladro se carga por **tramos ordenados desde el fondo** (o desde el collar). Tipos de tramo: explosivo (producto del catálogo), taco (material del catálogo), cámara de aire, separador. La suma de longitudes debe **cerrar exactamente** la longitud del taladro (error si no cierra).

| Magnitud | Fórmula | Notas |
|---|---|---|
| Densidad lineal | DCL = (π/4)·Ø²·ρ [kg/m] (ρ en kg/m³) | Con Ø en pulgadas y ρ en g/cc: ≈ 0,507·ρ·Ø². Con Ø en mm: ≈ ρ·Ø²/1273. |
| Masa de un tramo | m_i = DCL_i·L_i, o dato directo en kg si el producto se mide por peso | En cartuchos: número de cartuchos × masa. |
| Carga por taladro | Q = Σ m_i | Base de MIC, factor de carga y energía. |
| Densidad media tras gasificar | ρ_med = Q/[(L_c + L_esponjamiento)·(π/4)·Ø²] | Para emulsión gasificada: la carga se coloca a una longitud menor y "sube" al gasificar. **Se calcula por tramo**, no dividiendo la carga total entre la longitud de un solo tramo (error de la hoja de origen). |
| Volumen de influencia | V = B·S·H | Ver sección 1. |
| Factor de carga | FC = Q/V [kg/m³] | Por taladro, por fila, por grupo y por voladura. |
| Factor de potencia | PF = Q/(V·ρ_r) [kg/t] | Ídem. |
| Factor de energía | FE = Q·e_m/(V·ρ_r) [MJ/t]; e_m = energía del explosivo en MJ/kg | Cuando hay varios productos, Σ m_i·e_i. |
| Consumo específico | CE = Q/V | Sinónimo de FC en pequeño diámetro (CR-03). |
| Metros perforados | Σ L | Y m³/m de perforación = V/L. |

**Explosivos de carga:** si el producto tiene esponjamiento, se guardan densidad inicial y final. Para **cartuchos** que se aplastan por el peso de la columna, el diámetro efectivo crece (CR-03 usa +10 % para el hidrogel encartuchado); es un parámetro del tramo.

**Cadena de iniciación (F1).** Cada taladro tiene una lista de elementos con posición (m desde el collar): detonador (con su retardo de fondo), boosters (uno o varios), y las cargas a granel que detonan por ellos. Se admiten **varios decks y varios boosters**. Verificación: cada tramo de explosivo poco sensible (granel) debe tener un booster en su tramo (advertencia si no). Un doble primado solo es válido si la dispersión de tiempo entre los dos detonadores es menor que el tiempo de detonación de la columna entre ellos (verificación opcional, F2).

**Profundidad escalada de enterramiento (SDOB) — advertencia de confinamiento (G4) — R1 con fuente secundaria, CR-02.** Fórmula de Chiappetta usada en el curso:
- Densidad lineal de la carga superior, en kg/m: q = ρ_med·Ø²[mm]/1275.
- Longitud de referencia de la carga: L_w = 10·Ø.
- Peso de esa carga: W = q·L_w [kg].
- Profundidad al centro de esa carga: D = T + L_w/2 [m], con T = taco.
- **SD = D/W^(1/3)** [m/kg^(1/3)].
Rangos citados por fuentes secundarias: proyección y onda aérea severas por debajo de ≈ 0,4 y ausentes por encima de ≈ 1,2. **No se programan como bloqueo**: el software emite una advertencia configurable con umbrales editables, clasificando el valor por rangos. Confirmar los rangos con una fuente primaria (guía sección 17). Con decks: por defecto se toma la carga más cercana a la superficie (bajo el taco); decisión R0 por confirmar.

**Presión de detonación y de taladro (informativa).** PD = 0,25·ρ_med·VOD² (ρ en g/cc, VOD en m/s, resultado ×10⁻⁶ en GPa; equivale a ρ·VOD²/4, γ = 3); PB = 0,5·PD (rango 30–70 %). Hay variantes con γ variable (PD = ρ·VOD²/(γ + 1)). Por defecto γ = 3, configurable; mostrar siempre unidades. **VOD según diámetro**: VOD(D) = VOD_ideal·(1 − (D_c/D)²), con D_c el diámetro crítico del producto; se bloquea un producto solo si D < D_c y la regla está en R3 (hasta entonces, advertencia).

## 3. Amarre, tiempos y simulación (G5) — estado R2/R3 (tiempos) y R0 (burden efectivo), CR-05

**Dos conceptos separados** (cambiar uno no altera el otro):
- **Amarre** = topología: qué taladro se conecta a cuál, desde qué punto de inicio.
- **Retardos** = tiempos en ms de cada conector de superficie y de cada detonador (de fondo).

**Modelo.** Un grafo dirigido: nodos = taladros (más un nodo "origen"); aristas = conectores de superficie con su retardo en ms. Para cada taladro:
- t_llegada(i) = tiempo más corto desde el origen sumando retardos de superficie (algoritmo del camino más corto; si el amarre es un árbol, el camino es único). Con detonadores **electrónicos** el tiempo es el programado, sin grafo.
- **t_detonación(i) = t_llegada(i) + retardo de fondo(i)**.
- Tiempo relativo: se resta el menor t_detonación.
Opciones posteriores: tiempo de quemado del conector por longitud (tubo de choque ≈ 2 000 m/s), dispersión de tiempos de los detonadores por familia (Monte Carlo; guía sección 17), tiempo de detonación de la columna (longitud/VOD) cuando importa.

**Herramientas de amarre a ofrecer** (equivalentes a las de JKSimBlast, ver `Referencia/R3`): elegir taladro de inicio; conectar en línea (entre taladros de una fila, ms/hoyo); conectar filas (ms entre filas); generar amarres típicos (en fila, en V, en escalón/echelon); edición manual de cualquier conexión; detección de ciclos y de taladros sin conectar (error).

**Mapa de isotiempos y reproductor.** Contornos de igual tiempo de detonación; reproducción de la secuencia con paso configurable; taladros coloreados por tiempo.

**Burden efectivo — estado R0, CR-05.**
- t_i = tiempo de detonación del taladro i.
- Superficies libres en t_i: la(s) cara(s) libre(s) definida(s) por el usuario **más** los taladros j con t_j < t_i − Δ (tratados como puntos; Δ = "tiempo mínimo de alivio", 0 ms por defecto, parámetro).
- **B_ef(i) = distancia del taladro i a la superficie libre más cercana** en ese instante.
- Advertencias: B_ef(i) > 2·B_nominal (cara libre no despejada); B_ef(i) mucho menor que el nominal (sobreconfinamiento del alivio).
La fuente del curso da un caso particular (malla equilátera: burden perforado 0,87·S, efectivo 0,29·S con cierta iniciación) pero **no** una fórmula general: el modelo anterior es una hipótesis que se valida con CR-05 y con el ingeniero de minas, y que se contrasta con la función "burden relief" de JKSimBlast (`Referencia/R3`).

**Retardos entre taladros y entre filas (guía de diseño, no bloqueo).** Retardo entre filas: 6–12 ms por metro de burden (apretado) o más; entre taladros: 3–9 ms por metro de espaciamiento (pirotécnicos). Las fuentes traen rangos distintos por tipo de roca y equipo; se codifica **una tabla configurable** y se avisa cuando un retardo cae fuera del rango elegido.

## 4. Carga máxima por retardo (MIC) y vibración (G6) — estado R1/R2, CR-05, CR-06

**MIC (carga máxima instantánea por retardo).** Ventana deslizante de ancho w (por defecto **8 ms**, parámetro; convención de uso general, fuente a confirmar: USBM RI 8507): para cada instante t, la carga de la ventana [t, t + w) es la suma de Q_i de los taladros con t_i en la ventana. **MIC = máximo de esas sumas** en toda la voladura. Ventana semiabierta: dos taladros separados exactamente w **no** se agrupan (convención por confirmar; CR-05, amarre 4). Se entrega también el gráfico de carga por ventana contra tiempo.

**Distancia escalada de vibración.** SD_v = R/√Q, con R = distancia entre el punto de monitoreo y la carga [m] y Q = carga por retardo [kg]. **No confundir con la profundidad escalada de enterramiento** (raíz cúbica, sección 2): son dos modelos distintos, con nombres y campos distintos en el código.

**PPV en campo lejano (ley de propagación).** PPV = K·SD_v^(−β) [mm/s], con K y β **configurables por punto o por sitio** (no hay valores universales; los de CR-06 son ilustrativos). Distancia R para un grupo de taladros dentro de una ventana: por defecto **la distancia del punto al taladro más cercano del grupo** (criterio conservador); alternativas configurables: centroide de la carga. Se calcula el PPV de cada ventana y se reporta el máximo y la ventana que lo causa.

**Límites de daño.** Una **tabla configurable** distancia → PPV admisible. Valores del curso, a contrastar con la normativa peruana vigente antes de usarlos: 0–90 m: 32 mm/s; 91–1 524 m: 26 mm/s; > 1 524 m: 19 mm/s. Los límites y sus fuentes son datos del sitio, no constantes del código. Se muestra si el PPV calculado excede el límite; se muestra también el MIC máximo admisible para un PPV dado invirtiendo la ley.

**Puntos de monitoreo.** Lista de puntos (E, N, Z, nombre, límite aplicable, K y β si difieren).

Alternativas de la Fase 2 (no F1): campo cercano por Holmberg–Persson, PPV = K·[(q/R)·Δθ]^α con q = densidad lineal, Δθ = ángulo subtendido por la columna, y criterio de daño ¼·VPPc (VPPc = velocidad de partícula crítica de la roca); ver `Referencia/R1`, ficha F25.

## 5. Modelos de la Fase 2 (resumen; se especificarán al llegar)

| Modelo | Núcleo | Fuente principal | Ejemplo disponible |
|---|---|---|---|
| Fragmentación Kuz-Ram | X50 = A·(V/Q)^0,8·Q^(1/6)·(115/RWS)^0,633 (Q en kg por taladro, V en m³ por taladro, RWS = potencia relativa en peso vs. ANFO, A = factor de roca, típicamente 7–13); distribución de Rosin-Rammler con índice de uniformidad n y tamaño característico Xc = X50/0,693^(1/n) | Cunningham (1983, 2005); Lilly (1986) para el factor de roca | CR-02 (regresión); CR-07 por conseguir |
| Corrección de finos (JKMRC / Swebrec) | Zona triturada más Kuz-Ram | Literatura abierta; las constantes de JKSimBlast no son públicas | — |
| Daño en campo cercano | Holmberg–Persson | Holmberg & Persson (1979) | `Referencia/R1` F25 |
| Precorte y buffer | Pb = 110·f^n·ρ·VOD² (f = razón de volúmenes, n = 1,25 seco o 0,9 con agua); espaciamiento E ≤ D·(Pb + RT)/RT | Curso; CR-01 | CR-01 |
| Onda aérea y proyección | Semáforo por SD, taco, burden y secuencia | Fuentes por definir | — |
| Desplazamiento del material | Depende de la secuencia y del amarre | Fuentes por buscar | — |
| Método sueco (frentes) | Langefors–Holmberg | Holmberg (1982) | `Referencia/R4` |

Las variantes ambiguas de estas fórmulas (índice de uniformidad n, Kuznetsov con RWS o RBS, rango de A) están listadas en `Referencia/R1`, sección 7, puntos 13 y 14: **no elijas una sin fuente**.

## 6. Verificaciones de cordura (el software debe marcarlas, no bloquearlas)

| Verificación | Regla | Estado |
|---|---|---|
| Rigidez | Semáforo por H/B según la tabla de Konya (≤ 2 = atención) | R2 |
| Taco | T fuera de 0,7–1,3·B o de 15–25·Ø → aviso | R1 |
| Sobreperforación | J/B fuera de 0,2–0,5 → aviso (rangos por fuente) | R0/R1 |
| Diámetro contra banco | H/Ø fuera de 50–70 → aviso (otra regla: Ø ≤ 15·H, Ø en mm, H en m) | R0 |
| Burden operativo | Fuera de ±10 % del teórico elegido | R1 |
| Cara libre | Sin cara libre no se genera malla; banco con una sola cara libre → **advertencia** (mínimo 2 es lo típico de banco, no una exigencia física) | R1 |
| Cierre de tramos | Suma de longitudes ≠ longitud del taladro → error | R3 |
| Confinamiento | SD fuera de rango configurable → aviso | R1 |
| Diámetro crítico | Ø < Ø crítico del producto → aviso (bloqueo solo en R3) | R1 |
| Tiempos | Orden de detonación invertido respecto de la cara libre → aviso | R0 |

Toda verificación con estado menor que R3 es **advertencia configurable**, nunca bloqueo.
