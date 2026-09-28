# Benchmark: JKSimBlast (JKTech / Universidad de Queensland, distribuido por Soft-Blast)

Fecha de la investigación: 2026-09-24. Método: solo lectura de documentación pública y material de curso.
Público del documento: un desarrollador que NO es minero. Cada función se explica primero en lenguaje simple.

Convención de referencias (todas las URL son exactas y fueron consultadas en esta sesión salvo que se indique):

| Clave | Fuente | Tipo / confianza |
|---|---|---|
| [MAN] | Manual público "JKSimBlast User Manual" (copyright JKTech 1998, Soft-Blast 2006; PDF generado en 2008): https://www.soft-blast.com/Support/Downloads/JKSimBlast_A5.pdf . Descargado y leído completo (264 páginas PDF). Cito el número de página IMPRESO del manual ("p. N"). | Oficial, pero de versión antigua (v2 temprana, Windows 98/XP). Alta |
| [WEB] | https://www.soft-blast.com/Software/JKSimBlast.html (página "last updated December 2019", leída también en HTML crudo) | Oficial. Alta |
| [B-DD] [B-EF] [B-MIC] [B-V3] | Folletos oficiales: https://www.soft-blast.com/Support/Downloads/Brochures/Design-Detonation_A4.pdf , .../Energy-Fragmentation_A4.pdf , .../MIC-Vib_Damage_A4.pdf , .../JKSimBlast-V3_A4_170509.pdf (los enlaza [WEB]) | Oficial. Alta |
| [TUT] | Tutorial 2DBench (Soft-Blast 2011): https://www.soft-blast.com/Support/Downloads/2DBench-Tutorial.pdf | Oficial. Alta |
| [BR] [CT] [ED] | How-To oficiales: https://www.soft-blast.com/Support/Downloads/Burden%20Relief%20How-To.pdf , .../Contouring%20How-To.pdf , .../Electronic%20Delays%20How-To.pdf | Oficial. Alta |
| [HIST] | https://www.soft-blast.com/Support/Downloads/JKSimBlast%20History.pdf (historial de cambios, llega hasta enero 2019) | Oficial. Alta |
| [V3TXT] | https://www.soft-blast.com/Support/Downloads/Saving%20a%20blast%20to%20a%20v3%20compatible%20text%20file.pdf (feb 2017) | Oficial. Alta |
| [FO] | https://www.soft-blast.com/Support/Downloads/2DRing%20FragmentO%20instructions.pdf | Oficial. Alta |
| [CMD] | https://www.soft-blast.com/Support/Downloads/2DBench%20Command%20syntax.pdf (1999) | Oficial. Alta |
| [DL] [SM] [TR] [PRO] | https://www.soft-blast.com/Support/Downloads.html , .../Support/SupportAndMaintenance.html , .../Support/Training.html , .../About/Profile.html | Oficial. Alta |
| [SAMP] | Datos de muestra públicos https://www.soft-blast.com/Support/Downloads/samples_2DBench.zip . Lo descargué al scratchpad y SOLO extraje 7 archivos de texto para ver formatos (no ejecuté nada). | Oficial. Alta |
| [JKT] | https://jktech.com.au/products/software y folleto https://jktech.com.au/files/1812/JKTech%20Brochure%20-%20Software%20(June2022)%20FINAL.pdf | Oficial. Alta |
| [ONE] | Onederra, I. (2004) "Breakage and fragmentation modelling for underground production blasting applications", IRR Drilling & Blasting Conference, Perth: https://miningandblasting.wordpress.com/wp-content/uploads/2009/09/fragmentation-modelling-for-underground-onederra.pdf | Paper de JKMRC (autor del modelo). Alta |
| [MSR] | https://www.miningsoftwarereviews.com/software/jksimblast | Tercero (agregador). Media |
| [PDFC] | https://pdfcoffee.com/jksimblast-surface-pdf-free.html | FUENTE SECUNDARIA (copia re-alojada). Por su descripción es el mismo manual [MAN]; no aporta datos nuevos. Media |
| [DECK] | Diapositivas de un curso de simulación y análisis de voladuras con JKSimBlast 2DBench (47 diapositivas con capturas reales del software; PowerPoint 2016, enero 2022). No se entrega. Se cita "diap. N". | Material de curso, con capturas reales. Media-Alta |
| [CSV] | Archivo CSV de una malla de práctica, sin encabezado (formato de importación de hoyos). | Dato de práctica |
| [YT] | Videos públicos (solo títulos; no pude extraer su contenido): https://www.youtube.com/watch?v=QP6AMP3Yc94 (Tutorial básico JK Simblast - módulo 2D bench, ene-2018), https://www.youtube.com/watch?v=XUv297DAcNg (Parte 7: análisis de energía en planta y perfil, abr-2018), https://www.youtube.com/watch?v=dqfnnTEIEaA (JKSimBlast para tu Proyecto Integrador - 2D Bench Nivel 1, jun-2024), lista https://www.youtube.com/playlist?list=PL9tANb8RkcaEWJ8ShcBBep44Ku_ChDFj1 | Terceros. No verificados |

---------------------------------------------------------------------

## 1. Resumen (10 líneas)

1. JKSimBlast es una suite de escritorio para Windows que sirve para diseñar una voladura en la pantalla (dónde van los taladros, cuánto explosivo lleva cada uno, con qué retardos se conectan) y luego simular y analizar qué pasará (orden de detonación, energía repartida en la roca, vibración, daño, fragmentación) [WEB][MAN p.1].
2. Se compone de módulos independientes: 2DBench (bancos de superficie), 2DRing (subterráneo, abanicos/anillos de taladros largos), 2DFace (frentes de avance/túneles), JKBMS (base de datos jerárquica de voladuras), 2DView (vista extendida, contornos de energía), TimeHEx (tiempo vs carga, vibración) más utilitarios Design Importer, StockView y Units [MAN p.i, p.1].
3. Versiones de 2DBench: JKBench (básica), JKBench+ (diseño avanzado, análisis básico) y 2DBench (diseño y análisis avanzados) [WEB].
4. Paquetes: Superficie = 2DBench + JKBMS + 2DView + TimeHEx; Subterráneo = 2DRing + JKBMS + 2DView + TimeHEx; Túnel = 2DFace + JKBMS + 2DView + TimeHEx [WEB].
5. Historia: investigación de voladura del JKMRC (Universidad de Queensland) 1978-1994; JKTech propuso JKSimBlast en 1996 como "siguiente generación" del software de investigación; Soft-Blast Pty Ltd (Brisbane) se fundó en 2002 como empresa independiente para distribución, soporte y capacitación, y desde 2007 mantiene el software y desarrolla v3 [PRO]. El manual lleva copyright JKTech 1998 / Soft-Blast 2006 [MAN].
6. Versión vigente publicada: serie 2.18 (instalador `JKSimBlast_setup_v2.18.04A.exe`; 2DBench v2.18.04, 2DRing v2.18.03, etc.), con archivos históricos 2.01-2.16 [DL]. La fecha de la 2.18 no se publica; hay un archivo de drivers de llave con fecha 2026-02-26 [DL], lo que indica que el sitio sigue mantenido. La página comercial dice "v2"; la "v3" es un desarrollo anunciado desde 2017 (JKSimView3, visor 3D beta, marzo 2017) que aún no reemplaza a v2 [WEB][B-V3][PRO].
7. Distribuye Soft-Blast (Australia) con agentes regionales; JKTech (UQ) lo produce y también atiende consultas [JKT]. Usuarios: "más de 750 usuarios en 60 países" según Soft-Blast (https://www.soft-blast.com/) y "más de 900" según JKTech [JKT] (cifras distintas, sin fecha).
8. Licencia: requiere llave física USB (dongle; Hardlock, y desde ~2026 también Keylok) más un archivo de licencia (`license.nfo`/`.sbl`) por organización; hay llaves de red [MAN p.14][DL]. Precio NO público. Soporte y mantenimiento (S&M): primer año incluido; renovación anual del 15% del precio de lista por módulo o paquete; perder la llave normalmente obliga a comprar otra licencia salvo que haya S&M vigente [SM]. Capacitación típica de 3 o más días [TR].
9. Persistencia: todo se guarda en bases de datos Microsoft Access (`.2db`, `.2dr`, `.2df`, `.bms`), con coordenadas 3D completas (Este, Norte, Cota) aunque se dibuje en 2D; se puede copiar/pegar todo a Excel en texto tabulado [MAN p.57][WEB].
10. Alcance real de "simulación": simula la SECUENCIA de detonación (tiempos, con dispersión estadística de retardos, Monte Carlo) y calcula mapas de energía/daño/vibración con modelos simples y rápidos; NO es un simulador de física de la roca (no hay elementos finitos ni movimiento de la pila) [MAN][B-DD][B-EF]. JKTech vende aparte JKVBOC (movimiento de voladura) [JKT].

Nota importante sobre las fuentes: el manual público [MAN] es antiguo y NO describe Kuz-Ram, JKFines/Fines Correction ni las constantes de vibración de 2DBench; eso solo aparece en la página comercial y los folletos [WEB][B-EF]. En 2DBench moderno (v2.13+) hay funciones que el manual no cubre (Relief Rate, electronic delays, contouring, damage contours, guardar como texto v3) y que se documentan en los How-To y en [HIST].

---------------------------------------------------------------------

## 2. Fichas de función

### F01. JKBMS: gestión de datos de voladuras (Blast Management System)
- **Nombre y módulo**: JKBMS, base de datos/árbol de organización. Módulo JKBMS.
- **Qué problema resuelve (simple)**: en una mina se hacen cientos de voladuras y la información (diseño, fotos, fragmentación medida, vibraciones, costos) queda dispersa. JKBMS es como un "explorador de archivos" con forma de árbol (sitio > tajo > banco > voladura) donde cada voladura queda enlazada a sus resultados.
- **Decisión que apoya al ingeniero**: comparar una voladura nueva con las anteriores del mismo dominio de roca, y recuperar rápido qué funcionó antes de diseñar la siguiente. NO reemplaza un sistema de reporte de producción [MAN p.17].
- **Entradas**: objetos que el usuario agrega al árbol (sitio, tajo, banco, unidad geotécnica con tipos de roca y familias de juntas, colección de voladuras, fragmentación como % pasante vs tamaño, vibración, gráfico de tiempo, fotos, videos, archivos genéricos); voladuras creadas en 2DBench/2DRing/2DFace, que se ENLAZAN (no se copian) al árbol [MAN p.19-20, p.46-54].
- **Flujo de usuario**: (1) crear base de datos nueva (desde plantilla `Template.mdb`); (2) crear objeto raíz (típicamente "sitio"); (3) agregar hijos seleccionando el padre y pulsando el ícono del objeto; (4) crear una colección de voladuras y agregar voladuras de tres formas: desde el módulo de diseño con JKBMS abierto, importando de una base `.2db`, o creando un nodo y abriendo el diseñador; (5) doble clic en la voladura para editarla en el módulo de diseño; (6) adjuntar resultados (fragmentación, vibración, fotos, distribuciones de energía y contornos PPV); (7) buscar y generar reportes [MAN p.41-54].
- **Salidas**: vista de plano con varias voladuras juntas; visor 3D con voladuras, superficies (a partir de puntos de topografía), distribuciones de energía y de PPV, y reproducción de la detonación; reportes Excel; "Blast Summary Report" (solo voladuras de banco) y "Export Report" (un `.txt` tabulado por voladura más un `.bmp`) [MAN p.26-27, p.34-37][WEB].
- **Modelo/cálculo detrás**: ninguno; es gestión de datos. "JKBMS cannot perform any analyses" [MAN p.53]. Permite búsquedas (rápida, constructor de consultas, búsqueda 3D por coordenadas, búsqueda de voladura por resultado) [MAN p.33-34].
- **Limitaciones o dolores observables**: no tiene deshacer (Undo) [MAN p.31]; una sola base abierta a la vez y bloqueo por archivo `.ldb` (otros usuarios solo lectura) [MAN p.20-21]; base Access se degrada con tamaño y el manual recomienda partir por fecha o lugar [MAN p.20]; abrir bases `.2db` directamente en JKBMS puede "colgar" el programa si se usan menús no permitidos [MAN p.21]; los objetos de fragmentación/vibración se ingresan a mano o se pegan (JKBMS no calcula) [MAN p.53]; [INFERIDO] sin trabajo multiusuario simultáneo real ni sincronización en la nube.
- **Evidencia y confianza**: [MAN p.17-54] Alta; [WEB] sección JKBMS Alta; [HIST] (v2.12.04 mejora gráfico de fragmentación y pegado de datos "JKFines") Alta.

### F02. 2DBench, modo Área (contornos y "strings")
- **Nombre y módulo**: Modo Área (primer botón de la barra), 2DBench.
- **Qué problema resuelve (simple)**: antes de poner taladros hay que dibujar "el terreno" de la voladura: cresta, pie (toe), polígono de la malla, límites de polígonos de mineral, textos. Estas líneas también sirven para calcular áreas y volúmenes y para guiar cómo se colocan los taladros.
- **Decisión que apoya al ingeniero**: definir el área a volar (y por tanto el volumen y tonelaje para el factor de carga) y los límites de control.
- **Entradas**: líneas, polígonos y etiquetas de punto dibujados con el mouse, o importados de texto (Design Importer). Cada línea tiene nivel (cota) propio [MAN p.68-69].
- **Flujo de usuario**: activar modo Área; en parámetros fijar el nivel igual a la cota de banco; elegir herramienta polígono; clic por cada vértice y cruzar el primer lado para cerrar [MAN p.68-69].
- **Salidas**: "strings" visibles en el plano; polígono usado en Design Factors (volumen = área x altura de banco); se guardan en la base como componente "Area" [MAN p.59, p.71][TUT].
- **Modelo/cálculo detrás**: geometría plana (área de polígono). Ninguno físico.
- **Limitaciones o dolores observables**: entrada de contornos por dibujo manual o importación de texto; no se documenta importación DXF/CAD en v2 (DXF figura como "planificada" en v3 [B-V3]); [INFERIDO] poca integración con planos topográficos actuales (superficies, nubes de puntos).
- **Evidencia y confianza**: [MAN p.68-69, p.59]; [TUT]; [B-V3] Alta.

### F03. 2DBench, modo Taladros (creación de patrones de perforación)
- **Nombre y módulo**: Modo Hole/Drill, 2DBench (equivalente: 2DRing "drilling mode", 2DFace "drilling mode").
- **Qué problema resuelve (simple)**: colocar los huecos donde se perfora, con su diámetro, longitud, inclinación (dip), dirección (bearing), burden (distancia a la fila anterior o cara libre) y espaciamiento (distancia entre taladros de la misma fila). También permite "nodos" (taladros ficticios) para conectar amarres donde no hay taladro.
- **Decisión que apoya al ingeniero**: elegir malla (burden x espaciamiento), tipo de malla (cuadrada o tresbolillo), sobreperforación (subdrill) y cota de piso, según dureza y diámetro.
- **Entradas**: parámetros de hoyo (diámetro, cota de banco, cota de piso, sobreperforación, longitud, dip, bearing, costo de perforación por metro, densidad de roca) y de patrón (burden, espaciamiento, filas, taladros por fila, escalonado/cuadrado, orientación respecto al burden) [DECK diap. 21]; taladros importados de texto (por defecto quedan "marcados", los dibujados quedan "no marcados") [MAN p.67].
- **Flujo de usuario**: modo Drill > método "pattern": clic para el primer taladro (fila 1, hoyo 1), clic para la dirección de la fila frontal, clic al lado del burden; cerrar con [End] para centrar; consultar cualquier hoyo con el botón de información. Otros métodos: taladro único, relleno de polígono, seguir línea, "Baseline" (línea base con plantilla) [MAN p.65-67][WEB].
- **Salidas**: taladros y nodos en la base, con coordenadas 3D de collar y fondo (toe), consulta por hoyo (fila, número en fila, bancos, burden x espaciamiento, orden de detonación, masa cargada); plantillas guardables (hoyos, decks y retardos); ajuste de collares o fondos a una superficie o plano [WEB][DECK diap. 27].
- **Modelo/cálculo detrás**: geometría (longitud = altura de banco / cos(inclinación) + sobreperforación). Ninguno físico.
- **Limitaciones o dolores observables**: patrones básicos (filas rectas, poligono, línea); el "marcado" de taladros (M/U, cuadro/máscara de hasta 50 lados) es el mecanismo central de edición por lotes y es fácil equivocarse [TUT]; sin deshacer general salvo "un paso atrás" (Alt+Retroceso) [MAN p.62]; [INFERIDO] la edición es por diálogos y teclas de acceso, no directa por arrastrar en pantalla (2DFace sí permite arrastrar hoyos marcados [MAN p.156]).
- **Evidencia y confianza**: [MAN p.65-67, p.60-62]; [WEB] 2DBench; [DECK diap. 21, 27] Alta.

### F04. 2DBench, modo Carga (decks de explosivo, taco y otros materiales)
- **Nombre y módulo**: Modo Deck/Load, 2DBench.
- **Qué problema resuelve (simple)**: definir qué hay dentro de cada taladro: columna de explosivo (ANFO, emulsión, etc.), taco (relleno inerte arriba), cámaras de aire, cargas separadas. La carga determina la energía disponible para romper la roca.
- **Decisión que apoya al ingeniero**: cuánto explosivo y dónde ponerlo (carga de fondo vs columna, cámara de aire, longitud de taco), y el costo por taladro.
- **Entradas**: material (de la base de stocks: densidad, energía MJ/kg, RWS/RBS [energía relativa por peso y volumen], VOD (velocidad de detonación; un material inerte tiene VOD = 0), diámetro mínimo, costo/kg), método de cantidad (longitud de carga, longitud desde el collar, masa en kg, % del largo del hoyo, número de cartuchos, hasta un punto) [MAN p.69-70, p.124][B-DD][DECK diap. 22, 28].
- **Flujo de usuario**: abrir parámetros, elegir material, método y cantidad, "Accept"; elegir alcance (un hoyo, todos, marcados, no marcados) y hacer clic en el área de diseño; repetir para taco; consultar hoyo (ciclar por los decks con clic) [MAN p.69-70][TUT].
- **Salidas**: decks guardados por hoyo (longitud, masa, densidad, energía); total de explosivo; esquema visual del hoyo (barra coloreada); base de datos de materiales usados [MAN p.69][SAMP: tabla DECK y MATERIAL USED].
- **Modelo/cálculo detrás**: masa = densidad x volumen de columna de diámetro del hoyo (acoplado); energía por deck = masa x energía específica. Materiales completamente personalizables [WEB]. No modela desacoplamiento en detalle ni interacción con agua [INFERIDO].
- **Limitaciones o dolores observables**: catálogo de explosivos y accesorios vive en una base Access/TXT (`Stocks.stk`, `Stock.mdb`, o el nuevo `stocks_stt`) que el usuario debe mantener con StockView o Access [MAN p.123, 127][DL]; [INFERIDO] el catálogo por defecto es genérico y los nombres de productos comerciales locales deben cargarse a mano.
- **Evidencia y confianza**: [MAN p.69-70, 123-124, 187-188]; [B-DD]; [DECK diap. 22, 28] Alta.

### F05. 2DBench, modo Retardo de Fondo (detonador, conector y booster dentro del taladro)
- **Nombre y módulo**: Modo Downhole, 2DBench.
- **Qué problema resuelve (simple)**: cada taladro lleva un iniciador con tiempo de retardo (por ejemplo 500 ms) y un booster que arranca la columna de explosivo. Aquí se dice cuál y a qué profundidad.
- **Decisión que apoya al ingeniero**: tiempo de retardo dentro del hoyo (define cuándo explota cada taladro relativo a su amarre) y ubicación del primer (cebo) para que la iniciación arranque de fondo o de tope.
- **Entradas**: tabla de retardos (serie, nombre, retardo nominal, dispersión SD en %, límites mín/máx), conector (VOD de quemado, longitud provista), primer (densidad, energía, masa, presión) desde stocks; distancia desde collar o desde toe (o por longitud, deck, elevación, % del largo) [MAN p.72-73, p.125][TUT][B-DD][SAMP: DOWNHOLE DELAY/CONNECTION/PRIMER DATA].
- **Flujo de usuario**: parámetros con pestañas Delay / Connector / Primer / Interval / Relief; poner la distancia (regla: el retardo debe quedar DENTRO de la columna explosiva o la simulación no funciona bien); alcance (todos, marcados, uno) y clic [MAN p.72-73][TUT p.12].
- **Salidas**: triángulo de color en cada hoyo; tiempos nominales y reales en el plano si se activan en Display Options; entradas en la base [TUT].
- **Modelo/cálculo detrás**: retardo actual = nominal con variabilidad; la cadena downhole es determinística salvo la dispersión estadística declarada [B-DD].
- **Limitaciones o dolores observables**: exige respetar reglas de ubicación (detonador en el explosivo) que el software no autocorrige [TUT p.12]; [INFERIDO] los kits de retardos electrónicos requieren la herramienta especial de F07.
- **Evidencia y confianza**: [MAN p.72-73, p.125-126]; [TUT]; [B-DD] Alta.

### F06. 2DBench, modo Retardos Superficiales (amarre o "tie-in")
- **Nombre y módulo**: Modo Surface, 2DBench.
- **Qué problema resuelve (simple)**: es el "cableado" en la superficie que une los taladros entre sí con retardos entre taladros y entre filas. Determina el orden y el sentido en que se rompe el banco y hacia dónde sale el material.
- **Decisión que apoya al ingeniero**: tiempo entre taladros de una fila y entre filas (por ejemplo 17 ms y 42 ms), punto de iniciación, esquema de amarre (en V, en línea, diagonal), uni o bidireccional según sea tubo de choque o cordón detonante.
- **Entradas**: detonador de superficie y conector desde stocks; tipo de retardo (inter-taladro o inter-fila, solo para mostrarlos separados); bidireccional/unidireccional; taladros marcados; nodos como puntos de ignición [MAN p.74-77, p.126-127][TUT p.13-14].
- **Flujo de usuario**: marcar todos los hoyos; elegir "Multiple hole tie up" (amarre múltiple por línea) para conectar una fila con retardos inter-taladro; elegir "Hole to Hole" para conectar filas; Esc para desconectar; Retroceso para borrar un enlace equivocado; consultar cualquier retardo [TUT p.13-14].
- **Salidas**: conexiones como líneas en el plano con etiqueta de tiempo; total de conectores; alimenta la simulación (F08) [MAN p.75-77][DECK diap. 24, 30, 40].
- **Modelo/cálculo detrás**: red de grafos: nodos (taladros/puntos) y aristas (retardos con tiempo de quemado = longitud / VOD del conector + retardo del detonador) [B-DD].
- **Limitaciones o dolores observables**: el amarre es completamente manual (clic por línea); [INFERIDO] no hay "auto-amarre" a partir de un patrón deseado en el manual de v2, salvo las herramientas electrónicas de F07.
- **Evidencia y confianza**: [MAN p.74-77]; [TUT]; [DECK diap. 24, 30, 40] Alta.

### F07. 2DBench, retardos electrónicos e interval/relief contours
- **Nombre y módulo**: Herramientas "Electronic Delays" (single interval, multiple intervals, relief rate), 2DBench.
- **Qué problema resuelve (simple)**: con detonadores electrónicos el tiempo lo pones tú (no viene fijo en el detonador) y sin amarre físico de retardo. Estas herramientas calculan el tiempo de cada taladro para que la roca "se libere" en una dirección y velocidad deseadas.
- **Decisión que apoya al ingeniero**: dirección de salida, velocidad de progresión de la detonación (ms por metro, "relief rate"), y forma de la secuencia (contorno, V, diamante, chevron).
- **Entradas**: retardo electrónico, conector y primer; posición en el hoyo; intervalo entre hoyos y entre filas (pueden ser positivos o negativos, pero el tiempo final no puede ser menor a 0 ms); método de tiempo del hoyo de partida (aplicar tiempo, mínimo/máximo, más cercano al collar/toe, primero/último insertado); para contornos: punto de referencia, dirección, "relief rate" (tiempo por distancia), reglas de cálculo [ED].
- **Flujo de usuario**: elegir detonador; pestaña Interval (single o multiple) o Relief; clic en hoyo inicial y luego en el siguiente o final de línea; o herramienta de contorno: clic en punto de referencia y dirección R1, luego "Proceed". Opción de insertar varios detonadores por hoyo con un tiempo de offset [ED].
- **Salidas**: tiempos de cada taladro insertados como detonadores electrónicos con conexión de superficie de 0 ms; se ven activando en Display Options [ED].
- **Modelo/cálculo detrás**: Tiempo = tiempo de cálculo + relief rate x (distancia al punto o línea de referencia) [ED].
- **Limitaciones o dolores observables**: el documento es una nota corta "how-to" de mayo 2015, con dependencias entre opciones (cambiar el método reinicia la línea de contorno) [ED]; [INFERIDO] la lógica de una "cadena electrónica" (unidad de disparo y unidad de cadena, según el esquema del documento) se modela de forma simple.
- **Evidencia y confianza**: [ED]; [B-DD] ("electronic: relief contours (3), hole interval") Alta.

### F08. Simulación de detonación con dispersión (Monte Carlo) y contornos de tiempo
- **Nombre y módulo**: Modo Detonación (sexto botón), 2DBench/2DRing/2DFace.
- **Qué problema resuelve (simple)**: "ensayar" la voladura en pantalla antes de disparar: ver la onda de iniciación recorrer el amarre y cada taladro explotando en su tiempo. Detecta amarres cortados, retardos mal puestos, taladros que explotan antes de tiempo o que quedan sin iniciar.
- **Decisión que apoya al ingeniero**: corregir la secuencia antes del disparo; entender la dirección de desplazamiento del material con las líneas de igual tiempo (isotiempos); qué tan variable es la secuencia real por dispersión de retardos.
- **Entradas**: diseño completo (taladros, decks, retardos de fondo y superficie); punto de iniciación (clic en un hoyo o nodo); parámetros: modo "cada evento" o "cuadro de tiempo" (paso por ejemplo 10 ms), pausas, número de corridas Monte Carlo, factores de multiplicación de dispersión de retardos de superficie y de fondo (0 = tiempos nominales; 1 = dispersión declarada) [MAN p.78-79][TUT p.15][B-DD][DECK diap. 31].
- **Flujo de usuario**: modo Detonación; clic en el hoyo de inicio; ver conectores iniciarse (cambian a gris) y los taladros explotar (círculos de color = frente de detonación); teclas S (detener), cualquier tecla (avanzar paso), C (continuar), Esc (terminar); guardar el blast para conservar los tiempos; calcular contornos de primera detonación con el botón de contornos [MAN p.78-80][TUT p.15-16].
- **Salidas**: tiempos de detonación por deck, retardo de fondo y superficie (media, desviación, nominal y secuencia); contornos de tiempo ("Time Contour") con escala y flechas de desplazamiento; estadísticas si se ejecuta muchas veces; los tiempos alimentan MIC/vibración, burden relief y energía 4D [B-DD][DECK diap. 31-32][SAMP].
- **Modelo/cálculo detrás**: recorrido de grafo desde el punto de iniciación: tiempo de quemado del conector (longitud y VOD, por ejemplo 2000 m/s en tubo de choque) + retardo del detonador + para decks contiguos, VOD y longitud del deck; dispersión con distribución estadística por detonador (SD nominal en %) multiplicada por el factor del usuario [B-DD]. El resultado es determinístico si dispersión = 0.
- **Limitaciones o dolores observables**: simula la iniciación, NO el movimiento de la roca ni fallas por corte de cordón (cut-off) o desplazamiento de taladros [INFERIDO]; la animación es por teclado (S, C, Esc) [TUT]; el tamaño de muestra Monte Carlo es manual [MAN p.79].
- **Evidencia y confianza**: [MAN p.78-80, p.128-129, p.201-204]; [B-DD]; [TUT]; [DECK diap. 31-33] Alta.

### F09. Design Factors y Blast Summary (factor de carga, volumen, tonelaje, costos)
- **Nombre y módulo**: >Analysis >Design Factors (tecla F) y >Analysis >Blast Summary, 2DBench.
- **Qué problema resuelve (simple)**: responde "¿cuánto explosivo gasto por tonelada de roca?" (powder factor) y "¿cuánto cuesta todo?". Es el indicador más usado para comparar voladuras.
- **Decisión que apoya al ingeniero**: aceptar o ajustar la carga por tonelada y el costo por tonelada contra el objetivo de diseño.
- **Entradas**: taladros marcados, altura de banco (por defecto: cota de banco menos cota de piso), densidad de la roca (SG), polígono opcional [MAN p.71].
- **Flujo de usuario**: marcar todos los hoyos (Ctrl+M); F; editar altura de banco o SG con doble clic; abrir Blast Summary para totales, conteos y promedios de perforación, carga y retardos; copiar al portapapeles [MAN p.71, p.80].
- **Salidas**: volumen, tonelaje, factor de carga (kg/t, kg/m3), costos por componente (perforación, explosivos, retardos), totales por voladura; texto copiable a Excel [MAN p.57, p.71, p.80][WEB "Powder and Volume Factors"].
- **Modelo/cálculo detrás**: método 1 = área de polígono x altura de banco; método 2 = burden x espaciamiento x (altura vertical menos sobreperforación) por hoyo; tonelaje = volumen x SG; solo hoyos marcados [MAN p.71].
- **Limitaciones o dolores observables**: [INFERIDO] no modela roca de diferentes densidades dentro de una malla ni la variación de altura de banco en terreno irregular más allá de lo que fija la cota del hoyo.
- **Evidencia y confianza**: [MAN p.71, p.80]; [WEB] Alta.

### F10. Carga máxima instantánea (MIC) y vibración por distancia escalada
- **Nombre y módulo**: gráfico MIC y función de "scaled-distance" en 2DBench/2DRing/2DFace; versión extendida en TimeHEx.
- **Qué problema resuelve (simple)**: la vibración que sienten las estructuras vecinas depende de cuánto explosivo detona "casi al mismo tiempo". El MIC suma el explosivo que explota dentro de una ventana pequeña (típicamente 8 ms) y muestra la barra más alta. Con esa masa y la distancia al punto de interés se estima la vibración (PPV) y la sobrepresión de aire.
- **Decisión que apoya al ingeniero**: si el retardo entre filas y taladros mantiene la carga simultánea por debajo del límite permitido; cuánto cambiar la secuencia para bajar la vibración en una estructura o talud.
- **Entradas**: detonaciones simuladas (con Monte Carlo); ventana de tiempo (0 a 9 ms o cualquiera hasta 1000 ms); constantes de la ley de vibración y de airblast (distancia escalada); punto de interés (etiqueta o coordenadas) o distancia fija; velocidad de onda en la roca (TimeHEx) [MAN p.80, p.243-247][B-MIC].
- **Flujo de usuario**: tras simular, botón MIC: gráfico barras "kg por ventana" vs tiempo; clic en barra = se marcan en el plano los taladros vinculados (los ya explotados a la izquierda, los que explotan y los pendientes); flechas para "reproducir" la detonación; botón de vibración para ingresar constantes y mostrar PPV/airblast de la barra elegida; guardar datos a texto [MAN p.80, p.243-247].
- **Salidas**: gráfico MIC (masa o número de decks por ventana), acumulativo (masa total detonada hasta el tiempo t), gradiente y tasa promedio de consumo de explosivo (kg/ms), PPV y airblast en el punto elegido, archivo `.txt` tabulado para Excel con masa individual, masa acumulada y resultados de vibración [B-MIC][MAN p.245-246].
- **Modelo/cálculo detrás**: MIC = para cada deck que detona en t, suma masa de todos los decks entre t y t + ventana; máximo global = MIC del blast [MAN p.243]. Vibración = "distancia escalada" que relaciona masa de carga, distancia y factores de roca [B-MIC]. Los manuales no publican la fórmula exacta ni las constantes por defecto; la forma estándar (Devine) es PPV = K (D / raiz(Q))^(-alfa) [DECK diap. 13 y bibliografía en la sección 6]. TimeHEx cambia la línea de tiempo por el TIEMPO DE LLEGADA en un punto: llegada = detonación + distancia / velocidad de onda, con travel time (ms) = distancia (m) x 1000 / velocidad (m/s) [MAN p.245-246].
- **Limitaciones o dolores observables**: ley de vibración empírica de campo lejano, sin superposición de forma de onda (el JKBMS solo grafica formas de onda importadas o "seed" externas [B-MIC]); una sola ubicación de referencia por cálculo; [INFERIDO] el modelo trata cada deck como fuente puntual con masa concentrada, sin dirección ni geología estructural.
- **Evidencia y confianza**: [MAN p.80, p.243-249]; [B-MIC]; [TUT p.16]; [DECK diap. 13-15] Alta (excepto fórmula/constantes: Media).

### F11. TimeHEx (tiempo vs holes y explosivos)
- **Nombre y módulo**: TimeHEx (programa aparte, dentro de todos los paquetes).
- **Qué problema resuelve (simple)**: versión ampliada del MIC para estudiar cómo la secuencia reparte el explosivo en el tiempo, viéndolo desde un punto de interés (por ejemplo una casa), y a qué velocidad se "consume" el explosivo.
- **Decisión que apoya al ingeniero**: rediseñar tiempos si desde el punto de interés las ondas de varios taladros llegan superpuestas, aunque en el plano detonen a tiempos distintos.
- **Entradas**: una voladura de una base de datos JKSimBlast que ya tiene detonación simulada; ventana de tiempo; punto de interés; velocidad sísmica de la roca; parámetros de vibración/airblast [MAN p.243-247].
- **Flujo de usuario**: abrir voladura > elegir masa o número de decks > ventana de tiempo > "relative to a point" > velocidad de onda > vibración; clic en barras para ver los hoyos; vista de diseño en planta para consultar hoyos y ver la posición del hoyo en el gráfico [MAN p.243-249].
- **Salidas**: gráficos y texto tabulado; cumulativo y tasa de consumo kg/ms; esquema de decks y retardos por hoyo [MAN p.245-249].
- **Modelo/cálculo detrás**: cálculo de tiempo de llegada (ver F10) y ventana móvil de masa [MAN p.245-246].
- **Limitaciones o dolores observables**: es un programa separado que se recarga a mano ("Reload") después de cada edición en el diseñador [MAN p.244]; [INFERIDO] no muestra mapa de vibración en el terreno, sólo la serie temporal en un punto.
- **Evidencia y confianza**: [MAN p.243-249]; [WEB] TimeHEx; [HIST] (v2.13.01: corre con llaves de banco, anillo, frente y red) Alta.

### F12. Burden Relief (alivio del burden) y Relief Rate
- **Nombre y módulo**: pestaña "Burden Relief" del diálogo de simulación y gráfico Burden Relief, 2DBench (2DFace también). "Relief Rate" agregado en v2.13.14 a 2.13.24 [HIST].
- **Qué problema resuelve (simple)**: un taladro rompe bien si la roca delante de él ya se movió (tiene cara libre). Si el vecino que debía "abrirle el camino" no tiene suficiente explosivo o no explotó antes, el burden queda apretado y la roca se fragmenta mal o se genera sobrefractura hacia atrás.
- **Decisión que apoya al ingeniero**: revisar si cada taladro tiene alivio suficiente a tiempo (por ejemplo, ajustar el retardo entre filas, o aumentar la carga de una fila alivio).
- **Entradas**: taladros marcados como "completamente aliviados" (cara libre); número de cargas requeridas dentro de una distancia (burden), intervalo de tiempo mínimo entre la carga aliviadora y la analizada, mínimo de masa (total o por taladro), opción de considerar o no cargas del mismo hoyo, Monte Carlo y factores de dispersión [BR][MAN p.79 tab Burden Relief].
- **Flujo de usuario**: marcar hoyos aliviados; activar Monte Carlo; abrir la pestaña Burden Relief; llenar cargas, distancia y ventana de tiempo; correr la simulación; ver los hoyos coloreados por valor de éxito; consultar detalle por carga; abrir el gráfico linkeado a hoyos (azul: ya explotaron; verde: explotan después; turquesa: los que contribuyen) [BR].
- **Salidas**: color de éxito por hoyo (probabilidad de cumplir el criterio en las corridas Monte Carlo); gráfico masa vs tiempo enlazado al plano; archivos de análisis `.s3th` (burden relief) y `.s3tf` (relief rate/facetas) para JKSimView3 [BR][V3TXT].
- **Modelo/cálculo detrás**: regla lógica: una "carga" (columna contigua que detona con un solo retardo) pasa si dentro de la distancia de burden hay al menos N cargas que explotaron antes en al menos dT y con masa suficiente. Se repite en muchas simulaciones y se cuenta el éxito [BR]. El procedimiento no es un modelo de mecánica de rocas.
- **Limitaciones o dolores observables**: criterio binario simple, sin geometría de cara libre real; "Relief Rate" solo funciona bien en voladuras verticales/planas ("no calculan correctamente para una voladura orientada verticalmente") [V3TXT]; el documento reconoce "algunas funciones aún por hacer" en 2015 [HIST 2.13.15].
- **Evidencia y confianza**: [BR]; [HIST]; [V3TXT]; [MAN p.79] Alta.

### F13. Distribución de energía del explosivo (3D estática y 4D dinámica)
- **Nombre y módulo**: Explosive Energy Distribution (EED), en 2DBench, 2DRing, 2DFace (menú Tools/Analysis) y en 2DView (región de cálculo).
- **Qué problema resuelve (simple)**: el factor de carga (kg/t) es un promedio de toda la voladura y no dice dónde hay poca o mucha energía. La EED calcula un mapa de colores de cuánto explosivo "llega" a cada punto de la roca, como el campo eléctrico alrededor de un alambre cargado. Sirve para ver zonas mal cargadas: pata sin energía (piso duro, raíces), sobrecarga cerca del talud final (daño), etc.
- **Decisión que apoya al ingeniero**: ajustar burden/espaciamiento, largo de taco, cámaras de aire, densidad o cantidad de explosivo por zona; ver si la energía llega a la zona de interés (piso, pared final, cara del túnel) con la magnitud necesaria.
- **Entradas**: plano de cálculo (horizontal a cualquier cota, vertical en cualquier dirección; en 2DRing/2DFace, plano paralelo o normal al plano de diseño), resolución de grilla (regla del manual: entre 1/4 y 1/10 del espaciamiento en bancos; 0.1 m en anillos subterráneos, 0.02 m en frentes), densidad de la roca, hoyos incluidos (marcados/no marcados), tipo 3D o 4D, tiempo de cooperación (solo 4D), unidades (kg/t, kg/m3, MJ/t, MJ/m3, MJ/m2) [MAN p.130-136, p.196-200, p.220-233][B-EF].
- **Flujo de usuario**: (1) definir región de cálculo (polígono o dibujo; en 2DBench cuadro/máscara de selección); (2) abrir el diálogo de energía; (3) crear archivo de resultados o elegir uno; (4) poner resolución, SG y ubicación del plano; (5) elegir hoyos; (6) elegir 3D o 4D y "Calculate"; (7) ajustar escala, rangos, colores y "Redisplay"; (8) opcionalmente guardar el resultado en base de datos (`.eed`) o copiar los rangos y áreas a Excel [MAN p.133-134, p.226-232].
- **Salidas**: mapa de contornos de color con leyenda y % de área por rango ("Relative Area"); resultados guardados para verlos en JKBMS 3D; archivos v3 `.s3tp` (puntos) para JKSimView3 [MAN p.230-231][V3TXT].
- **Modelo/cálculo detrás**: cada columna de explosivo se trata como fuente continua de energía con sólo atenuación geométrica (esférica). Para una carga cilíndrica de diámetro D, ecuación (6) del manual integra a lo largo de la columna la masa por unidad de longitud dividida por la masa de roca en una esfera de radio r; resulta en la fórmula cerrada (7): P = 187.5 (Pe/Pr) D^2 (1/h^2) (L2/r2 - L1/r1), donde Pe = densidad del explosivo, Pr = densidad de la roca, h = distancia perpendicular del punto al eje de la carga, L1 y L2 = extremos del segmento de carga medidos a lo largo del eje desde el pie de la perpendicular, r1 y r2 = distancias del punto a esos extremos; el total en un punto es la SUMA sobre todas las cargas [MAN p.130-131, p.196-197]. (Mi derivación de unidades, a verificar: con D en metros y densidades como SG, P sale en kg por tonelada.) El manual atribuye el enfoque a "Kleine et al (1993)" sin dar la referencia completa. La versión 4D multiplica la contribución de cada deck por un factor de peso que decae con la diferencia entre el tiempo de detonación del deck (td) y el del deck más cercano al punto (tnd), con una escala llamada "tiempo de cooperación" tc (~ tiempo hasta el primer movimiento del burden; aprox. 25-30 ms en el ejemplo subterráneo); peso ~ exp(-|td - tnd| / tc) [MAN p.131-133, p.232-233] (la fórmula está como imagen y la lectura del valor absoluto es mía; verificar).
- **Limitaciones o dolores observables**: sólo atenuación geométrica (sin geología, sin absorción por roca ni por juntas, sin presión de gases): el propio material lo llama "herramienta de diseño" [MAN p.226]; una sola región y un solo resultado en pantalla a la vez [MAN p.230]; cálculo lento con grillas finas (ejemplo del proyecto de muestra: archivos de resultados de 6.6 MB) [SAMP]; los datos de energía de cada explosivo (MJ/kg) dependen del catálogo.
- **Evidencia y confianza**: [MAN p.130-136, p.196-200, p.226-233]; [B-EF]; [DECK diap. 12, 34] Alta.

### F14. Contornos de daño (Holmberg-Persson, PPV)
- **Nombre y módulo**: "Damage Contours" / Holmberg-Persson PPV, en 2DBench, 2DRing, 2DFace (pestaña del diálogo de energía o menú Analysis); 2DRing lo usa en FragmentO.
- **Qué problema resuelve (simple)**: estima qué tan lejos de cada taladro la roca se daña por la vibración (agrietamiento nuevo, apertura de fracturas, trituración), para proteger la pared final, un talud, o la cara de un túnel.
- **Decisión que apoya al ingeniero**: dónde detener la fila amortiguadora, cuánta carga poner en la fila de contorno, o si se necesita precorte; si el daño alcanzará una estructura o una zona de mineral.
- **Entradas**: ubicación del punto respecto de la carga, concentración lineal de carga (kg/m, depende del explosivo y del hoyo), constantes de atenuación K y alfa del macizo (determinadas en campo), umbral de PPV crítico [B-MIC (sección daño)][DECK diap. 16-17, 35][FO].
- **Flujo de usuario**: igual que F13 (región de cálculo, escala, colores); la escala se define en mm/s con rangos coloreados; el mapa se puede guardar a archivo para JKBMS [B-MIC][DECK diap. 35].
- **Salidas**: mapa de contornos de PPV en plano o sección con leyenda de daño; archivo `.s3tp` para v3; copia de rangos y áreas a portapapeles [B-MIC][V3TXT].
- **Modelo/cálculo detrás**: modelo de Holmberg y Persson: PPV en un punto = K [ (gamma/R0) ( arctan((H + Xs - X0)/R0) + arctan((X0 - Xs)/R0) ) ]^alfa, integrando la contribución de cada elemento de columna (gamma = densidad lineal de carga, H = longitud de carga, Xs = longitud de taco, X0 = profundidad del punto, R0 = distancia radial) [DECK diap. 16]. Umbrales de daño según la diapositiva: 1/4 del PPV crítico = dilatación de fracturas existentes, 1x = nuevas grietas, 4x = daño visible, 8x = trituración [DECK diap. 35]. El folleto advierte que el modelo sólo es confiable en roca dura y masiva donde domina la deformación, y no incluye gases, tiempos ni VOD en roca débil o fracturada [B-MIC].
- **Limitaciones o dolores observables**: el propio vendor declara la limitación de roca débil; las constantes K y alfa deben calibrarse con mediciones locales; [INFERIDO] no hay superposición temporal de ondas entre taladros (suma vectorial simple).
- **Evidencia y confianza**: [B-MIC] (Alta); [DECK diap. 16-17, 35, 45] (Media-Alta); [MAN p.139] menciona las constantes K y alfa y el "PPV onset of breakage" en FragmentO (Alta).

### F15. Fragmentación: Kuz-Ram, corrección de finos JKMRC (Crush Zone + Kuz-Ram) y FragmentO
- **Nombre y módulo**: (a) 2DBench: "Kuz-Ram and JKFines Fragmentation" [WEB]; los folletos lo describen como "standard Kuz-Ram" y "JKMRC Fines Correction (Crush Zone + Kuz-Ram)" [B-EF]; (b) 2DRing: FragmentO (Tools > Fragmentation Model) [MAN p.137].
- **Qué problema resuelve (simple)**: predecir el tamaño de los trozos de roca después del disparo (curva de "porcentaje que pasa" vs tamaño). Esto decide el rendimiento de palas, camiones, chancadora y molino: muy grueso = más sobretamaño y reproceso; muy fino = pérdida en ley o de valor.
- **Decisión que apoya al ingeniero**: cambiar malla, carga, timing o densidad de explosivo para acercarse al tamaño objetivo P80 y a menos finos o menos sobretamaño; en subterráneo, elegir el burden crítico de un anillo.
- **Entradas**: [Kuz-Ram/corrección de finos, según la diapositiva del curso con la pantalla real de 2DBench] geometría (burden, espaciamiento, diámetro, altura de banco, sobreperforación, taco), explosivo (energía relativa), y de roca: Lilly Blastability Index (o factor de roca directo), densidad, módulo de Young, UCS, resistencia a tracción, tamaño medio de bloque in situ, "fines size", espaciamiento medio de juntas, sobretamaño, buzamiento y dirección de buzamiento de juntas, buzamiento y dirección de la cara libre [DECK diap. 37, 45]. [FragmentO] rango de burdens (inicial, incremento, final), umbral de relación espaciamiento/burden, suavizado, constantes de atenuación (K, alfa) y "PPV de inicio de rotura", SG, UCS, resistencia a tracción, velocidad P, módulo dinámico de Young, coeficiente de Poisson, tamaño medio del bloque in situ [MAN p.138-141][FO].
- **Flujo de usuario**: [FragmentO] activar la máscara de selección sobre el anillo cargado; Tools > Fragmentation Model; pestañas Control, Rock Properties, Rock Structure y Model; "Run Model"; marcar salidas (se marcan automáticamente las que superan la relación crítica S/B); "Plot Selected"; "Copy Selected/All" y pegar en Excel [MAN p.138-143]. [Kuz-Ram] el manual antiguo no lo describe; [DECK diap. 37, 45] muestra la lista de entradas.
- **Salidas**: curvas de distribución granulométrica; P10, P20, P50, P80, P90 y uniformidad por cada burden; tabla resumen entrada/salida pegable a Excel; en 2DBench, la curva se puede guardar y traer a JKBMS (JKBMS "import fragmentation results from 2DBench, 2DRing") [B-EF][MAN p.141-143][HIST 2016-12-15].
- **Modelo/cálculo detrás**: 
  - Kuz-Ram: combina la ecuación de Kuznetsov para el tamaño medio (x50), la distribución de Rosin-Rammler para toda la curva, el índice de volabilidad de Lilly modificado para la roca y el índice de uniformidad de Cunningham para geometría y distribución de explosivo [B-EF].
  - JKMRC Fines Correction: el modelo "Crush Zone" predice la extensión de la trituración alrededor de cada hoyo y la aplica a la parte fina de la curva Kuz-Ram [B-EF]. Según la literatura: Kuz-Ram subestima los finos; JKMRC agrega una segunda distribución para los finos y estima el radio de la zona triturada a partir de la presión pico en el hoyo y la resistencia de la roca (Kanchibotla et al. 1999; Thornton et al. 2001) (https://link.springer.com/article/10.1007/s00603-018-1470-9 , Media).
  - FragmentO (subterráneo, modelo de un solo anillo): combina dos funciones de Rosin-Rammler (finos y gruesos) con tres parámetros: punto de corte de finos (fc), tamaño medio (x50) y uniformidad gruesa (nc). fc sale de un modelo mecánico de zona triturada + zona fracturada; x50 de una relación empírica con el tamaño medio de bloque in situ y un "factor de fragmentación" derivado de la distribución 3D de energía; la uniformidad de un modelo 3D de atenuación de PPV. Sólo se implementó una versión simplificada de los finos en el software [ONE][FO]. Extensión estocástica descrita por Onederra (no incluida en 2DRing) [ONE].
- **Limitaciones o dolores observables**: el propio JKTech no publica precisión; literatura independiente reporta error mediano ~60% para Kuz-Ram y el modelo de zona triturada en un comparativo (Springer 2018, Media); FragmentO "suministra sobre todo resultados gruesos" y solo una versión simple de finos [FO]; FragmentO es "propietario" y no aplica a bancos; el manual v2 antiguo no documenta los parámetros de Kuz-Ram [MAN].
- **Evidencia y confianza**: [B-EF] Alta (existencia y descripción); [MAN p.137-143]; [FO]; [ONE] Alta; [DECK diap. 37, 45] Media-Alta; el error de predicción (Springer) Media.

### F16. 2DView y 2DContour (vista extendida y contornos de datos por taladro)
- **Nombre y módulo**: 2DView; sus análisis "Explosive Energy Distribution" (F13) y "2DContour".
- **Qué problema resuelve (simple)**: ver la voladura desde cualquier ángulo (planta, sección, oblicua) y convertir cualquier número asociado a cada taladro (longitud, costo, tiempo, masa cargada, retardo, etc.) en un mapa de colores (como un mapa de calor) para detectar patrones.
- **Decisión que apoya al ingeniero**: dónde se concentra el costo o la carga, si hay taladros más largos por relieve, si los tiempos están simétricos, qué zonas del banco requieren cambios.
- **Entradas**: voladuras abiertas de bases `.2db/.2dr/.2df` (una o varias juntas; se pueden mezclar componentes de distintas voladuras); región de cálculo (polígono o dibujada); valor a contornear; resolución (1/4 de la distancia entre taladros como referencia); "distancia de influencia" e "interpolation shadowing" [MAN p.209-224, p.234-236].
- **Flujo de usuario**: File > Open o Add Designs; View > Define (plano/sección/superficie definida por el usuario con centro, límites, ángulo y posición); crear región (desde polígono cercano o dibujada); elegir valor; "Calculate Contour Surface for All Regions"; escala (rangos, colores, líneas o relleno, % de área por rango) [MAN p.212-217, p.221-239].
- **Salidas**: mapas de líneas o rellenos; lista de valores estándar contorneables (~38: tiempo de detonación, masa de carga, energía total, costos de carga/conectores/retardos/primer/taco, RBS/RWS promedio, VOD promedio, cota de collar/toe, longitud, densidad de carga, fila, número, etc.) y valores personalizados [MAN p.236-237]; impresión a escala con logo, leyendas y comentarios [MAN p.218-219]. En 2DBench moderno existe además Analysis > Contouring con contornos "Hole" y "Line" [CT].
- **Modelo/cálculo detrás**: interpolación ponderada por el inverso de la distancia entre los datos de los hoyos y los puntos de grilla; el valor de un hoyo se aplica a todo el largo del hoyo (en planta se ve en el centro, en sección como una línea) [MAN p.220-221, p.234-235].
- **Limitaciones o dolores observables**: 2DView no puede editar ni guardar voladuras [MAN p.207-209]; las regiones de 2DContour no se guardan (hay que recrearlas) [MAN p.221]; los valores personalizados requieren editar tablas Access a mano (`Extra Hole Data Definition`) [MAN p.240-241]; el Contouring de 2DBench estaba en "versión borrador" con solo Hole y Line, un contorno de cada tipo [CT].
- **Evidencia y confianza**: [MAN p.207-241]; [CT]; [WEB] Alta.

### F17. 2DRing: diseño subterráneo por anillos (tajeos por taladros largos)
- **Nombre y módulo**: 2DRing.
- **Qué problema resuelve (simple)**: en minería subterránea de tajeos por taladros largos, los taladros no son verticales en un banco, sino abanicos de agujeros en planos (anillos) perforados desde galerías. Se diseña cada plano de anillo, se cargan los taladros y se secuencian.
- **Decisión que apoya al ingeniero**: burden y espaciamiento de puntas (toe spacing) del anillo, ángulo de los taladros, distancia al límite del tajeo (stand-off), carga por deck y retardos; el burden crítico entre anillos.
- **Entradas**: definición de planos de anillo (origen, rumbo de la normal, buzamiento; o desde una sección importada), contornos del tajeo y galerías (strings importados de un software de planificación minera), plantillas de galerías (perfiles), posiciones de perforación, parámetros del hoyo (diámetro, stand-off, costo, longitud y ángulo máximos) [MAN p.111-127][WEB].
- **Flujo de usuario**: crear/seleccionar plano de anillo > dibujar o importar límites > crear galería a partir de polígono o plantilla > posiciones de perforación > perforar (hoyo único, hasta el límite del tajeo con stand-off, abanico de 360° por espaciamiento de puntas o ángulos iguales) > cargar (por largo, masa, collar sin carga, espaciado de collar, o carga automática por energía) > retardos > simulación > energía y fragmentación [MAN p.111-136][WEB].
- **Salidas**: reportes de perforación, carga, retardos de fondo y superficie (texto en columnas); exportación a 3X3Win (`.prj`); impresión a escala; FragmentO; energía 3D/4D [MAN p.106-108, p.128-143].
- **Modelo/cálculo detrás**: ver F13 (energía), F14 (PPV) y F15 (FragmentO).
- **Limitaciones o dolores observables**: la vista principal es una sección 2D del mundo 3D; superposición de anillos adyacentes es una opción, no un modelo 3D completo de la roca; [INFERIDO] sin manejo automático de desviación de perforación (la extensión estocástica de FragmentO sobre desviación no está en el programa).
- **Evidencia y confianza**: [MAN p.83-143]; [WEB] 2DRing; [FO]; [ONE] Alta.

### F18. 2DFace: frentes de avance, túneles y digitalizador de imagen
- **Nombre y módulo**: 2DFace.
- **Qué problema resuelve (simple)**: diseñar el "disparo de avance" de una galería: la plantilla de taladros en la cara (arranque con taladros vacíos de alivio y cargados, luego contorno, piso, auxiliares). También permite dibujar el "como quedó perforado" a partir de una foto.
- **Decisión que apoya al ingeniero**: forma del arranque (burn cut), espaciamiento de contorno, carga de cada tipo de taladro y secuencia; y comparar diseño vs realidad para diagnosticar sobre excavación.
- **Entradas**: perfil del túnel (plantillas: arco Bézier o hombros redondeados, círculo, o polígono importado), secciones del perfil (techo, piso), tipos de taladros (alivio de arranque, cargados de arranque, techo, costado, piso o lifter, auxiliares), plantillas de arranque en archivos ASCII (carpeta `2DFace\Cuts`), imagen (jpeg, gif, bmp, wmf, emf) para digitalizar [MAN p.171-186, p.192-195].
- **Flujo de usuario**: dibujar/crear el perfil > perforar (hoyo, arranque desde plantilla con ancho y alto, múltiples hoyos a lo largo del techo/paredes/piso por espaciamiento o número, círculo) > cargar > retardos > simulación con contornos de tiempo > energía 3D/4D en un plano a una distancia del frente [MAN p.171-204].
- **Salidas**: reporte de resumen de diseño (texto o portapapeles), energía, contornos de tiempo, impresión con logo, escalas y comentarios; exportación a 3X3Win [MAN p.158-170, p.196-204].
- **Modelo/cálculo detrás**: energía 3D/4D (F13), simulación de detonación (F08). Ejemplo del manual: ronda de 45 taladros de 3.2 m, 51 mm cargados y 102 mm de alivio, resolución 0.02 m, SG 2.8 [MAN p.200].
- **Limitaciones o dolores observables**: digitalizador manual (clic por hoyo con 6 escalas de origen y perfil) [MAN p.192-195]; [INFERIDO] sin mapeo real de desviación de perforación por escaneo (la lista de v3 "laser scan import" figura como planificada) [B-V3].
- **Evidencia y confianza**: [MAN p.145-205]; [WEB] 2DFace; [B-V3] Alta.

### F19. Importación y exportación de datos (Design Importer, copiar/pegar, informes)
- **Nombre y módulo**: Design Importer (importador ASCII), Copy/Paste y >File >Export, todos los módulos.
- **Qué problema resuelve (simple)**: traer taladros y contornos que vienen de otros programas o del GPS de perforación y devolver los datos a Excel u otros sistemas.
- **Decisión que apoya al ingeniero**: no rehacer a mano un diseño hecho en CAD o software de planificación; poder auditar los datos en Excel; formar reportes de entrega.
- **Entradas**: archivos de texto columna por columna con un punto o hoyo por línea y al menos coordenadas Este y Norte (delimitados o de ancho fijo) [TUT p.7].
- **Flujo de usuario**: (1) elegir archivo y vista previa, indicar líneas de comentario y separador; (2) asignar nombre de columna (usar Display Label para el número del hoyo) y elegir cómo se definen las cadenas o strings; (3) definir cierre de strings; (4) filtrar filas con criterios de exclusión; (5) valores por defecto para datos faltantes y conversiones (por ejemplo pies a metros); (6) guardar la configuración nombrada en `Import.ini` [MAN p.101-106, p.162-166][TUT p.7].
- **Salidas**: ver sección 4.
- **Modelo/cálculo detrás**: ninguno; es un asistente de importación de columnas.
- **Limitaciones o dolores observables**: no hay importación directa de DXF o formato de topografía en v2 (DXF planeado en v3 [B-V3]); [INFERIDO] la importación se basa en "configuraciones" por extensión de archivo y no detecta automáticamente el formato.
- **Evidencia y confianza**: [MAN p.101-108]; [TUT]; [SAMP] Alta.

### F20. StockView y Units (catálogos y unidades)
- **Nombre y módulo**: StockView y Units (utilitarios que no requieren llave ni licencia) [MAN p.4].
- **Qué problema resuelve (simple)**: mantener el catálogo de explosivos, detonadores, conectores y boosters (con sus propiedades y costos) y elegir el sistema de unidades (métrico, imperial o personalizado).
- **Decisión que apoya al ingeniero**: usar productos reales de la mina (con su costo y su dispersión de tiempos) en lugar de valores genéricos, de modo que las simulaciones y costos sean confiables.
- **Entradas**: registros con densidad, energía (MJ/kg), RWS, RBS, VOD, diámetro mínimo, costo; retardos con serie, tiempo, SD, límites; conectores con VOD de quemado y longitud; primers con masa, presión [SAMP tablas de material].
- **Flujo de usuario**: abrir StockView (o Access) y editar; 2DBench carga la base indicada en `/STOCK=` o en el `.ini` [CMD][MAN p.123].
- **Salidas**: `Stock.mdb` / `Stocks.stk`, y un nuevo archivo de texto `stocks_stt` descrito como "new generic stocks text file" [DL]; `Units.mdb` [CMD].
- **Modelo/cálculo detrás**: ninguno.
- **Limitaciones o dolores observables**: bases Access (32 bits) y edición fuera del programa; [INFERIDO] no hay catálogo sincronizado con proveedores de explosivos.
- **Evidencia y confianza**: [MAN p.i, p.123, p.127]; [CMD]; [DL] Alta.

### F21. Reportes e impresión
- **Nombre y módulo**: >File >Print Blast Window, >File >Export >To Report, "Export Report" de JKBMS; 2DBench.
- **Qué problema resuelve (simple)**: entregar al perforista y al cargador el plano de la malla a escala (con numeración de taladros, retardos y cargas) y entregar reportes de números para archivo o contrato.
- **Decisión que apoya al ingeniero**: emitir el plano y la orden de carga; controlar cantidades y costos para el cierre de la voladura.
- **Entradas**: qué elementos mostrar (opciones visuales), papel, márgenes, logo (`PrintLogo.bmp`), caja de comentarios, ubicación de leyendas de contornos, energía y PPV [MAN p.108-110, p.168-170][TUT p.8].
- **Flujo de usuario**: configurar Display Options, abrir el diálogo de impresión, vista previa (Esc para volver), guardar la configuración de impresora con nombre (`2DBPrnConfigs.ini`) [MAN p.108-110]. Para reporte: elegir elementos, carpeta y nombre; se generan `nombre.txt` y `nombre.bmp`; se puede abrir con una plantilla de libro Excel incluida (menú JKSimBlast > Get Report) [TUT p.8].
- **Salidas**: plano impreso a escala; texto tabulado; imagen bitmap; libro Excel formateado; en JKBMS también "Blast Summary Report" solo de bancos [MAN p.34-37][TUT p.8].
- **Modelo/cálculo detrás**: ninguno.
- **Limitaciones o dolores observables**: sin generación de PDF nativo en v2 (el 3D PDF llega con JKSimView3, requiere Adobe Reader 11 [B-V3]); [INFERIDO] la imagen exportada es un mapa de bits fijo (no vectorial).
- **Evidencia y confianza**: [MAN p.34-37, p.108-110]; [TUT] Alta.

### F22. JKSimView3 (visor 3D beta de "JKSimBlast v3")
- **Nombre y módulo**: JKSimView3 (SV3), beta desde marzo 2017.
- **Qué problema resuelve (simple)**: ver en 3D (con giro libre) las voladuras y los resultados de análisis de los módulos v2, reproducir la detonación y entregar un PDF 3D con tablas.
- **Decisión que apoya al ingeniero**: revisar la geometría y la secuencia en 3D con mineros y perforistas; compartir el diseño con quienes no tienen licencia.
- **Entradas**: archivos de texto tabulado: voladura `.s3tb`; análisis `.s3tc` (contornos como detonación), `.s3tf` (facetas, como relief rate), `.s3th` (por hoyo, como burden relief), `.s3tk` (modelo de bloques, reservado), `.s3tl` (líneas, reservado), `.s3tp` (puntos, como energía y daño) [V3TXT]. Se pueden abrir y editar en Excel o editor de texto.
- **Flujo de usuario**: en 2DBench v2.13.27 o superior, File > Save as V3 Text; luego abrir en SV3 [V3TXT].
- **Salidas**: 3D PDF con tablas de perforación, carga y tiempos; copia de datos e imágenes; notas adhesivas; reproducción con controles [B-V3].
- **Modelo/cálculo detrás**: ninguno (visualización).
- **Limitaciones o dolores observables**: "en desarrollo"; las herramientas de diseño y análisis aún no se migran de v2 a v3 ([B-V3], 2017); sin evidencia en la web pública de que v3 completo se haya lanzado; la S&M de Soft-Blast menciona que "JKSimBlast v3 is available for v2 users with current S&M" [SM], sin aclarar qué incluye.
- **Evidencia y confianza**: [B-V3]; [V3TXT]; [WEB] Alta.

### F23. Blastatistics (control de calidad en línea) - NO es un módulo de JKSimBlast
- **Nombre y módulo**: Blastatistics (Blastics), sistema web/móvil de QA/QC de voladura.
- **Qué problema resuelve (simple)**: controlar en campo si lo diseñado se ejecuta como se diseñó (perforación, carga, tiempos) y generar reportes el mismo día.
- **Decisión que apoya al ingeniero**: corregir rápidamente desviaciones de perforación y carga antes del siguiente disparo.
- **Entradas**: datos de campo capturados en web o app; integración con diseño (JKSimBlast 2DBench) y análisis de fragmentación (Split-Desktop), según la página de Soft-Blast [BL: https://www.soft-blast.com/Software/Blastatistics.html].
- **Flujo de usuario**: no documentado en fuentes públicas.
- **Salidas**: reportes automáticos, base de datos central multi-sitio [BL].
- **Modelo/cálculo detrás**: estadística de indicadores de calidad (no documentado).
- **Limitaciones o dolores observables**: por la fuente oficial, Blastatistics lo desarrolla Rocha Blast Engineers (https://www.blastatistics.net/en/: productos Blastics Surface y BlasticsGEO Surface; "unos 2000 blasts completados y 100 usuarios"), y Soft-Blast solo lo presenta y refiere a esa empresa. El agregador [MSR] lo cita como módulo clave de JKSimBlast y la página oficial de JKTech no lo menciona [JKT]; en este benchmark se trata como producto complementario de terceros con integración, no como parte de JKSimBlast.
- **Evidencia y confianza**: [BL] Alta (existencia); https://www.blastatistics.net/en/ Media (tercero); [MSR] Baja como descripción de módulo.

---------------------------------------------------------------------

## 3. Flujo de trabajo de punta a punta: diseño de un banco en 2DBench

Según [MAN p.65-80], [TUT] (2011) y las capturas reales del curso [DECK diap. 21-33], corregido con el estado actual de los How-To.

Regla general del programa: se trabaja "de izquierda a derecha" por los modos de la barra (Área, Hoyos, Carga, Retardo de fondo, Retardo superficial, Detonación) y cada modo agrega un componente del blast. Los botones globales (ancla para medir distancia y rumbo, "hook" para fijar el cursor a una línea, [Home], [End], GoTo, zoom con Z) siempre están disponibles [MAN p.65]. Solo los hoyos MARCADOS ("M") reciben acciones, análisis y exportaciones [TUT p.4].

1. **Preparar el entorno**. Abrir 2DBench con la llave conectada; título muestra la base de stocks, base de diseño y nombre/escenario (ejemplo del curso: "ST=stocks.stk, DB=default.2db") [DECK diap. 25]. Recomendación oficial: usar una base temporal (`default.2db`) hasta terminar y luego "Save As"; no hay autoguardado [TUT p.6]. Idioma: hay archivos de idioma inglés y español (`Espanol_240528.lng`) [DL].
2. **Traer el contorno y los taladros** (opciones): (a) importar strings y taladros de texto con el asistente (paso a paso, F19); (b) dibujar el polígono en modo Área (nivel = cota de banco); (c) perforar con el patrón: primer hoyo, dirección de fila frontal, dirección del burden [MAN p.65-66]. Fuente de datos típica en minería peruana (material del usuario): hoyos de un diseño ya generado en CAD con ID, Este, Norte, Cota (ver sección 4, [CSV]) [DECK diap. 38].
3. **Definir los parámetros de perforación**: diámetro, cota de banco y de piso, sobreperforación, longitud total, dip, bearing, costo por metro, SG de roca; burden, espaciamiento, filas, hoyos por fila, escalonado/cuadrado [DECK diap. 21].
4. **Guardar** (Save Blast): nombre + escenario (0 a 9 predefinidos; nuevos desde 10) + comentarios; el blast se guarda en cinco componentes (Area, Hole, Deck, Downhole, Surface) con ID propio [TUT p.6][MAN p.67-68].
5. **Cargar (modo Deck)**: elegir explosivo (ejemplo ANFO), método "carga a longitud desde el collar", "Accept", "Load all holes" y clic; luego taco (0 m desde collar), clic; verificar con consulta (ciclar por decks) [MAN p.69-70].
6. **Calcular factores de diseño**: marcar todo (Ctrl+M), tecla F; revisar altura de banco, SG, factor de carga, tonelaje, costos [MAN p.71].
7. **Retardos de fondo**: elegir detonador (ejemplo #20 / 500 ms), conector y primer; distancia (por ejemplo 1 m desde el toe, dentro del explosivo); "All holes" y clic [MAN p.72-73].
8. **Retardos de superficie (amarre)**: marcar; detonador y conector (por ejemplo 17 ms; nonel); inter-taladro por líneas con "Multiple hole tie up"; inter-fila con "Hole to hole tie up" (por ejemplo 42 ms); o con electrónicos, usar la herramienta de F07 [MAN p.74-77][ED].
9. **Simulación**: modo Detonación; opcional: Monte Carlo, factores de dispersión (0 = nominal), tamaño de paso; clic en el hoyo de inicio; ver el frente; guardar para registrar tiempos [MAN p.78-79][TUT p.15].
10. **Análisis básicos**: contornos de primera detonación (isotiempos), gráfico MIC con ventana de 8 ms, PPV con la función de distancia escalada, Blast Summary con totales [MAN p.80][DECK diap. 32-33].
11. **Análisis avanzados** (según licencia 2DBench): burden relief [BR], distribución de energía 3D/4D [MAN p.226-233], contornos de daño Holmberg-Persson [B-MIC][DECK diap. 35], fragmentación (Kuz-Ram + corrección de finos) [B-EF], contouring de valores por hoyo [CT]. La abreviatura habitual del curso: "simulación y análisis" [DECK].
12. **Salida**: imprimir a escala (Print Blast Window), exportar a reporte (`.txt` + `.bmp` + plantilla Excel), guardar como texto v3 (.s3tb) para el visor 3D, copiar tablas a Excel, y (opcional) enlazar la voladura en JKBMS con fotos, fragmentación medida y vibraciones [MAN p.34-37, p.46-54][TUT p.8][V3TXT].

Ejemplo real de un curso [DECK diap. 36-40]: malla "malla de práctica" con tres tipos de taladro: Producción (12 1/4", burden 9 m, espaciamiento 10 m, sobreperforación 2 m, altura de banco 16 m, taco 7.5 m, explosivo HA73 10.5 m, iniciación electrónica); Producción Fila A (mismo diámetro, con taco superior 2.2 m, taco intermedio 7.9 m, explosivo HA64 en dos decks 5.7 m + 2.2 m); Buffer (9 7/8", 3.5 x 4 m, sobreperforación 1 m, taco 4.5 m, cámara de aire 7.9 m, HA64 4.6 m). Las ilustraciones muestran cómo 2DBench reproduce esos decks y el amarre de la fila.

---------------------------------------------------------------------

## 4. Formatos de archivo (importación y exportación)

**Bases de datos nativas (Microsoft Access, motor Jet de 32 bits [INFERIDO])**
- `.2db` (2DBench), `.2dr` (2DRing), `.2df` (2DFace): una base puede tener muchas voladuras; se crean desde plantilla (`__BenchDesign.mdb`); se pueden abrir con extensión `.mdb` [MAN p.99-100, p.160][TUT p.6]. Cada voladura = "escenarios" (0-9 predefinidos, y nuevos desde 10) compuestos por 5 componentes (Area, Hole, Deck, Downhole, Surface) [TUT p.6].
- `.bms` (JKBMS; compatible con Access; bloqueo `.ldb`) [MAN p.20-21].
- Stocks: `Stock.mdb`, `Stocks.stk` (Access), nuevo `stocks_stt` (texto) [MAN p.123, 127][DL]; Units: `Units.mdb` [CMD].
- Resultados de energía: `.eed` (base) o `binary.tmp` (temporal, se sobrescribe) [MAN p.229-231].
- Parámetros/estilo: `.ini` (por ejemplo `2DBench.ini`, `Import.ini`, `TimeHEx.ini`, `2DBPrnConfigs.ini`); comandos `/CMD`, `/INI`, `/STOCK`, `/UDB`, `/UUN`, `/MDB`, `/BN`, `/S`, `/LIC`, `/EXTRANET` [CMD][MAN p.106, 109][HIST]; idiomas `.lng` [DL].

**Texto tabulado v2 (copiar/pegar y >File >Open from Text / Save to Text, desde 2DBench v2.13.14)** [HIST][SAMP `iron mine_6.txt`]
Secciones con encabezado, todas en tabulador: `2DBENCH AREA DATA`, `HOLE DATA`, `DECK DATA`, `MATERIAL USED DATA`, `DOWNHOLE DELAY DATA`, `DOWNHOLE DELAY ELEMENT DATA`, `DOWNHOLE CONNECTION DATA`, `DOWNHOLE PRIMER DATA`, `SURFACE DELAY DATA`, `SURFACE DELAY ELEMENT DATA`, `SURFACE CONNECTION DATA`.
Columnas de la tabla de hoyos (32 campos): contador, ID, etiqueta, es nodo, fila, hoyo en fila, collar Este/Norte/Cota, diámetro (mm), longitud, dip, bearing, stand-off, toe Este/Norte/Cota, orden de detonación, costo por metro, comentario, burden, espaciamiento, marca (M/U), sobreperforación, y campos de cadena electrónica, enlaces, conteo de retardos y de conexiones. El deck tiene longitud, masa, cartuchos, ID de material, tiempo medio de detonación, SD, tiempo nominal, secuencia y contadores de detonaciones exitosas. Esta estructura es el mejor "esquema de datos" público para replicar un modelo de voladura.

**Texto v3 (JKSimBlast v3, feb-2017)** [V3TXT][SAMP `copper mine [4].s3tb`]
- Blast: `.s3tb`, texto con tabulador, encabezado "JKSimBlast v3.0" y tipo de voladura (BENCH), secciones `FILE_DATA`, `BLAST_DATA`, `BLAST_HISTORY_TABLE`, `REFERENCE_POINT_DATA`, `PLANES_TABLE`, `AREA_*`, `ZONES_TABLE`, `HOLES_*` (tipos, comentarios, secciones), `NODES_TABLE`, `DRILL_POSITIONS_TABLE`, `MWD_*` (Measure While Drilling), `DECKS_*`, `MATERIALS_TABLE`, `DOWNHOLE_DELAYS_*`, `SURFACE_DELAYS_*`, `DETONATORS_TABLE`, `CONNECTORS_TABLE`, `PRIMERS_TABLE`, `CHAINS_*`, `ATTACHMENTS_TABLE`, `INCLUDES_TABLE`, `LINKED_TEXT_TABLE`; incluye GUID, origen y ejes del sistema de coordenadas locales con unidades explícitas. Contempla zonas de voladura (para calcular factor de carga y tonelaje en el futuro), datos MWD y levantamientos de taladro (no usados aún en 2DBench).
- Análisis: `.s3tc` (contornos, por ejemplo detonación), `.s3tf` (facetas, relief rate), `.s3th` (por hoyo, burden relief), `.s3tp` (puntos, energía y daño), `.s3tk` (bloques; reservado), `.s3tl` (líneas; reservado).

**Importación de strings y hoyos** (Design Importer / General String Import / General Hole Import) [MAN p.101-106][TUT p.7][SAMP]
- ASCII con columnas (coma, tabulador, espacio, punto y coma, o ancho fijo). Ejemplos de la muestra: CSV `Name,Northing,Easting,Elevation,Description` (`iron mine_6.csv`); `ironmine.str` con `string; north; east; level; point` delimitado por punto y coma; `drill.map` de GPS de perforación con `-, label, E, N, L, -, bearing, dip`; archivos `.BLAST` de mina de carbón; `surface_points.txt` para superficies (E,N,L).
- Opciones: número de líneas de comentario, mapeo de columnas, cómo se definen strings (por valor común, por línea o un solo string), cierre de strings (todos cerrados si tienen más de 2 puntos, todos abiertos, cerrados si el primero y último quedan dentro de una tolerancia, o manualmente), lista de exclusiones, valores por defecto y conversión de unidades no métricas (por ejemplo pies) y guardado de la configuración [MAN p.101-106].
- Si el texto pegado o importado tiene secciones, "Paste" de 2DBench busca las etiquetas (`AREA DATA`, `Reference Point`, `The Number of Lines/Labels`, `Line/Label Data`, `POINTS`) e ignora líneas no conformes [HIST v2.13.39]; 2DRing pega tablas buscando encabezados [HIST v2.14.04].

**Exportaciones**
- Reportes de texto/columna: de perforación, carga, retardos de fondo, retardos superficiales (2DRing/2DFace, tabulado; solo hoyos marcados) [MAN p.106-107]; Export Report + `.bmp` + plantilla Excel; Blast Summary [MAN p.34-37][TUT p.8].
- 3X3Win (`.prj`) desde 2DRing y 2DFace [MAN p.106, p.167].
- Imágenes: copiar figura del área de diseño, guardar "Blast Image" y "Save Design Region Picture" [MAN p.62][TUT p.5]; entrada de imágenes para digitalizar: jpeg, gif, bmp, wmf, emf [MAN p.192]; logo de impresión en bitmap [MAN p.109].
- Archivos de resultados de gráficos (MIC, fragmentación) a texto tabulado/Excel; 3D PDF (v3) [MAN p.244][B-V3].
- Enlaces a fotos, videos y archivos genéricos dentro de JKBMS; conexión con Split-Desktop (análisis de imágenes de fragmentación) [MAN p.30][BL].

**Material de curso revisado**
- CSV de una malla de práctica: 180 filas, 4 columnas sin encabezado (ID, Este, Norte, Cota), coordenadas tipo UTM en metros, cota con pequeñas diferencias entre grupos de taladros. IDs con prefijos por grupo (por ejemplo `A`, `B`, `C`, `BF`); la interpretación de los prefijos (`BF` = buffer) es [INFERIDO]. Es exactamente el formato mínimo que espera la importación general de hoyos de 2DBench (una fila por hoyo, Este y Norte; "Display Label" para el ID) [TUT p.7].
- Diapositivas de un curso de JKSimBlast 2DBench: teoría (burden, relación de rigidez, distribución de energía, vibraciones, criterios de daño) y capturas reales del software. Se aprovecharon como evidencia [DECK].

---------------------------------------------------------------------

## 5. Modelos físicos mencionados (para la fase de matemática)

Aviso: el manual no publica la mayor parte de las constantes; las fórmulas "estándar" abajo son de la literatura y del curso y deben VERIFICARSE contra las fuentes originales antes de implementarse.

| Modelo | Qué mide | Dónde aparece en JKSimBlast | Idea documentada | Referencia bibliográfica |
|---|---|---|---|---|
| Kuz-Ram | Curva de fragmentación (tamaño medio x50 y forma de la curva) | 2DBench [WEB][B-EF] | Kuznetsov (x50) + Rosin-Rammler + índice de volabilidad de Lilly modificado + índice de uniformidad de Cunningham [B-EF] | Kuznetsov, V.M. (1973), "The mean diameter of the fragments formed by blasting rock", Soviet Mining Science 9(2), 144-148. Cunningham, C.V.B. (1983), "The Kuz-Ram model for prediction of fragmentation from blasting", 1st Int. Symp. on Rock Fragmentation by Blasting, Luleå, 439-453; (1987) "Fragmentation estimations and the Kuz-Ram model - four years on", 2nd Int. Symp., Keystone, 475-487. Lilly, P.A. (1986), "An empirical method of assessing rock mass blastability", AusIMM/IE Aust. Newcastle Conf. Rosin, P. y Rammler, E. (1933). [Referencias de mi conocimiento; no verificadas en línea en esta sesión] |
| Corrección de finos JKMRC = Crush Zone Model (CZM) + Kuz-Ram; "Two-Component Model" (TCM) | Exceso de finos que Kuz-Ram no predice | 2DBench "JKMRC Fines Correction"; el sitio dice "JKFines"; JKBMS acepta datos de rango de tamaño desde JKFines [WEB][B-EF][HIST 2016-12-15] | Zona triturada alrededor del hoyo (radio según presión pico en el hoyo y resistencia de la roca) genera finos; se aplica a la parte fina de la curva [B-EF] | Kanchibotla, S.S., Valery, W. y Morrell, S. (1999), "Modelling fines in blast fragmentation and its impact on crushing and grinding", Explo '99, Kalgoorlie, AusIMM, 137-144 (verificada: https://www.semanticscholar.org/paper/Modelling-fines-in-blast-fragmentation-and-its-on-Kanchibotla-Valery/71d44aa1c6f570d19e660f86f5a1b1305224d35d). Thornton, D., Kanchibotla, S.S. y Brunton, I. (2001), "Modelling the impact of rockmass and blast design variation on blast fragmentation", Explo 2001, Hunter Valley; versión ampliada en Fragblast 6(2), 2002, 169-188 (verificada por búsqueda web, Media). Comparación crítica de modelos JKMRC: Fragblast 6(2), 207ff (https://www.tandfonline.com/doi/abs/10.1076/frag.6.2.207.8670; autores no verificados) |
| FragmentO | Fragmentación en tajeos por taladros largos (un anillo) | 2DRing [MAN p.137][FO] | Dos Rosin-Rammler (fc, x50, nc); zona triturada + fracturada; x50 con tamaño de bloque in situ y distribución 3D de energía; uniformidad con atenuación PPV 3D [ONE][FO] | Onederra, I. (2004), IRR Drilling & Blasting Conf., Perth (URL en tabla de fuentes); tesis doctoral y artículos "Onederra 2004a, 2004b" citados allí sin detalle |
| Distribución de energía 3D y 4D | Concentración de explosivo/energía en cada punto de la roca | 2DBench, 2DRing, 2DFace, 2DView [MAN p.130-133, p.226-233] | Ecuaciones (6) y (7) del manual (transcritas en F13); ponderación por tiempo con tiempo de cooperación | "Kleine et al (1993)" según el manual (sin cita completa; probablemente informe AMIRA/JKMRC P93, 1993 [INFERIDO]). Base: Kleine, T.H. (1988), "A mathematical model of rock breakage by blasting", tesis PhD, Univ. of Queensland (mencionada en [ONE] y en búsqueda web, Media) |
| Holmberg-Persson (campo cercano) | PPV cerca de una carga cilíndrica, y daño por umbral de PPV | 2DBench, 2DRing, 2DFace; FragmentO [B-MIC][MAN p.139] | Integral de la contribución de cada elemento de columna (fórmula en F14); PPV crítico para daño | Holmberg, R. y Persson, P.A. (1979), "Design of tunnel perimeter blasthole patterns to prevent rock damage", Trans. IMM, Sec. A, 88, A37-A40 (referencia de mi conocimiento; no verificada). En el curso: [DECK diap. 16] |
| Distancia escalada (campo lejano, MIC) | PPV y presión de aire en un punto de interés | gráfico MIC, 2DBench y TimeHEx [MAN p.245-246][B-MIC] | PPV = K (D / raiz(Q))^(-alfa) en la forma de Devine; Q = masa por ventana (típico 8 ms) | Devine, J.F. (1966), "Vibration levels from blasting", USBM (curso: [DECK diap. 13], con tabla de K y alfa de Scherpenisse, Adamson y Díaz (2000): K promedio 357, alfa promedio -2.07). Constantes por defecto de 2DBench: no publicadas |
| Criterio de daño de McKenzie | Zonas de daño según PPV crítico | solo en el curso [DECK diap. 17] (no documentado en manual/folletos de JKSimBlast) | 4x PPV crítico = fracturamiento intenso; 1x = nuevas fracturas; 1/4 = extensión de fracturas | McKenzie, C. (referencia del curso; cita completa no dada) |
| Tiempo de llegada | Desfase de las barras del MIC por el viaje de la onda | TimeHEx [MAN p.245-246] | tiempo llegada = detonación + distancia x 1000 / velocidad de la onda | Ninguna (fórmula directa) |
| Simulación de detonación con dispersión | Tiempos reales de cada taladro con variabilidad de retardos | 2DBench, 2DRing, 2DFace [MAN p.78-79][B-DD] | Grafo de iniciación + Monte Carlo con SD nominal en % por detonador | Ninguna publicada |
| Burden relief y relief rate | Si cada taladro tuvo alivio a tiempo | 2DBench, 2DFace [BR][ED] | Reglas de conteo de cargas y tiempos (F12); tiempo = distancia x relief rate | Ninguna publicada |
| Índice de volabilidad de Lilly (BI) | Dificultad de voladura de la roca | entrada de Kuz-Ram en 2DBench [B-EF][DECK diap. 37] | BI = 0.5 (RMD + JPS + JPO + SGI + H), forma original | Lilly (1986) (arriba) |

Otros modelos del ecosistema JKTech (no del núcleo de JKSimBlast): JKVBOC para movimiento de voladura en tajo abierto [JKT]. JKSimMet es OTRO producto: simulación de circuitos de conminución/procesamiento de minerales; no tiene relación funcional con diseño de voladuras [JKT].

---------------------------------------------------------------------

## 6. Diferencias 2D vs 3D y limitaciones de escritorio que una versión web puede mejorar

**Qué es "2D" y qué es "3D" en JKSimBlast**
- El nombre "2D" se refiere a la interfaz de dibujo: 2DBench trabaja en planta; 2DRing y 2DFace trabajan sobre una sección/plano [MAN p.57, p.83].
- Los datos siempre son 3D: cada hoyo, deck y retardo lleva Este, Norte y Cota [MAN p.57][WEB]. Las analíticas de energía y PPV se calculan en 3D, pero se muestran sobre un plano de corte 2D elegido por el usuario (horizontal a una cota, o vertical en una dirección) [MAN p.226].
- 3D real: JKBMS trae un visor 3D (voladuras, decks, superficies, energías y PPV; reproduce detonación) [MAN p.27][WEB]; 2DView da una vista oblicua "de superficie definida por el usuario" [MAN p.212-217]; JKSimView3 (beta 2017) es el visor 3D "de nueva generación" [B-V3].
- El diseño en sí (colocar hoyos, cargar, amarrar) se hace en 2D en todas las versiones v2. La v3 planeada pretende unificar diseño y análisis en un solo programa 3D [B-V3].

**Limitaciones de escritorio y oportunidades web (marca [INFERIDO] donde no hay documento)**
1. Licencia con llave USB (dongle), versión de red con monitor, y archivo de licencia por organización; perder la llave implica costo [SM][DL]. Web: licencias por suscripción o por usuario en la nube; acceso desde cualquier equipo [INFERIDO].
2. Instalación pesada y sensible (registro de archivos de sistema, drivers de llave, problemas de "file registration", registro de DLL en Win64) [DL][MAN p.4-15]. Web: sin instalación.
3. Almacenamiento en bases Access (`.2db`, `.bms`): un archivo por proyecto, sin control de versiones más allá de "escenarios", bloqueo de archivo, y degradación con tamaño [MAN p.20, p.100]. Web: base de datos multiusuario con historial de cambios [INFERIDO].
4. Sin guardado automático ni Undo en JKBMS; en 2DBench hay un solo "paso atrás" [TUT p.6][MAN p.31, p.62]. Web: historial completo con deshacer/rehacer [INFERIDO].
5. Flujo basado en teclas y modos ocultos ([click], [Home], [End], [M]/[U], marcado del hoyo) con curva de aprendizaje de 3 o más días de capacitación [TR]. Web: manipulación directa, tooltips, tutoriales incrustados [INFERIDO].
6. Interoperabilidad limitada: importación de texto asistida; sin DXF, sin nubes de puntos ni escaneos láser (planificados en v3 [B-V3]); Excel por copiar/pegar. Web: importación de CSV/DXF/shapefile/GeoJSON/LandXML, API abierta [INFERIDO].
7. Análisis con modelos simples, ejecutados uno a la vez, con una sola región y resultado en pantalla [MAN p.230]; cálculo lento con grillas finas [MAN p.220]. Web: cálculo en servidor/GPU, comparación lado a lado de escenarios, sensibilidad automática [INFERIDO].
8. Sin colaboración: para compartir en 3D se depende de 3D PDF o de enviar la base de datos [B-V3]. Web: enlace compartible con comentarios [INFERIDO].
9. Visualización 3D tardía y aparte (v3 beta desde 2017) [PRO]. Web: mismo motor 3D para diseñar y analizar desde el inicio [INFERIDO].
10. Catálogos de explosivos y accesorios en base propia que el usuario debe alimentar [MAN p.123]. Web: catálogos por región/proveedor y de la organización [INFERIDO].
11. Sistema operativo: el manual dice Win98/NT/2000/XP; Soft-Blast publica utilidades de registro para Win64 [MAN p.3][DL]; el programa es de 32 bits (Access/Jet, DDE) [INFERIDO]. Web: independiente de plataforma.
12. Brechas funcionales que un curso de la materia ya necesita y JKSimBlast resuelve solo parcialmente [DECK]: recomendación de burden con múltiples modelos, relación de rigidez, superposición de ondas de vibración, plano de evacuación/aviso de voladura, decisiones de daño con tablas de normativa peruana (0-90 m: 32 mm/s; 91-1524 m: 26; más de 1524 m: 19) [DECK diap. 14-15].

---------------------------------------------------------------------

## 7. Preguntas abiertas para verificar con una demo o licencia oficial

1. ¿Cuáles son exactamente las ecuaciones y constantes por defecto de Kuz-Ram, de la corrección de finos (JKFines/Crush Zone) y de la ley de distancia escalada en 2DBench 2.18? El manual antiguo no las publica; ¿qué es "JKFines" respecto de "JKMRC Fines Correction"? [MAN][B-EF]
2. ¿Qué incluye realmente "JKSimBlast v3" hoy (S&M dice "v3 disponible para usuarios v2 con S&M vigente")? ¿Es solo JKSimView3 o ya incluye diseño? ¿Hay hoja de ruta pública? [SM][B-V3]
3. Fecha y notas de la versión 2.18 (el historial público [HIST] termina en enero de 2019). ¿Qué cambió entre 2.14 y 2.18?
4. Precio de licencias y de cada módulo (JKBench, JKBench+, 2DBench, paquetes) y modelo de nube o suscripción, si existe: no público [SM][MSR].
5. Precisión y validación de cada análisis frente a mediciones (fragmentación, vibración, daño): ¿existen estudios de validación de JKSimBlast publicados por JKTech o Soft-Blast?
6. Alcance real de la integración con Blastatistics (Rocha Blast Engineers) y con Split-Desktop (formatos e intercambio).
7. Comportamiento con voladuras inclinadas, taladros con desviación medida, y superficies de terreno irregulares (subdrill/cota de piso variable): ¿el factor de carga usa el volumen real?
8. Cómo se define y se guarda la lógica "cadena electrónica" (unidad de disparo y unidad de cadena, según la lámina de [ED]) y cuáles marcas de detonador electrónico se modelan.
9. Exactitud de la fórmula 4D (¿valor absoluto en el exponente?) y de las unidades de la ecuación (7); ¿"tiempo de cooperación" tiene valores típicos por roca?
10. Capturas de pantalla y contenido de los tres videos y del artículo sobre 2DFace ("Application of JKSimBlast software in drifting operations", ResearchGate, no accesible: https://www.researchgate.net/publication/338913443_Application_of_JKSimBlast_software_in_drifting_operations ), que no pude leer por bloqueo (HTTP 403).
11. ¿Existe una demo/evaluación oficial (el código `EVALUATION` aparece en el historial de versiones [HIST])? Es la vía correcta para el benchmark; conviene pedir una a Soft-Blast.
12. Rendimiento con voladuras grandes (miles de hoyos): el manual recomienda partir bases por tamaño; no hay cifras [MAN p.20].
