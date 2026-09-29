# 01 — Guía del desarrollador

**Cronos** (nombre de trabajo; verificar que no choque con otro producto): software **web** de diseño y simulación de voladuras. Esta guía contiene todo lo necesario para empezar y avanzar: alcance, requisitos, arquitectura, hitos, backlog con criterios de aceptación, reglas de trabajo y decisiones por defecto. Los demás documentos del paquete son de consulta.

Estado: borrador para que lo corrijas. Nada de lo que hay aquí te obliga a una tecnología concreta (sección 7); sí te obliga a los criterios de aceptación y a las reglas de verificación (secciones 9 a 11).

---

## 1. Qué se construye

### 1.1 El problema
Diseñar y simular una voladura depende hoy de programas de escritorio: JKSimBlast (base Access, llave USB, sin historial de versiones), I-Blast y SHOTPlus (Windows). Sus límites, según el análisis de `Referencia/R2` y `R3`: instalación pesada, un archivo por proyecto, poca o ninguna colaboración, interfaces poco intuitivas (curva de aprendizaje de días), importación limitada, análisis uno a la vez.

### 1.2 El producto
Una aplicación web para que un ingeniero **diseñe** una voladura, **simule** la secuencia y **prediga** sus resultados **antes de disparar**, con cálculos verificables y reportes. El usuario entra por navegador.

Una voladura, dicho para quien no es minero: en un tajo abierto, la roca se rompe con explosivo cargado en **taladros** perforados en una **malla** regular. Cada taladro lleva explosivo abajo y un **taco** (material inerte) arriba que confina la energía. Los taladros no explotan a la vez: se conectan con **retardos** en milisegundos para que cada uno rompa hacia un espacio libre ya abierto (la **cara libre**). El ingeniero decide distancias (burden, espaciamiento), cargas y tiempos para lograr fragmentación adecuada, sin vibración ni proyecciones excesivas. Un error en un cálculo puede causar daño a personas o a infraestructura: por eso la regla central del proyecto es la **verificación numérica con fuente**.

### 1.3 Módulos
| Módulo | Contenido | Equivale a |
|---|---|---|
| Superficie | Diseño y análisis de bancos | 2DBench (JKSimBlast) y el núcleo de I-Blast y SHOTPlus |
| Frentes | Túneles y galerías (método sueco: arranque, ayudas, contorno, zapateras) | 2DFace |
| Anillos | Tajeos con taladros largos en abanico | 2DRing |
| Datos de campo | Perforación, sismógrafos, nube de puntos y dron | Ecosistema de I-Blast |

Se parte por **Superficie, Fase 1**. El modelo de datos y el motor deben nacer preparados para los demás: taladros en 3D con cualquier orientación, decks, secuencia como grafo.

### 1.4 Usuarios
| Rol | Qué necesita |
|---|---|
| **Diseñador** (ingeniero de perforación y voladura) | Crear diseños, simular, comparar escenarios, generar reportes |
| **Revisor** (planeamiento, supervisión) | Ver diseños y resultados, comentar; no edita |
| **Administrador** | Usuarios y roles, catálogos de explosivos y accesorios |

### 1.5 Principios
1. **Correcto antes que vistoso.** Cada cálculo cita su fuente y se verifica con un caso de referencia.
2. **Explicable.** Al usuario se le muestra qué modelo se usó, con qué parámetros y por qué.
3. **Simple de usar.** El flujo guía al ingeniero paso a paso.
4. **Modular y bilingüe** (español e inglés) desde el diseño.
5. **Sin copiar.** Se estudian funciones y literatura pública; no se copian interfaz, textos ni constantes propietarias de JKSimBlast, I-Blast, SHOTPlus ni BlastLogic.

### 1.6 Qué debes *entender*, no solo programar
Cada función responde tres preguntas: **¿qué decisión apoya?**, **¿qué pasa si sale mal?**, **¿cómo lo verifico con un ejemplo hecho a mano?** Si no puedes responderlas por escrito, pregunta antes de programar. El ingeniero de minas revisa tu comprensión en cada hito (indicador I1).

---

## 2. Cómo usar este paquete

| Documento | Para qué |
|---|---|
| **01 — Guía del desarrollador** (este) | Todo lo necesario para empezar y avanzar |
| **02 — Especificación de cálculo** | Fórmulas, unidades, convenciones y verificaciones de la Fase 1 |
| **03 — Modelo de datos e importación** | Entidades, catálogos, formatos, trampas de importación, ejemplo JSON |
| **04 — Casos de referencia** | Ejemplos con valores esperados: la base de las pruebas |
| **05 — Reglas mineras y su verificación** | Estado de cada regla de dominio, con fuentes |
| `Referencia/R1` — Primer minero → desarrollador | Glosario ES/EN (105 términos), 30 fichas de concepto, familias de explosivos y accesorios, ejemplos resueltos, dudas abiertas |
| `Referencia/R2`, `R3` — Benchmark I-Blast y JKSimBlast | Qué hace cada programa, función por función, flujo de trabajo y formatos |
| `Referencia/R4` — Subterráneo | Frentes y anillos (módulos posteriores) |

**Orden de lectura.** (1) Esta guía completa. (2) `Referencia/R1`, secciones 1, 2 y 5 (ciclo de voladura, glosario, ejemplos resueltos). (3) `02` y `04`. (4) `03`. (5) `05`. (6) `R2` y `R3` como consulta al construir cada pantalla.

**Empieza así (primer tramo, hito G0).**
1. Lee esta guía y `R1` (secciones 1, 2, 5).
2. Resuelve **a mano y con código** el caso CR-01 (`04`). Contrasta con el código de referencia de CR-02.
3. Haz las pruebas técnicas S1, S2 y S3 (sección 7.4) y propón tu stack con nota de decisión.
4. Crea el repositorio con la estructura de la sección 14 y el ejercicio de comprensión (sección 18).
5. Muestra el resultado al ingeniero de minas antes de pasar a G1.

---

## 3. Alcance y fases

**Dentro de la Fase 1 (superficie):** contorno y taladros; importar topografía y polígonos; catálogos de explosivos y accesorios (base más importación); carga por tramos; retardos, amarre y simulación de detonación; carga por retardo y PPV; reporte; escenarios comparables; usuarios con rol; español e inglés.

**Después:** energía y daño, fragmentación, onda aérea, desplazamiento del material y proyección de rocas (Fase 2); frentes y anillos (módulos posteriores); datos de campo.

**Fuera de alcance por ahora:** ejecución en campo (tabletas y guía de carga), integración con equipos de perforación o camiones de explosivos, gemelo digital 4D y aprendizaje automático.

| Fase | Objetivo | Contenido | Se cierra cuando |
|---|---|---|---|
| **F0 Fundamentos** | Claridad de qué se construye y cómo | Esta guía, repositorio, decisiones de arquitectura, spikes S1–S3 | Documentos aprobados; spikes con su criterio cumplido |
| **F1 MVP de superficie** | Flujo completo de un banco, de la importación al reporte | Hitos G0–G9 (sección 8) | I1–I5 en verde en todos los hitos; I6 medido |
| **Evaluación 1** | Primer filtro | El ingeniero de minas usa el producto con los casos de prueba; lista de hallazgos | Hallazgos críticos resueltos |
| **F2 Análisis avanzado** | Predecir resultados | Energía y daño, fragmentación, onda aérea, desplazamiento, proyección | Casos de referencia de cada modelo reproducidos |
| **Evaluación 2** | Ingenieros externos | Grupo elegido por el ingeniero de minas; manual básico y registro de comentarios | Hallazgos críticos resueltos |
| **F3 Subterráneo** | Frentes y anillos | Método sueco para frentes; abanicos para anillos | Ronda completa dentro de sección; casos de referencia |
| **F4 Datos de campo** | Calibrar con mediciones | Importar perforación y sismógrafos, nube de puntos y dron | Un diseño calibrado con datos reales |
| **F5 Preparación para distribución** | Dejarlo listo para terceros | Documentación de usuario, empaquetado, lista de verificación de lanzamiento | Lista aprobada |

No hay fechas: cada fase y cada hito se cierra por criterio medible.

---

## 4. Casos de uso y flujo principal

| ID | Caso de uso | Actor | Resultado |
|---|---|---|---|
| UC-01 | Crear un proyecto y elegir su sistema de coordenadas | Diseñador | Proyecto con CRS declarado |
| UC-02 | Importar topografía, polígono y taladros | Diseñador | Datos visibles en su posición correcta |
| UC-03 | Diseñar la malla dentro de un polígono con una cara libre | Diseñador | Taladros con burden y espaciamiento medidos desde la cara libre |
| UC-04 | Cargar los taladros por tramos (explosivo, taco, cámara de aire, booster) | Diseñador | Kg por taladro, factor de carga y tonelaje |
| UC-05 | Definir amarre y retardos, y simular la detonación | Diseñador | Tiempo de detonación por taladro y reproductor |
| UC-06 | Calcular carga por retardo y PPV en puntos de monitoreo | Diseñador | Valores frente a límites configurables |
| UC-07 | Crear y comparar escenarios | Diseñador | Comparación lado a lado |
| UC-08 | Generar el reporte | Diseñador | PDF con datos, gráficos y supuestos |
| UC-09 | Revisar y comentar un diseño | Revisor | Comentarios asociados al escenario |
| UC-10 | Gestionar usuarios y catálogos | Administrador | Usuarios con rol y catálogo cargado |

**Flujo de punta a punta** (es la tarea que mide el indicador I6): crear proyecto → importar taladros y polígono → definir cara libre → ajustar malla y grupos → cargar tramos con productos del catálogo → definir amarre y retardos → simular y revisar isotiempos → calcular MIC y PPV → guardar escenario → duplicar y variar retardos → comparar → generar reporte. `Referencia/R3`, sección 3, describe el flujo equivalente en JKSimBlast (12 pasos) como comparación; no lo copies, mejóralo.

**Pantallas mínimas de la Fase 1:** (1) proyectos; (2) ajustes del proyecto (CRS, unidades, idioma); (3) asistente de importación con vista previa; (4) diseño: plano 2D con vista 3D conmutable, tabla de taladros editable y panel de propiedades; (5) catálogos; (6) editor de carga del taladro por tramos; (7) amarre y retardos con reproductor, isotiempos y gráfico de MIC; (8) vibración: puntos de monitoreo y PPV; (9) escenarios y comparación; (10) reporte; (11) administración de usuarios. Los bocetos los propone el dev y los aprueba el ingeniero de minas antes de construir cada pantalla.

---

## 5. Requisitos funcionales de la Fase 1

Cada requisito se completa con: fuente, caso de referencia, prueba y pantalla (esa cadena es el indicador I2). La columna "Regla" remite a `05`.

| ID | Requisito | Hito | Regla |
|---|---|---|---|
| R-01 | Importar polígonos (CSV, DXF, GeoJSON); formatos a validar con la operación | G2 | RM-22 |
| R-02 | Importar taladros (ID, Este, Norte, Cota…) con detección de separador, decimal, codificación y Norte/Este invertidos | G2 | `03`, secc. 5 |
| R-03 | Importar topografía del tajo | G2 | — |
| R-04 | Definir la cara libre y medir burden y espaciamiento desde ella | G3 | RM-06, RM-07 |
| R-05 | Tipos de malla: cuadrada, tres bolillos, triangular no equilátera | G3 | — |
| R-06 | Malla adaptada a un polígono cualquiera | G3 | — |
| R-07 | Grupos de taladros (precorte, buffer, producción) y asignación por polígono | G3 | RM-18 |
| R-08 | Taladros verticales e inclinados; sobreperforación como parámetro | G3 | RM-16, RM-17 |
| R-09 | Burden efectivo según la secuencia | G5 | RM-07 |
| R-10 | Catálogo base de proveedores e importación del catálogo del cliente | G4 | — |
| R-11 | Catálogo de accesorios con propiedades por producto (incluida la combustión de la mecha) | G4 | RM-15 |
| R-12 | Carga por decks con material de taco desde catálogo | G4 | RM-01, RM-03, RM-04 |
| R-13 | Cadena de iniciación posicionada (detonador, booster, granel) | G4 | RM-05 |
| R-14 | Kg por taladro, factor de carga, tonelaje, metros perforados y área | G4 | — |
| R-15 | Advertencia configurable de confinamiento insuficiente | G4 | RM-03, RM-08 |
| R-16 | Amarre y retardos por separado | G5 | — |
| R-17 | Tiempo de detonación por taladro y reproductor | G5 | — |
| R-18 | Elegir el taladro de inicio y generar el amarre | G5 | — |
| R-19 | Carga máxima por retardo | G6 | — |
| R-20 | PPV por distancia escalada de vibración con K y β configurables | G6 | RM-08, RM-21 |
| R-21 | Puntos de monitoreo con límites configurables | G6 | RM-21 |
| R-22 | Reporte PDF | G7 | — |
| R-23 | Escenarios comparables | G7 | — |
| R-24 | Autoguardado y deshacer/rehacer | G7 | — |
| R-25 | Usuarios con rol (diseñador, revisor) | G8 | — |
| R-26 | Español e inglés | G8 | — |
| R-27 | Unidades del SI y coordenadas UTM consistentes | G1 | — |

## 6. Requisitos no funcionales

Las metas numéricas son **propuestas** que se validan en los spikes (sección 7.4).

| ID | Categoría | Requisito | Verificación |
|---|---|---|---|
| NF-01 | Arranque | La aplicación se levanta completa en local con un solo comando. | Un tercero lo logra siguiendo el README |
| NF-04 | Navegadores | Chrome y Edge actuales como requisito; otros, mejor esfuerzo. | Suite de pruebas en ambos |
| NF-05 | Rendimiento de dibujo | Proyectos de hasta ~5 000 taladros con desplazamiento y zoom fluidos (meta ≥ 30 cuadros por segundo en una PC de oficina de gama media). Una voladura típica tiene cientos de taladros. | Spike S1 |
| NF-06 | Rendimiento de cálculo | La simulación de detonación de 5 000 taladros responde en segundos, sin bloquear la interfaz. | Spike S2 |
| NF-07 | Seguridad | Autenticación, roles, cifrado en tránsito, registro de auditoría de cambios. | Lista de verificación |
| NF-08 | Integridad de datos | Autoguardado, historial de versiones por proyecto y migración entre versiones del formato. | Pruebas de recuperación y de migración |
| NF-09 | Idiomas y unidades | Español e inglés completos. SI interno; visualización configurable (m/ft, mm/in). | Cambio de idioma sin textos sin traducir |
| NF-10 | Interoperabilidad | Importar y exportar CSV, DXF y GeoJSON; formato de proyecto propio, versionado y portable. | Casos de importación con datos anonimizados |
| NF-11 | Calidad de cálculo | Cada fórmula en el registro `RULES.md` con fuente, caso de referencia y prueba. | Indicadores I3 a I5 |
| NF-12 | Mantenibilidad | Motor de cálculo separado de la interfaz y de la base de datos; cobertura ≥ 85 %. | Reporte de cobertura |
| NF-13 | Observabilidad | Registros de errores y de versión para diagnosticar problemas. | Revisión de los registros |
| NF-14 | Usabilidad | Ayudas en pantalla, atajos y flujo guiado; un ingeniero nuevo completa el caso CR-04 sin ayuda. | Indicador I6 |
| NF-15 | Propiedad intelectual | Ninguna interfaz, texto ni constante propietaria copiada; dependencias con licencia permisiva o compatible con distribución comercial. | Revisión de dependencias |

---

## 7. Arquitectura y decisiones

Propuesta para que la corrijas. No impone un stack: fija lo estructural y te deja las tecnologías, con su justificación.

### 7.1 Componentes
| Componente | Qué hace |
|---|---|
| **Aplicación web** | Dibujo de la malla en 2D y 3D, tablas editables, escenarios y reportes |
| **Motor de cálculo** | Toda la matemática de voladura (geometría, carga, tiempos, vibración, y luego fragmentación y daño). Biblioteca **sin pantalla**, con pruebas |
| **Persistencia** | Proyectos, escenarios y catálogos |
| **Importadores y exportadores** | CSV, DXF y GeoJSON de entrada; PDF y CSV de salida |

### 7.2 Restricciones
1. El motor de cálculo es independiente de la interfaz: se prueba sin abrir la aplicación.
2. Unidades del SI internas y un **sistema de coordenadas declarado por proyecto** (código EPSG).
3. El formato del proyecto tiene número de versión y migraciones.
4. Español e inglés desde el primer día.
5. Ninguna regla minera sin fuente: las constantes viven en un registro (`RULES.md`).

### 7.3 Decisiones que toma el dev
Cada una se cierra con una nota corta en `docs/DECISIONS.md` (contexto, opciones, decisión).

| ID | Decisión | Nota |
|---|---|---|
| D-01 | Tecnología de la interfaz y del servidor | Las que domines mejor, con justificación |
| D-02 | Dónde corre el cálculo | Liviano e interactivo en el navegador; simulaciones pesadas en el servidor; **una sola biblioteca** para ambos |
| D-03 | Cómo se guardan los datos | Base de datos relacional con soporte espacial, o la que justifiques |
| D-04 | Cómo se dibuja | Renderizado acelerado por GPU para miles de taladros |
| D-05 | Formato de proyecto exportable | Versionado, con migraciones |
| D-06 | Pruebas | Valores esperados de fuentes externas, nunca calculados con el propio código |
| D-07 | Qué reutilizas de tu prototipo actual | Lo decides tú y lo anotas |

### 7.4 Pruebas técnicas de riesgo (se hacen primero)
| ID | Riesgo | Prueba | Éxito |
|---|---|---|---|
| S1 | Dibujar miles de taladros en el navegador | Dibujar y desplazar 5 000 taladros con 3D | ≥ 30 cuadros por segundo en una PC de oficina de gama media |
| S2 | Un solo motor de cálculo para navegador y servidor | Simulación de detonación de 5 000 taladros con el mismo código en ambos | Resultados idénticos y la interfaz no se bloquea |
| S3 | Importar datos reales | CSV, DXF y GeoJSON con las trampas de `03`, sección 5 | Posiciones correctas; las trampas se detectan |

### 7.5 Riesgos
| Riesgo | Mitigación |
|---|---|
| Fórmulas mal aplicadas | Reglas con fuente, casos de referencia y pruebas externas (secciones 9 a 11) |
| Rendimiento del dibujo con muchos taladros | Spike S1 antes de construir la interfaz |
| Duplicar la lógica de cálculo | D-02: una sola biblioteca |
| Perder trabajo al cambiar el formato | D-05: versionado y migraciones desde el primer hito |
| Constantes propietarias copiadas | Revisión de origen de cada constante; regla de la sección 14 |

---

## 8. Hitos de la Fase 1

Cada hito se cierra cuando cumple su **criterio de salida**. Un hito no empieza sin haber cerrado los anteriores, salvo acuerdo por escrito. No hay estimación de tiempo.

| Hito | Qué se construye | Criterio de salida (medible) | Épicas |
|---|---|---|---|
| **G0 Comprensión y base** | Ejercicio de comprensión (sección 18) y repositorio con `engine/`, `web/`, `server/`, `docs/`, `tests/`, más `RULES.md`, `QUESTIONS.md` y `DECISIONS.md`; spikes S1–S3 | 6 de 6 respuestas aprobadas por el ingeniero de minas. Un tercero clona el repo y corre las pruebas con un solo comando. | E0 |
| **G1 Modelo de datos y unidades** | Proyecto, escenario, polígono, taladro, decks, explosivo, accesorio; unidades SI; guardado versionado | Guardar y abrir un proyecto en JSON sin perder nada (prueba de ida y vuelta). Sin unidades mezcladas. | E1 |
| **G2 Importación** | Polígonos, taladros y topografía desde CSV, DXF y GeoJSON con detección de separador, decimal, codificación y aviso ante Norte/Este intercambiados | CR-04 (o su versión sintética) se importa y los taladros caen en su posición sobre un mapa. Las trampas de `03`, sección 5, se detectan o se rechazan con mensaje claro. | E2 |
| **G3 Diseño de malla** | Malla dentro de un polígono con **cara libre** definida por el usuario; tres tipos; burden y espaciamiento desde la cara libre; grupos | CR-01 y CR-04: conteo, área y burden coinciden con el cálculo a mano dentro de la tolerancia | E3 |
| **G4 Explosivos y carga** | Catálogo base más importación; accesorios; carga por decks; cadena de iniciación; factor de carga, kg y tonelaje | CR-01, CR-02 y CR-03 reproducidos. Los materiales de taco salen del catálogo. Advertencia de confinamiento configurable. | E4 |
| **G5 Amarre, tiempos y simulación** | Amarre y retardos por separado; tiempo por taladro; **burden efectivo según la secuencia**; reproductor | CR-05: tiempos al **milisegundo** con el cálculo a mano | E5 |
| **G6 Carga por retardo y PPV** | MIC; distancia escalada de vibración con K y β configurables; puntos de monitoreo con límites configurables | Un ejemplo a mano coincide con el motor (CR-05, CR-06 y ejemplo de `04`). La profundidad escalada de enterramiento **no** se mezcla con esta (RM-08). | E6 |
| **G7 Reporte y escenarios** | Reporte PDF; escenarios comparables; autoguardado; deshacer y rehacer | Dos escenarios con distintos retardos se comparan lado a lado; el reporte reproduce los números de CR-04 | E7 |
| **G8 Usuarios e idiomas** | Usuarios con rol; español e inglés | Un revisor no puede editar; toda la interfaz cambia de idioma | E8 |
| **G9 Cierre de Fase 1** | Revisión conjunta y demo | Indicadores de la sección 10 cumplidos y tarea de punta a punta (I6) medida | Todas |

### 8.1 Ciclo de trabajo dentro de cada hito
1. Ubicar o escribir el **caso de referencia** (con su fuente) y anotar las reglas en `RULES.md` con su estado.
2. Escribir la **prueba** con el valor de la fuente.
3. Implementar (la IA está permitida, sección 11).
4. Contestar por escrito dos preguntas de comprensión sobre lo construido.
5. Llenar el **reporte de hito** y mostrar una demo corta al ingeniero de minas.

### 8.2 Plantilla del reporte de hito
```
Hito: G_
Reglas tocadas: R-xx (estado antes → después), con fuente
Casos de referencia reproducidos: CR-xx (resultado vs. esperado, diferencia)
Indicadores: I1 _ · I2 _ · I3 _ · I4 _ · I5 _
Preguntas abiertas (críticas / no críticas): _ / _
Qué no pude verificar y por qué: _
```

---

## 9. Estados de una regla de dominio

Toda regla (una fórmula, un rango, una validación) vive en `RULES.md` del repo y avanza así. El punto de partida de `RULES.md` es el documento `05`.

| Estado | Significa | Evidencia |
|---|---|---|
| **R0 Hipótesis** | Alguien la dijo o la leyó | Ninguna todavía |
| **R1 Con fuente** | Está en un libro, paper, manual o ficha técnica | Cita concreta (autor, año, página o URL) |
| **R2 Verificada con ejemplo** | Se resolvió a mano un caso con esa fuente | Caso de referencia con resultado numérico |
| **R3 Implementada con prueba** | El código reproduce el ejemplo | Prueba automática con el valor **de la fuente**, no del propio código |
| **R4 Validada** | El ingeniero de minas la ve funcionando y confirma | Demo corta y visto bueno escrito |

Consecuencias:
- Una regla que **bloquea** al usuario (impide una acción) necesita al menos R3. En R0 o R1 es, a lo sumo, una **advertencia configurable**.
- Una constante o rango sin fuente (R0) no entra al código como valor fijo: se deja como parámetro del usuario.
- Si una fuente contradice la regla, gana la fuente y se anota en `docs/QUESTIONS.md`.

## 10. Cómo se mide el avance

No se mide por tiempo, por cantidad de código ni por número de pantallas.

| Indicador | Qué mide | Cómo se calcula | Meta para cerrar un hito |
|---|---|---|---|
| **I1 Comprensión** | Que se entiende lo que se construye | Respuestas aprobadas por el ingeniero de minas: 6 en G0 y 2 por hito después | 100 % aprobadas |
| **I2 Trazabilidad** | Que cada requisito tiene su cadena completa | % de requisitos (sección 5) con fuente → caso de referencia → prueba → pantalla | 100 % de los del hito; 100 % de la Fase 1 al cierre |
| **I3 Verificación numérica** | Que el motor da los números correctos | % de casos de referencia aplicables al hito reproducidos dentro de la tolerancia | 100 % |
| **I4 Calidad automática** | Que nada se rompe | Pruebas que pasan; fórmulas con al menos una prueba con valor externo; cobertura de líneas del motor | 100 % pruebas verdes; 100 % de fórmulas con prueba; cobertura ≥ 85 % |
| **I5 Rigor de fuentes** | Que no hay reglas al aire | Reglas o constantes mineras sin cita en el código; preguntas críticas abiertas | 0 y 0 |
| **I6 Tarea de punta a punta** | Que un ingeniero puede usarlo | Un ingeniero reproduce CR-04 desde la importación hasta el reporte, sin ayuda. Se registra: éxito (sí/no), bloqueos, errores y tiempo | La primera medición es la **línea base** (sin meta); después se acuerda una mejora |
| **I7 Paridad con referencia** | Que coincidimos con un programa de referencia | Con una demo oficial: % de indicadores de CR-04 (tiempos, carga por retardo, factor de carga, tonelaje, PPV) que coinciden con JKSimBlast o I-Blast dentro de ±2 %. Toda diferencia se explica: error propio o diferencia de modelo documentada | Informativo; solo para **comparar resultados**, sin copiar interfaz, textos ni constantes propietarias |

**Semáforo por hito**
- **Verde:** cumple I1 a I5 del hito.
- **Amarillo:** algún indicador abierto, con plan y responsable.
- **Rojo:** hay reglas sin fuente, pruebas circulares o código que nadie sabe explicar. No se avanza al hito siguiente.

## 11. Cómo usar la IA (y cómo no)

La IA acelera. También inventa fórmulas con aplomo y escribe pruebas que repiten el mismo error del código.

| Permitido | Obligatorio | Prohibido |
|---|---|---|
| Interfaz, importadores, código repetitivo, documentación, explicar código ajeno, proponer bibliografía candidata | Toda fórmula, constante o regla minera **cita una fuente humana verificable**. La IA no es fuente. | Aceptar una fórmula "porque la IA la recordaba" sin fuente |
| Generar pruebas **a partir de casos de referencia ya definidos** | El ejemplo numérico de la fuente se escribe **antes** que el código | Pruebas que calculan el valor esperado con la misma fórmula del código (prueba circular) |
| Revisar el código con IA | Poder **explicar** cada módulo que se entrega: qué hace y por qué | Entregar código que pasa las pruebas pero que nadie sabe explicar |

---

## 12. Backlog de la Fase 1

Formato: *Como [rol], quiero [algo], para [beneficio].* Los criterios son comprobables. Los R-xx son los requisitos de la sección 5; los RM-xx, las reglas de `05`; los CR-xx, los casos de `04`.

### E0 — Comprensión y base (G0)
| ID | Historia | Criterios de aceptación |
|---|---|---|
| H-001 | Como dev, quiero un repositorio con la estructura de la sección 14 para trabajar ordenado. | Un tercero clona, corre un comando y pasan las pruebas. Existen `RULES.md`, `QUESTIONS.md` y `DECISIONS.md`. |
| H-002 | Como dev, quiero resolver el ejercicio de comprensión para demostrar que entiendo el dominio. | Las 6 respuestas de la sección 18 están en `docs/QUESTIONS.md` y aprobadas por el ingeniero de minas. |
| H-003 | Como dev, quiero cerrar los spikes S1–S3 para fijar el stack. | Cada spike cumple su criterio de éxito (7.4) y hay nota de decisión D-01 a D-05. |

### E1 — Modelo de datos y guardado (G1)
| ID | Historia | Criterios de aceptación |
|---|---|---|
| H-101 | Como diseñador, quiero crear un proyecto con su sistema de coordenadas para que las posiciones sean inequívocas. | El proyecto exige un CRS (EPSG). Sin CRS no se puede importar. |
| H-102 | Como diseñador, quiero que mi trabajo se guarde solo y con historial para no perderlo. | Se recupera cualquiera de las últimas N versiones. Cerrar el navegador no pierde datos. |
| H-103 | Como administrador, quiero exportar e importar un proyecto para respaldarlo o compartirlo. | Exportar e importar no pierde ningún dato (prueba de ida y vuelta). El formato tiene versión y se migra. |
| H-104 | Como usuario, quiero elegir unidades de visualización (m/ft, mm/in) sin alterar los datos. | Los datos internos no cambian al cambiar la unidad; no hay unidades mezcladas en ninguna tabla (R-27). |

### E2 — Importación (G2; R-01, R-02, R-03)
| ID | Historia | Criterios de aceptación |
|---|---|---|
| H-201 | Como diseñador, quiero importar taladros desde CSV para trabajar con mi diseño real. | Detecta separador, decimal y codificación. Avisa si Norte y Este parecen intercambiados. Muestra vista previa en el mapa antes de aceptar. |
| H-202 | Como diseñador, quiero importar polígonos y topografía (DXF, GeoJSON, CSV) para diseñar sobre el tajo. | Los elementos caen en su posición correcta con el CRS del proyecto. Los formatos no soportados se rechazan con mensaje claro. |
| H-203 | Como diseñador, quiero mapear las columnas de un CSV desconocido. | Asistente de mapeo con vista previa; error claro con IDs duplicados y filas inválidas (lista de líneas). |

### E3 — Diseño de malla (G3; R-04 a R-08)
| ID | Historia | Criterios de aceptación |
|---|---|---|
| H-301 | Como diseñador, quiero definir la cara libre con una línea para medir burden y espaciamiento desde ella (RM-06, RM-07). | Sin cara libre no se genera la malla. Un banco con una sola cara libre genera **advertencia**, no bloqueo. |
| H-302 | Como diseñador, quiero generar mallas cuadrada, tres bolillos y triangular no equilátera dentro de un polígono. | Conteo de taladros y área coinciden con el cálculo a mano (CR-01, CR-04). |
| H-303 | Como diseñador, quiero agrupar taladros (precorte, buffer, producción) y asignarles configuraciones distintas seleccionándolos con un polígono. | Cada grupo guarda su carga y retardo. La selección por polígono incluye solo los taladros encerrados. |
| H-304 | Como diseñador, quiero taladros inclinados y sobreperforación configurable. | La sobreperforación es un parámetro del usuario, sin constante fija (RM-16). CR-03 (inclinado 20°) reproducido. |
| H-305 | Como diseñador, quiero ver burden teórico por varios modelos para elegir el operativo. | Se muestran Ash, Konya–Walter y Andersen con sus parámetros (`02`, secc. 1); marca burden fuera de ±10 %. Reproduce los valores de CR-01. |

### E4 — Explosivos y carga (G4; R-10 a R-15)
| ID | Historia | Criterios de aceptación |
|---|---|---|
| H-401 | Como administrador, quiero cargar el catálogo de un proveedor y de accesorios para usar sus productos reales. | Se importa un catálogo de ejemplo; cada producto conserva sus propiedades (densidad, VOD, resistencia al agua, combustión de la mecha, etc.), fuente y versión (`03`, secc. 3). |
| H-402 | Como diseñador, quiero cargar un taladro por tramos (explosivo, taco, cámara de aire, booster) para calcular su energía. | El taco sale de un catálogo de materiales; el agua no se ofrece en el módulo de superficie (RM-01). Kg por taladro y factor de carga reproducen CR-01, CR-02 y CR-03. La suma de tramos debe cerrar la longitud. |
| H-403 | Como diseñador, quiero modelar la cadena detonador → booster → granel. | Cada elemento tiene posición en el taladro; puede haber varios decks y boosters (RM-05). Advertencia si un tramo de granel no tiene booster. |
| H-404 | Como diseñador, quiero una advertencia de confinamiento insuficiente. | Configurable; usa la profundidad escalada de enterramiento, **separada** de la distancia escalada de vibración (RM-08). CR-02: SD = 1,459. |
| H-405 | Como diseñador, quiero ver el tonelaje, factor de carga, factor de potencia y factor de energía por taladro, grupo y voladura. | Nombres y unidades como en `02`, sección 0; valores de CR-01/CR-02 dentro de tolerancia. |

### E5 — Amarre, tiempos y simulación (G5; R-09, R-16 a R-18)
| ID | Historia | Criterios de aceptación |
|---|---|---|
| H-501 | Como diseñador, quiero definir el amarre y los retardos por separado. | Cambiar el amarre no modifica los retardos y viceversa. |
| H-502 | Como diseñador, quiero ver el tiempo de detonación de cada taladro y reproducir la secuencia. | En CR-05 (amarres 1 a 3) los tiempos coinciden al milisegundo con el cálculo a mano. |
| H-503 | Como diseñador, quiero ver el burden efectivo según la secuencia. | El burden efectivo de cada taladro se calcula, no se digita (RM-07). CR-05, amarres 1 y 5. Advertencia de cara libre no despejada. |
| H-504 | Como diseñador, quiero elegir el taladro de inicio y generar amarres típicos (en fila, en V, en escalón) que luego pueda editar. | Cada plantilla genera la topología esperada en CR-05 (amarres 1 y 2). Detecta ciclos y taladros sin conectar. |
| H-505 | Como diseñador, quiero ver mapa de isotiempos y avisos de orden invertido. | Los contornos corresponden a los tiempos calculados; el orden invertido respecto de la cara libre genera aviso. |

### E6 — Carga por retardo y PPV (G6; R-19 a R-21)
| ID | Historia | Criterios de aceptación |
|---|---|---|
| H-601 | Como diseñador, quiero la carga máxima por retardo (MIC) con una ventana configurable. | Coincide con el cálculo a mano en CR-05 (amarres 1 a 4); la ventana por defecto es 8 ms. |
| H-602 | Como diseñador, quiero el PPV en puntos de monitoreo con K y β configurables. | Coincide (±1 %) con el ejemplo a mano de CR-06 con el mismo K y β. Los límites de daño son una tabla configurable con fuente (RM-21). |
| H-603 | Como diseñador, quiero administrar los puntos de monitoreo y ver el MIC máximo admisible para un PPV dado. | El MIC admisible se obtiene invirtiendo la ley y es coherente con H-602. |

### E7 — Reporte y escenarios (G7; R-22 a R-24)
| ID | Historia | Criterios de aceptación |
|---|---|---|
| H-701 | Como diseñador, quiero comparar dos escenarios lado a lado. | Muestra diferencias en tiempos, carga por retardo, PPV y factor de carga. |
| H-702 | Como diseñador, quiero un reporte PDF. | Reproduce los números de CR-04 e indica modelos, parámetros y supuestos. |
| H-703 | Como diseñador, quiero deshacer y rehacer. | Al menos 50 pasos en edición de malla, carga y amarre; el estado guardado es consistente. |

### E8 — Usuarios e idiomas (G8; R-25, R-26)
| ID | Historia | Criterios de aceptación |
|---|---|---|
| H-801 | Como administrador, quiero crear usuarios con rol (diseñador, revisor). | El revisor no puede editar. Los cambios quedan en un registro. |
| H-802 | Como usuario, quiero usar la aplicación en español o inglés. | Sin textos sin traducir; unidades configurables. |

## 13. Definición de "hecho" (para cualquier historia)

1. Sus criterios de aceptación se cumplen y hay prueba automática de cada uno.
2. Las reglas mineras que toca están en `RULES.md` con fuente y estado.
3. Los casos de referencia aplicables se reproducen dentro de tolerancia.
4. La documentación afectada está actualizada.
5. Se revisó el código y se puede explicar cada módulo entregado.

---

## 14. Normas de trabajo

**Repositorio**
```
cronos/
  engine/        motor de cálculo (biblioteca pura, sin interfaz ni base de datos)
  web/           aplicación web
  server/        API, control de acceso y persistencia
  docs/
    decisiones/  registro de decisiones (una nota corta por decisión)
    RULES.md    registro de reglas mineras con fuente y estado
    QUESTIONS.md dudas para el ingeniero de minas
    QUESTIONS.md ejercicio de la sección 18
  tests/         pruebas y casos de referencia (datos de fuentes externas)
  README.md      cómo levantar el proyecto y correr las pruebas con un solo comando
```

**Flujo**
- Rama principal protegida; todo cambio entra por *pull request* con revisión.
- Commits pequeños y frecuentes, con mensajes que digan **qué** y **por qué**.
- Cada PR enlaza la historia (H-xxx) que resuelve y muestra qué criterios de aceptación cumple.
- La integración continua corre pruebas, análisis estático y cobertura en cada cambio. Un cambio con pruebas rojas no se une.

**Datos de prueba y confidencialidad**
- Solo datos anonimizados o inventados en el repositorio; las coordenadas reales se desplazan.
- Los casos de referencia se guardan con su fuente y su licencia de uso.
- No se suben credenciales ni claves; se usan variables de entorno.
- Las dependencias se revisan: licencia permisiva o compatible con distribución comercial.

**Propiedad intelectual**
- No se copian interfaz, textos ni constantes propietarias de JKSimBlast, I-Blast, SHOTPlus ni BlastLogic. Se estudian funciones y literatura pública.
- Se anota el origen de cada constante y de cada tabla semilla.

**Comunicación**
- Las dudas de dominio se escriben en `docs/QUESTIONS.md`; el ingeniero de minas (Nilson Garrido) responde en bloque. Las llamadas se hacen cuando un hito las necesita, no por calendario. **Mientras esperas una respuesta, avanza con el valor por defecto de la sección 17**, marcado como parámetro configurable.
- Las decisiones estructurales se registran en `docs/DECISIONS.md`.
- El avance se muestra con capturas o un video corto, además del código.
- El ingeniero de minas valida el dominio (estado R4) y prioriza; **no es un oráculo**: si duda, lo dice; si una fuente lo contradice, gana la fuente.

---

## 15. Decisiones de modelado

Lo que el producto debe hacer bien desde el modelo de datos, y lo que debe evitar. La columna "Regla" remite a `05`.

| Enfoque | Debe hacerse | Razón minera | Regla |
|---|---|---|---|
| Taco | Catálogo de materiales de taco; en superficie, material inerte y angular. El aire solo como cámara de aire intencional. No ofrecer agua en el módulo de superficie; el módulo de carbón subterráneo (posterior) podría admitir bolsas de agua. | El taco confina la energía; mal confinado hay proyección de rocas y onda aérea. Las bolsas de agua son una práctica reglamentada en minas de carbón subterráneas: no se descartan por decreto. | RM-01, RM-03, RM-04 |
| Carga de fondo | Cadena detonador → booster → granel, con varios decks y boosters posibles, cada elemento con posición | El detonador enciende al booster; el booster detona la carga a granel (ANFO o emulsión, poco sensibles) | RM-05 |
| Coordenadas | Coordenadas reales con CRS declarado; importación de topografía y polígonos | La mina diseña sobre su tajo | RM-22 |
| Burden | Cara libre definida por el usuario; burden efectivo según la secuencia | El burden es la distancia a la cara libre más cercana | RM-06, RM-07 |
| Carga | Grupos de taladros con carga propia, asignados con un polígono | Precorte, buffer y producción se cargan distinto | RM-18 |
| Geometría | Azimut, inclinación y sobreperforación como parámetros del taladro | Evita lomos en el piso; los rangos varían | RM-16, RM-17 |
| Amarre y tiempos | Separados | El amarre define la dirección del desplazamiento; los tiempos, la carga por retardo | — |
| Salidas | Desplazamiento del material, onda aérea y proyección de rocas (Fase 2) | Lo que la industria mide para proteger equipos, infraestructura y comunidades | — |
| Distancia escalada | Dos modelos, dos nombres, dos campos: profundidad escalada de enterramiento (confinamiento) y distancia escalada de vibración (PPV) | Son modelos distintos con raíces distintas (cúbica y cuadrada) | RM-08 |
| Resultados | Nunca son fuente de verdad; se recalculan desde el diseño | Evita datos inconsistentes tras editar | — |

Funcionalidades que conviene tener bien resueltas por experiencia en otros programas: perímetro y generación de malla, presets de configuración, reproductor de secuencia, puntos de estructuras para vibración, biblioteca de productos y resultados. La vista 3D es útil sobre todo con taladros inclinados.

## 16. Trampas conocidas

- **"Distancia escalada" son dos modelos distintos** (RM-08): profundidad escalada de enterramiento (confinamiento del taco) y distancia escalada de vibración (PPV). Van por separado.
- **Nombres frecuentemente mal escritos:** Holmberg–Persson (no "Holbert Pearson"); Kuz-Ram (Kuznetsov–Cunningham–Rammler); Langefors–Holmberg; TimeHEx. Busca la bibliografía con los nombres correctos.
- **Importación de datos reales:** separador `;`, decimal con punto, miles con coma (272,345.578), codificación ISO-8859-1 y **Norte y Este intercambiados** en algunos archivos. Valida siempre contra un mapa (`03`, secc. 5).
- **Errores en materiales de curso** (`R1`, sección 7): la densidad media de la hoja de diseño sale mal en diseños con carga superior, hay hojas con MPa donde son GPa y dos definiciones de "potencia relativa". No copies una fórmula de una hoja sin contrastarla.
- **Cifras de fabricantes** (por ejemplo, la precisión de PPV de I-Blast) no tienen auditoría independiente.
- **Constantes redondeadas:** 0,507 y 1275 son aproximaciones de π/4 y de 1273,24; usa las exactas y documenta la conversión.
- **Pruebas circulares:** si el valor esperado sale de la misma fórmula del código, la prueba no prueba nada.
- **Un mismo producto con datos distintos según la fuente** (densidades, potencia): el catálogo debe tener origen y versión (`03`, secc. 3).

---

## 17. Decisiones por defecto y preguntas abiertas

Para que **no frenes** por una duda de dominio: cada punto trae el **valor por defecto con el que avanzas** (siempre como parámetro configurable, nunca como constante fija) y quién lo resuelve. Cuando llegue la respuesta, se actualiza `RULES.md`.

| # | Duda | Defecto para avanzar | Estado |
|---|---|---|---|
| 1 | Umbral de deflagración / VOD mínimo (las fuentes dan 1 000 y 2 000 m/s) | Advertencia con umbral configurable, 2 000 m/s | R0 |
| 2 | Fórmula de presión de detonación (varias variantes y unidades) | PD = ρ·VOD²/4 (γ = 3), en GPa, γ configurable; PB = 0,5·PD | R1 |
| 3 | "Potencia relativa": definición y explosivo de referencia (ANFO: 900 a 969 kcal/kg según la fuente) | RWS = AWS/AWS_ANFO; ANFO de referencia configurable, defecto 900 kcal/kg; mostrar siempre cuál se usó | R0 |
| 4 | Densidad y SD en taladros con decks | Densidad por tramo; SD con la carga más cercana a la superficie (bajo el taco) | R0 |
| 5 | Longitud con sobreperforación | L = H + J (la variante L = H + 0,3·J es errata) | R2 |
| 6 | Regla de sobreperforación por defecto | J = 0,3·B; J = 0 permitido; rango de aviso 0,2–0,5·B | R0 |
| 7 | Relación diámetro–altura de banco | Solo aviso informativo; no bloquea | R0 |
| 8 | Burden efectivo | Modelo de `02`, sección 3 (distancia a la superficie libre más cercana al detonar) | R0 |
| 9 | Regla de taco por defecto | T = 0,7·B, con verificación por SD | R1 |
| 10 | Espaciamiento y umbral de rigidez | S = (H + 7B)/8 si H/B < 4; 1,4·B si ≥ 4; umbral de rigidez configurable | R1 |
| 11 | Nombres e unidades de indicadores | `loading_factor_kg_m3`, `powder_factor_kg_t`, `energy_factor_MJ_t` | Cerrado |
| 12 | Ventana de MIC | 8 ms, semiabierta; configurable | R1 |
| 13 | Distancia para PPV de un grupo | Distancia al taladro más cercano del grupo (conservador); alternativa: centroide | R0 |
| 14 | Límites de vibración | Tabla configurable; valores de curso (32/26/19 mm/s) hasta contrastar con la norma vigente | R1 |
| 15 | Precisión de detonadores por familia (electrónico 0,005–0,01 %; no eléctrico 1–5 %) | Parámetro del catálogo; sin Monte Carlo en F1 | R1 |
| 16 | Estado del taladro (seco / con agua) | Campo opcional con tres estados (seco, agua estática, agua dinámica) que filtra productos por resistencia al agua | Por decidir |
| 17 | Variantes de Kuz-Ram (índice n, RWS/RBS, rango de A) | No se implementa en F1. Antes de F2: fuente primaria y ejemplo (CR-07) | R0 |
| 18 | Formatos que usa la operación (DXF u otros) | CSV, DXF y GeoJSON primero; los demás según validación | Por validar |
| 19 | Tablas de retardo ms/m por roca y equipo | Una tabla configurable, sin valores fijos en el código | R0 |
| 20 | Umbrales de SDOB (< 0,4 severo; > 1,2 sin proyección, fuente secundaria) | Advertencia configurable; confirmar con fuente primaria | R0 |
| 21 | Tiempo mínimo de alivio Δ (burden efectivo) | 0 ms, parámetro | R0 |
| 22 | Origen de los catálogos de explosivos y accesorios | Fichas técnicas del fabricante, con versión y URL en cada producto | R1 |

**Preguntas críticas abiertas al iniciar:** los puntos 4, 8, 13 y 16 (y la confirmación de CR-05). Las demás no bloquean.

---

## 18. Ejercicio de comprensión (hito G0)

Responde por escrito en `docs/QUESTIONS.md`. El ingeniero de minas lo revisa contigo.

1. Explica por qué el taco confina y qué pasa si el confinamiento es insuficiente. Investiga si existe algún caso en que el agua se use como taco y anota la fuente.
2. Dibuja la cadena detonador → booster → granel y explica qué pasaría si faltara el booster.
3. Resuelve a mano **CR-01** (Mina Esperanto): burden con Ash y con Konya–Walter, y compáralo con tu código.
4. Explica qué es una cara libre, por qué un banco típico tiene dos y por qué un túnel con una sola funciona.
5. Diferencia amarre y retardo. Dibuja dos amarres de la misma malla y di hacia dónde se movería el material.
6. Diferencia PPV, frecuencia y onda aérea, y explica por qué "profundidad escalada de enterramiento" y "distancia escalada de vibración" no son lo mismo.

## 19. Después de la Fase 1

| Fase | Contenido técnico | Primeros pasos cuando llegue |
|---|---|---|
| F2 Análisis avanzado | Distribución de energía y contornos de daño (Holmberg–Persson), fragmentación (Kuz-Ram y corrección de finos), onda aérea, desplazamiento del material, proyección de rocas | Especificar cada modelo en `02` con fuente y caso de referencia (CR-07) antes de programar; no reproducir constantes propietarias |
| F3 Subterráneo | Frentes: perfil, arranque con alivio vacío, ayudas, contorno, zapateras, método sueco. Anillos: abanicos por ángulo o espaciamiento de pie, slot, secuencia | `Referencia/R4`; ampliar el modelo de datos con perfil de excavación y taladros de alivio |
| F4 Datos de campo | Importar perforación (MWD, as-drilled), sismógrafos, nube de puntos y dron; calibrar K y β; comparar diseño vs. real | Definir formatos con la operación; separar diseño y realidad en el modelo (`03`, principio 2) |
| F5 Distribución | Documentación de usuario, empaquetado, lista de verificación | — |

## 20. Glosario mínimo

Glosario completo de 105 términos ES/EN en `Referencia/R1`, sección 2. Lo esencial:

| Término | Inglés | Qué es |
|---|---|---|
| Banco | bench | Escalón de roca que se vuela; altura H |
| Taladro | blast hole | Perforación que se carga con explosivo; Ø = diámetro |
| Collar | collar | Boca del taladro, en la superficie |
| Burden (piedra) | burden | Distancia del taladro a la cara libre más cercana |
| Espaciamiento | spacing | Distancia entre taladros de una misma fila |
| Sobreperforación | subdrilling | Longitud perforada bajo el piso del banco para romper bien el pie |
| Taco | stemming | Material inerte sobre el explosivo que confina la energía |
| Cara libre | free face | Superficie de roca expuesta hacia la cual se desplaza la roca rota |
| Deck | deck | Tramo de carga separado por taco o aire |
| Cámara de aire | air deck | Tramo sin explosivo dentro de la columna |
| Booster (cebo) | booster / primer | Carga potente que inicia el explosivo a granel |
| Detonador | detonator | Elemento que inicia la cadena; con retardo interno |
| Retardo | delay | Tiempo (ms) entre el inicio y la detonación |
| Amarre | tie-in | Conexión entre taladros: define el orden |
| ANFO | ANFO | Nitrato de amonio con combustible; poco resistente al agua |
| Emulsión | emulsion | Explosivo resistente al agua; a granel o encartuchado |
| VOD | VOD | Velocidad de detonación (m/s) |
| Factor de carga | loading / powder factor | Explosivo por volumen (kg/m³) o por tonelada (kg/t) |
| MIC | max. instantaneous charge | Carga máxima que detona en una ventana de tiempo (≈ 8 ms) |
| PPV | peak particle velocity | Velocidad pico de partícula (mm/s): mide vibración |
| Precorte / buffer / producción | presplit / buffer / production | Grupos de taladros de contorno, amortiguación y producción |
| Fragmentación | fragmentation | Distribución de tamaños de la roca rota (X50, X80) |
| UCS | UCS | Resistencia a la compresión de la roca (MPa) |
