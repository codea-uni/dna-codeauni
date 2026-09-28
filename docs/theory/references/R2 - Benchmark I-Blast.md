# Benchmark I-Blast (DNA-Blast / distribuido por Finexplo)

> Producto analizado: **I-Blast de DNA-Blast** (dna-blast.com). NO es "iBLAST" de bioinformática (vtsynergy).
> Preparado para: equipo que construirá una alternativa web (superficie primero, luego subterráneo). El desarrollador no es minero, por eso cada función se explica en lenguaje simple.
> Método: solo lectura. Se leyó completa la presentación del curso, se inspeccionaron los zips de datos (extracción selectiva a un directorio de trabajo en el scratchpad) y se consultó la web pública. Ninguna instalación ni ejecución del software.

## Claves de evidencia y confianza

| Clave | Fuente |
|---|---|
| **[C01 lám. N]** | `Clase 01 - Presentación I-Blast.pdf` (16 láminas), curso PERVOL 4.0, sesión 10 (ponente: Ing. Edwin Viera Yacila, DNA-Blast). Las láminas 13 y 15 son capturas reales de la interfaz. |
| **[DI-x]** | `DATOS INICIALES.zip` (fichas técnicas PDF, capturas PNG de pantallas reales de I-Blast, `Explosif.dna`). Las capturas llevan marca de agua "I-BLAST SOFTWARE – ACADEMIC VERSION". |
| **[S5] [S6] [S7] [S9]** | Zips de sesiones: vibraciones, fotogrametría con dron, datos de malla/perforación, fragmentación. |
| **[B7.5 p.N]** | Folleto oficial "I-Blast 7.5 – Features overview for underground & surface" (93 págs.; se cita la numeración impresa). https://www.attakroc.com/wp-content/uploads/2018/01/I-Blast-7.5-brochure_EN_A_HQ-1.pdf (también en https://www.dna-blast.com/Blasting-Design-Simulation-Optimization/I-Blast_7_files/I-Blast%207.5%20brochure_EN_A_HQ_4.pdf, que hoy da 404). Las tablas DE/PRO/ADV se reconstruyeron leyendo la posición de las marcas de verificación del PDF; puede haber algún desfase de una fila. |
| **[B8 p.N]** | Folleto oficial "I-Blast 8 – 2018" (8 págs.), https://www.attakroc.com/wp-content/uploads/2018/01/I-Blast-8_2018_brochure_EN_A.pdf |
| **[W-SOL] [W-HOME] [W-SCI] [W-DNA] [W-REF] [W-TRL]** | https://www.dna-blast.com/solutions.html · /index.html · /science.html · /dna-solutions.html · /references.html · /blasting-trl.html. Ojo: estas páginas se leyeron con un resumidor automático (WebFetch), no el HTML crudo; los datos duros (nombres de tiers, formatos) conviene reconfirmarlos en demo. |
| **[FIN]** | https://www.finexplo.fi/?page_id=495 (distribuidor finlandés; menciona "I-Blast 8", 8 funciones, folleto y serie de tutoriales en YouTube). |
| **[PAPER]** | Bernard, T. & Dozolme, P. (2014), "The Digital Simulation of Blasts: A Major Challenge for Mines in the 21st Century", Procedia Engineering 83:100-110, https://doi.org/10.1016/j.proeng.2014.09.019 (el sitio de ScienceDirect devolvió 403; solo se vio el resumen vía búsqueda). |

**Confianza:** Alta = documento/captura oficial de DNA-Blast; Media = curso o tercero; Baja = inferido.
**[INFERIDO]** marca lo que no está documentado en ninguna fuente.

**URLs de la web que hoy dan 404** (existían en el sitio antiguo, aparecen en buscadores): `.../Blasting-Design-Simulation-Optimization/I-Blast_SIM.html`, `.../I-Blast_7.html`, `.../I-Blast_ADV.html`, `.../i-blast_software.html`, `.../Technology.html`, el folleto `I-Blast 8_2018_brochure_EN_A.pdf` en dna-blast.com. El sitio se rediseñó; no se encontró una página propia "Standard". Otros PDF localizados pero no leídos: https://www.i-blast.net/DOWNLOAD/DOC/DNA-Blast_Software_2020_B_FR.pdf (folleto 2020 en francés; la descarga excedió el tiempo). Lista de tutoriales en español: https://www.youtube.com/playlist?list=PL5BtC90BvqjI9vs2pqBEGOgzrdVehIzKS (no fue posible listar los títulos).

---

## 1. Resumen (10 líneas)

1. **I-Blast** es un programa de escritorio Windows (interfaz tipo cinta de opciones, escrito con toda probabilidad en Delphi [INFERIDO por la estética y los formatos]) para **diseñar, simular, medir y reportar voladuras** de minas a cielo abierto, canteras, túneles y minería subterránea, con un único paquete "todo incluido" (sin módulos sueltos, B7.5 p.03).
2. Lo desarrolla **DNA-Blast** (Francia/Irlanda, con oficinas o representantes en Brasil, México, Perú, Bolivia, Rusia, EE. UU.; C01 lám. 4). Su autor científico es Thierry Bernard (papers ISEE 1994-2020, ver [W-SCI]). Finexplo es uno de sus distribuidores (Finlandia).
3. **Tiers históricos** (folletos 7.5 y 8): Design Express (DE) < PRO (en el folleto 8 aparece también "SIM") < ADV. **Tiers actuales** (web 2025-26): **I-Blast DE** (Design Express), **EVO**, **EVO+** (simulación, con acceso temporal a funciones ULT) e **ULT** (gemelo digital 4D, deconvolución de la "trou-signature", optimización de secuencia), más **I-Blast Dashboard** (portal web de KPI). Equivalencia aproximada: PRO≈EVO, ADV≈EVO+/ULT [INFERIDO, no publicada].
4. En el curso se presentan dos productos: **I-Blast EVO** (diseño, simulación, mediciones, optimización; superficie y subterráneo) e **I-Blast ULT** (modelado 4D del movimiento de roca, fragmentación, vibraciones) [C01 lám. 7-8].
5. Concepto central que vende: **"gemelo digital de la voladura"**, un modelo físico calibrado con datos reales (dron, perforadora, camión de explosivos, sismógrafo) [C01 lám. 9-10].
6. Lo que lo distingue: **modelos basados en física** (superposición de "trou-signature" para vibraciones, modelo de fragmentación basado en onda P, modelo de proyección/muckpile) y **todo en una sola base de datos** (explosivos, geología, taladros, registros, informes).
7. Ecosistema alrededor: DNA-Frag (fragmentación por foto/dron), DNA-FragCam (cámara en cinta transportadora), DNA-OnSite (tablet de campo), DNA-AIDEV (sonda de desviación), DNA-Vib (sismógrafo en desarrollo) [W-DNA].
8. Idiomas: inglés, francés, español (ruso citado en B8 p.8); métrico e imperial; base de datos local con respaldo automático; archivos `.dna` para compartir diseños y plantillas [B7.5 p.07, 25].
9. Licenciamiento: licencia perpetua (1 licencia) o anual (3 licencias con soporte prioritario); actualizaciones al 40 % del precio tras el primer año; requisitos mínimos: i5, 4 GB RAM, 10 GB disco, tarjeta gráfica dedicada [B7.5 p.03-06]. Portal de licencias: https://www.i-blast.net/IBLicenseManager.
10. Cifras que publica: PPV predicho con ≤22 % de desviación en 1806 cargas (Osisko, 1 Mt a 205 m de un pueblo), proyección horizontal <20 % (o <5 % en el caso de cantera), fragmentación 84-90 % de precisión [B7.5 p.79-82; W-SCI; PAPER]. Son cifras del fabricante, sin auditoría independiente.

---

## 2. Glosario mínimo para el desarrollador (no minero)

| Término | Qué es en simple |
|---|---|
| Banco / cara libre (free face) | Escalón de roca; la cara libre es la pared hacia la que la roca "sale" al volarse. |
| Taladro (hoyo, blasthole) | Agujero perforado donde se coloca el explosivo. Tiene collar (boca, X,Y,Z), profundidad, diámetro, inclinación y azimut. |
| Burden (piedra) | Distancia del taladro a la cara libre. Si es muy poco: proyecciones de roca (flyrock). Si es mucho: roca mal fragmentada. Es LA variable de diseño más crítica. |
| Espaciamiento | Distancia entre taladros de una misma fila. |
| Taco (stemming) | Tramo superior del taladro relleno con arena/grava para "sellar". |
| Factor de carga (powder factor) | kg de explosivo por m³ de roca. En el curso: 0,413 kg/m³ (ver F04). |
| Carga por retardo | kg que explotan a la vez (misma ventana de milisegundos). Manda las vibraciones. |
| PPV | Velocidad pico de partícula (mm/s): cuánto se mueve el suelo; el estándar para limitar daños y quejas. |
| Distancia escalada | D/√Q (distancia dividida por raíz de la carga). Base de la "ley de atenuación": PPV = K·(D/√Q)^α; K y α se calibran con registros de sismógrafo. |
| Retardo / secuencia / timing | Milisegundos entre detonaciones de cada taladro; se logra con detonadores no eléctricos (nonel), eléctricos o electrónicos (EDD). |
| VOD | Velocidad de detonación del explosivo (m/s). Depende del diámetro; existe un "diámetro crítico" bajo el cual no detona bien. |
| Cast / muckpile | Cuánto se lanza la roca y qué forma final toma el montón de material volado. |
| Fragmentación | Distribución de tamaños de roca resultante (curva % pasante). Afecta carguío, chancado, costo. |
| Airblast | Onda de sobrepresión en el aire (dB): ruido y rotura de vidrios. |
| MWD | Datos que la perforadora mide mientras perfora (torque, empuje, velocidad); sirven como "radiografía" de la dureza de la roca. |
| Nube de puntos / ortofoto | Modelo 3D o foto aérea georreferenciada generada con fotos de dron (fotogrametría). |

---

## 3. Fichas de función

**Convención de tiers en las fichas:** `DE / PRO / ADV` = folleto 7.5; entre paréntesis el nombre actual (`DE / EVO / EVO+ / ULT`) cuando la web lo indica. Si no se sabe, se marca [INFERIDO].

### F01. Proyecto, escenarios y "Gestión de voladuras" (base de datos de sitio/voladura)
- **Nombre y tier:** Blast Management / base de datos por sitio y voladura. DE, PRO, ADV (todos).
- **Qué problema resuelve:** Que todo lo de una voladura (diseño, simulaciones, fotos, registros sísmicos, informes) quede en un solo lugar en vez de dispersarse en Excel, PDF y carpetas.
- **Decisión que apoya:** Comparar voladuras entre sí, auditar si se cumplió el plan, saber qué se hizo en un sitio y aprender de resultados previos (incluye calificación de 1 a 5 estrellas del resultado).
- **Entradas:** Datos de la voladura (nombre, ubicación, comentarios, clima, mallas anti-proyección, nombre del blaster), fotos, PDF adjuntos, registros sísmicos. Archivos `.dna`.
- **Flujo de usuario:** Crear sitio y voladura, asignar diseño, adjuntar fotos/registros/informes, ver resumen (pestaña "Objetivos" con simulado vs. objetivo de fragmentación, forma del montón, vibración, airblast), calificar la voladura, multiselección en 2D/3D para ver varias voladuras juntas.
- **Salidas:** Tablero por voladura (clic izquierdo sobre un taladro muestra nombre, nº de taladros, cota, PPV máx. registrado, calificación; clic derecho abre PDF de diseño/simulación/resultado); vista 3D con varias voladuras; respaldo automático en tiempo real; "Escenario #0" en la barra de estado.
- **Modelo/cálculo detrás:** No aplica (gestión de datos).
- **Limitaciones/dolores:** Base local de escritorio [INFERIDO por "sincronizar con base de datos maestra" en sesión IX]; la sincronización multiusuario depende de un módulo de "BD maestra" no documentado. La multiselección 3D es de PRO/ADV (no de DE).
- **Evidencia y confianza:** B7.5 p.07-13, 72-73; C01 lám. 12 (sesión I "organización de la información", IX "sincronizar base de datos con base de datos maestra"), lám. 13 y 15 (barra de estado "Scenario #0", "UNIDADES ISO"). **Alta**.

### F02. Base de datos de explosivos (plantillas de explosivo)
- **Nombre y tier:** Modelos de explosivo (encartuchados del sitio, a granel del sitio, explosivos comunes). DE, PRO, ADV.
- **Qué problema resuelve:** Que el programa "sepa" cómo se comporta cada explosivo (densidad, velocidad de detonación, tamaño de cartucho, costo) para calcular cargas, energía y vibraciones sin volver a teclear datos.
- **Decisión que apoya:** Elegir producto y diámetro de taladro: p. ej. saber que una emulsión a 215 mm alcanza ~4030 m/s de los 5200 ideales y a diámetros pequeños casi no detona; comparar costo por kg y emisiones.
- **Entradas:** Ficha técnica del fabricante (PDF) transcrita a mano: proveedor, nombre, densidad (kg/m³), VOD ideal (m/s), diámetro crítico (mm), fuerza relativa vs. ANFO, precio (R$/kg; en la captura de Brasil), GHG (kg CO2/kg), imagen, PDF de la ficha; para encartuchado: diámetro, longitud, peso del cartucho. Opción "VOD ideal" vs. "VOD medido". Exportable/importable a Excel y en `.dna`.
- **Flujo de usuario:** Pestaña Encartuchados / A granel / Comunes; Agregar o Modificar; ver el gráfico "VOD vs. diámetro" con perillas (VOD ideal, D crítico, D); asignar color.
- **Salidas:** Tabla con filtro/orden por proveedor; gráfico con curva roja y línea del VOD ideal; el título del gráfico muestra p. ej. "4548,1 m/s @ 76 mm"; plantillas exportables.
- **Modelo/cálculo detrás:** Verificado con las dos capturas: **VOD(D) = VOD_ideal × (1 − (Dc/D)²)**. Con Ibenite 70/30 (ideal 5200, Dc 102, D 215) da 4029,6 m/s y con Ibegel (5100, Dc 25, D 76) da 4548,1 m/s: coinciden al decimal con los títulos de los gráficos (cálculo propio, confianza Media-Alta).
- **Limitaciones/dolores:** Carga manual desde fichas de fabricante en PDF (en el zip hay fichas de Famesa "SAN-G" y "Superfam Dos" en español y de Enaex "Ibegel/Ibenite" en portugués). El dato "VOD del diámetro 3100 m/s" del Ibegel convive con VOD ideal 5100 y la curva no lo usa [INFERIDO: es un dato de ficha, no un parámetro del modelo]. Sin energía por kg (RWS/RBS) explícita; solo "fuerza vs. ANFO" [INFERIDO: se usa una fuerza relativa, no un cálculo termoquímico].
- **Evidencia y confianza:** DI `Fichas tecnicas/Base-Ibegel.png`, `Base-Ibenite 73.png`; PDF Ibegel/Ibenite (Enaex: densidad 1,15-1,25 g/cm³, RWS 86-99 %, RBS 122-169 %, VOD típica 5800, diámetro crítico 4"); B7.5 p.24-25, 72. **Alta**.

### F03. Base de datos geológica (modelo de geología)
- **Nombre y tier:** Modelo de Geología. DE, PRO, ADV.
- **Qué problema resuelve:** Traducir "el tipo de roca" a números que los modelos necesitan: cuánta energía debe entrar, cómo viajan las ondas, cuánto atenúa la vibración.
- **Decisión que apoya:** Cargar más o menos explosivo por dominio de roca, y usar la ley de atenuación adecuada por zona.
- **Entradas:** Nombre, foto, densidad (kg/m³), velocidad onda P (m/s), resistencia a compresión y tracción (MPa), módulo de Young (GPa), Poisson, **K(Vib) y Alfa(Vib)** (constantes de vibración de la roca), y una **calibración de registros de perforación**: `Rc = [parámetro] × a + b (MPa)` con el parámetro elegible (en la captura: "TBT").
- **Flujo de usuario:** Agregar / Modificar / Eliminar, marcar "por defecto", vincular luego a taladros o zonas.
- **Salidas:** Tabla de rocas; los valores alimentan simulaciones, la ley de atenuación por zona y el "índice de resistencia" calculado desde MWD.
- **Modelo/cálculo detrás:** Calibración lineal de MWD a resistencia (Rc = a·índice + b). Uso de K y α en PPV = K·(D/√Q)^α.
- **Limitaciones/dolores:** Roca homogénea por plantilla; un mismo dominio no varía dentro de la voladura salvo por MWD. El ejemplo del curso (Itabirito Compacto: 3045 kg/m³, Vp 5253 m/s, UCS 170 MPa, tracción 17, Young 117,9, Poisson 0,19, K=1500, α=−1,52, Rc=TBT×1+0) solo tiene un tipo de roca.
- **Evidencia y confianza:** DI `Geologia/Base-Itabirito C.png`; B7.5 p.72 (lista de campos). **Alta**.

### F04. Modelos de carga del taladro (plantillas de carga, "loading templates")
- **Nombre y tier:** Modelos de carga / Inspector (pestaña Loading). DE, PRO, ADV; carga automática = solo ADV.
- **Qué problema resuelve:** Definir exactamente qué va dentro de cada taladro, de abajo hacia arriba: explosivo a granel o en cartuchos, taco de grava o arena, tapones, cámaras de aire (decks), booster y detonadores. Igual a como lo hace el operador en campo.
- **Decisión que apoya:** Cuánto explosivo, con qué altura de taco, con qué decks; cálculo instantáneo del **factor de carga** y del kg por taladro para cumplir costo, fragmentación y límite de vibración.
- **Entradas:** Diámetro y profundidad del taladro, explosivo (de la BD), tipo de carga (granel, encartuchado, taco grava, taco arena, tapón, aire), longitud/altura o peso, opción "Adaptable" (la altura varía con la profundidad, con mínimo/máximo), detonador superior/inferior, booster superior/inferior (peso ajustable, 900 g en la captura), cordón detonante (g/m), timing absoluto. Burden y espaciamiento del pozo.
- **Flujo de usuario:** Pestañas "Modelos del sitio / Carga / Detalle": elegir tipo de carga, agregar capas en una tabla (Nº, nombre, base m, altura m, cantidad kg, adaptable), ver la columna dibujada a escala; botón "Taco final"; botón "Afectar" para asignar el modelo a los taladros seleccionados; adjuntar PDF.
- **Salidas:** Dibujo del pozo (p. ej. 0-4,5 m arena; 4,5-11 m Ibenite 70/30, 380,2 kg, 6,5 m; 0 ms / 900 g), tabla de capas, y cabecera con Burden 9,16 m, Espaciamiento 9,16 m, Carga del taladro 381,057 kg, **Factor de carga 0,413 kg/m³**, Carga unitaria 381,057 kg. Listado de explosivos y accesorios para el reporte.
- **Modelo/cálculo detrás:** Factor de carga = masa del taladro / (Burden × Espaciamiento × Profundidad): 381,057 / (9,16 × 9,16 × 11) = 0,413. Verificado con la captura (la profundidad del taladro, no la altura del banco, es el divisor). Para nonel, el retardo dentro del pozo se ajusta automáticamente con la VOD del tubo.
- **Limitaciones/dolores:** Posible incoherencia en la captura del curso: 380,16 kg de Ibenite en 6,5 m de un pozo de 229 mm implican ~1420 kg/m³, mientras la plantilla dice 1220 kg/m³. Puede deberse a otra plantilla o a compresión "adaptable" (B7.5 p.29 habla de ajuste de densidad hasta un nivel crítico de 1,4) [INFERIDO]; verificar en demo. Sin cálculo de sobreperforación explícito visible.
- **Evidencia y confianza:** DI `Base-Modelo de Carga.png`; C01 lám. 15 (Inspector: campos Cartridges, Height, Quantity, Bottom/Top, Density, Price, Charge D., Critical D., Ideal VOD, VoD @ D, Top Booster, Top det., Absolute timing, Detonating cord, Bottom Booster, Bottom det., y resumen Explosive quantity, Volume, Powder factor, C per D); B7.5 p.26-27, 30-31. **Alta**.

### F05. Diseño CAD de malla y taladros
- **Nombre y tier:** Módulo de diseño (CAD). DE, PRO, ADV.
- **Qué problema resuelve:** Trazar la malla de perforación (dónde va cada taladro, inclinación, profundidad) y corregirla rápido cuando cambia algo en campo.
- **Decisión que apoya:** Ubicar taladros según la cara libre real (burden), la topografía y la geología; ajustar profundidades para llegar a la cota de piso o rampa.
- **Entradas:** Taladros creados manualmente (mallas cuadradas, en tresbolillo, filas irregulares) o importados (X,Y,Z o GPS; combinaciones superficie+profundidad, superficie+fondo, superficie+azimut, fondo+profundidad); polilíneas; Excel/CSV/TXT; fondo (Google Maps, imagen, plano).
- **Flujo de usuario:** Crear malla, mover grupos de taladros a coordenadas exactas (2 clics), ampliar/reducir patrón por porcentaje, copiar/pegar con carga y tiempos, editar diámetro/profundidad/burden/dirección de cara libre, crear rampas (ajuste automático de fondo de pozo), "adaptar collar al terreno", copiar de la voladura anterior.
- **Salidas:** Vista 2D/3D de la malla, tabla de taladros, líneas y textos de anotación; exportación a texto/Excel y a formatos de perforadora (ver F22).
- **Modelo/cálculo detrás:** Geometría CAD; cálculo de burden mínimo por taladro respecto de la línea de banco (incluye ángulo del taladro).
- **Limitaciones/dolores:** Curva de aprendizaje alta (el curso dedica 6 de 16 sesiones a diseño, importación y organización). "Posición y tamaño de textos y etiquetas personalizables" figuraba como "próximamente" en 7.5 [B7.5 p.78]. Comparado con un CAD web: sin edición colaborativa.
- **Evidencia y confianza:** B7.5 p.15-19, 23, 27-28, 73-74; C01 lám. 12 (sesiones III-IV), lám. 13 y 15 (cinta "Diseño", grupos Zoom/Selección, CAD, Anotación, Vistas, X,Y,Z). **Alta**.

### F06. Perfiles de cara libre, burden crítico y mapa de calor
- **Nombre y tier:** Perfiles 2D/3D, perfil crítico 3D desde nube de puntos, mapa de calor de burden crítico. Perfil 2D: DE, PRO, ADV. Perfil crítico 3D desde nube: ADV (B7.5) / EVO+ (web) [B7.5 p.7-G]; mapa de calor: web [W-SOL].
- **Qué problema resuelve:** El plano en papel no muestra los "vientres" y "espolones" reales de la cara del banco. Ahí el burden es menor y la roca puede salir disparada (flyrock, accidente).
- **Decisión que apoya:** Reposicionar o descargar taladros donde el burden real es pequeño; asegurar que el burden mínimo real sea el de diseño.
- **Entradas:** Perfiles de láser (Carlson, Coda, TruePulse, MDL, LYNX, TEPEX), CSV/TXT de perfiles, nubes de puntos (`.laz .las .ply .dxf .dwg .dbs .csv`) de dron o láser terrestre, desviación de taladros (F07).
- **Flujo de usuario:** Elegir taladros en el mismo orden en que se escanearon, importar el archivo del perfilador y marcar "aplicar a todos", corregir el pie (toe) si no se evacuó todo el material, ver perfil crítico y mapa de calor 3D.
- **Salidas:** Perfil por taladro (pestaña "Bench" del Inspector), líneas de burden mínimo, mapa de calor de burden crítico sobre la nube, factor de carga vs. burden en un clic.
- **Modelo/cálculo detrás:** Distancia mínima 3D del taladro (con su inclinación) a la superficie; corrección de perfiles con una línea inclinada que representa el pie.
- **Limitaciones/dolores:** El mapa de calor y el perfil 3D exigen nube de puntos válida; si el dron no tiene puntos de control, la georreferenciación puede fallar (ver F14). Para cara libre irregular hay que confiar en el perfil 3D, no en el 2D.
- **Evidencia y confianza:** B7.5 p.20-22, 32, 36, 7-F, 7-G; B8 p.4, 8; W-SOL; C01 lám. 7 (Burden en la columna "Mediciones"). **Alta**.

### F07. Desviación de taladros y "burbujas" de riesgo
- **Nombre y tier:** Importación de desviación + análisis 3D de burbujas. DE, PRO, ADV (importación); burbujas: B8 / web.
- **Qué problema resuelve:** Un taladro nunca queda exactamente recto ni donde se diseñó; si dos quedan muy juntos habrá exceso de energía, y si quedan muy separados habrá roca sin romper.
- **Decisión que apoya:** Recargar (menos/más explosivo), tapar un pozo, o rediseñar la secuencia antes de disparar, según la posición real del pozo.
- **Entradas:** Sondas de desviación (Boretrak de Carlson, DeviaLim, formato IREDES, DNA-AIDEV). En los datos del curso: `23-12-21 Calidra PHD.phd` (Carlson Boretrak, azimut/inclinación cada 1 m) y `Voladura.xlsx` (hoja "Sondeo de Perforación": #Bno, Profundidad, Inclinación, Azimut, 90 taladros); más el fichero `Voladura.txt` con los collares (X, Y, Z).
- **Flujo de usuario:** Importar collares, importar la desviación y asociar por número de taladro, ver la trayectoria coloreada y las burbujas.
- **Salidas:** Trayectoria 3D con código de color; burbujas rojas (pozos demasiado juntos → concentración de energía y riesgo de flyrock) y azules (demasiado separados → mala fragmentación).
- **Modelo/cálculo detrás:** Geometría 3D de trayectorias (mínima curvatura o similar [INFERIDO]) y distancia entre pozos a lo largo de su longitud.
- **Limitaciones/dolores:** Cada fabricante de sonda usa otro formato; el usuario debe ordenar los pozos manualmente.
- **Evidencia y confianza:** B8 p.4; B7.5 p.20, 73-74; W-SOL (Bore Track, DeviaLim, IREDES); W-DNA (DNA-AIDEV: 40 mm de diámetro, <1° de precisión de azimut); S7 `.phd` y `Voladura.xlsx`. **Alta** (funcionalidad); **Media** (formato `.phd` deducido).

### F08. Secuencia de iniciación (timing) y reproductor de secuencia
- **Nombre y tier:** Módulo de timing (EDD, nonel, eléctricos), visualización de secuencia, "burning front", isolíneas. DE, PRO, ADV; diseño automático de timing = ADV (EDD).
- **Qué problema resuelve:** El orden y los milisegundos con que explotan los taladros deciden hacia dónde sale la roca, cuánta vibración se genera y si hay tiros cortados o fuera de secuencia.
- **Decisión que apoya:** Elegir retardo entre taladros/filas (ms), decidir el sentido de salida, y verificar que un tubo no explote antes de tiempo (cut-off).
- **Entradas:** Tipo de detonador (EDD, no eléctrico, eléctrico), retardos por taladro, VOD del tubo no eléctrico, desviación estándar en fondo y superficie, timing por deck, cara libre.
- **Flujo de usuario:** Crear una secuencia inicial, editar tiempos por grupos, reproducir la secuencia (con interferencias de onda y sonido), visualizar isolíneas de tiempo con dirección de lanzamiento, revisar el frente de combustión.
- **Salidas:** Mapas 2D/3D de tiempos, "burning front" (flechas y estrellas de colores), tablas de tiempos, conversión automática de retardos a números de detonador para inventario.
- **Modelo/cálculo detrás:** Cálculo de tiempos de iniciación; **simulación Monte Carlo** (1 o 50 corridas) para dispersión de nonel [B7.5 p.31].
- **Limitaciones/dolores:** La secuencia óptima solo se calcula automáticamente para EDD (electrónicos) en los folletos.
- **Evidencia y confianza:** B7.5 p.31, 40, 73-74, 76; C01 lám. 12 (sesiones IV y X: "crear una secuencia inicial", "analice el efecto de la acumulación de carga", "antemano de la carga por retardo"), lám. 7 (Tiempos). **Alta**.

### F09. Análisis de solapamiento y carga por retardo (charge per delay)
- **Nombre y tier:** Overlap / Charge per delay. DE, PRO, ADV (nivel exacto varía según función).
- **Qué problema resuelve:** Saber cuántos kg detonan "casi a la vez" en una ventana de tiempo, que es lo que determina la vibración a un edificio o talud.
- **Decisión que apoya:** Ajustar retardos o partir cargas en decks para no exceder el límite de vibración.
- **Entradas:** Secuencia (F08), cargas (F04), ventana de tiempo.
- **Flujo de usuario:** Seleccionar ventana; el módulo suma cargas que coinciden; ver gráfico de acumulación.
- **Salidas:** Gráficos de acumulación de carga, carga máxima por retardo, "abaco de campo" (carga por retardo vs. distancia permitida).
- **Modelo/cálculo detrás:** Suma de masas por ventana de tiempo, tomando la velocidad de onda P para decidir qué se solapa en un punto (Vp geologico).
- **Limitaciones/dolores:** El solape se evalúa en el sentido de "ventana", no por superposición de formas de onda (eso es la trou-signature, F11).
- **Evidencia y confianza:** B7.5 p.41-45, 7-E, 74-75; C01 lám. 15 (campo "C per D"). **Alta**.

### F10. Registros de vibración: importación, análisis y ley de atenuación
- **Nombre y tier:** Módulo sísmico ("Registros" y "Analizar"). PRO, ADV; K y α automáticos por zona/distancia/período = ADV; análisis avanzado (Vp, H/V, función de transferencia, rotación) = ADV.
- **Qué problema resuelve:** Convertir los registros de sismógrafos en un "modelo del terreno" que prediga cuánta vibración habrá a cierta distancia con cierta carga. Además cumplir normativas.
- **Decisión que apoya:** Máxima carga por retardo permitida a cada distancia (p. ej. límite de 25 mm/s o 1 mm/s en un edificio); validar si se cumplió el límite en la voladura.
- **Entradas:** Registros sísmicos de sismógrafos (IDETEC, Instantel, NOMIS, Vibracord, White, ZTEX, Syscom, ASCII/CSV, formato nativo); zonas (puntos de control: casas, plantas, taludes); cargas por retardo; distancias. En los datos del curso: 1 registro nativo `.NSZ` y 2 CSV (ver §5).
- **Flujo de usuario:** Crear áreas/zonas, importar señal ASCII o nativa, asociar a la voladura, filtrar y seleccionar eventos (los puntos que dan la mejor correlación), ver regresión log-log de PPV vs. distancia escalada, borrar puntos atípicos desde el gráfico, guardar la selección como "escenario" y asignarla a una zona.
- **Salidas:** Tabla de registros (voladura, fecha, zona, PPV L/T/V, resultante PVS, carga de referencia, distancia); gráfico PPV vs. distancia escalada con línea de ajuste, coeficiente de correlación r², intervalo de confianza configurable (50 % en el ejemplo); puntos = trou-signature, cuadrados = voladura completa; abaco de campo.
- **Modelo/cálculo detrás:** Ley de atenuación por distancia escalada **PPV = K·(D/√Q)^α** con regresión log-log; en el caso 2 del curso: K(50 %) = 179,4, α = −1, r² = 0,7 (Brasil, voladuras cerca de cavidades [C01 lám. 14]). Filtros (pasa alto/bajo/banda), FFT, cumplimiento de norma.
- **Limitaciones/dolores:** Cada sismógrafo entrega otro formato (el curso tuvo que ver 3 formas distintas: nativo, ASCII con cabecera de 2 filas, y CSV de otro fabricante); K y α son locales: cambiarlos por zona exige clasificar bien los registros.
- **Evidencia y confianza:** B7.5 p.41-48, 75; C01 lám. 12 (sesión V: importar señal ASCII / nativa; crear áreas), lám. 14 (gráfico real de la ley con K=179,4, α=−1, r²=0,7), lám. 7 (Vibraciones); S5 (datos). **Alta**.

### F11. Simulación de PPV: distancia escalada, iso-PPV y "trou-signature"
- **Nombre y tier:** Simulación de vibración. Distancia escalada + iso-PPV: PRO, ADV (EVO). Método de la "signature hole": PRO (solo far-field/tiempo) y ADV (near-field/frecuencia, multiseñal, decks); deconvolución = ULT.
- **Qué problema resuelve:** Predecir antes de disparar cuánta vibración habrá en cada punto sensible, incluyendo el efecto de la secuencia, no solo la suma de kg.
- **Decisión que apoya:** Aprobar o rediseñar la secuencia y las cargas; localizar el punto crítico.
- **Entradas:** Malla, cargas, secuencia, zonas y puntos de control, K y α (F10) o una **señal de un solo taladro** (signature hole) registrada en campo, velocidad de onda P, filtros.
- **Flujo de usuario:** Escoger método, elegir zonas o nube de puntos, definir ventana de tiempo, ejecutar; para signature hole, seleccionar el registro de un pozo aislado, opcionalmente varios y con decks.
- **Salidas:** PPV por zona, mapas iso-PPV sobre nube de puntos, radios de carga por retardo (círculos azul→rojo), mapa de factor de amplificación por frecuencia, gráficos de señal predicha en el tiempo.
- **Modelo/cálculo detrás:** (1) Distancia escalada. (2) **Superposición lineal de la respuesta de un taladro elemental ("trou-signature") en dominio del tiempo y de la frecuencia**, con retardos y distancias de cada pozo; método publicado por Bernard (2009, 2012). Precisión declarada ≤22 % de desviación en 1806 cargas.
- **Limitaciones/dolores:** Requiere un registro de un solo taladro cercano (calibrar es trabajo de campo); el cálculo puede tardar (multi-núcleo, estimación de tiempo, aviso por email en ADV). Los K/α por zona deben mantenerse al día.
- **Evidencia y confianza:** B7.5 p.7-E, 45, 56-60, 74-77, 79; W-SCI (Bernard 2009, 2012; algoritmo genético 10 000 secuencias en <10 s); W-SOL. **Alta** (descripción); modelo interno solo a nivel de nombre.

### F12. Optimización del retardo (secuencia) por vibración y frecuencia
- **Nombre y tier:** Optimización de secuencia / Optimizer. PRO (un solo pozo, minimizar PPV, campo lejano), ADV/ULT (minimizar PPV, subir frecuencia, ambas, toda la voladura, near-field, deck).
- **Qué problema resuelve:** Encontrar automáticamente qué milisegundos entre taladros/filas dan menos vibración, en vez de probar a mano.
- **Decisión que apoya:** Elegir retardo entre taladros, entre filas y entre cargas de un mismo pozo; decidir entre "menos PPV" y "más frecuencia" (menos dañina para estructuras).
- **Entradas:** Signature hole, zonas, rango de retardos, restricciones (PPV, frecuencia), filtros.
- **Flujo de usuario:** Configurar, calcular (barra de progreso y tiempo estimado, multi-núcleo), recibir correo con resultados en TXT, ver gráfico 3D (Vp, frecuencia o retardo óptimo), aplicar el retardo calculado a la secuencia con un clic.
- **Salidas:** Retardo interpozo óptimo (p. ej. 13 ms en el ejemplo), superficies 3D de PPV/frecuencia vs. retardos, archivos TXT.
- **Modelo/cálculo detrás:** Superposición de trou-signature + búsqueda (algoritmo genético en la versión ULT [W-SCI]).
- **Limitaciones/dolores:** Solo aplica a electrónicos (EDD) en práctica; requiere haber caracterizado la señal.
- **Evidencia y confianza:** B7.5 p.56-60, 76-77; W-SCI; C01 lám. 12 (sesión XIV: "optimice el tiempo con el modelo de onda elemental"). **Alta**.

### F13. Airblast (onda aérea)
- **Nombre y tier:** Simulación de airblast. Un pozo (con dirección de cara libre): PRO, ADV. Voladura completa a nivel de zona con clima: ADV.
- **Qué problema resuelve:** Anticipar el ruido/sobrepresión (dB) que llegará a un pueblo o edificio, incluyendo viento y temperatura.
- **Decisión que apoya:** Cambiar dirección de cara libre, cargas o secuencia; decidir si volar hoy según el clima.
- **Entradas:** Malla, cargas, timing, dirección de la cara libre, temperatura, viento, registros de airblast (dB) con ley de atenuación propia y r² de aire.
- **Flujo de usuario:** Configurar clima, seleccionar zona, ver interferencia y gráfico del nivel en la zona; calibrar el modelo con registros; calcular velocidad de onda P a partir de señal sísmica + aérea.
- **Salidas:** Niveles en dB por dirección (escala amarillo-rojo), gráfico en tiempo real en la zona, ley de atenuación de aire.
- **Modelo/cálculo detrás:** Distancia escalada para airblast; propagación con efecto de temperatura y viento (detalles no publicados).
- **Limitaciones/dolores:** [INFERIDO] modelo aéreo no incluye topografía compleja (no documentado).
- **Evidencia y confianza:** B7.5 p.47-48, 52-53, 75-76; C01 lám. 7 (Air Blast), lám. 12 (sesión XIV). **Alta**.

### F14. Fotogrametría con dron: ortofoto, puntos de control y nube de puntos
- **Nombre y tier:** Flujo de fotogrametría + importación de nubes de puntos y ortofotos. Importación de nubes: DE, PRO, ADV; "generación de nube" listada en Field Measures (web).
- **Qué problema resuelve:** Tener un modelo 3D/orto de la cara y el piso exactamente al día, sin poner gente en la cara del banco.
- **Decisión que apoya:** Diseñar contra la topografía real; medir volúmenes; comparar antes y después; ubicar taladros reales sobre la ortofoto.
- **Entradas:** Fotos de dron (81 JPG de ~15 MB, `MAX_0463…MAX_0543`), puntos de control con coordenadas (`Puntos.txt`, ver §5), ortofoto GeoTIFF (`orthophoto.tif`, 927 MB) y otra imagen `Imagen.tif` (10 MB) [S6, solo índice].
- **Flujo de usuario (según programa del curso):** "Procesamiento de fotos con dron" y "ploteo de taladros en la nube de puntos" (sesión VI); luego importar nube de puntos, operar con nube, crear perfiles críticos a partir de la nube, perfil 3D vs. 2D (sesión VIII).
- **Salidas:** Ortofoto georreferenciada, nube de puntos coloreada con normales (`NP_Malla_Voladura 02.txt`: X Y Z R G B nx ny nz, ~302 MB), perfiles críticos.
- **Modelo/cálculo detrás:** No se publica; el procesamiento probablemente lo hace software externo (WebODM/Metashape/Pix4D [INFERIDO]) y I-Blast importa el resultado. El sitio dice que "genera nube de puntos" [W-SOL] pero no se ve el flujo.
- **Limitaciones/dolores:** Archivos enormes (ortofoto de casi 1 GB). El fichero de puntos de control tiene coordenadas que parecen Norte, Este en vez de X,Y (ver §5).
- **Evidencia y confianza:** C01 lám. 12 (sesiones VI-VIII), lám. 10-11 (dron en el gemelo digital); S6 (índice del zip y `Referencias.png`); S7; B7.5 p.7-F/G. **Media-Alta**.

### F15. Medición de fragmentación por imagen (DNA-Frag / Photogrammetric Analysis System)
- **Nombre y tier:** Análisis fotogramétrico de fragmentación. PRO, ADV (EVO/EVO+/ULT; manual básico ya en DE web).
- **Qué problema resuelve:** Medir el tamaño de las rocas del montón sin tamizar físicamente.
- **Decisión que apoya:** Saber si la voladura dio la granulometría objetivo (p. ej. % pasante a 800 mm) y recalibrar el modelo.
- **Entradas:** Fotos con una escala de referencia; en el curso `s9\Fragmentación.zip` = 7 fotos de dron DJI (modelo FC330/Phantom 4 [INFERIDO por "FC330"], 4000×3000 px, tomadas el 31/01/2018 según EXIF) de un montón de roca caliza gris con una pelota de referencia; y ortofoto.
- **Flujo de usuario:** Definir escala con una línea de 2 puntos, detección automática (escala de grises, contraste automático, tamaño de imagen reducido), corrección manual (líneas entre 2 puntos) para bloques y finos, analizar varias imágenes y concatenar; luego "medir la fragmentación de una ortofoto" con cuadrícula.
- **Salidas:** Curva granulométrica por imagen y conjunto; la versión 7.5 reduce el tiempo de 160 s a 20 s por foto de 500 kB; DNA-Frag entrega distribución georreferenciada por dron.
- **Modelo/cálculo detrás:** Segmentación de imágenes + ajuste de curva (modelo no publicado); AI en versiones recientes [W-SOL].
- **Limitaciones/dolores:** Todo montón fotografiado desde arriba subestima finos y sobrestima fragmentos grandes (sesgo típico, no documentado [INFERIDO]). Depende de calidad de imagen y escala.
- **Evidencia y confianza:** B7.5 p.7-C, 39, 75; B8 p.5; C01 lám. 12 (sesiones VII y XIV), lám. 7 (Fragmentación en "Mediciones"); s9 zip. **Alta** (existencia), **Media** (método).

### F16. Simulación de fragmentación (predicción)
- **Nombre y tier:** Simulación de fragmentación, un pozo (PRO, ADV/EVO) y toda la voladura (ADV/EVO+). ULT usa modelo de vóxeles.
- **Qué problema resuelve:** Prever la curva de tamaños antes de disparar, y ver qué parte del banco quedará gruesa o fina.
- **Decisión que apoya:** Ajustar malla (burden/espaciamiento), carga y secuencia para lograr la granulometría objetivo (y bajar costo de chancado/carguío).
- **Entradas:** Geometría del pozo (burden y espaciamiento teóricos o reales), carga, geología (UCS, Vp, etc.), perfil real de la cara; medición de tamaño máximo para calibrar.
- **Flujo de usuario:** Simular un taladro; calibrar con la medición (F15); simular toda la voladura (mapa 3D y curva); comparar resultados.
- **Salidas:** Curva granulométrica y mapa 3D coloreado por tamaño (lám. 7: "Fragmentación").
- **Modelo/cálculo detrás:** "Modelo de fragmentación basado en la física de la onda P" [W: I-Blast 7]; en ULT, **discretización en vóxeles con trayectorias balísticas y colisiones** [W-SCI]. Precisión declarada 84-90 %.
- **Limitaciones/dolores:** Cálculo de fragmentación de toda la voladura solo en ADV; la web aclara que es solo predicción previa (no aprende de datos posteriores) [W-SCI].
- **Evidencia y confianza:** B7.5 p.75-76; C01 lám. 7-8, 12 (sesión XII: simular, calibrar, analizar resultados); W-SCI; PAPER (84-90 %). **Alta** (existencia); modelo solo por nombre.

### F17. Proyección (cast), forma del montón (muckpile) y daño
- **Nombre y tier:** Simulación de cast y muckpile: un pozo (PRO/ADV), varias filas con perfil real (ADV); 3D cast, "Damage simulation" (ADV).
- **Qué problema resuelve:** Predecir hasta dónde se lanzará la roca y qué forma tendrá el montón; evitar proyecciones peligrosas y facilitar el carguío/limpieza.
- **Decisión que apoya:** Distancias de seguridad y despeje; elegir retardo entre filas (ejemplo: 16 ms vs. 58 ms cambia el montón); minimizar dilución de mineral (movimiento de roca).
- **Entradas:** Malla, cargas, perfil real (F06), timing entre filas, geología, medición de distancia máxima para calibrar.
- **Flujo de usuario:** Elegir un pozo o toda la cara; ejecutar; comparar escenarios; calibrar con la distancia medida.
- **Salidas:** Velocidad de eyección, trayectoria, distancia horizontal máxima, efecto cráter, forma 3D del montón (2D y 3D).
- **Modelo/cálculo detrás:** Balística por taladro con eyección desde la cara libre; **en ULT, movimiento 4D en vóxeles** [W-SCI]. Precisión declarada <20 % en cast horizontal (Osisko) y <5 % (cantera).
- **Limitaciones/dolores:** Modelo 4D solo en ULT; la simulación del montón asume el efecto de la secuencia de tiempos pero no de diferencias de sobreperforación [INFERIDO].
- **Evidencia y confianza:** B7.5 p.51, 54-55, 76, 80-82; C01 lám. 8 ("antes/después"), lám. 12 (sesión XIII); W-SCI. **Alta**.

### F18. Distribución de energía 2D/3D (con y sin tiempo)
- **Nombre y tier:** Energy distribution. 2D: PRO/ADV; 3D con cortes horizontales/verticales: PRO/ADV; con ventana de tiempo: ADV.
- **Qué problema resuelve:** Ver dónde termina la energía dentro y alrededor de la voladura: zonas con exceso (riesgo de flyrock, sobrefragmentación) o con déficit (bloques, "patas").
- **Decisión que apoya:** Reasignar carga y timing para uniformizar la energía; corregir efectos de mal burden.
- **Entradas:** Cargas, malla, secuencia (opcional), 1 de 5 resoluciones.
- **Flujo de usuario:** Elegir 2D o 3D, resolución, cortes (10 horizontales automáticos o verticales a medida), marcar "considerar tiempo", ejecutar.
- **Salidas:** Mapas de energía con escala de color, animación en el tiempo, imágenes para reporte.
- **Modelo/cálculo detrás:** Suma de contribuciones energéticas por carga, con atenuación geométrica y timing (no publicado).
- **Limitaciones/dolores:** [INFERIDO] es un indicador cualitativo, no energía absoluta en MJ/m³.
- **Evidencia y confianza:** B7.5 p.7-D, 38, 75-76; B8 p.5. **Alta**.

### F19. Carga automática, patrón automático y timing automático
- **Nombre y tier:** Smart loading / automatic pattern. ADV (EVO+/ULT). Con reglas por burden, UCS, carga por retardo o PPV.
- **Qué problema resuelve:** Cargar cientos de taladros a mano según reglas repetitivas es lento y sujeto a errores.
- **Decisión que apoya:** Definir reglas ("a este burden, esta altura de taco; a esta distancia de la zona, esta carga máxima") y dejar que el software las aplique.
- **Entradas:** Explosivo, longitud de decks, taco final, tiempos entre decks, booster/detonadores, objetivos (carga por retardo, PPV en una zona, burden, resistencia de roca).
- **Flujo de usuario:** Elegir explosivo, configurar taladro tipo, elegir ajuste (variar taco o forzar cargas iguales), aplicar a los pozos (proceso de ~3 s), revisar con el Inspector; también importar Excel con carga y tiempos y recibir advertencias de inconsistencias.
- **Salidas:** Plan de carga por pozo, informes de discrepancias (pozos faltantes, ajuste de densidad hasta 1,4, ajuste de profundidad), ajuste de posición y ángulo de la primera fila para mantener un burden definido contra el perfil crítico (v8).
- **Modelo/cálculo detrás:** Reglas y búsqueda; para carga por PPV usa las distancias de cada pozo a la zona.
- **Limitaciones/dolores:** Solo ADV.
- **Evidencia y confianza:** B7.5 p.28-30, 50, 74; B8 p.3-4. **Alta**.

### F20. Datos de perforación (MWD) y resistencia de roca
- **Nombre y tier:** Importar registros de perforación, índice de resistencia equivalente. PRO, ADV (EVO/ULT); mapa UCS en web.
- **Qué problema resuelve:** La perforadora "siente" la dureza de la roca mientras perfora; aprovechar eso para cargar más donde es dura y menos donde es blanda.
- **Decisión que apoya:** Zonificar la carga por resistencia; justificar cargas ante el cliente; ajustar la malla al dominio.
- **Entradas:** Registros MWD por taladro. En los datos del curso: **50 ficheros `.lim`** (en `LIM-…zip`), cada uno un ZIP con `data.nc` (NetCDF) y `description.xml` (dispositivo LIM, máquina "Junjin JD800", método rotopercusión, diámetro de herramienta 88,9 mm, longitud de barra 3,66 m); variables por muestreo: `time`, `DEPTH`, `AS`, `TP`, `TQ`, `EVP/EVR/IP/SP`. Ver §5.
- **Flujo de usuario:** Elegir taladros en el orden de perforación, asignar cada registro con un clic, elegir 2 "parámetros compuestos" y 4 parámetros de perforación, ver el índice junto a cada pozo, añadir la curva MWD al plan de carga del pozo.
- **Salidas:** Índice de resistencia cualitativo por pozo (en MPa vía calibración de F03), curva de log junto a la carga en el reporte.
- **Modelo/cálculo detrás:** Rc = a·índice + b (calibrable en el modelo geológico).
- **Limitaciones/dolores:** Los parámetros MWD varían según el equipo (la propia captura de geología usa "TBT" sin documentarlo). Interpretación cualitativa ("cuanto más a la derecha la curva, más dura la roca").
- **Evidencia y confianza:** B7.5 p.37, 71, 75; DI `Base-Itabirito C.png` (campo de calibración); S7 `.lim`; C01 lám. 7 (M.W.D.). **Alta**.

### F21. Auditorías y análisis de costos / GHG
- **Nombre y tier:** Auditorías de perforación, de carga, de perfiles, de costos y ambiental (GHG); cost module: DE/PRO/ADV en 7.5; GHG: EVO/ULT en web.
- **Qué problema resuelve:** Comparar lo diseñado con lo ejecutado y poner un costo (dinero y CO₂) a cada decisión.
- **Decisión que apoya:** Cambiar producto, malla o personal para bajar costo; corregir el error de perforación; auditar emisiones.
- **Entradas:** Plan, datos ejecutados (profundidades reales, cargas reales), precios de explosivos (R$/kg en la captura), costos de perforación y mano de obra, factor GHG por explosivo.
- **Flujo de usuario:** Abrir auditoría, elegir ventana de tiempo, ver tablas y comparaciones.
- **Salidas:** Tablas (filtrables, exportables a Excel), gráficos de KPIs, reportes; en el programa del curso: sesión XI "análisis de costos", "análisis de perforación", "auditoría de gases de efecto invernadero", "comparación de voladuras".
- **Modelo/cálculo detrás:** Contabilidad de costos; GHG = kg de explosivo × kg CO2/kg (campo en la plantilla de explosivo).
- **Limitaciones/dolores:** Sin datos de detalle.
- **Evidencia y confianza:** DI `Base-Ibegel.png` (campos Precio y GHG); B7.5 p.64, 75; W-SOL; C01 lám. 12 (sesión XI), lám. 7 (KPIs). **Alta**.

### F22. Informes PDF y exportación a equipos y detonadores
- **Nombre y tier:** Reportes automáticos (diseño, simulación, resultados) y exportación. DE, PRO, ADV (el informe de simulación en PDF es de ADV/PRO según tabla).
- **Qué problema resuelve:** Entregar al operador una hoja de campo exacta y, al cliente/regulador, evidencia del diseño, la simulación y el resultado.
- **Decisión que apoya:** Aprobar y comunicar; dar instrucciones de carga a los blasters.
- **Entradas:** Diseño (F05-F08), simulaciones, logo y colores corporativos, fotos, clima, mallas anti-proyección, nombre del blaster.
- **Flujo de usuario:** Elegir páginas, editar (pincel para anotar en el PDF), guardar en la BD, reutilizar páginas; el botón "PDF" de la cinta Global.
- **Salidas:** PDF de diseño (lista de explosivos, detonadores por longitud, cargas por pozo, patrón, tiempos y cableado, mapa de ubicación), PDF de simulación, PDF de resultados (eventos sísmicos, PPV máximo por zona); Excel, Word, XML, TXT; archivos de patrón de perforación **IREDES, VIST, TPL** para perforadoras inteligentes; exportación a detonadores electrónicos (DaveyTronic, Fametronic, HiTronic, IIDetex); `.dna` para compartir.
- **Modelo/cálculo detrás:** No aplica.
- **Limitaciones/dolores:** Reportes basados en plantillas propias de I-Blast; el "reporte personalizado con tu propia página" solo desde v8. Lista de detonadores solo para eléctricos en 7.5.
- **Evidencia y confianza:** B7.5 p.11, 61-71, 77-78; B8 p.6-7; C01 lám. 15 (botón PDF), lám. 12 (sesión IX: reportes, exportar/importar patrón, sincronizar BD); W-SOL. **Alta**.

### F23. Subterráneo: túneles y voladura en abanico (ring blasting)
- **Nombre y tier:** Módulo de túnel y ring blasting. DE (compatibilidad), PRO, ADV (módulos automáticos).
- **Qué problema resuelve:** Diseñar el patrón de perforación de un frente de túnel o de anillos en minería subterránea (donde la geometría es compleja) y exportarlo al jumbo.
- **Decisión que apoya:** Distribución de taladros (cuele, ayudas, contorno), tipo de explosivo y diámetro; predecir vibración y daño.
- **Entradas:** Forma de túnel (varias disponibles), parámetros de explosivo, diámetro, resistencia; geometría de anillos.
- **Flujo de usuario:** Elegir forma del túnel, patrón automático y carga, revisar en 3D (vistas múltiples, útil para anillos), exportar.
- **Salidas:** Patrón de túnel, vista 3D de anillos, exportación a jumbo.
- **Modelo/cálculo detrás:** Diseño geométrico automático; modelo vóxel adaptado a espacio confinado en ULT (colisiones con paredes y techo, bulking limitado por el volumen disponible) [W-SCI].
- **Limitaciones/dolores:** Menos detalle público que superficie. Caso de referencia: proyecto Chavimochic (Perú), 95 % de avance garantizado [B7.5 p.83].
- **Evidencia y confianza:** B7.5 p.7-A, 7-B, 14, 34, 73-74, 83; B8 p.3; W-SOL, W-SCI. **Alta** (existencia), **Media** (profundidad).

### F24. Gemelo digital 4D (ULT)
- **Nombre y tier:** Digital Twin / simulación 4D de movimiento de roca. ULT.
- **Qué problema resuelve:** Simular en 3D a lo largo del tiempo cómo se rompe y se mueve la roca (y la ley de mineral) para controlar dilución, estabilidad de taludes y vibración.
- **Decisión que apoya:** Reducir dilución y pérdida de mineral, elegir secuencia y carga, planificar recuperación selectiva.
- **Entradas:** Todo el resto (malla, cargas, secuencia, geología, MWD, nube de puntos, datos de sismógrafo, fotogrametría). En el curso: dron, perforadora, camión de carga, sismógrafo, fotogrametría "antes/después" [C01 lám. 10].
- **Flujo de usuario:** Cargar diseño real, ejecutar simulación 4D, comparar "antes/después" con fotos y nube de puntos, calibrar.
- **Salidas:** Modelo 4D de terreno y movimiento (colores por desplazamiento), distribución de tamaño de fragmentos, niveles de vibración y firma sísmica en el ambiente (C01 lám. 8); ganancias publicadas (p. ej. 22,1 M USD/año en Nordgold por excavación selectiva, según la web).
- **Modelo/cálculo detrás:** Medio continuo/elasticidad (ecuaciones de equilibrio de tensiones, ondas), discretización en vóxeles, trayectorias balísticas y colisiones, transporte de atributos (ley de mineral) [C01 lám. 9; W-SCI]. Las ecuaciones de la lámina 9 son de tensor de tensiones, ecuación de onda y Bernoulli (solo ilustrativas).
- **Limitaciones/dolores:** Solo predicción previa (no realimenta con datos posteriores) [W-SCI]. Costo/licencia superior. Estado real de madurez difícil de verificar sin demo.
- **Evidencia y confianza:** C01 lám. 8-11; W-SOL; W-SCI; W-TRL (nivel 5 "gemelo digital 4D"). **Media** (marketing + resumen web).

### F25. Dashboard web de KPI
- **Nombre y tier:** I-Blast Dashboard. Producto separado (web).
- **Qué problema resuelve:** Que gerencia y operación vean los indicadores de voladura sin abrir el programa de escritorio.
- **Decisión que apoya:** Seguimiento de fragmentación, vibración, costos, consumo de explosivos y desempeño operativo entre voladuras.
- **Entradas:** Datos de las bases I-Blast (sincronizadas).
- **Flujo de usuario:** Iniciar sesión desde el navegador; ver KPIs; filtrar.
- **Salidas:** Tablero con gráficos (en la lám. 7 del curso: barras, tortas y tablas en "KPI's"), acceso remoto.
- **Modelo/cálculo detrás:** No aplica (agregación de datos).
- **Limitaciones/dolores:** [INFERIDO] requiere que el usuario ya use I-Blast de escritorio; no está claro si existe API abierta.
- **Evidencia y confianza:** W-SOL; C01 lám. 7 (Dashboard listado en "Entregas", "KPI's" en Optimización). **Media**.

### F26. Ecosistema de campo: DNA-Frag / FragCam, OnSite, AIDEV, Vib, RTK
- **Nombre y tier:** Productos complementarios (no incluidos en las licencias I-Blast).
- **Qué problema resuelve:** Cerrar el ciclo "diseño → ejecución → medición" con datos reales de campo.
- **Decisión que apoya:** Ajustar diseño en el sitio; medir fragmentación en continuo; verificar posición del taladro con precisión de centímetros; alimentar la simulación con vibración de alta calidad.
- **Entradas / salidas:** DNA-FragCam (IA en cinta transportadora, medición cada segundo, % pasante, correo diario); DNA-OnSite (tablet de campo para carga real y posiciones, con kit DNA-RTK); DNA-AIDEV (sonda de desviación, 40 mm × 450 mm, 2 kg, Bluetooth, 8 h de batería, incremento mínimo 0,5 m); DNA-Vib (sismógrafo en desarrollo).
- **Flujo de usuario:** El operador registra en tablet; los datos se sincronizan con la BD de I-Blast.
- **Modelo/cálculo detrás:** No publicado.
- **Limitaciones/dolores:** Requiere hardware propio. DNA-Vib todavía "en desarrollo".
- **Evidencia y confianza:** W-DNA (https://www.dna-blast.com/dna-solutions.html). **Media** (un solo resumen web).

---

## 4. Flujo de trabajo de punta a punta (según el cronograma del curso)

Fuente: cronograma de 16 sesiones (C01 lám. 12), donde el ponente pasa de datos a reporte. La lámina 10 resume el concepto: datos de dron, perforadora y camión entran; sismógrafo y dron devuelven medición para calibrar.

1. **Sesión I (07/06)** – Instalación, modo licencia, configuración de usuario, organización de la información (sitio, voladura, carpetas).
2. **Sesión II (10/06)** – Bases de datos: geología (F03), explosivos (F02), modelos de carga (F04), generación de polígonos (zonas/áreas).
3. **Sesión III (12/06)** – Crear taladros, cargar, visualizar el patrón, modificar taladros (F05).
4. **Sesión IV (14/06)** – Importar taladros, crear grupos, ajustar profundidad automáticamente, crear una secuencia inicial (F05, F08).
5. **Sesión V (17/06)** – Escenarios y caras libres, importar perfiles (F06), áreas para señales sísmicas, importar señal ASCII o nativa (F10).
6. **Sesión VI (19/06)** – Procesar fotos de dron y plotear taladros en la nube de puntos (F14).
7. **Sesión VII (21/06)** – Fondo de Google Map, imágenes de fondo, varias voladuras a la vez, importar fotos generales y para granulometría (F14, F15).
8. **Sesión VIII (24/06)** – Nube de puntos, perfiles críticos desde la nube, perfil 3D vs. 2D (F06).
9. **Sesión IX (26/06)** – Revisar datos, crear reportes, exportar/importar patrón de voladura, sincronizar con base de datos maestra (F01, F22).
10. **Sesión X (28/06)** – Primera secuencia, interferencia de secuencia, efecto de la acumulación de carga, "antemano" de carga por retardo (F08, F09).
11. **Sesión XI (01/07)** – Carga por retardo en cargas específicas, costos, perforación, auditoría GHG, comparación de voladuras (F21).
12. **Sesión XII (03/07)** – Simular fragmentación de un taladro, calibrar, analizar resultados (F16).
13. **Sesión XIII (05/07)** – Simular proyección, calibrar, analizar (F17).
14. **Sesión XIV (08/07)** – Onda aérea (simular, calibrar, analizar), medir fragmentación en una sola imagen y en una ortofoto, optimizar el tiempo con el modelo de onda elemental, simular PPV en una malla y en una nube de puntos (F13, F15, F12, F11).
15. **Sesión XVI (12/07)** – Casos de estudio y evaluación de entrenamiento.

**Casos de estudio del curso:** Caso 1 = sesión práctica en pantalla vacía de I-Blast (lám. 13). Caso 2 = voladuras cerca de cavidades naturales ("Cavidad 01/02") en una mina de hierro de Brasil, con registros sísmicos y ley de atenuación K=179,4, α=−1, r²=0,7 (lám. 14-15).

---

## 5. Formatos de archivo encontrados

| Formato / archivo | Origen | Qué se pudo deducir |
|---|---|---|
| **`.dna`** (`Explosif.dna`, 836 bytes) | `DATOS INICIALES/Fichas tecnicas/` | Es el formato de intercambio de I-Blast (diseños y plantillas de explosivo) [B7.5 p.25]. El fichero es **texto ASCII en Base64** con líneas de 80 caracteres y CRLF. Decodificado: 610 bytes con cabecera `01 01 00 00 00 04`, luego dos enteros de 32 bits (0x252 = 594 = longitud de la carga útil y 0x3CD = 973, tamaño sin comprimir) y 594 bytes de alta entropía (7,6 bits/byte). No se abrió con zlib, raw deflate, bz2, lzma ni brotli: probablemente compresión o cifrado propietario. **No se logró leer el contenido.** Como el zip llamado "DATOS INICIALES" no trae ningún `.dna` de proyecto completo, solo el de la plantilla de explosivo. |
| **`.NSZ`** (`Registro 1 (D=100 m y Z=2500).NSZ`, 29,7 KB) | S5 `Datos.zip` | Binario. Comienza con la cadena ASCII `DEMx0100038382E372A23DSN123456322253XX` seguida de `DNA` y cadenas como `13056`; el resto parece comprimido/codificado. Es el "señal sísmica nativa" del curso (sesión V). Marca del equipo/fabricante no identificada [INFERIDO: sismógrafo de la línea de DNA-Blast o NOMIS, que la web lista entre los importadores automáticos]. Nombre del fichero: distancia 100 m, Z=2500 (cota). |
| **CSV de vibración** (`Registro 2 (a 200 m y Z=2500).csv`, `Registro 3 (a 300 m y Z=2500).csv`) | S5 | Codificación ISO-8859-1, separador `;`, decimal `.`. Fila 1: `;Acústico;Radial;Vertical;Transversal`. Fila 2: `Tiempo De la Muestra;Decibelios;mm/s;mm/s;mm/s`. Datos: 6656 muestras por registro con paso de 0,0009766 s (= 1/1024 s: **1024 muestras por segundo**), duración 6,5 s; 4 canales: airblast en dB (0-128) y velocidad de partícula radial, vertical y transversal en mm/s. Picos: a 200 m R 3,81, V 3,05, T 3,94 mm/s y 128 dB; a 300 m R 3,30, V 2,79, T 3,43 mm/s y 116 dB. Al final quedan filas vacías `;;;;`. |
| **`Voladura.csv`** | S5 | 110 taladros: `Taladro;X (m);Y (m);Z (m);Longitud (m)`. Los números usan **coma como separador de miles y punto como decimal** (`272,345.578`) y las longitudes van de 7,6 a 12,0 m (110 filas verificadas). Coordenadas UTM (X≈272 000, Y≈7 651 000, cota≈2564-2570 m). |
| **`Voladura.txt` / `Voladura.xlsx`** | S7 | `.txt`: TSV con cabecera `Tipo`, `X superior (m)`, `Y superior (m)`, `Z superior (m)` para 90 taladros (collares, UTM X≈617 700, Y≈2 113 200, Z≈2519 m). `.xlsx`: hoja "Sondeo de Perforación" con `# Bno`, `Profundidad`, `Inclinación`, `Azimut` (90 filas; profundidad ~7-14 m, inclinación ~0-12°). Es la combinación collar + desviación. |
| **`.phd`** (`23-12-21 Calidra PHD.phd`, 65 KB) | S7 | Binario de una sonda **Carlson BoreTrak** (cabeceras `Carlson Boretrak`, `O_ Face ID:01`, `Surveyed:271221`, `Hole No:01`, `Depth:14.50`, `Obs Sep:1.00`, `Offset:0.50`). Por pozo: cabecera y registros de 36 bytes: cadena `Original` (14 caracteres, relleno) + float azimut + float inclinación + float profundidad (p. ej. 312,19°, 0,33°, 1,0 m; 350,8°, 3,49°, 2,0 m). 1215 registros ≈ 33 pozos [deducción propia]. Calidra es una empresa mexicana de cal (caso citado en [W-REF]). |
| **`.lim`** (50 ficheros en `LIM-…zip`) | S7 | ZIP renombrado con `data.nc` (NetCDF clásico, cabecera `CDF\x01`) y `description.xml` (esquema `lim.eu`: `filename`, `creation`, `project_ref` "VOL 51", `borehole_ref`, `operator`, `device` (serie 52067, build 20170405), `drilling` (máquina Junjin JD800, método rotopercusión, herramienta 88,9 mm, fluido aire, longitud de barra 3,66 m), `inclination` X/Y, duración efectiva en s). `data.nc`: 990 muestras con `time` (0-539,8 s), `DEPTH` (0-10,91 m), `AS` (1-1218), `EVP`, `EVR`, `TP` (2,2-88,6), `IP`, `TQ` (3,1-99,3), `SP`. Son registros MWD: el significado exacto de AS/TP/TQ no está documentado [INFERIDO: velocidad de avance, presión de empuje, torque]. |
| **`NP_Malla_Voladura 02.txt`** | S7 (302 MB; solo se leyó el encabezado) | Nube de puntos en texto: 9 columnas separadas por espacio, `X Y Z R G B nx ny nz` (coordenadas UTM ≈ 617 718, 2 113 257, 2525 m; colores 0-255; normales unitarias). Sin cabecera. **4 172 869 puntos** (conteo de líneas leído en streaming desde el zip, sin extraerlo); ~72 bytes por punto. |
| **`Puntos.txt` + `Referencias.png`** | S6 (extraídos del zip de 1,6 GB) | `Name;X;Y;Z;ID` con 4 puntos de control (P5-P8) con "X"≈2 267 778 y "Y"≈325 365 y cota 1832-1835: **los valores parecen Norte y Este intercambiados** (el Y 325 365 es un Este UTM, el X 2 267 778 un Norte [INFERIDO]), aviso de trampa al importar. `Referencias.png` = recorte de la ortofoto con las 4 marcas P5-P8 sobre una malla con taladros, camioneta roja, cajas oscuras (vista cenital). |
| **`orthophoto.tif`** (927 MB), **`Imagen.tif`** (10 MB), 81 × `MAX_04xx.JPG` | S6 (solo índice) | Ortofoto GeoTIFF y fotos de dron ~15 MB c/u para fotogrametría. |
| **`DJI_0006…0013.JPG`** | s9 | 7 fotos de dron DJI FC330, 4000×3000 px, 31/01/2018, para fragmentación. |
| **PNG de pantallas** (`Base-Modelo de Carga.png`, `Base-Ibegel.png`, `Base-Ibenite 73.png`, `Base-Itabirito C.png`, `Sitio.png`) | DATOS INICIALES | Capturas reales de I-Blast (edición académica). `Sitio.png` = modelo 3D de un tajo con **bloques (vóxeles) coloreados** por un atributo (tipo modelo de bloques, escala azul-rojo) sobre malla de terreno en verde (ver F24). |
| **IREDES / VIST / TPL / DBS / LAZ / LAS / PLY / DXF / DWG** | Web | Formatos de exportación/importación citados en [W-SOL] y B7.5/B8. |

---

## 6. Librería de datos que necesita (campos)

**Explosivos** (a granel y encartuchados; [DI Base-Ibegel/Ibenite; B7.5 p.72]): proveedor, nombre, imagen, PDF de la ficha; densidad (kg/m³); VOD ideal (m/s); diámetro crítico (mm); VOD medido (a un diámetro); fuerza relativa vs. ANFO (calculada/derivada); precio por kg; **emisión GHG (kg CO2/kg)**; color; para encartuchado: diámetro de cartucho, longitud, peso, VOD del diámetro. Para nonel: VOD del tubo, desviación estándar de fondo y superficie. Fichas técnicas del curso (Famesa SAN-G/APU, Superfam Dos, Enaex Ibegel/Ibenite) incluyen además densidad de matriz y sensibilizada, presión de detonación (kbar), energía (kcal/kg), potencia relativa en peso y volumen (RWS/RBS vs. ANFO) y resistencia al agua; I-Blast solo pide un subconjunto.

**Geología** [DI Base-Itabirito C.png]: nombre, foto, densidad, velocidad onda P, resistencia a compresión, resistencia a tracción, módulo de Young, Poisson, **K(Vib), α(Vib)**, calibración `Rc = índice_MWD × a + b`, marca "por defecto".

**Modelos de carga:** nombre, diámetro, profundidad; lista de capas (explosivo, base, altura, cantidad, adaptable, mín/máx); tipo de carga; booster (peso), detonadores (arriba/abajo), cordón detonante (g/m), timing por deck.

**Detonadores y accesorios:** tipo (EDD, nonel, eléctrico), retardo nominal, longitud de cable, nº de detonador, VOD del tubo, desviación estándar.

**Zonas y puntos de control:** nombre, X,Y,Z, límite de PPV (mm/s), límite de dB, K y α asignados (escenario).

**Equipos y sismógrafos:** marca/formato (IDETEC, Instantel, NOMIS, Vibracord, White, ZTEX, Syscom); canales, frecuencia de muestreo.

**Mediciones de campo:** perfiles láser (Carlson, Coda, TruePulse, MDL, LYNX, TEPEX), sondas de desviación, MWD, fotos con escala.

**Costos:** precio de explosivos, accesorios, perforación, mano de obra, ingeniería; factores GHG.

**Configuración de usuario/empresa:** idioma, unidades (métrico/imperial, "UNIDADES ISO" en la barra de estado), logo, colores de informe, carpeta de trabajo, sistema de coordenadas (UTM o planos de Estado).

---

## 7. Preguntas abiertas para verificar con una demo o licencia real

1. **Tiers vigentes y precios:** ¿cuál es exactamente la diferencia funcional entre EVO, EVO+ y ULT hoy, y cómo se mapean a DE/PRO/ADV de 7.5? ¿Existe "Standard" y "Simulation" como en las URL antiguas (`I-Blast_SIM.html`)? ¿Cuál es el precio y el modelo de licencia (perpetua/anual, dongle o online)?
2. **Formato `.dna`:** ¿es contenedor propio comprimido? ¿Existe documentación o un exportador a XML/JSON? Es clave para interoperar.
3. **Modelos de cálculo:** fórmulas exactas de fragmentación ("basado en onda P"), cast/muckpile, distribución de energía y airblast. ¿Son verificables con casos propios? ¿Se aceptan modelos alternativos (Kuz-Ram, KCO, SveDeFo)? [INFERIDO: no aparecen en los folletos.]
4. **Significado de las variables MWD** (`AS`, `TP`, `TQ`, `EVP/EVR/IP/SP`) y del parámetro "TBT" en la calibración de resistencia: ¿cómo se convierte un índice a MPa?
5. **Formato `.NSZ`** y qué sismógrafos lo generan; ¿qué modelos de sismógrafo se soportan de forma nativa vs. CSV?
6. **Inconsistencia de densidad** en la captura de carga (380,16 kg en 6,5 m de Ø229 mm = ~1420 kg/m³ vs. 1220 de la plantilla): ¿el modelo aplica compresión, densidad variable o corrige el peso?
7. **Georreferenciación:** ¿qué sistemas de coordenadas soporta y cómo evita la confusión Norte/Este (ver `Puntos.txt`)? ¿Se importa GeoTIFF/ortofoto directamente y cómo maneja archivos de casi 1 GB y nubes de decenas de millones de puntos?
8. **Voladura subterránea:** profundidad real de los módulos de túnel/ring (diseño de cuele, explosivo, contorno, control de sobrerotura).
9. **Multiusuario y datos:** ¿cómo funciona la "base de datos maestra" y el Dashboard web? ¿Existe API, exportación de KPI y sincronización a la nube?
10. **Rendimiento:** tiempo real de la simulación 4D y de la optimización de secuencia en una voladura de 500+ taladros; ¿usa GPU (v8 dice usar la tarjeta gráfica)?
11. **Reportes:** ¿son plantillas editables por el usuario en la práctica? ¿Formatos de exportación abiertos (XML, Word)?
12. **Validación:** ¿se puede replicar el 22 % de error de PPV y la precisión de 84-90 % de fragmentación con datos propios? (La afirmación "0% frag_accuracy / 0% vib_reduction" en la home parece un marcador de posición sin datos [W-HOME].)
13. **Interfaz:** ¿hay una API (COM, línea de comandos) para automatizar? ¿Qué partes son WebGL/GPU? Es relevante para el diseño de una alternativa web.
14. **Competitividad del ecosistema:** la lista de integraciones (Carlson, TruePulse, MDL, Nomis, IDETEC, Boretrak, IREDES, EDD de varios fabricantes) es el mayor "foso" de I-Blast; conviene priorizar qué formatos soportar primero en el producto web.

---

## 8. Hallazgos adicionales y notas de método

- **La captura del curso revela el diseño de UI:** 8 pestañas de cinta: Global, Vista, Diseño, Registros, Analizar, Simulaciones, Optimización, Bases (en inglés: Global, Display, Design, Records, Analysis, Simulations, Optimization, DataBase); grupos de la pestaña Vista: Zoom/Selección, Taladros, Zonas (con "PPV"), Puntos (nube), Info voladura, Resultados, 3D. Global: Zoom/Select, CAD (CLR, Dist), Annotation, Views, X-Y-Z, Info, Report (PDF), Preferences (unidades KG, idioma), Help (F1, F3 soporte). Panel derecho "Inspector" con pestañas Loading, Details, Bench, Seismic Trace (C01 lám. 13 y 15).
- El programa "desde cero" empieza con una vista 2D con escala y brújula N/E/S/O, y una barra de estado con "Escenario" y unidades.
- **Clientes y referencias declaradas:** logos en C01 lám. 5 (minas, canteras, fabricantes de explosivos, construcción); [W-REF] cita 54 operaciones en 19 países (Vale, Osisko, Nordgold, Soboce, Lafarge, Calidra, etc.); son afirmaciones del fabricante.
- **Limitación de esta investigación:** no se pudo leer el detalle de los tiers "EVO/EVO+" más allá de la página `solutions.html` (resumida), no se accedió a ScienceDirect (403) ni a los videos de YouTube, y la página del folleto 2020 en francés no cargó. La nube de puntos de 302 MB (4,17 M de puntos) no se extrajo; solo se leyó en streaming.