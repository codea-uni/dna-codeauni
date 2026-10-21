import type { CheckSeverity, VibrationScaling } from '@cronos/core';

/** Fórmula de la ley de PPV según la distancia escalada, en texto plano. */
const ppvFormula = (scaling: VibrationScaling) =>
  scaling === 'cube-root'
    ? 'PPV = K·(R/Q^(1/3))^(-beta)'
    : scaling === 'langefors'
      ? 'PPV = K·(Q^(1/2)/R^(3/4))^beta'
      : 'PPV = K·(R/Q^(1/2))^(-beta)';

export type ReportLanguage = 'es' | 'en';

const es = {
  docTitle: (blast: string) => `Informe de voladura · ${blast}`,
  title: 'Informe de voladura',
  company: 'Empresa',
  mine: 'Mina',
  project: 'Proyecto',
  blast: 'Voladura',
  version: 'Versión',
  author: 'Autor',
  date: 'Fecha',
  summary: 'Resumen',
  holes: 'Taladros',
  holesValue: (total: number, loaded: number) => `${total} (${loaded} cargados)`,
  drilled: 'Metros perforados',
  diameter: 'Diámetro',
  benchHeight: 'Altura de banco',
  explosive: 'Explosivo',
  primers: 'Primas',
  volume: 'Volumen cubicado',
  tonnage: 'Tonelaje cubicado',
  loadingFactor: 'Factor de carga real',
  designFactor: 'Factor de carga de diseño (B·S·H)',
  energy: 'Energía',
  cost: 'Costo de productos',
  unpriced: 'precio sin cargar',
  partial: 'parcial',
  unpricedNote: (names: string) =>
    `Costo de productos incompleto: sin precio en la librería para ${names}. El costo no es real hasta cargar sus precios.`,
  duration: 'Duración de la secuencia',
  noTimes: 'sin tiempos',
  maxPerDelay: (windowMs: string) => `Máx. kg por retardo (${windowMs} ms)`,
  coincident: 'Grupos coincidentes',
  flyrock: 'Alcance flyrock (Lundborg)',
  plan: 'Plano',
  planByTime: 'Plano (color: tiempo de disparo)',
  north: 'N',
  chargeByProduct: 'Carguío por producto',
  noCharge: '(sin carga)',
  fragTitle: 'Fragmentación (Kuz-Ram + Swebrec)',
  noLoadedHoles: 'Sin taladros cargados.',
  rockFactor: 'Factor de roca A',
  uniformity: 'Índice de uniformidad n',
  oversize: 'Sobretamaño (> 100 cm)',
  vibTitle: 'Vibración y sobrepresión',
  ppvLaw: 'Ley de PPV',
  notCalibrated: 'sin calibrar con mediciones de la mina',
  courseSource: 'valor orientativo; confirmar con el EIA de la operación o la norma vigente',
  mic: 'Carga máx. por retardo',
  micExtended: 'Con ventana ampliada (dispersión de pirotécnicos)',
  electronicOnly: '- (solo electrónicos)',
  monitoringPoint: 'Punto de control',
  limit: 'Límite',
  admissible: 'kg adm.',
  exceeds: ' (EXCEDE)',
  noMonitoringPoints: '(sin puntos de control)',
  interRow: 'Retardo entre filas',
  rows: 'Filas',
  minMs: 'mín [ms]',
  maxMs: 'máx [ms]',
  meanMs: 'media [ms]',
  review: 'Revisión del diseño',
  noObservations: 'Sin observaciones.',
  observation: 'Observación',
  level: 'Nivel',
  severity: { error: 'error', warning: 'advertencia', info: 'nota' } satisfies Record<
    CheckSeverity,
    string
  >,
  assumptions: 'Modelos, parámetros y supuestos',
  continued: '(cont.)',
  allStructures: 'todas',
  holeTable: [
    'Taladro',
    'Este',
    'Norte',
    'Cota',
    'Largo',
    'Ø mm',
    'Incl °',
    'Az °',
    'kg',
    't [ms]',
  ],
  holeRange: (from: number, to: number, total: number) => `Taladros (${from}–${to} de ${total})`,
  notes: {
    units:
      'Los resultados se recalculan desde el diseño (unidades del sistema internacional) con el mismo cálculo que muestra la pantalla.',
    deckCharge:
      'Carga de cada tramo: masa = (pi/4)·Ø²·densidad·largo cargado, descontando el asentamiento del producto; los cartuchos usan su masa por metro.',
    volume: (lopezJimeno: boolean) =>
      `Volumen de diseño B·S·H con la altura de banco vertical; volumen real por el área de influencia de cada taladro recortada al perímetro. Sobreperforación: ${lopezJimeno ? 'López Jimeno, L = H/cos alfa + (1 - alfa/100)·J' : 'vertical bajo el piso, L = (H + J)/cos alfa'}.`,
    timing: (windowMs: string) =>
      `Tiempos de salida: camino más corto por el amarre (Dijkstra) más el retardo de fondo. La carga máxima por retardo suma los taladros que salen dentro de ${windowMs} ms.`,
    burden: (reliefMs: string) =>
      `Burden efectivo: distancia a la cara libre más cercana al momento de salir; un taladro anterior da alivio si salió al menos ${reliefMs} ms por metro de burden antes y está delante.`,
    sdob: (severe: string, safe: string) =>
      `Profundidad escalada de enterramiento (Chiappetta): carga superior, primeros 10 diámetros; avisos bajo ${severe} (severa) y bajo ${safe} m/kg^(1/3), rangos orientativos de bibliografía.`,
    ppv: (scaling: VibrationScaling, law: string) =>
      `Vibración en campo lejano: ${ppvFormula(scaling)}, con R la distancia al taladro más cercano del grupo que sale junto y Q la carga máxima por retardo (Duvall y Fogelson, 1962). Ley usada: ${law}. K y beta son propios de cada sitio y se calibran con sismógrafos.`,
    limits: (list: string) => `Límites de PPV: ${list || 'sin tabla'}.`,
    airblast:
      'Sobrepresión P = k·(R/W^(1/3))^(-beta) (Siskind et al., 1980) y alcance de proyecciones (Lundborg): modelos empíricos, informativos.',
    airblastUnderground:
      'Sobrepresión P = k·(R/W^(1/3))^(-beta) (Siskind et al., 1980): modelo empírico, informativo.',
    frag: 'Fragmentación: Kuz-Ram (Cunningham, 1987) con la curva Swebrec (Ouchterlony, 2005); estimación a validar con mediciones del sitio.',
    generic: (count: number, names: string) =>
      `Atención: ${count} explosivo(s) con valores genéricos sin ficha técnica (${names}); reemplazar por la ficha del fabricante.`,
    allCited: 'Todos los explosivos citan su ficha técnica.',
    rules:
      'Las observaciones de la revisión son avisos para el criterio del ingeniero; no bloquean el diseño.',
  },
  /** Títulos de observaciones por `check.id`; el núcleo ya los da en español. */
  checks: {} as Record<string, string>,
};

const en = {
  docTitle: (blast: string) => `Blast report · ${blast}`,
  title: 'Blast report',
  company: 'Company',
  mine: 'Mine',
  project: 'Project',
  blast: 'Blast',
  version: 'Version',
  author: 'Author',
  date: 'Date',
  summary: 'Summary',
  holes: 'Holes',
  holesValue: (total: number, loaded: number) => `${total} (${loaded} loaded)`,
  drilled: 'Drilled metres',
  diameter: 'Diameter',
  benchHeight: 'Bench height',
  explosive: 'Explosive',
  primers: 'Primers/boosters',
  volume: 'Volume',
  tonnage: 'Tonnage',
  loadingFactor: 'Loading factor (actual)',
  designFactor: 'Design factor (B·S·H)',
  energy: 'Energy',
  cost: 'Product cost',
  unpriced: 'price not entered',
  partial: 'partial',
  unpricedNote: (names: string) =>
    `Product cost incomplete: no price in the library for ${names}. The cost is not real until their prices are entered.`,
  duration: 'Sequence duration',
  noTimes: 'no times',
  maxPerDelay: (windowMs: string) => `Max. charge per delay (${windowMs} ms)`,
  coincident: 'Coincident groups',
  flyrock: 'Flyrock range (Lundborg)',
  plan: 'Plan view',
  planByTime: 'Plan view (colour: firing time)',
  north: 'N',
  chargeByProduct: 'Charge by product',
  noCharge: '(no charge)',
  fragTitle: 'Fragmentation (Kuz-Ram + Swebrec)',
  noLoadedHoles: 'No loaded holes.',
  rockFactor: 'Rock factor A',
  uniformity: 'Uniformity index n',
  oversize: 'Oversize (> 100 cm)',
  vibTitle: 'Vibration and airblast',
  ppvLaw: 'PPV law',
  notCalibrated: 'not calibrated with mine records',
  courseSource: 'indicative value; confirm with the operation permit or the applicable standard',
  mic: 'Max. charge per delay',
  micExtended: 'With extended window (pyrotechnic scatter)',
  electronicOnly: '- (electronic only)',
  monitoringPoint: 'Monitoring point',
  limit: 'Limit',
  admissible: 'Adm. kg',
  exceeds: ' (EXCEEDS)',
  noMonitoringPoints: '(no monitoring points)',
  interRow: 'Inter-row delay',
  rows: 'Rows',
  minMs: 'min [ms]',
  maxMs: 'max [ms]',
  meanMs: 'mean [ms]',
  review: 'Design review',
  noObservations: 'No findings.',
  observation: 'Finding',
  level: 'Level',
  severity: { error: 'error', warning: 'warning', info: 'note' },
  assumptions: 'Models, parameters and assumptions',
  continued: '(cont.)',
  allStructures: 'all',
  holeTable: ['Hole', 'East', 'North', 'Elev.', 'Length', 'Ø mm', 'Incl °', 'Az °', 'kg', 't [ms]'],
  holeRange: (from: number, to: number, total: number) => `Holes (${from}–${to} of ${total})`,
  notes: {
    units:
      'Results are recomputed from the design (SI units) with the same calculation shown on screen.',
    deckCharge:
      'Deck charge: mass = (pi/4)·Ø²·density·charged length, less product slumping; cartridges use their mass per metre.',
    volume: (lopezJimeno: boolean) =>
      `Design volume B·S·H with vertical bench height; actual volume from each hole's influence area clipped to the boundary. Subdrill: ${lopezJimeno ? 'López Jimeno, L = H/cos alpha + (1 - alpha/100)·J' : 'vertical below the floor, L = (H + J)/cos alpha'}.`,
    timing: (windowMs: string) =>
      `Firing times: shortest path over the tie-up (Dijkstra) plus the downhole delay. Max. charge per delay sums the holes firing within ${windowMs} ms.`,
    burden: (reliefMs: string) =>
      `Effective burden: distance to the nearest free face at firing time; an earlier hole provides relief if it fired at least ${reliefMs} ms per metre of burden before and lies in front.`,
    sdob: (severe: string, safe: string) =>
      `Scaled depth of burial (Chiappetta): top charge, first 10 diameters; warnings below ${severe} (severe) and below ${safe} m/kg^(1/3), indicative ranges from the literature.`,
    ppv: (scaling: VibrationScaling, law: string) =>
      `Far-field vibration: ${ppvFormula(scaling)}, with R the distance to the nearest hole of the group firing together and Q the max. charge per delay (Duvall and Fogelson, 1962). Law used: ${law}. K and beta are site constants calibrated with seismographs.`,
    limits: (list: string) => `PPV limits: ${list || 'no table'}.`,
    airblast:
      'Airblast P = k·(R/W^(1/3))^(-beta) (Siskind et al., 1980) and flyrock range (Lundborg): empirical models, for information only.',
    airblastUnderground:
      'Airblast P = k·(R/W^(1/3))^(-beta) (Siskind et al., 1980): empirical model, for information only.',
    frag: 'Fragmentation: Kuz-Ram (Cunningham, 1987) with the Swebrec curve (Ouchterlony, 2005); estimate to be validated with site measurements.',
    generic: (count: number, names: string) =>
      `Warning: ${count} explosive(s) with generic values and no datasheet (${names}); replace with the manufacturer's datasheet.`,
    allCited: 'All explosives cite their datasheet.',
    rules:
      "Review findings are warnings for the engineer's judgement; they do not block the design.",
  },
  checks: {
    // diagnostics/designChecks.ts
    noFreeFace: 'No free face defined',
    lowStiffness: 'Low burden stiffness',
    subdrillRange: 'Subdrill out of range',
    benchDiameter: 'Unusual diameter for the bench height',
    unloaded: 'Unloaded holes',
    overcharged: 'Column longer than the hole',
    noStemming: 'No stemming',
    shortStemming: 'Short stemming',
    longStemming: 'Long stemming',
    stemmingDiameter: 'Stemming out of range in diameters',
    noDetonator: 'Loaded without detonator',
    notInitiated: 'Loaded but not initiated',
    coincident: 'Neighbours firing together',
    duplicate: 'Duplicate collars',
    outside: 'Outside the boundaries',
    // diagnostics/chargeChecks.ts
    openColumn: 'Column does not close',
    noBooster: 'Blasting agent without booster',
    waterIncompatible: 'Explosive not suitable for water in the hole',
    belowCriticalDiameter: 'Charge diameter below critical',
    sdobSevere: 'Insufficient confinement (severe SDOB)',
    sdobLow: 'Low confinement (SDOB)',
    // timing/timingChecks.ts
    tieCycle: 'Tie-up with cycles',
    unrelievedBurden: 'Free face not relieved',
    invertedOrder: 'Firing order inverted relative to the free face',
    closeRelief: 'Relief too close',
    delayGuide: 'Delay outside the per-metre guideline',
    unpricedProducts: 'Products without price',
  } as Record<string, string>,
} satisfies typeof es;

export const REPORT_TEXT: Record<ReportLanguage, typeof es> = { es, en };
