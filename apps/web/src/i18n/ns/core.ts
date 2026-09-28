/**
 * Textos de la interfaz (G8, D-11): español (claves) e inglés. `satisfies` exige las mismas
 * claves en ambos idiomas: si falta o sobra una, no compila.
 *
 * Textos que genera el núcleo (revisión del diseño, importación, proyecto, ejemplos) y el engine.
 * El español reproduce exactamente el texto del núcleo: `coreText.ts` reconoce los mensajes de
 * error del núcleo con estas mismas plantillas.
 */
export const es = {
  'common.error': 'Error',

  // Revisión del diseño (packages/core/src/diagnostics, timing/timingChecks.ts)
  'check.noFreeFace.title': 'Sin cara libre definida',
  'check.noFreeFace.detail':
    'Solo queda la superficie del banco como cara libre: voladura confinada, más vibración y peor fragmentación (RM-06). Marca la cara libre en el perímetro (herramienta C).',
  'check.lowStiffness.title': 'Rigidez del burden baja',
  'check.lowStiffness.detail':
    'H/B ≤ {value} (tabla de Konya: mala distribución de energía, más proyección y vibración).',
  'check.subdrillRange.title': 'Sobreperforación fuera de rango',
  'check.subdrillRange.detail': 'J/B fuera de {min}–{max} (rango de las fuentes; configurable).',
  'check.benchDiameter.title': 'Diámetro poco usual para la altura de banco',
  'check.benchDiameter.detail': 'H/Ø fuera de {min}–{max} (regla informativa, R0).',
  'check.unloaded.title': 'Taladros sin carga',
  'check.unloaded.detail': 'No tienen explosivo asignado.',
  'check.overcharged.title': 'Columna más larga que el taladro',
  'check.overcharged.detail': 'La suma de decks supera la longitud del taladro.',
  'check.noStemming.title': 'Sin taco',
  'check.noStemming.detail':
    'Explosivo hasta la boca: alto riesgo de proyecciones y sobrepresión (P-04). Confirma que es intencional (alivio o prueba).',
  'check.shortStemming.title': 'Taco corto',
  'check.shortStemming.detail':
    'Taco menor que {ratio} × burden (sin malla: {diameters} × Ø); riesgo de proyecciones (P-04).',
  'check.longStemming.title': 'Taco largo',
  'check.longStemming.detail': 'Taco mayor que {ratio} × burden: roca sin fragmentar en el collar.',
  'check.stemmingDiameter.title': 'Taco fuera del rango en diámetros',
  'check.stemmingDiameter.detail':
    'Taco fuera de {min}–{max} × Ø (regla de las fuentes; configurable).',
  'check.noDetonator.title': 'Cargados sin detonador',
  'check.noDetonator.detail': 'Tienen explosivo pero ningún iniciador en el taladro.',
  'check.notInitiated.title': 'Cargados sin iniciar',
  'check.notInitiated.detail': 'No les llega la señal: falta amarre o punto de inicio.',
  'check.coincident.title': 'Vecinos que disparan juntos',
  'check.coincident.detail':
    'Taladros a menos de {factor} × el espaciamiento que detonan dentro de {window}: pierden alivio (mala fragmentación y más vibración).',
  'check.duplicate.title': 'Bocas duplicadas',
  'check.duplicate.detail': 'Taladros a menos de {distance} m entre sí.',
  'check.outside.title': 'Fuera de los perímetros',
  'check.outside.detail': 'Taladros que no caen dentro de ningún perímetro.',
  'check.openColumn.title': 'Columna que no cierra',
  'check.openColumn.detail':
    'La suma de tramos es menor que la longitud del taladro: completa con taco o aire (cierre de tramos, R3).',
  'check.noBooster.title': 'Agente de voladura sin booster',
  'check.noBooster.detail':
    'Una carga (tramo continuo de explosivo) con agente de voladura no tiene booster dentro: puede no detonar (tiro fallado) o deflagrar (RM-05).',
  'check.waterIncompatible.title': 'Explosivo no apto para el agua del taladro',
  'check.waterIncompatible.detail':
    'Agua estática: sin ANFO (emulsión o ANFO pesado con alta emulsión, o ANFO con funda y bombeo). Agua dinámica: solo emulsión (P-09).',
  'check.belowCriticalDiameter.title': 'Diámetro de carga menor que el crítico',
  'check.belowCriticalDiameter.detail':
    'Por debajo del diámetro crítico el explosivo no detona de forma estable (CK-09).',
  'check.sdobSevere.title': 'Confinamiento insuficiente (SDOB severa)',
  'check.sdobSevere.detail':
    'Profundidad escalada de enterramiento < {value} m/kg^⅓: proyección y onda aérea severas (DF-20, fuente secundaria; configurable).',
  'check.sdobLow.title': 'Confinamiento bajo (SDOB)',
  'check.sdobLow.detail':
    'Profundidad escalada de enterramiento < {value} m/kg^⅓: posible proyección desde el collar (DF-20; configurable).',
  'check.tieCycle.title': 'Amarre con ciclos',
  'check.tieCycle.detail':
    'Hay conexiones que forman un circuito cerrado: revisa el sentido del amarre (H-504).',
  'check.unrelievedBurden.title': 'Cara libre no despejada',
  'check.unrelievedBurden.detail':
    'Burden efectivo ≥ {value} × nominal al detonar: la cara hacia la que sale todavía no se abrió (RM-07, CR-05).',
  'check.invertedOrder.title': 'Orden invertido respecto de la cara libre',
  'check.invertedOrder.detail':
    'Detonan antes que un vecino que está más cerca de la cara libre: salen contra roca sin alivio (CK-10).',
  'check.closeRelief.title': 'Alivio muy cercano',
  'check.closeRelief.detail':
    'Burden efectivo < {value} × nominal: el alivio viene de un taladro muy próximo.',
  'check.delayGuide.title': 'Retardo fuera de la guía por metro',
  'check.delayGuide.detail':
    'Entre taladros {holeMin}–{holeMax} ms/m de espaciamiento y entre filas {rowMin}–{rowMax} ms/m de burden (guía de diseño, P-11; configurable).',

  // Avisos de importación (ImportWarning)
  'import.warn.noZ': '{count} taladros sin cota: se usó la superficie del banco.',
  'import.warn.zeroZ': '{count} taladros con cota 0: revisa si falta la cota.',
  'import.warn.swapXYUtm':
    'Este y Norte parecen intercambiados: los valores caen fuera del rango UTM del proyecto y dentro si se intercambian.',
  'import.warn.swapXYDigits':
    'Este y Norte parecen intercambiados: el Este tiene 7 cifras y el Norte 6.',
  'import.warn.outOfCrs':
    'Las coordenadas caen fuera del rango UTM del EPSG {epsg}: revisa si el archivo usa otro CRS o coordenadas locales.',
  'import.warn.crsMismatch':
    'El archivo declara EPSG {fileEpsg} y el proyecto usa EPSG {epsg}; Cronos no reproyecta.',
  'import.warn.outlier': '{count} taladros a más de {limit} m del resto: {list}.',

  // Errores de importación (se reconocen por el mensaje del núcleo; ver coreText.ts)
  'import.err.line': 'Línea {line}: {message}',
  'import.err.point': 'Punto {point}: {message}',
  'import.err.nonNumericXY': 'X o Y de boca no numéricos',
  'import.err.invalidGeometry': 'Geometría inválida (longitud negativa o taladro horizontal)',
  'import.err.duplicateId': 'ID duplicado «{label}» (ya en la línea {firstLine})',
  'import.err.duplicateIdExisting': 'ID duplicado «{label}» (ya existe en la voladura)',
  'import.err.missingExplosiveFields': 'Faltan nombre, densidad, VOD o energía válidos',
  'import.err.notJson': 'El archivo no es JSON válido.',
  'import.err.notGeoJson': 'No es un GeoJSON (Feature o FeatureCollection) válido.',
  'import.err.lonLat':
    'El GeoJSON parece estar en longitud/latitud (WGS 84). Cronos no reproyecta: expórtalo en el CRS del proyecto (coordenadas UTM en metros).',
  'import.err.noEastNorth': 'No se encontraron las columnas Este y Norte.',
  'import.err.nonNumericEN': 'Este o Norte no numéricos',
  'import.err.fewVertices': 'Polígono «{id}» con menos de 3 vértices: ignorado',
  'import.dxf.flatLines':
    '{count} líneas sin diferencia de cota: se tomaron como bocas de taladros verticales.',
  'import.dxf.noZ': '{count} bocas sin cota: se ubicaron en la superficie del banco ({top} m).',
  'import.dxf.openPolyline': 'Polilínea abierta en la capa "{layer}" ignorada como perímetro.',

  // Archivo de proyecto (parseProjectFile)
  'project.notProject': 'El archivo no contiene un proyecto.',
  'project.schemaTooNew':
    'El archivo usa el esquema v{version}, más nuevo que el soportado (v{supported}).',
  'project.invalid': 'Proyecto inválido en "{path}": {message}',

  // Proyectos de ejemplo (packages/core/src/examples/examples.ts)
  'example.production.name': 'Producción estándar',
  'example.production.description':
    '≈250 taladros Ø 229 mm · ANFO pesado de fondo + ANFO · salida en V desde la cara libre',
  'example.wet.name': 'Frente con agua',
  'example.wet.description':
    'Filas del fondo con agua cargadas con emulsión · resto con ANFO · amarre línea a línea',
  'example.electronic.name': 'Cerca de infraestructura',
  'example.electronic.description':
    'Electrónicos taladro a taladro (sin coincidencias) · cámara de aire · planta a 180 m',
  'example.inclined.name': 'Taladros inclinados',
  'example.inclined.description':
    'Inclinados 15° hacia la cara libre · ideal para la vista 3D (tecla 3)',
  'example.problems.name': 'Problemas típicos',
  'example.problems.description':
    'Taco corto, sin carga, sin detonador, fila sin amarre, retardos que coinciden, duplicados',

  // Engine (packages/engine/src/text.ts)
  'engine.undo.addHole': 'Agregar taladro',
  'engine.undo.addNamed': 'Agregar {name}',
  'engine.undo.deleteNamed': 'Borrar {name}',
  'engine.undo.drawNamed': 'Dibujar {name}',
  'engine.undo.moveHole': 'Mover taladro',
  'engine.undo.moveHoles': 'Mover {n} taladros',
  'engine.undo.deleteConnection': 'Borrar conexión',
  'engine.undo.connectHoles': 'Conectar taladros',
  'engine.undo.initiationPoint': 'Punto de inicio',
  'engine.undo.freeFace': 'Cara libre',
  'engine.map.compass': 'Brújula',
  'engine.map.west': 'O',
  'engine.map.rulerCorner': 'Coordenadas del proyecto: Este (arriba) y Norte (izquierda)',
  'engine.map.grid': 'grilla',
  'engine.map.decimal': ',',
};

export const en = {
  'common.error': 'Error',

  'check.noFreeFace.title': 'No free face defined',
  'check.noFreeFace.detail':
    'Only the bench top is left as a free face: confined blast, more vibration and poorer fragmentation (RM-06). Mark the free face on the boundary (tool C).',
  'check.lowStiffness.title': 'Low burden stiffness',
  'check.lowStiffness.detail':
    'H/B ≤ {value} (Konya table: poor energy distribution, more flyrock and vibration).',
  'check.subdrillRange.title': 'Subdrill out of range',
  'check.subdrillRange.detail': 'J/B outside {min}–{max} (range from the sources; configurable).',
  'check.benchDiameter.title': 'Unusual diameter for the bench height',
  'check.benchDiameter.detail': 'H/Ø outside {min}–{max} (informative rule, R0).',
  'check.unloaded.title': 'Unloaded holes',
  'check.unloaded.detail': 'No explosive assigned.',
  'check.overcharged.title': 'Column longer than the hole',
  'check.overcharged.detail': 'The sum of the decks exceeds the hole length.',
  'check.noStemming.title': 'No stemming',
  'check.noStemming.detail':
    'Explosive up to the collar: high risk of flyrock and airblast (P-04). Confirm it is intentional (relief or test hole).',
  'check.shortStemming.title': 'Short stemming',
  'check.shortStemming.detail':
    'Stemming shorter than {ratio} × burden (no pattern: {diameters} × Ø); flyrock risk (P-04).',
  'check.longStemming.title': 'Long stemming',
  'check.longStemming.detail':
    'Stemming longer than {ratio} × burden: unbroken rock in the collar zone.',
  'check.stemmingDiameter.title': 'Stemming out of range in hole diameters',
  'check.stemmingDiameter.detail':
    'Stemming outside {min}–{max} × Ø (rule from the sources; configurable).',
  'check.noDetonator.title': 'Loaded holes without detonator',
  'check.noDetonator.detail': 'They have explosive but no initiator in the hole.',
  'check.notInitiated.title': 'Loaded holes not initiated',
  'check.notInitiated.detail':
    'The signal does not reach them: missing tie-up or initiation point.',
  'check.coincident.title': 'Neighbours firing together',
  'check.coincident.detail':
    'Holes closer than {factor} × the spacing that fire within {window}: they lose relief (poor fragmentation and more vibration).',
  'check.duplicate.title': 'Duplicate collars',
  'check.duplicate.detail': 'Holes less than {distance} m apart.',
  'check.outside.title': 'Outside the boundaries',
  'check.outside.detail': 'Holes that do not fall inside any boundary.',
  'check.openColumn.title': 'Column does not close',
  'check.openColumn.detail':
    'The sum of the decks is shorter than the hole length: fill with stemming or air (deck closure, R3).',
  'check.noBooster.title': 'Blasting agent without booster',
  'check.noBooster.detail':
    'A charge (continuous explosive column) with a blasting agent has no booster inside: it may fail to detonate (misfire) or deflagrate (RM-05).',
  'check.waterIncompatible.title': 'Explosive not suitable for the water in the hole',
  'check.waterIncompatible.detail':
    'Static water: no ANFO (emulsion or heavy ANFO with high emulsion content, or lined and dewatered ANFO). Dynamic water: emulsion only (P-09).',
  'check.belowCriticalDiameter.title': 'Charge diameter below critical',
  'check.belowCriticalDiameter.detail':
    'Below the critical diameter the explosive does not detonate steadily (CK-09).',
  'check.sdobSevere.title': 'Insufficient confinement (severe SDOB)',
  'check.sdobSevere.detail':
    'Scaled depth of burial < {value} m/kg^⅓: severe flyrock and airblast (DF-20, secondary source; configurable).',
  'check.sdobLow.title': 'Low confinement (SDOB)',
  'check.sdobLow.detail':
    'Scaled depth of burial < {value} m/kg^⅓: possible flyrock from the collar (DF-20; configurable).',
  'check.tieCycle.title': 'Tie-up with loops',
  'check.tieCycle.detail':
    'Some connections form a closed loop: check the direction of the tie-up (H-504).',
  'check.unrelievedBurden.title': 'Free face not cleared',
  'check.unrelievedBurden.detail':
    'Effective burden ≥ {value} × nominal at firing: the face it moves toward has not opened yet (RM-07, CR-05).',
  'check.invertedOrder.title': 'Firing order reversed relative to the free face',
  'check.invertedOrder.detail':
    'They fire before a neighbour closer to the free face: they break against unrelieved rock (CK-10).',
  'check.closeRelief.title': 'Relief too close',
  'check.closeRelief.detail':
    'Effective burden < {value} × nominal: relief comes from a very close hole.',
  'check.delayGuide.title': 'Delay outside the per-metre guide',
  'check.delayGuide.detail':
    'Hole-to-hole {holeMin}–{holeMax} ms/m of spacing and row-to-row {rowMin}–{rowMax} ms/m of burden (design guide, P-11; configurable).',

  'import.warn.noZ': '{count} holes without collar elevation: the bench top was used.',
  'import.warn.zeroZ': '{count} holes with elevation 0: check whether the elevation is missing.',
  'import.warn.swapXYUtm':
    'Easting and Northing seem swapped: the values fall outside the project UTM range and inside it when swapped.',
  'import.warn.swapXYDigits':
    'Easting and Northing seem swapped: the Easting has 7 digits and the Northing 6.',
  'import.warn.outOfCrs':
    'The coordinates fall outside the UTM range of EPSG {epsg}: check whether the file uses another CRS or local coordinates.',
  'import.warn.crsMismatch':
    'The file declares EPSG {fileEpsg} and the project uses EPSG {epsg}; Cronos does not reproject.',
  'import.warn.outlier': '{count} holes more than {limit} m from the rest: {list}.',

  'import.err.line': 'Line {line}: {message}',
  'import.err.point': 'Point {point}: {message}',
  'import.err.nonNumericXY': 'Non-numeric collar X or Y',
  'import.err.invalidGeometry': 'Invalid geometry (negative length or horizontal hole)',
  'import.err.duplicateId': 'Duplicate ID «{label}» (already on line {firstLine})',
  'import.err.duplicateIdExisting': 'Duplicate ID «{label}» (already in the blast)',
  'import.err.missingExplosiveFields': 'Missing valid name, density, VOD or energy',
  'import.err.notJson': 'The file is not valid JSON.',
  'import.err.notGeoJson': 'Not a valid GeoJSON (Feature or FeatureCollection).',
  'import.err.lonLat':
    'The GeoJSON seems to be in longitude/latitude (WGS 84). Cronos does not reproject: export it in the project CRS (UTM coordinates in metres).',
  'import.err.noEastNorth': 'The Easting and Northing columns were not found.',
  'import.err.nonNumericEN': 'Non-numeric Easting or Northing',
  'import.err.fewVertices': 'Polygon «{id}» with fewer than 3 vertices: ignored',
  'import.dxf.flatLines':
    '{count} lines with no elevation difference: taken as collars of vertical holes.',
  'import.dxf.noZ': '{count} collars without elevation: placed on the bench top ({top} m).',
  'import.dxf.openPolyline': 'Open polyline on layer "{layer}" ignored as a boundary.',

  'project.notProject': 'The file does not contain a project.',
  'project.schemaTooNew':
    'The file uses schema v{version}, newer than the supported one (v{supported}).',
  'project.invalid': 'Invalid project at "{path}": {message}',

  'example.production.name': 'Standard production',
  'example.production.description':
    '≈250 holes Ø 229 mm · heavy ANFO bottom charge + ANFO · V firing pattern from the free face',
  'example.wet.name': 'Wet face',
  'example.wet.description':
    'Wet back rows loaded with emulsion · rest with ANFO · row-by-row tie-up',
  'example.electronic.name': 'Near infrastructure',
  'example.electronic.description':
    'Hole-by-hole electronic detonators (no coincidences) · air deck · plant at 180 m',
  'example.inclined.name': 'Angled holes',
  'example.inclined.description': 'Angled 15° toward the free face · ideal for the 3D view (key 3)',
  'example.problems.name': 'Typical problems',
  'example.problems.description':
    'Short stemming, unloaded, no detonator, row without tie-up, coinciding delays, duplicates',

  'engine.undo.addHole': 'Add hole',
  'engine.undo.addNamed': 'Add {name}',
  'engine.undo.deleteNamed': 'Delete {name}',
  'engine.undo.drawNamed': 'Draw {name}',
  'engine.undo.moveHole': 'Move hole',
  'engine.undo.moveHoles': 'Move {n} holes',
  'engine.undo.deleteConnection': 'Delete connection',
  'engine.undo.connectHoles': 'Connect holes',
  'engine.undo.initiationPoint': 'Initiation point',
  'engine.undo.freeFace': 'Free face',
  'engine.map.compass': 'Compass',
  'engine.map.west': 'W',
  'engine.map.rulerCorner': 'Project coordinates: Easting (top) and Northing (left)',
  'engine.map.grid': 'grid',
  'engine.map.decimal': '.',
} satisfies Record<keyof typeof es, string>;
