# 05 — Reglas mineras y su verificación

Cada regla de dominio que el producto necesita, con su **estado** y con lo que dicen las fuentes. Es el semillero del registro `RULES.md` del repositorio.

Regla del proyecto: **ninguna afirmación técnica es verdadera por haberse dicho**, venga de un ingeniero, de un curso, de una hoja de cálculo o de una IA. Toda regla nace como hipótesis y sube de estado (guía, sección 9). Donde una fuente contradice una regla, gana la fuente y se registra la diferencia.

## Estados de verificación

| Marca | Significado |
|---|---|
| ✔ | Verificado con fuente externa |
| ◐ | Verificado **con matiz**: es cierto en el caso típico, pero no como regla absoluta |
| ○ | Coincide con el material de curso o con la práctica general; **no** se buscó fuente externa todavía |
| ? | Por validar: falta fuente o depende de la mina |
| ⚙ | Decisión de producto; no es un hecho verificable |

Las fuentes marcadas *(secundaria)* son blogs, proveedores o informes ambientales: sirven de pista, no de prueba. Hay que confirmarlas con un libro o paper (por ejemplo, el ISEE Blasters' Handbook). Los identificadores RM-24 y RM-25 (decisiones de producto) no se listan aquí.

## Reglas y su estado

| # | Regla / afirmación técnica | Estado | Qué dicen las fuentes | Qué implica para el software |
|---|---|---|---|---|
| RM-01 | El agua nunca se usa como taco | ◐ | En superficie el taco es material inerte, idealmente roca triturada angular. Pero las **bolsas de agua** son una práctica reglamentada en minas subterráneas de carbón (30 CFR 75, subparte N); reducen polvo y gases, aunque aprovechan peor la energía que el taco de suelo. | El taco es un **catálogo de materiales con propiedades**, no una lista fija. El módulo de superficie no ofrece agua; el de subterráneo de carbón (fuera de la Fase 1) podría. No programar "nunca" como regla dura. |
| RM-02 | El agua es el enemigo del explosivo: exige uno resistente al agua y encarece | ✔ | La emulsión encartuchada se usa tradicionalmente para taladros con agua, y la emulsión bombeable desplaza el agua y llena el taladro. | El explosivo lleva la propiedad **resistencia al agua**. Falta decidir con el ingeniero de minas si el taladro tendrá un estado "seco / con agua" (dato nuevo). |
| RM-03 | El taco confina; sin confinamiento hay proyección de rocas | ✔ | Con poca profundidad escalada de enterramiento hay proyección y onda aérea severas; con más taco, menos eyección. Ver RM-08 para los rangos. | Advertencia de confinamiento insuficiente en la Fase 1; cálculo completo de proyección en la Fase 2. |
| RM-04 | El material del taco debe ser anguloso para que trabe | ✔ | Roca triturada angular de 6 a 14 mm es lo más eficaz en taladros de 50 a 130 mm. Longitud típica: ≈ 0,7 × burden con roca triturada; 1,0 a 1,2 × burden con otros materiales. | Propiedades del material de taco: angularidad y granulometría recomendada. Valores típicos como **sugerencia**, no como límite. |
| RM-05 | Cadena: detonador → booster → carga a granel (ANFO o emulsión, poco sensibles); puede haber varios decks y varios boosters | ○ | Coincide con el curso y con la práctica general (Referencia/R1, sección de explosivos). | Modelo de taladro con elementos posicionados (detonador, booster, decks). Buscar fuente externa en la pasada 2. |
| RM-06 | Un banco tiene mínimo 2 caras libres; con menos se genera vibración en vez de fragmentar | ◐ | El burden es la distancia a la cara libre más cercana; un banco típico tiene dos (superficie y cara del banco). Pero la exigencia física es **al menos una** cara libre a distancia de burden; los túneles trabajan con una y la crean con el arranque. | Definir la cara libre es obligatorio. "Mínimo 2" es el caso típico de banco: **advertencia**, no bloqueo. |
| RM-07 | El burden se mide desde la cara libre; la cara libre define orden y tiempos; con filas sucesivas la cara retrocede | ✔ | Definición de burden verificada. JKSimBlast implementa el "burden relief" (alivio del burden) según la secuencia. | El **burden efectivo** de cada taladro depende de la secuencia de detonación. Se calcula, no se tipea. |
| RM-08 | La "distancia escalada" sirve tanto para el confinamiento del taco como para predecir PPV | ◐ | Son **dos modelos distintos**. (a) *Profundidad escalada de enterramiento (SDOB)*: confinamiento, con raíz cúbica (m/kg^(1/3)); proyección y onda aérea severas por debajo de ≈ 0,4 y ausentes por encima de ≈ 1,2 *(secundaria)*. (b) *Distancia escalada de vibración*: distancia dividida por la raíz de la carga por retardo; PPV = K·(distancia escalada)^(−β) [GENERAL: Devine/USBM]. | Implementar por separado, con nombres distintos. Confirmar los rangos de SDOB con una fuente primaria. |
| RM-09 | Holmberg–Persson mide el daño en campo cercano | ✔ | JKSimBlast lo usa para contornos de daño (Referencia/R3, ficha F14). | Modelo de la Fase 2. |
| RM-10 | Kuz-Ram usa potencia del explosivo, factor de carga y parámetros de roca (índice de volabilidad de Lilly) | ✔ | El índice de Lilly (1986) se incorporó al modelo de Cunningham (1983); el factor de roca A vale típicamente entre 7 y 13. | Modelo de la Fase 2. Entradas: potencia, factor de carga, factor de roca. |
| RM-11 | Corrección de finos del JKMRC | ✔ ◐ | Existe (crush zone + Kuz-Ram), pero las constantes del programa no son públicas (Referencia/R3). | Fase 2; usar la literatura abierta, no reproducir constantes propietarias. |
| RM-12 | Método sueco (Langefors–Holmberg) para frentes | ✔ | Holmberg publicó el modelo completo en 1982. | Módulo de frentes (fase posterior). |
| RM-13 | Subterráneo: se detona un taladro con mucha energía para crear la segunda cara libre | ◐ | El arranque usa **taladros de alivio vacíos** (a veces varios, de gran diámetro) y taladros cargados que disparan en secuencia hacia ellos (burn cut). | Módulo de frentes: modelar el alivio vacío y los cargados; validar que el diámetro del alivio sea mayor que el de carga. |
| RM-14 | En subterráneo se trabaja encartuchado, no a granel | ◐ | Hay cartuchos y **también emulsión bombeable a granel** (veta angosta, frentes mecanizados). | El módulo subterráneo debe soportar ambos. |
| RM-15 | Mecha de seguridad: 160 ± 10 s/m, solo subterránea, por chispeo | ◐ | La velocidad varía por producto; el dato de la ficha de Famesa no se verificó. Se usa en minería, canteras y construcción; no en minas con gas. | Velocidad de combustión como **dato de catálogo por producto**. Sin regla dura de "solo subterránea". |
| RM-16 | Sobreperforación desde 0,5 m hasta más de 1,5 m; puede ser 0 | ? | El material del curso trae tres o más reglas incompatibles (Referencia/R1, sección 7). | Parámetro del usuario con rangos sugeridos por fuente; no constante. |
| RM-17 | Taladros verticales o inclinados; el burden en el collar y en el fondo difiere | ○ | Práctica general y curso. | Azimut e inclinación como atributos del taladro. |
| RM-18 | Precorte: taladros delgados, poca carga, salen antes y definen el talud; buffer de 1 a 2 filas; producción | ○ | Coincide con el curso; el orden exacto ("antes" o "segundos antes") es una decisión de diseño. | Grupos de taladros con carga y retardo propios. |
| RM-19 | El P80 objetivo (por ejemplo, 3,6 in) lo fija cada operación | ⚙ | Es un ejemplo de una operación; cada mina fija el suyo. | Parámetro de la operación, no constante. |
| RM-20 | El amarre decide hacia dónde se mueve el material; una pala eléctrica prefiere una pila alta y un cargador frontal, una más estirada | ? | Conocimiento operativo; no se buscó fuente. | Fase 2 (desplazamiento del material). Buscar fuente antes de modelar. |
| RM-21 | Vibración: se miden PPV y frecuencia; el daño depende de ambas | ○ | Coincide con la práctica; los límites (curso: 32, 26 y 19 mm/s según la distancia) deben contrastarse con la norma peruana vigente. | El criterio de daño es una **tabla configurable**, no un número fijo. |
| RM-22 | DXF es la versión de código abierto | ◐ | DXF es un formato de intercambio de Autodesk con especificación publicada y muy soportado; no es open source. Las minas también usan formatos propios de sus programas de planificación. | Validar con la mina qué formatos usa realmente antes de fijar los importadores. |
| RM-23 | JKSimBlast usa modelos matemáticos; I-Blast, modelos físicos | ◐ | Ambos son matemáticos. JKSimBlast usa modelos empíricos simples; I-Blast afirma modelos basados en física (superposición de ondas), sin auditoría independiente. | Profundizar en la pasada 2; no repetir el marketing de ningún fabricante. |

## Fuentes consultadas

- Bolsas de agua como taco: [OSTI, plastic water stemming cartridges](https://www.osti.gov/etdeweb/biblio/686943) · [30 CFR 75, subparte N](https://www.ecfr.gov/current/title-30/chapter-I/subchapter-O/part-75/subpart-N) · [Wiley, water-soil composite stemming](https://onlinelibrary.wiley.com/doi/10.1155/2018/3523509)
- Taco y mejores prácticas: [SAIMM, Stemming and best practice](https://www.saimm.co.za/Journal/v121n08p415.pdf) · [Pit & Quarry, blasting design standards](https://www.pitandquarry.com/blasting-mechanics-revisited-blasting-design-standards/)
- Caras libres y burden: [PSU MNG 230, patrones de banco](https://courses.ems.psu.edu/mng230/node/872) · [NPS, Blast design](https://www.nps.gov/parkhistory/online_books/npsg/explosives/Chapter8.pdf)
- Emulsión a granel en subterráneo: [Orica, bulk emulsions](https://www.orica.com/resource-hub/insight/2025/orica-bulk-systems-understanding-the-basics) · [SciELO, pumpable emulsions in narrow-reef stoping](https://scielo.org.za/scielo.php?script=sci_arttext&pid=S2225-62532015000600008)
- Profundidad escalada de enterramiento *(secundaria)*: [ERG Industrial](https://ergindustrial.com/scaled-depth-of-burial-explained/) · [Blast It Global (EPA WA)](https://www.epa.wa.gov.au/sites/default/files/PER_documentation2/3-3.%20Blasting%20Assessment%20(Blast%20It%20Global).pdf)
- Kuz-Ram: [The Kuz-Ram fragmentation model – 20 years on](https://www.smctesting.com/documents/mine-to-mill/The%20kuz%20ram%20fragmentation%20model%2020%20years%20on.pdf)
- Mecha de seguridad: [Safety fuse (Wikipedia)](https://en.wikipedia.org/wiki/Safety_fuse) · [Famesa, mecha de seguridad blanca](https://www.famesaexplosivos.com/wp-content/uploads/2025/01/FT-MECHA-DE-SEGURIDAD-BLANCA.pdf)
- Arranque de frentes: [ITA-AITES, burn cut](https://tunnel.ita-aites.org/en/component/seoglossary/1-main-glossary/78-burn-cut) · [PSU MNG 230, patrones de galería](https://courses.ems.psu.edu/mng230/node/871)

## Cómo se usa este documento

- Una regla con marca ○, ? o ⚙ **no** se programa como bloqueo para el usuario; a lo sumo, como advertencia configurable.
- Antes de cerrar un hito, las reglas que lo tocan pasan a ✔ o ◐ con una fuente citada, o se dejan explícitamente como configurables.
- Si encuentras una fuente que contradiga una regla de esta tabla, anótalo aquí (y en `docs/QUESTIONS.md`) y se resuelve con el ingeniero de minas; gana la fuente.
