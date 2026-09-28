# Voladura subterránea: conceptos y alcance para el producto web

Documento de referencia para el desarrollador (no minero). Corresponde a módulos **posteriores** a la Fase 1 (frentes y anillos); léelo cuando llegue ese momento o si necesitas entender por qué el modelo de datos debe admitir taladros en 3D con cualquier orientación.

**Etiquetas de procedencia**
- `[CURSO]` viene de material de cursos de perforación y voladura (no se entrega).
- `[GENERAL]` conocimiento general de ingeniería de voladura, no verificado contra una fuente. Las fórmulas con esta etiqueta deben validarse contra la fuente citada antes de programarlas (estado R0/R1 del plan).
- `[WEB+URL]` sacado de una página pública consultada; parafraseado.

---

## 1. Qué es la voladura subterránea y en qué se diferencia de la de superficie

### 1.1 La idea central: cuántas caras libres tiene la roca

Una voladura rompe roca con un explosivo, pero la roca solo se rompe bien si tiene **a dónde moverse**. Ese "a dónde" es una **cara libre**: una superficie de roca expuesta al aire hacia la cual la roca rota puede desplazarse.

| | Superficie (banco) | Subterránea, frente (túnel/galería) | Subterránea, tajeo (taladros largos) |
|---|---|---|---|
| Caras libres | Varias: el talud (frente del banco) y el techo (superficie). | **Una sola**: la cara del frente, perpendicular a los taladros. | Una o varias, pero **ya abiertas** (un "slot" o una galería vacía). |
| Dirección de taladros | Verticales o inclinados desde arriba. | Paralelos al eje del túnel, apuntando hacia adentro de la roca. | En abanico ("ring") o paralelos, largos, desde una galería. |
| Longitud de taladro | 10 a 20 m | 2 a 5 m | 10 a 30 m o más |
| Problema principal | Fragmentación, vibración, proyecciones. | **Crear** la cara libre cada disparo, avance ("pull"), sobre-excavación. | Precisión de perforación (desviación), dilución, daño a las cajas. |
| Factor de carga típico `[CURSO]` | ~0.7 kg/m³ | 2 a 4 kg/m³ | Bajo, cercano al banco (0.3 a 0.6 kg/m³ según el material de curso) |


### 1.2 Dos mundos en el subterráneo

**A. Desarrollo: frentes, túneles, galerías, rampas, cruceros.** Se abre la labor. Se dispara la sección completa (un "round" o "ronda"), se limpia el material, se sostiene y se repite. Módulo equivalente en JKSimBlast: **2DFace**.

Grupos de taladros de un frente (vista en planta de la cara, como un reloj de agujeros) `[GENERAL]`, coincide con el material de curso y con `[WEB+URL]` https://courses.ems.psu.edu/mng230/node/871:

1. **Arranque (cut)**: el grupo central que abre el primer hueco. Es lo más crítico. Si falla ("arranque congelado"), el avance se desploma.
   - **Burn cut / corte quemado (paralelo)**: taladros paralelos, con uno o más **taladros de alivio vacíos** (sin explosivo) de gran diámetro (75 a 150 mm). Los cargados disparan en secuencia hacia el hueco. Se usa con jumbos (perforadoras mecanizadas). `[WEB+URL]` https://courses.ems.psu.edu/mng230/node/871
   - **V-cut / cuña**: pares de taladros inclinados que convergen. Todos se cargan. Limitado por el ancho de la galería. `[CURSO]`.
   - Otros: cut en abanico, cut en espiral (`[GENERAL]`).
2. **Ayudas / destroza (stoping / helpers)**: agrandan el hueco hasta casi la sección completa. Son los que más roca arrancan.
3. **Contorno (perimeter: corona/techo y hastiales/paredes)**: definen el perfil final. Van con carga liviana y desacoplada (**smooth blasting**, voladura suave) para no dañar la roca que queda.
4. **Zapateras / arrastres (lifters)**: el piso. Van más cargadas porque levantan la roca contra la gravedad y salen al final.

Orden de detonación típico: arranque, ayudas, contorno, zapateras. Retardos largos entre grupos (decenas a cientos de ms) para que cada grupo tenga cara libre despejada. `[CURSO]`.

**B. Producción: tajeos por taladros largos (longhole, sublevel stoping), anillos (rings).** Se extrae el mineral. Desde una galería de perforación se hacen taladros largos en un **abanico** (un plano vertical o inclinado, llamado "anillo"). Cada anillo vuela contra una cara libre ya existente (un **slot** o "chimenea de arranque" abierta antes). Se avanza retirándose anillo por anillo. Módulo equivalente en JKSimBlast: **2DRing**. `[WEB+URL]` https://www.soft-blast.com/Software/JKSimBlast.html

Términos clave de anillos `[GENERAL]`, `[WEB+URL]` (definición de burden de anillo, búsqueda sobre ring blasting):
- **Burden de anillo**: distancia entre el plano de un anillo y la cara libre contra la que vuela (en la práctica, entre anillos sucesivos).
- **Toe spacing / espaciamiento de pie**: separación entre los fondos de taladros contiguos del mismo anillo. Es lo que se ve mal en un abanico regular por ángulo: los pies se abren con la distancia.
- **Desviación de perforación**: en 20 m, un error de 1 a 2 % son 20 a 40 cm. Arruina el burden real en el fondo.
- Otros elementos: taladros hacia arriba (upholes) y hacia abajo (downholes), anillos inclinados, *drawbells*, *horodiam*, *narrow vein* (JKSimBlast los menciona; `[WEB+URL]` búsqueda de 2DRing).

### 1.3 Qué decisiones toma el ingeniero (lo que el software debe apoyar)

**Frente:** sección y perfil (herradura, rectangular, circular); avance deseado; tipo y geometría del arranque; diámetros (carga y alivio); n.º y posición de taladros por grupo; inclinación de contorno (*look-out*, taladros ligeramente abiertos hacia afuera para que la sección no se cierre con cada ronda); explosivos por grupo (emulsión a granel, cartuchos, cordón detonante en contorno); longitud de carga y taco; secuencia y retardos; control de vibración (carga máxima por retardo); revisión de que la ronda cumple sección y avance; costo (kg/m de avance, m perforados/m de avance).

**Anillos:** ubicación de la galería de perforación; ángulos, diámetros y largos de taladros; burden y espaciamiento de pie; sobre-perforación; carga por taladro (columnas, tacos, cargas en fondo); secuencia de anillos y de taladros dentro del anillo; slot inicial; control de dilución y daño a las cajas (contorno del tajeo); vibración.

**Común a ambos:** roca (propiedades y calidad del macizo), explosivos disponibles, accesorios de iniciación (no eléctricos, electrónicos), restricciones legales (en Perú, DS 024-2016-EM y modificatorias, vibraciones DS-132 según el material de curso; no verificado).

---


## 4. Alcance subterráneo esperado del producto

Se asume que el producto ya cubre superficie (banco) y comparte con esa parte el motor de taladros/decks/retardos/simulación. Aquí solo lo subterráneo.

### 4.1 Módulo "Frentes / túneles" (equivalente a 2DFace)

**Qué hace 2DFace `[WEB+URL]`** https://www.soft-blast.com/Software/JKSimBlast.html y https://www.soft-blast.com/Support/Downloads/Brochures/Design-Detonation_A4.pdf:
- Perfiles del túnel a partir de plantillas, dibujados o importados.
- Creación de taladros de carga y de alivio con plantillas de arranque (*cut templates*) y herramientas para techo, hastiales, piso, línea y círculo.
- Digitalizador integrado: crear el diseño a partir de fotos o imágenes.
- Decks de explosivo y retardos personalizables (retardos de fondo y de superficie, conexiones).
- Simulación de detonación con dispersión de retardos, alivio de burden, contornos de energía y de daño, carga máxima instantánea (MIC) y efecto de vibración.
- Exportación a hojas de cálculo (copiar/pegar taladros, decks, retardos, líneas) e impresión de planos a escala.

**Funciones mínimas (MVP subterráneo)**
1. **Perfil de excavación**: herradura (arco + hastiales), rectangular, arco-D, circular; ancho, alto, radio de arco; área calculada; importación de polilínea (DXF o CSV).
2. **Diseño de ronda**:
   - parámetros: avance objetivo, Ø de taladro de carga, Ø y número de taladros de alivio, desviación esperada;
   - arranque burn cut paralelo de 4 secciones (método sueco): posición del alivio, cuadriláteros, taladros por sección;
   - ayudas de pared, techo y piso; contorno con voladura suave (espaciamiento y carga lineal); zapateras;
   - todo editable a mano (arrastrar/mover/añadir/borrar taladros) sin perder el vínculo con los parámetros.
3. **Carga**: explosivo por grupo, columna de carga, taco, cordón/carga desacoplada en contorno, kg por taladro; resumen de kg por grupo y total.
4. **Iniciación y secuencia**: series de detonadores (no eléctricos, electrónicos), retardo por taladro y por grupo, asignación automática arranque → ayudas → contorno → zapateras con control manual, simulación paso a paso.
5. **KPIs de ingeniería**: avance esperado (pull, ≈95 % del taladro si la desviación ≤ 2 %, `[WEB+URL]` https://miningandblasting.wordpress.com/wp-content/uploads/2009/09/four-section-parallel-hole-cut-model-swedish-method-for-tunnel-blast-design.pdf), volumen y toneladas por ronda, factor de carga (kg/m³ y kg/t), kg por metro de avance, metros perforados por metro de avance, n.º de taladros, kg por retardo máximo.
6. **Validaciones**: alivio vacío mayor al de carga, burden del primer cuadrilátero ≤ 1.7·Ø equivalente, taladros dentro del perfil, distancias mínimas entre taladros, retardos únicos y crecientes, cara libre disponible.
7. **Exportación**: plano PDF a escala (con perfil, taladros numerados, tabla de taladros con largo, carga y retardo, esquema de conexión), CSV de taladros, DXF.
8. **Escenarios/versiones** y comparación lado a lado.

**Fórmulas base del método sueco de cuatro secciones**

De la fuente web `[WEB+URL]` https://miningandblasting.wordpress.com/wp-content/uploads/2009/09/four-section-parallel-hole-cut-model-swedish-method-for-tunnel-blast-design.pdf (Sharma, sobre Langefors-Kihlström 1963, Holmberg 1982, Persson et al. 2001). Se parafrasea:
- Aplica sobre todo a secciones mayores a unos 10 m². Diámetro del alivio recomendado mayor a 75 mm.
- Varios alivios: diámetro equivalente `Φe2 = √N · Φe` (N alivios de diámetro Φe).
- Avance: con desviación ≤ 2 %, el avance real ≈ 95 % de la profundidad del taladro; la profundidad depende del diámetro del alivio.
- Distancia del alivio central al primer cuadrilátero: máximo 1.7·Φ; para explotar bien el explosivo, 1.5·Φ con desviación de 0.5 a 1 %; si la desviación es mayor, el burden práctico es el máximo menos el error de perforación (`E = α·H + β`).
- Regla para el n.º de secciones: el lado de la última sección debe ser menor que la raíz cuadrada del avance. Taco en taladros de arranque: 10·d.
- Zapateras: fórmula de burden de banco con la altura de banco reemplazada por el avance, factor de fijación f = 1.45, S/B ≈ 1, y B ≤ 0.6·L.
- Ayudas: f = 1.45 (sección B) y 1.2 (sección C), S/B = 1.25.
- Contorno sin voladura suave: como zapateras con f = 1.2 y S/B = 1.25 (carga de columna = mitad de la de fondo). Con voladura suave: S = K·d con K entre 15 y 16, S/B = 0.8, carga lineal ≈ 90·d² (d en m, kg/m, para Ø < 155 mm).
- Las cargas lineales bajan en este orden: arranque, ayudas, hastiales/techo (piso mayor que hastiales/techo).

`[GENERAL]` Las expresiones numéricas completas no estaban en el texto extraíble de la fuente (van como imagen). Las siguientes salen de memoria de Holmberg/Jimeno y **hay que verificarlas contra el libro**:
- Avance: `H = 0.15 + 34.1·Φ2 − 39.4·Φ2²` (m, con Φ2 en m).
- Burden primer cuadrilátero: `B1 ≤ 1.7·Φ2`; práctico `B1 = 1.7·Φ2 − F`.
- Carga lineal en el arranque: `q1 = 55·d·(B1/Φ2)^1.5·(B1 − Φ2/2)·(c/0.4)/PRP_ANFO` (kg/m; d y Φ2 en m; c constante de roca ≈ 0.2 a 0.5; PRP = potencia relativa en peso vs ANFO). La fuente lista exactamente estas variables.
- Secciones siguientes: ancho `W_n = B_n·√2` y burden `B_n` con expresión análoga; condición para que el hueco anterior cierre el ángulo de apertura (< 90°) y evite deformación plástica (la fuente y una búsqueda web lo confirman en palabras: burden mayor a 2 veces Φ produce deformación plástica y "cut congelado"; https://www.sciencedirect.com/science/article/abs/pii/S0886779805000763 comparación de modelos de diseño de túneles).
- Burden de zapateras: `B = 0.9·√(q·PRP/(c·f·(S/B)))` (m), con `B ≤ 0.6·L`.

Otras metodologías que conviene mencionar como opciones en fases posteriores `[GENERAL]`: Olofsson (arranque paralelo y en V, tablas por sección y avance), métodos empíricos de tipo "n.º de taladros por área", arranques en V y en abanico, y diseño por perfil "smooth blasting" de Persson-Holmberg (tablas por diámetro y carga lineal).

**Funciones deseables (fases posteriores)**
- Digitalizador desde foto o escáner del frente y comparación de "as-drilled" vs "as-designed" (importar la ronda perforada por el jumbo: collar, dirección, largo).
- Exportar a formatos de jumbo (Sandvik iSURE, Epiroc Rig Control/Underground Manager; los formatos varían y deben pedirse a los fabricantes).
- Análisis de vibración con MIC y ley de atenuación local; radio de daño por carga lineal en contorno; predicción de sobre-excavación y half-casts.
- Ciclo completo: sostenimiento, ventilación posvoladura, ciclos por turno.
- Optimización de secuencia con detonadores electrónicos (I-Blast ADV lo ofrece, `[WEB+URL]` https://www.dna-blast.com/blasting-design-simulation-optimization/I-Blast_ADV.html).
- Plantillas por mina (estándares de ronda) y biblioteca de explosivos y accesorios.
- Cálculo de costos por metro de avance.

### 4.2 Módulo "Anillos / tajeos" (equivalente a 2DRing)

**Qué hace 2DRing `[WEB+URL]`** https://www.soft-blast.com/Software/JKSimBlast.html y https://www.soft-blast.com/Support/Downloads/Brochures/Design-Detonation_A4.pdf:
- Diseño y análisis de voladuras con taladros en planos, con cada plano en cualquier orientación: longhole, sublevel stoping, veta angosta, drawbells, horodiam.
- Creación de taladros: abanico de 360° por espaciamiento de pie o por ángulo igual; recortar o dejar distancia (*stand-off* / sobre-perforación) contra cualquier línea de borde; perforar desde varios centros.
- Superponer anillos adyacentes y taladros de "breakthrough" (que salen a otra galería).
- Carga automática de decks por distribución de energía; simulación de detonación; contornos; análisis de fragmentación (FragmentO); vibración y MIC.
- Importar/exportar a hoja de cálculo.

**Funciones mínimas**
1. **Geometría del tajeo**: polilínea del contorno del tajeo (sección transversal), galería(s) de perforación (origen del abanico), líneas de borde/mineral.
2. **Diseño del anillo**: crear abanico por ángulo igual o por espaciamiento de pie constante; centros de perforación múltiples; upholes/downholes; recorte al contorno con sobre-perforación o *stand-off*; Ø por taladro.
3. **Parámetros**: burden (entre anillos), espaciamiento de pie, ángulo/inclinación del plano del anillo, número de anillos, longitud de tajeo.
4. **Cálculo**: metros perforados por anillo, volumen y toneladas por anillo (burden × área de la sección del anillo), factor de carga (kg/m³ y kg/t), kg por taladro y por anillo, ratio metros/tonelada.
5. **Carga**: columnas, taco, cargas de fondo/cebo, número de cartuchos, factor de carga automático por longitud.
6. **Secuencia**: retardos por taladro dentro del anillo (de la cara libre hacia el exterior) y entre anillos (retirada desde el slot); MIC por retardo.
7. **Slot / cara libre inicial**: marcar el slot y verificar que el primer anillo tiene cara libre.
8. **Validaciones**: toe spacing dentro de rango (relación con burden), longitud máxima de taladro por equipo, desviación esperada (1 a 2 % del largo), taladros que se cruzan.
9. **Exportación**: plano PDF por anillo (sección con taladros numerados, ángulo, largo, carga), CSV (collar, azimut, inclinación, largo, carga, retardo) para el equipo de perforación y para carga, DXF.

**Funciones deseables**
- Vista 3D de anillos sucesivos y del tajeo.
- Comparación diseño vs perforado (survey del taladro).
- Predicción de dilución/sobre-rotura y del daño en las cajas.
- Optimización (mismo mineral con menos metros perforados; equilibrio entre carga y granulometría, FragmentO equivalente).
- Secuencia de tajeos y rellenos.

**Reglas de arranque para longhole `[CURSO]` `[GENERAL]`** (a validar): burden ≈ 25 a 35 veces el diámetro; relación de espaciamiento de pie a burden ≈ 1.0 a 1.3; ~85 % del largo cargado; sobre-perforación según dureza de pie (fracciones del burden: 0 a 0.1 con pie plano, hasta 0.5 en pie difícil, `[WEB+URL]` resultado de búsqueda sobre ring blasting, sin URL de detalle abierta).

### 4.3 Equivalencias resumidas

| Función | 2DFace (frente) | 2DRing (anillo) |
|---|---|---|
| Perfil de excavación | Plantilla, dibujo o import | Contorno del tajeo |
| Generación de taladros | Plantillas de arranque, techo, hastial, piso | Abanico por ángulo o toe spacing, recorte |
| Alivio vacío | Sí | n/a |
| Decks y explosivos | Sí | Sí, carga automática |
| Retardos de fondo y superficie | Sí | Sí |
| Simulación de detonación | Sí, con dispersión | Sí |
| MIC y vibración | Sí | Sí |
| Contornos de energía y daño | Sí | Sí |
| Fragmentación | n/a | FragmentO |
| Import/export | Hoja de cálculo, texto | Hoja de cálculo, texto |
| Versiones y comparación | Sí | Sí |

---


## Fuentes web consultadas (2026-09-24)

- JKSimBlast, módulos 2DBench, 2DRing, 2DFace, JKBMS: https://www.soft-blast.com/Software/JKSimBlast.html
- Folleto "Design / Detonation" de JKSimBlast (herramientas de taladros, decks, retardos, simulación de detonación, almacenamiento): https://www.soft-blast.com/Support/Downloads/Brochures/Design-Detonation_A4.pdf
- Método sueco de cuatro secciones (Langefors-Kihlström, Holmberg): https://miningandblasting.wordpress.com/wp-content/uploads/2009/09/four-section-parallel-hole-cut-model-swedish-method-for-tunnel-blast-design.pdf
- Patrones de rondas en galerías (burn, V, ayudas, zapateras, contorno): https://courses.ems.psu.edu/mng230/node/871
- Comparación de modelos de diseño de túneles (Zare y Bruland): https://www.sciencedirect.com/science/article/abs/pii/S0886779805000763 (solo resumen de búsqueda)
- Metodología de diseño de anillos: https://www.researchgate.net/publication/43499374_Design_methodology_for_underground_ring_blasting (403, solo resumen de búsqueda)
- I-Blast (módulo de anillos subterráneos, secuencias electrónicas): https://www.dna-blast.com/Blasting-Design-Simulation-Optimization/I-Blast_7.html y https://www.dna-blast.com/blasting-design-simulation-optimization/I-Blast_ADV.html (solo resumen de búsqueda; la página I-Blast_7 devolvió 404 al abrirla)
