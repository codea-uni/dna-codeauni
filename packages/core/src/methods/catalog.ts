/**
 * Catálogo de modelos de cálculo: fuente única de verdad para el botón «Detalle» de cada panel y
 * para la sección «Modelos y fórmulas» de la Documentación (así no se contradicen).
 *
 * Cada modelo dice qué ecuación usa el programa, de quién es, con qué nivel de confianza
 * (`docs/RULES.md`: R0–R4, o [V]/[CG]/[P] en subterránea), sus supuestos y los ID de regla que lo
 * respaldan (FC-*, RM-*, GE-*, VS-*, UG-R*, UG-P*, FC-UG*). Las variables tienen una `key` con la
 * que el panel pasa el valor que está usando AHORA ese cálculo.
 *
 * Si se agrega una metodología nueva (p. ej. otra ley de vibración), se implementa en el núcleo,
 * se agrega aquí con su `topic` y, si es alternativa elegible, en `METHOD_CHOICES`.
 */

/** Texto en los dos idiomas de la interfaz. */
export interface Bilingual {
  es: string;
  en: string;
}

const t = (es: string, en: string): Bilingual => ({ es, en });
const tex = String.raw;

/** Variable de un modelo: símbolo (TeX), significado y unidad en la que se muestra su valor. */
export interface MethodVariable {
  key: string;
  tex: string;
  name: Bilingual;
  /** Unidad de pantalla (el panel pasa el valor ya en esta unidad); '' = adimensional. */
  unit: string;
  /** Decimales al mostrar el valor actual. */
  decimals?: number;
  /** Es el resultado del modelo (se muestra al final, «→ PPV = …»). */
  output?: boolean;
}

/**
 * Estado del modelo: implementado en el código, previsto (documentado, sin selector todavía) o
 * solo visual (no calcula: muestra resultados de otros modelos).
 */
export type MethodStatus = 'implemented' | 'planned' | 'visual';

export interface MethodModel {
  id: string;
  topic: MethodTopicId;
  name: Bilingual;
  /** Autor(es) y año, como se citan. */
  authors: string;
  /** Referencia bibliográfica. */
  reference: string;
  /** IDs de `docs/RULES.md`. */
  rules: readonly string[];
  /** Ecuaciones en TeX (KaTeX), en orden de uso. */
  formulas: readonly string[];
  variables: readonly MethodVariable[];
  /** Nivel de confianza de `docs/RULES.md` (p. ej. «R3», «R1», «[CG]», «[P]»). */
  confidence: string;
  assumptions: readonly Bilingual[];
  status: MethodStatus;
  /** Dónde está en la aplicación (pasos en la interfaz). */
  where: Bilingual;
}

export type MethodTopicId =
  | 'vibration'
  | 'energy'
  | 'fragmentation'
  | 'ugFragmentation'
  | 'faceDesign'
  | 'rings'
  | 'methods'
  | 'volume'
  | 'sequence'
  | 'muckpile'
  | 'ugMuckpile'
  | 'simulation'
  | 'flyrock'
  | 'geotech';

export interface MethodTopic {
  id: MethodTopicId;
  title: Bilingual;
  intro: Bilingual;
}

export const METHOD_TOPICS: readonly MethodTopic[] = [
  {
    id: 'vibration',
    title: t('Vibración (campo lejano)', 'Vibration (far field)'),
    intro: t(
      'PPV en puntos de control con una ley de atenuación por distancia escalada, calibrada con sismógrafos, y criterios de daño por tipo de punto.',
      'PPV at control points with a scaled-distance attenuation law, calibrated with seismographs, and damage criteria by point type.',
    ),
  },
  {
    id: 'energy',
    title: t('Energía y halos de daño', 'Energy and damage halos'),
    intro: t(
      'Campo cercano: PPV de Holmberg–Persson integrado a lo largo de la carga y bandas de daño en múltiplos del PPV crítico.',
      'Near field: Holmberg–Persson PPV integrated along the charge and damage bands as multiples of the critical PPV.',
    ),
  },
  {
    id: 'fragmentation',
    title: t('Fragmentación en banco', 'Bench fragmentation'),
    intro: t(
      'Kuz-Ram (X50 y n) con la curva Swebrec (KCO) o Rosin-Rammler para los percentiles.',
      'Kuz-Ram (X50 and n) with the Swebrec (KCO) or Rosin-Rammler curve for the percentiles.',
    ),
  },
  {
    id: 'ugFragmentation',
    title: t('Fragmentación subterránea', 'Underground fragmentation'),
    intro: t(
      'Kuz-Ram por zonas del frente (arranque, ayudas, contorno, zapateras) o por anillo, mezcladas por la roca de cada zona.',
      'Kuz-Ram by face zone (cut, stoping, contour, lifters) or by ring, blended by the rock of each zone.',
    ),
  },
  {
    id: 'faceDesign',
    title: t('Frente: método sueco', 'Face: Swedish method'),
    intro: t(
      'Diseño de la ronda de Holmberg (1982): avance por el alivio, secciones del cuele, zapateras, ayudas y contorno; chequeo empírico del número de taladros.',
      'Holmberg (1982) round design: advance from the relief hole, cut squares, lifters, stoping and contour; empirical hole-count check.',
    ),
  },
  {
    id: 'rings',
    title: t('Abanicos y taladros largos', 'Rings and long holes'),
    intro: t(
      'Burden de Langefors-Kihlström, espaciamiento de fondos y collar sin carga alternado.',
      'Langefors-Kihlström burden, toe spacing and alternating uncharged collars.',
    ),
  },
  {
    id: 'methods',
    title: t('Plantillas por método de minado', 'Mining-method templates'),
    intro: t(
      'Prediseños UG-01 a UG-20 con reglas UG-R: valores de partida de manuales que el usuario ajusta.',
      'UG-01 to UG-20 pre-designs with UG-R rules: starting values from handbooks for the user to adjust.',
    ),
  },
  {
    id: 'volume',
    title: t('Cubicación', 'Volume and tonnage'),
    intro: t(
      'Volumen, tonelaje y factores de carga en banco y en subterránea.',
      'Volume, tonnage and loading factors in bench and underground blasts.',
    ),
  },
  {
    id: 'sequence',
    title: t('Secuencia: acoplamiento y corte por onda', 'Sequence: coupling and wave cut-off'),
    intro: t(
      'Taladros que detonan juntos (carga por retardo) y riesgo de que la onda del vecino corte una carga.',
      'Holes that fire together (charge per delay) and the risk of a neighbour’s wave cutting off a charge.',
    ),
  },
  {
    id: 'muckpile',
    title: t('Pila de material (banco)', 'Muckpile (bench)'),
    intro: t(
      'Velocidad inicial por taladro con un modelo elegible y cinemática de bloques hasta el reposo.',
      'Initial velocity per hole with a selectable model and block kinematics until rest.',
    ),
  },
  {
    id: 'ugMuckpile',
    title: t('Pila de material (subterránea)', 'Muckpile (underground)'),
    intro: t(
      'Bloques que salen con la secuencia, confinados por la galería o el tajeo, hasta formar la pila.',
      'Blocks leaving with the sequence, confined by the drive or stope, until they form the pile.',
    ),
  },
  {
    id: 'simulation',
    title: t('Simulación de la voladura', 'Blast simulation'),
    intro: t(
      'Animación de la secuencia: reproduce resultados de otros modelos, no calcula nada nuevo.',
      'Sequence animation: replays results of other models, it does not compute anything new.',
    ),
  },
  {
    id: 'flyrock',
    title: t('Proyección de roca y sobrepresión', 'Flyrock and airblast'),
    intro: t(
      'Alcance máximo de Lundborg y sobrepresión por raíz cúbica.',
      'Lundborg maximum range and cube-root airblast.',
    ),
  },
  {
    id: 'geotech',
    title: t('Modelo geotécnico', 'Geotechnical model'),
    intro: t(
      'Correlaciones para completar las propiedades de cada bloque cuando el modelo no las trae.',
      'Correlations that complete each block’s properties when the model does not provide them.',
    ),
  },
];

const v = (
  key: string,
  symbol: string,
  es: string,
  en: string,
  unit = '',
  extra: Partial<MethodVariable> = {},
): MethodVariable => ({ key, tex: symbol, name: t(es, en), unit, ...extra });

const PPV_OUT = v('ppv', 'PPV', 'velocidad pico de partícula', 'peak particle velocity', 'mm/s', {
  decimals: 2,
  output: true,
});
const VIB_INPUTS = [
  v('k', 'K', 'constante del sitio (calibrada)', 'site constant (calibrated)', 'mm/s', {
    decimals: 0,
  }),
  v('beta', String.raw`\beta`, 'exponente de atenuación', 'attenuation exponent', '', {
    decimals: 3,
  }),
  v('q', 'Q', 'carga máxima por retardo (ventana)', 'maximum charge per delay (window)', 'kg', {
    decimals: 1,
  }),
  v('r', 'R', 'distancia a la carga que gobierna', 'distance to the governing charge', 'm', {
    decimals: 1,
  }),
];
const VIB_WHERE = t(
  'Análisis › Vibración › Constantes del sitio (ley y escalamiento)',
  'Analysis › Vibration › Site constants (law and scaling)',
);

const MODELS_LIST = [
  // ------------------------------------------------------------------ Vibración
  {
    id: 'vibration.usbm',
    topic: 'vibration',
    name: t('Ley USBM (raíz cuadrada)', 'USBM law (square root)'),
    authors: 'Duvall & Petkof (1959); Devine (1962); Siskind et al. (1980)',
    reference: 'USBM RI 5483; USBM RI 8507; USBM RI 7937 (subterránea)',
    rules: ['FC-24', 'FC-25', 'FC-23'],
    formulas: [
      tex`PPV = K\left(\frac{R}{\sqrt{Q}}\right)^{-\beta}`,
      tex`Q_{adm}=\left(\frac{R}{SD_{adm}}\right)^{2},\quad SD_{adm}=\left(\frac{PPV_{lim}}{K}\right)^{-1/\beta}`,
    ],
    variables: [...VIB_INPUTS, PPV_OUT],
    confidence: 'R3',
    assumptions: [
      t(
        'Campo lejano: la carga se ve como un punto (R mucho mayor que el largo de carga).',
        'Far field: the charge is seen as a point (R much larger than the charge length).',
      ),
      t(
        'Q es la mayor carga dentro de la ventana de 8 ms (configurable, DF-12).',
        'Q is the largest charge inside the 8 ms window (configurable, DF-12).',
      ),
      t(
        'K y β son del sitio: sin calibrar con sismógrafos el resultado es orientativo (VS-05).',
        'K and β are site-specific: without seismograph calibration the result is indicative (VS-05).',
      ),
      t(
        'En subterránea la raíz cuadrada está respaldada: USBM RI 7937 (cuatro minas, K ≈ 230–1 280 mm/s, β ≈ 1,2–1,9) [V].',
        'Underground, square-root scaling is supported: USBM RI 7937 (four mines, K ≈ 230–1,280 mm/s, β ≈ 1.2–1.9) [V].',
      ),
    ],
    status: 'implemented',
    where: VIB_WHERE,
  },
  {
    id: 'vibration.ambraseys',
    topic: 'vibration',
    name: t('Ley de Ambraseys-Hendron (raíz cúbica)', 'Ambraseys-Hendron law (cube root)'),
    authors: 'Ambraseys & Hendron (1968)',
    reference: 'Ambraseys & Hendron (1968), Rock Mechanics in Engineering Practice, Wiley',
    rules: ['FC-24', 'VS-04'],
    formulas: [tex`PPV = K\left(\frac{R}{\sqrt[3]{Q}}\right)^{-\beta}`],
    variables: [...VIB_INPUTS, PPV_OUT],
    confidence: 'R1',
    assumptions: [
      t(
        'Escalamiento esférico: se usa con cargas compactas o distancias cortas.',
        'Spherical scaling: used with compact charges or short distances.',
      ),
      t(
        'K y β ajustados con la misma raíz; no se mezclan con los de raíz cuadrada.',
        'K and β fitted with the same root; they cannot be mixed with square-root values.',
      ),
    ],
    status: 'implemented',
    where: VIB_WHERE,
  },
  {
    id: 'vibration.langefors',
    topic: 'vibration',
    name: t('Ley de Langefors-Kihlström', 'Langefors-Kihlström law'),
    authors: 'Langefors & Kihlström (1963)',
    reference: 'Langefors & Kihlström (1963), The Modern Technique of Rock Blasting, Wiley',
    rules: ['VS-07', 'VS-04'],
    formulas: [
      tex`PPV = K\left(\frac{Q}{R^{3/2}}\right)^{\beta/2} = K\left(\frac{R^{3/4}}{\sqrt{Q}}\right)^{-\beta}`,
    ],
    variables: [...VIB_INPUTS, PPV_OUT],
    confidence: '[CG]',
    assumptions: [
      t(
        'Con β = 1 es la forma clásica PPV = K·√(Q/R^1,5); β libre permite calibrar.',
        'With β = 1 it is the classic PPV = K·√(Q/R^1.5); a free β allows calibration.',
      ),
      t(
        'Los K y β de otra ley no sirven: hay que ajustarlos con esta distancia escalada.',
        'K and β from another law do not apply: they must be fitted with this scaled distance.',
      ),
    ],
    status: 'implemented',
    where: VIB_WHERE,
  },
  {
    id: 'vibration.ghosh',
    topic: 'vibration',
    name: t('Ghosh-Daemen (con atenuación inelástica)', 'Ghosh-Daemen (inelastic attenuation)'),
    authors: 'Ghosh & Daemen (1983)',
    reference: 'Ghosh & Daemen (1983), 24th US Symposium on Rock Mechanics',
    rules: ['VS-08'],
    formulas: [tex`PPV = K\left(\frac{R}{\sqrt{Q}}\right)^{-\beta} e^{-\alpha R}`],
    variables: [
      ...VIB_INPUTS,
      v('alpha', String.raw`\alpha`, 'atenuación inelástica', 'inelastic attenuation', '1/m'),
      PPV_OUT,
    ],
    confidence: 'R1',
    assumptions: [
      t(
        'Próximamente: necesita un tercer parámetro (α) y su calibración por regresión múltiple.',
        'Coming soon: it needs a third parameter (α) and its multiple-regression calibration.',
      ),
    ],
    status: 'planned',
    where: VIB_WHERE,
  },
  {
    id: 'vibration.calibration',
    topic: 'vibration',
    name: t('Calibración con sismógrafos', 'Seismograph calibration'),
    authors: 'Siskind et al. (1980); Dowding (1985)',
    reference: 'USBM RI 8507; Dowding (1985), Blast Vibration Monitoring and Control',
    rules: ['VS-04', 'VS-05'],
    formulas: [
      tex`\log_{10}PPV=\log_{10}K-\beta\,\log_{10}SD`,
      tex`K_{95}=K_{50}\cdot 10^{\,t_{0.95}\,s}`,
    ],
    variables: [
      v('n', 'n', 'mediciones usadas', 'records used', '', { decimals: 0 }),
      v('r2', 'R^2', 'ajuste', 'goodness of fit', '', { decimals: 2 }),
      v('k', 'K', 'constante ajustada', 'fitted constant', 'mm/s', { decimals: 0 }),
      v('beta', String.raw`\beta`, 'exponente ajustado', 'fitted exponent', '', { decimals: 3 }),
    ],
    confidence: 'R1',
    assumptions: [
      t(
        'Mínimos cuadrados en log-log; K95 es la envolvente al 95 % con t de Student unilateral.',
        'Least squares in log-log; K95 is the 95 % envelope with a one-sided Student t.',
      ),
      t(
        'Se ajusta por zona y por tipo de voladura (superficie o subterránea).',
        'Fitted per zone and blast type (surface or underground).',
      ),
    ],
    status: 'implemented',
    where: t(
      'Análisis › Vibración › Calibración (mediciones de la mina)',
      'Analysis › Vibration › Calibration (mine records)',
    ),
  },
  {
    id: 'vibration.damage',
    topic: 'vibration',
    name: t('Criterios de daño por PPV', 'PPV damage criteria'),
    authors: 'USBM RI 8507 / OSM; DIN 4150-3; Bauer & Calder (1978)',
    reference:
      'Siskind et al. (1980) RI 8507; DIN 4150-3 (1999); Bauer & Calder (1978) Open Pit Planning and Design',
    rules: ['VS-01', 'VS-02', 'RM-21', 'DF-14'],
    formulas: [
      tex`PPV \le PPV_{lim}(\text{tipo de punto})`,
      tex`\text{roca: }<254\ \text{sin fracturar};\ 254\text{--}635\ \text{descostre};\ 635\text{--}2540\ \text{grietas};\ >2540\ \text{rotura}`,
    ],
    variables: [
      v('limit', 'PPV_{lim}', 'límite aplicable', 'applicable limit', 'mm/s', { decimals: 1 }),
      v('ppv', 'PPV', 'PPV calculado en el punto', 'computed PPV at the point', 'mm/s', {
        decimals: 2,
        output: true,
      }),
    ],
    confidence: 'R1',
    assumptions: [
      t(
        'Comunidad 12,7 mm/s, estructura 20 mm/s, talud y labor 254 mm/s por defecto; la tabla del EIA manda.',
        'Community 12.7 mm/s, structure 20 mm/s, slope and working 254 mm/s by default; the EIA table governs.',
      ),
      t(
        'No modela la frecuencia ni la amplificación en crestas (VS-06).',
        'Frequency and crest amplification are not modelled (VS-06).',
      ),
    ],
    status: 'implemented',
    where: t(
      'Análisis › Vibración › Límites de PPV y puntos de control',
      'Analysis › Vibration › PPV limits and control points',
    ),
  },
  // ------------------------------------------------------------------ Energía
  {
    id: 'energy.holmbergPersson',
    topic: 'energy',
    name: t('Holmberg–Persson (campo cercano)', 'Holmberg–Persson (near field)'),
    authors: 'Holmberg & Persson (1979); Persson, Holmberg & Lee (1994)',
    reference: 'Persson, Holmberg & Lee (1994), Rock Blasting and Explosives Engineering, CRC',
    rules: ['FC-28', 'RM-09', 'FC-UG1', 'CT-07'],
    formulas: [
      tex`PPV = K\left[\sum_i \frac{q\,\Delta x_i}{\left(d_i^{2}\right)^{\beta/(2\alpha)}}\right]^{\alpha}`,
    ],
    variables: [
      v('k', 'K', 'constante de campo cercano', 'near-field constant', 'mm/s', { decimals: 0 }),
      v('alpha', String.raw`\alpha`, 'exponente de la carga', 'charge exponent', '', {
        decimals: 3,
      }),
      v('beta', String.raw`\beta`, 'exponente de la distancia', 'distance exponent', '', {
        decimals: 3,
      }),
      v('q', 'q', 'carga lineal', 'linear charge', 'kg/m', { decimals: 2 }),
      v('d', 'd_i', 'distancia del elemento de carga al punto', 'charge element to point', 'm'),
      v('ppv', 'PPV', 'máximo del mapa', 'map maximum', 'mm/s', { decimals: 0, output: true }),
    ],
    confidence: 'R3',
    assumptions: [
      t(
        'Se integra por taladro y en cada punto se toma el máximo entre taladros (no se suman).',
        'Integrated per hole; each point takes the maximum over holes (they are not added).',
      ),
      t(
        'Válido cerca de la carga (R ≲ 2–3 largos de carga). K = 700 mm/s, α = 0,7, β = 1,5 son de la literatura: calibrar.',
        'Valid near the charge (R ≲ 2–3 charge lengths). K = 700 mm/s, α = 0.7, β = 1.5 are literature values: calibrate.',
      ),
      t(
        'Calibración publicada en una galería (Stillwater, Iverson et al. 2008): K = 171, α = 1,4, β = 1 [V]: las constantes cambian mucho por sitio.',
        'Published drift calibration (Stillwater, Iverson et al. 2008): K = 171, α = 1.4, β = 1 [V]: constants vary widely by site.',
      ),
    ],
    status: 'implemented',
    where: t(
      'Análisis › Energía (métrica PPV) · Subterránea › Análisis › Halos',
      'Analysis › Energy (PPV metric) · Underground › Analysis › Halos',
    ),
  },
  {
    id: 'energy.nioshModified',
    topic: 'energy',
    name: t('NIOSH modificado (Hustrulid–Lu)', 'NIOSH-modified (Hustrulid–Lu)'),
    authors: 'Hustrulid & Lu (2003); Iverson et al. (2008)',
    reference:
      'Iverson et al. (2008), NIOSH; ec. 4.41–4.42 en Gómez Mateos (2023), tesis doctoral UPM',
    rules: ['FC-47'],
    formulas: [
      tex`PPV = K\,\frac{W^{\alpha}}{\bar R^{\,\beta}}`,
      tex`\bar R=\frac{1}{W}\sum_i q\,\Delta x_i\,d_i`,
    ],
    variables: [
      v('k', 'K', 'constante de campo cercano', 'near-field constant', 'mm/s', { decimals: 0 }),
      v('alpha', String.raw`\alpha`, 'exponente de la carga', 'charge exponent', '', {
        decimals: 3,
      }),
      v('beta', String.raw`\beta`, 'exponente de la distancia', 'distance exponent', '', {
        decimals: 3,
      }),
      v('w', 'W', 'carga del taladro', 'hole charge', 'kg', { decimals: 1 }),
      v('d', 'd_i', 'distancia del elemento de carga al punto', 'charge element to point', 'm'),
      v('ppv', 'PPV', 'máximo del mapa', 'map maximum', 'mm/s', { decimals: 0, output: true }),
    ],
    confidence: '[V] forma · [CG] constantes',
    assumptions: [
      t(
        'Toda la carga del taladro a su distancia media: cerca del eje da menos que Holmberg–Persson y el contorno es casi esférico (no sigue la columna).',
        'The whole hole charge at its mean distance: near the axis it gives less than Holmberg–Persson and the contour is nearly spherical (it does not follow the column).',
      ),
      t(
        'Usa las mismas K, α, β que Holmberg–Persson (para una carga puntual ambos coinciden). Calibrar con mediciones cercanas.',
        'Uses the same K, α, β as Holmberg–Persson (both agree for a point charge). Calibrate with near-field measurements.',
      ),
      t(
        'Máximo entre taladros, como Holmberg–Persson.',
        'Maximum over holes, as Holmberg–Persson.',
      ),
    ],
    status: 'implemented',
    where: t('Análisis › Energía (métrica PPV)', 'Analysis › Energy (PPV metric)'),
  },
  {
    id: 'energy.criticalPpv',
    topic: 'energy',
    name: t('PPV crítico y bandas de daño', 'Critical PPV and damage bands'),
    authors: 'Forsyth (1993); Persson, Holmberg & Lee (1994); McKenzie',
    reference: 'Persson, Holmberg & Lee (1994); Forsyth (1993)',
    rules: ['FC-33', 'GE-09'],
    formulas: [
      tex`PPV_c=\frac{\sigma_t\,V_p}{E}`,
      tex`\text{bandas: }\tfrac14 PPV_c,\ 1\,PPV_c,\ 4\,PPV_c,\ 8\,PPV_c`,
    ],
    variables: [
      v('st', String.raw`\sigma_t`, 'resistencia a tracción', 'tensile strength', 'MPa', {
        decimals: 1,
      }),
      v('vp', 'V_p', 'velocidad de onda P', 'P-wave velocity', 'm/s', { decimals: 0 }),
      v('e', 'E', 'módulo de Young', 'Young’s modulus', 'GPa', { decimals: 1 }),
      v('vppc', 'PPV_c', 'PPV crítico', 'critical PPV', 'mm/s', { decimals: 0, output: true }),
    ],
    confidence: 'R1',
    assumptions: [
      t(
        'Si el usuario ingresa PPVc (retroanálisis) se usa ese valor; si no, la fórmula.',
        'If the user enters PPVc (back-analysis) that value is used; otherwise the formula.',
      ),
      t(
        '¼·PPVc: posible daño leve; 1×: fisuras nuevas; 4×: daño severo; 8×: rotura.',
        '¼·PPVc: possible minor damage; 1×: new cracks; 4×: severe damage; 8×: breakage.',
      ),
    ],
    status: 'implemented',
    where: t('Análisis › Energía › Daño', 'Analysis › Energy › Damage'),
  },
  {
    id: 'energy.bauerCalder',
    topic: 'energy',
    name: t('Umbrales de Bauer–Calder', 'Bauer–Calder thresholds'),
    authors: 'Bauer & Calder',
    reference: 'Bauer & Calder, citado en revisiones de PPV crítico para roca intacta',
    rules: ['FC-48'],
    formulas: [tex`PPV_{1}=254,\quad PPV_{2}=635,\quad PPV_{3}=2540\ \text{mm/s}`],
    variables: [],
    confidence: '[CG]',
    assumptions: [
      t(
        'Umbrales fijos para roca intacta: no usan la resistencia ni el módulo de la roca (con roca débil o fracturada el daño empieza antes).',
        'Fixed thresholds for intact rock: they ignore rock strength and modulus (in weak or jointed rock damage starts earlier).',
      ),
      t(
        'Bajo PPV₁ no hay fracturas en roca intacta; PPV₁–PPV₂ descostramiento leve; PPV₂–PPV₃ fracturas fuertes y algunas radiales; sobre PPV₃ rotura total.',
        'Below PPV₁ no fracturing of intact rock; PPV₁–PPV₂ minor tensile slabbing; PPV₂–PPV₃ strong tensile and some radial cracking; above PPV₃ complete break-up.',
      ),
    ],
    status: 'implemented',
    where: t('Análisis › Energía › Daño', 'Analysis › Energy › Damage'),
  },
  {
    id: 'energy.chargeDensity',
    topic: 'energy',
    name: t('Densidad de carga', 'Charge density'),
    authors: 'Cronos',
    reference: 'Núcleo gaussiano 3D normalizado (decisión de producto)',
    rules: ['FC-UG1'],
    formulas: [
      tex`\rho_q(\mathbf{x})=\sum_i \frac{m_i}{(2\pi)^{3/2}\sigma^3}\,e^{-\lvert\mathbf{x}-\mathbf{x}_i\rvert^2/(2\sigma^2)}`,
    ],
    variables: [
      v('sigma', String.raw`\sigma`, 'radio del núcleo', 'kernel radius', 'm', { decimals: 1 }),
    ],
    confidence: 'R0',
    assumptions: [
      t(
        'Indicador de distribución de explosivo (kg/m³), no de daño.',
        'Explosive distribution indicator (kg/m³), not a damage metric.',
      ),
    ],
    status: 'implemented',
    where: t('Análisis › Energía (métrica densidad)', 'Analysis › Energy (density metric)'),
  },
  // ------------------------------------------------------------------ Fragmentación banco
  {
    id: 'fragmentation.cunningham1987',
    topic: 'fragmentation',
    name: t('Kuz-Ram (Cunningham 1987)', 'Kuz-Ram (Cunningham 1987)'),
    authors: 'Kuznetsov (1973); Cunningham (1983, 1987); Lilly (1986)',
    reference: 'Cunningham (1987), 2nd Int. Symp. Rock Fragmentation by Blasting',
    rules: ['FC-26', 'RM-10', 'DF-17'],
    formulas: [
      tex`X_{50}=A\,K^{-0.8}\,Q^{1/6}\left(\frac{115}{RWS}\right)^{19/30}`,
      tex`n=\left(2.2-14\frac{B}{d}\right)\sqrt{\frac{1+S/B}{2}}\left(1-\frac{W}{B}\right)\left(\frac{\lvert BCL-CCL\rvert}{L}+0.1\right)^{0.1}\frac{L}{H}\,f_m`,
      tex`A=0.06\,(RMD+JF+RDI+HF)`,
    ],
    variables: [
      v('a', 'A', 'factor de roca', 'rock factor', '', { decimals: 2 }),
      v('k', 'K', 'factor de carga', 'loading factor', 'kg/m³', { decimals: 3 }),
      v('q', 'Q', 'explosivo por taladro', 'explosive per hole', 'kg', { decimals: 1 }),
      v(
        'rws',
        'RWS',
        'potencia relativa (ANFO = 100)',
        'relative weight strength (ANFO = 100)',
        '',
        {
          decimals: 0,
        },
      ),
      v('b', 'B', 'burden', 'burden', 'm', { decimals: 2 }),
      v('s', 'S', 'espaciamiento', 'spacing', 'm', { decimals: 2 }),
      v('d', 'd', 'diámetro', 'diameter', 'mm', { decimals: 0 }),
      v('w', 'W', 'desviación de perforación', 'drilling deviation', 'm', { decimals: 2 }),
      v('x50', 'X_{50}', 'tamaño medio', 'mean size', 'cm', { decimals: 1, output: true }),
      v('n', 'n', 'índice de uniformidad', 'uniformity index', '', { decimals: 2, output: true }),
    ],
    confidence: 'R2',
    assumptions: [
      t(
        'Malla regular y explosivo continuo; f_m = 1 (cuadrada), 1,1 (tresbolillo) o 1,15 (equilátera).',
        'Regular pattern and continuous charge; f_m = 1 (square), 1.1 (staggered) or 1.15 (equilateral).',
      ),
      t(
        'Subestima finos (no tiene la corrección JKMRC, RM-11). Aviso con n fuera de 0,7–2.',
        'Underestimates fines (no JKMRC correction, RM-11). Warning with n outside 0.7–2.',
      ),
      t(
        'Es una estimación que se calibra con la granulometría medida, no una predicción con error conocido.',
        'It is an estimate to be calibrated against measured sizing, not a prediction with a known error.',
      ),
    ],
    status: 'implemented',
    where: t('Análisis › Fragmentación › Metodología', 'Analysis › Fragmentation › Methodology'),
  },
  {
    id: 'fragmentation.cunningham2005',
    topic: 'fragmentation',
    name: t('Kuz-Ram (Cunningham 2005)', 'Kuz-Ram (Cunningham 2005)'),
    authors: 'Cunningham (2005)',
    reference: 'Cunningham (2005), Fragblast 8, «The Kuz-Ram fragmentation model – 20 years on»',
    rules: ['FC-UG5', 'FC-26'],
    formulas: [
      tex`X_{50}=A\,K^{-0.8}\,Q^{1/6}\left(\frac{115}{RWS}\right)^{19/20}C`,
      tex`n=n_s\sqrt{2-30\frac{B}{d}}\sqrt{\frac{1+S/B}{2}}\left(1-\frac{W}{B}\right)\left(\frac{\lvert BCL-CCL\rvert}{L}+0.1\right)^{0.1}\frac{L}{H}`,
    ],
    variables: [
      v('a', 'A', 'factor de roca', 'rock factor', '', { decimals: 2 }),
      v('k', 'K', 'factor de carga', 'loading factor', 'kg/m³', { decimals: 3 }),
      v('q', 'Q', 'explosivo por taladro', 'explosive per hole', 'kg', { decimals: 1 }),
      v(
        'rws',
        'RWS',
        'potencia relativa (ANFO = 100)',
        'relative weight strength (ANFO = 100)',
        '',
        {
          decimals: 0,
        },
      ),
      v('b', 'B', 'burden', 'burden', 'm', { decimals: 2 }),
      v('s', 'S', 'espaciamiento', 'spacing', 'm', { decimals: 2 }),
      v('d', 'd', 'diámetro', 'diameter', 'mm', { decimals: 0 }),
      v('c', 'C', 'calibración del sitio', 'site calibration', '', { decimals: 2 }),
      v('x50', 'X_{50}', 'tamaño medio', 'mean size', 'cm', { decimals: 1, output: true }),
      v('n', 'n', 'índice de uniformidad', 'uniformity index', '', { decimals: 2, output: true }),
    ],
    confidence: '[CG]',
    assumptions: [
      t(
        'En banco: n_s (factor de tiempos) = 1 y C = 1. En subterránea ambos son editables.',
        'In bench: n_s (timing factor) = 1 and C = 1. Underground both are editable.',
      ),
      t(
        'Da X50 algo menor que 1987 con explosivos de RWS > 100.',
        'Gives a somewhat smaller X50 than 1987 with explosives of RWS > 100.',
      ),
    ],
    status: 'implemented',
    where: t(
      'Análisis › Fragmentación › Metodología · Subterránea › Análisis › Fragmentación',
      'Analysis › Fragmentation › Methodology · Underground › Analysis › Fragmentation',
    ),
  },
  {
    id: 'fragmentation.swebrec',
    topic: 'fragmentation',
    name: t('Curva Swebrec (KCO)', 'Swebrec curve (KCO)'),
    authors: 'Ouchterlony (2005)',
    reference: 'Ouchterlony (2005), Fragblast 9(1), «The Swebrec function»',
    rules: ['FC-27'],
    formulas: [
      tex`P(x)=\frac{1}{1+\left[\dfrac{\ln(x_{max}/x)}{\ln(x_{max}/X_{50})}\right]^{b}}`,
      tex`b=2\ln 2\,\ln\!\left(\frac{x_{max}}{X_{50}}\right)n`,
    ],
    variables: [
      v('x50', 'X_{50}', 'tamaño medio (Kuz-Ram)', 'mean size (Kuz-Ram)', 'cm', { decimals: 1 }),
      v('xmax', 'x_{max}', 'tamaño máximo (bloque in situ o mín(B, S))', 'maximum size', 'cm', {
        decimals: 0,
      }),
      v('b', 'b', 'exponente Swebrec', 'Swebrec exponent', '', { decimals: 2 }),
      v('p80', 'P_{80}', 'tamaño al 80 % pasante', 'size at 80 % passing', 'cm', {
        decimals: 1,
        output: true,
      }),
    ],
    confidence: 'R1',
    assumptions: [
      t(
        'Corrige la cola de finos y gruesos de Rosin-Rammler; necesita x_max.',
        'Corrects the fines and coarse tails of Rosin-Rammler; it needs x_max.',
      ),
    ],
    status: 'implemented',
    where: t(
      'Análisis › Fragmentación › Metodología (curva)',
      'Analysis › Fragmentation › Methodology (curve)',
    ),
  },
  {
    id: 'fragmentation.rosinRammler',
    topic: 'fragmentation',
    name: t('Curva Rosin-Rammler', 'Rosin-Rammler curve'),
    authors: 'Rosin & Rammler (1933); Cunningham (1983)',
    reference: 'Cunningham (1983), 1st Int. Symp. Rock Fragmentation by Blasting',
    rules: ['FC-26'],
    formulas: [
      tex`P(x)=1-\exp\!\left[-\left(\frac{x}{x_c}\right)^{n}\right],\quad x_c=\frac{X_{50}}{(\ln 2)^{1/n}}`,
    ],
    variables: [
      v('xc', 'x_c', 'tamaño característico (63,2 %)', 'characteristic size (63.2 %)', 'cm', {
        decimals: 1,
      }),
      v('n', 'n', 'índice de uniformidad', 'uniformity index', '', { decimals: 2 }),
      v('p80', 'P_{80}', 'tamaño al 80 % pasante', 'size at 80 % passing', 'cm', {
        decimals: 1,
        output: true,
      }),
    ],
    confidence: 'R2',
    assumptions: [
      t(
        'Curva clásica de Kuz-Ram: subestima finos y sobrestima gruesos.',
        'Classic Kuz-Ram curve: underestimates fines and overestimates coarse sizes.',
      ),
    ],
    status: 'implemented',
    where: t(
      'Análisis › Fragmentación › Metodología (curva)',
      'Analysis › Fragmentation › Methodology (curve)',
    ),
  },
  // ------------------------------------------------------------------ Fragmentación subterránea
  {
    id: 'ugFragmentation.zones',
    topic: 'ugFragmentation',
    name: t('Kuz-Ram por zonas y anillos', 'Kuz-Ram by zones and rings'),
    authors:
      'Cunningham (1987, 2005); Ouchterlony (2005); Oñederra & Chitombo (2007); Fonseca de Castro (2021)',
    reference:
      'Fonseca de Castro (2021), mina Kittilä (método por zonas publicado); Dong (2023); Oñederra & Chitombo (2007) Mining Technology 116(4)',
    rules: ['FC-UG5', 'FC-UG6'],
    formulas: [
      tex`K_z=\frac{m_z}{A_z\cdot\text{avance}},\qquad P(x)=\sum_z \frac{V_z}{V}\,P_z(x)`,
      tex`\text{abanico: } B_{eq}=B,\ S_{eq}=S_{toe},\ K=\frac{m_{anillo}}{B\cdot A_{anillo}}`,
    ],
    variables: [
      v('a', 'A', 'factor de roca', 'rock factor', '', { decimals: 1 }),
      v('c', 'C', 'calibración', 'calibration', '', { decimals: 2 }),
      v('p50', 'P_{50}', 'tamaño medio de la mezcla', 'blend mean size', 'cm', {
        decimals: 1,
        output: true,
      }),
      v('p80', 'P_{80}', 'P80 de la mezcla', 'blend P80', 'cm', { decimals: 1, output: true }),
    ],
    confidence: '[V] método · [CG] constantes',
    assumptions: [
      t(
        'Frente por zonas (cuele, arrastres, contorno, producción) con promedio por volumen: es el método publicado por Fonseca de Castro (2021, Kittilä) [V]. Swebrec reproduce bien sobre X50 y peor los finos.',
        'Face by zones (cut, lifters, contour, production) with a volume-weighted average: the method published by Fonseca de Castro (2021, Kittilä) [V]. Swebrec fits above X50 well and fines less well.',
      ),
      t(
        'Estimación que se calibra (C) con fotos o escaneos de pila: ninguna fuente da un error numérico.',
        'An estimate to calibrate (C) with muckpile photos or scans: no source gives a numeric error.',
      ),
      t(
        'Abanicos con equivalencias de diseño [CG]: tienden a subestimar X50 en roca dura (calibrar C).',
        'Rings with design equivalences [CG]: they tend to underestimate X50 in hard rock (calibrate C).',
      ),
      t(
        'H del Kuz-Ram = largo del taladro (no hay banco).',
        'Kuz-Ram H = hole length (there is no bench).',
      ),
    ],
    status: 'implemented',
    where: t('Subterránea › Análisis › Fragmentación', 'Underground › Analysis › Fragmentation'),
  },
  // ------------------------------------------------------------------ Frente (método sueco)
  {
    id: 'face.holmberg',
    topic: 'faceDesign',
    name: t('Método sueco de Holmberg (1982)', 'Holmberg Swedish method (1982)'),
    authors: 'Holmberg (1982); Langefors & Kihlström (1963); López Jimeno et al. (1995)',
    reference:
      'Holmberg (1982), «Charge calculations for tunnelling», Underground Mining Methods Handbook; López Jimeno (1995)',
    rules: ['UG-R7', 'RM-12', 'RM-13'],
    formulas: [
      tex`H=0.15+34.1\,\Phi-39.4\,\Phi^{2},\qquad I=0.95\,H`,
      tex`B_1=1.5\,\Phi,\quad B_1'=B_1-F,\quad F=\alpha H+e'`,
      tex`l_1=55\,d\left(\frac{B_1}{\Phi}\right)^{1.5}\left(B_1-\frac{\Phi}{2}\right)\frac{c}{0.4}\,\frac{1}{s_{ANFO}}`,
      tex`B=8.8\cdot10^{-2}\sqrt{\frac{A_h\,l\,s_{ANFO}}{d\,c}}\quad\text{(secciones 2 a 4)}`,
      tex`B=0.9\sqrt{\frac{l\,s_{ANFO}}{\bar c\,f\,(S/B)}}\quad\text{(zapateras, ayudas, contorno)}`,
      tex`\text{contorno suave: } S=K\,d,\ B=1.25\,S,\ q=90\,d^{2}`,
    ],
    variables: [
      v(
        'phi',
        String.raw`\Phi`,
        'diámetro equivalente del alivio',
        'equivalent relief diameter',
        'mm',
        {
          decimals: 0,
        },
      ),
      v('d', 'd', 'diámetro de carga', 'charge hole diameter', 'mm', { decimals: 0 }),
      v('c', 'c', 'constante de roca', 'rock constant', 'kg/m³', { decimals: 2 }),
      v('l', 'l', 'carga lineal', 'linear charge', 'kg/m', { decimals: 3 }),
      v('f', 'F', 'error de perforación', 'drilling error', 'm', { decimals: 3 }),
      v('h', 'H', 'profundidad por el alivio', 'depth from relief', 'm', { decimals: 2 }),
      v('advance', 'I', 'avance', 'advance', 'm', { decimals: 2, output: true }),
      v('pf', 'K', 'factor de carga', 'powder factor', 'kg/m³', { decimals: 2, output: true }),
    ],
    confidence: 'R1 · [CG]',
    assumptions: [
      t(
        'Cuele de taladros paralelos con alivio vacío (Ø alivio > Ø carga); desviación 1 % y emboquille 2 cm por defecto.',
        'Parallel-hole cut with an empty relief hole (relief Ø > charge Ø); 1 % deviation and 2 cm collaring by default.',
      ),
      t(
        'f (fijación) y S/B por grupo de la tabla de Holmberg/López Jimeno; todos editables.',
        'Fixation f and S/B per group from the Holmberg/López Jimeno table; all editable.',
      ),
    ],
    status: 'implemented',
    where: t(
      'Subterránea › Frente de túnel › Método sueco',
      'Underground › Tunnel face › Swedish method',
    ),
  },
  {
    id: 'face.exsa',
    topic: 'faceDesign',
    name: t('Número de taladros empírico (EXSA)', 'Empirical hole count (EXSA)'),
    authors: 'EXSA, Manual Práctico de Voladura',
    reference: 'EXSA, Manual Práctico de Voladura (ed. 4)',
    rules: ['UG-R7'],
    formulas: [tex`N=\frac{P}{E}+K\,S`],
    variables: [
      v('p', 'P', 'perímetro de la sección', 'section perimeter', 'm', { decimals: 1 }),
      v('e', 'E', 'distancia entre taladros del contorno', 'contour hole distance', 'm', {
        decimals: 2,
      }),
      v('k', 'K', 'coeficiente de roca', 'rock coefficient', '1/m²', { decimals: 2 }),
      v('s', 'S', 'área de la sección', 'section area', 'm²', { decimals: 1 }),
      v('n', 'N', 'taladros (empírico)', 'holes (empirical)', '', { decimals: 0, output: true }),
      v('design', 'N_{dis}', 'taladros del diseño', 'design holes', '', { decimals: 0 }),
    ],
    confidence: '[CG]',
    assumptions: [
      t(
        'Chequeo de orden de magnitud, no diseña: E = 0,6 m y K = 1,5 por defecto (roca intermedia).',
        'Order-of-magnitude check, it does not design: E = 0.6 m and K = 1.5 by default (medium rock).',
      ),
    ],
    status: 'implemented',
    where: t(
      'Subterránea › Frente de túnel (indicador «Empírico»)',
      'Underground › Tunnel face («Empirical» indicator)',
    ),
  },
  // ------------------------------------------------------------------ Abanicos
  {
    id: 'rings.langefors',
    topic: 'rings',
    name: t('Burden de Langefors-Kihlström', 'Langefors-Kihlström burden'),
    authors: 'Langefors & Kihlström (1963); López Jimeno et al. (1995)',
    reference: 'Langefors & Kihlström (1963), The Modern Technique of Rock Blasting',
    rules: ['UG-R1', 'UG-R2', 'UG-R3', 'UG-R4'],
    formulas: [
      tex`B_{max}=\frac{d}{33}\sqrt{\frac{P\,s}{\bar c\,f\,(S/B)}}`,
      tex`\bar c=c+0.05\ (B\ge1.4\,\mathrm{m});\quad \bar c=c+\frac{0.07}{B}\ (B<1.4\,\mathrm{m})`,
      tex`B=B_{max}-e'-\alpha L`,
      tex`\text{regla empírica: } B\approx 25\text{--}35\,d`,
    ],
    variables: [
      v('d', 'd', 'diámetro', 'diameter', 'mm', { decimals: 0 }),
      v('bmax', 'B_{max}', 'burden máximo', 'maximum burden', 'm', { decimals: 2 }),
      v('burden', 'B', 'burden práctico', 'practical burden', 'm', { decimals: 2, output: true }),
      v('emin', '25d', 'regla empírica mínima', 'empirical rule minimum', 'm', { decimals: 2 }),
      v('emax', '35d', 'regla empírica máxima', 'empirical rule maximum', 'm', { decimals: 2 }),
    ],
    confidence: 'R1',
    assumptions: [
      t(
        'd en mm, P en kg/dm³, s relativa a la dinamita LFB (s = 0,84·s_ANFO); f = 1 y S/B = 1,25 en abanicos.',
        'd in mm, P in kg/dm³, s relative to LFB dynamite (s = 0.84·s_ANFO); f = 1 and S/B = 1.25 in rings.',
      ),
      t(
        'Con burden 0 en la plantilla se usa el práctico de Langefors; la regla 25–35·d solo avisa.',
        'With burden 0 in the template the Langefors practical burden is used; the 25–35·d rule only warns.',
      ),
    ],
    status: 'implemented',
    where: t(
      'Subterránea › Método de minado (taladros largos) › Burden',
      'Underground › Mining method (long holes) › Burden',
    ),
  },
  {
    id: 'rings.layout',
    topic: 'rings',
    name: t('Espaciamiento de fondos y collar alternado', 'Toe spacing and alternating collars'),
    authors: 'Atlas Copco (2007); Oñederra & Chitombo (2007)',
    reference:
      'Atlas Copco (2007), Mining Methods in Underground Mining; Oñederra & Chitombo (2007)',
    rules: ['UG-R5', 'UG-R6'],
    formulas: [
      tex`S_{toe}=1.2\text{--}1.3\,B`,
      tex`\text{carga desde donde } d_{vecino}\ge k\,S_{toe},\ k_{largo}=0.5\text{--}0.6,\ k_{corto}=0.3\text{--}0.35`,
    ],
    variables: [
      v('burden', 'B', 'burden entre anillos', 'ring burden', 'm', { decimals: 2 }),
      v('toe', 'S_{toe}', 'espaciamiento de fondos', 'toe spacing', 'm', { decimals: 2 }),
      v('pf', 'K', 'factor de carga del anillo', 'ring powder factor', 'kg/m³', {
        decimals: 2,
        output: true,
      }),
    ],
    confidence: 'R0 · [CG]',
    assumptions: [
      t(
        'El collar alternado (largo/corto) evita la concentración de carga cerca del pivote.',
        'Alternating (long/short) collars avoid charge concentration near the pivot.',
      ),
      t(
        'Los taladros que quedarían sin carga no se perforan.',
        'Holes that would be left uncharged are not drilled.',
      ),
    ],
    status: 'implemented',
    where: t('Subterránea › Abanicos (tajeo)', 'Underground › Rings (stope)'),
  },
  // ------------------------------------------------------------------ Plantillas
  {
    id: 'methods.templates',
    topic: 'methods',
    name: t('Reglas de las plantillas UG-01 a UG-20', 'Template rules UG-01 to UG-20'),
    authors: 'Hustrulid & Bullock (2001); Holmberg (1982); EXSA; Atlas Copco (2007)',
    reference:
      'Hustrulid & Bullock (2001), Underground Mining Methods, SME; Persson, Holmberg & Lee (1994)',
    rules: [
      'UG-R7',
      'UG-R8',
      'UG-R9',
      'UG-R10',
      'UG-R11',
      'UG-R12',
      'UG-R13',
      'UG-R14',
      'UG-R15',
      'UG-R16',
    ],
    formulas: [
      tex`\text{cuele en planta: } B_1=\min\!\left(1.5\Phi,\ \tfrac{\Phi}{2}+B\right),\ B=8.8\cdot10^{-2}\sqrt{\frac{A_h\,q\,s}{d\,c}}`,
      tex`\text{VCR: carga esferica }6d,\ d_o=\Delta_o N,\ N=E_v W^{1/3}`,
      tex`\text{retardos: }25\text{--}50\ \mathrm{ms}\ \text{entre taladros},\ 75\text{--}150\ \mathrm{ms}\ \text{entre filas}`,
    ],
    variables: [
      v('pf', 'K', 'factor de carga del prediseño', 'pre-design powder factor', '', {
        decimals: 2,
        output: true,
      }),
      v('min', 'K_{min}', 'objetivo mínimo', 'target minimum', '', { decimals: 2 }),
      v('max', 'K_{max}', 'objetivo máximo', 'target maximum', '', { decimals: 2 }),
    ],
    confidence: '[CG] · R0',
    assumptions: [
      t(
        'Son valores por defecto de manuales: ajústelos a su mina; no bloquean.',
        'They are handbook defaults: adjust them to your mine; they do not block.',
      ),
      t(
        'Frentes, rampas y cámaras reutilizan el método sueco (UG-R7).',
        'Faces, ramps and chambers reuse the Swedish method (UG-R7).',
      ),
    ],
    status: 'implemented',
    where: t(
      'Subterránea › Método de minado › (plantilla)',
      'Underground › Mining method › (template)',
    ),
  },
  // ------------------------------------------------------------------ Cubicación
  {
    id: 'volume.bench',
    topic: 'volume',
    name: t('Cubicación de banco', 'Bench volume'),
    authors: 'López Jimeno et al. (1995)',
    reference: 'López Jimeno et al. (1995), Drilling and Blasting of Rocks',
    rules: ['FC-02', 'FC-03', 'FC-13', 'FC-14'],
    formulas: [
      tex`V=B\,S\,H\ \ (/\cos\alpha),\qquad t=V\rho_r`,
      tex`\text{factor de carga}=\frac{Q}{V},\qquad \text{factor de potencia}=\frac{Q}{V\rho_r}`,
    ],
    variables: [
      v('v', 'V', 'volumen', 'volume', 'm³', { decimals: 0 }),
      v('rho', String.raw`\rho_r`, 'densidad de roca', 'rock density', 'kg/m³', { decimals: 0 }),
      v('q', 'Q', 'explosivo', 'explosive', 'kg', { decimals: 0 }),
      v('lf', 'Q/V', 'factor de carga', 'loading factor', 'kg/m³', { decimals: 3, output: true }),
      v('pf', 'Q/t', 'factor de potencia', 'powder factor', 'kg/t', { decimals: 3, output: true }),
    ],
    confidence: 'R3',
    assumptions: [
      t(
        'El volumen real usa el área de influencia de cada taladro (Voronoi) por la altura; el nominal B·S·H.',
        'The actual volume uses each hole’s influence area (Voronoi) times height; nominal is B·S·H.',
      ),
    ],
    status: 'implemented',
    where: t('Resultados › Carga', 'Results › Charge'),
  },
  {
    id: 'volume.underground',
    topic: 'volume',
    name: t('Cubicación subterránea', 'Underground volume'),
    authors: 'López Jimeno et al. (1995); Holmberg (1982)',
    reference: 'López Jimeno et al. (1995); Holmberg (1982)',
    rules: ['FC-UG4', 'UG-P10'],
    formulas: [
      tex`V_{frente}=A_{seccion}(1+OB)\cdot L_{perf}\,\eta`,
      tex`V_{abanicos}=(A_{tajeo}-A_{galeria})\cdot B\cdot N_{anillos}`,
    ],
    variables: [
      v('area', 'A', 'área de la sección', 'section area', 'm²', { decimals: 2 }),
      v('eff', String.raw`\eta`, 'eficiencia de avance', 'advance efficiency', '%', {
        decimals: 0,
      }),
      v('ob', 'OB', 'sobreexcavación', 'overbreak', '%', { decimals: 0 }),
      v('volume', 'V', 'volumen', 'volume', 'm³', { decimals: 1, output: true }),
    ],
    confidence: '[CG]',
    assumptions: [
      t(
        'η = 0,9 por defecto (0,85–0,95). El área sale de la excavación guardada o, sin ella, del contorno de las bocas (subestima).',
        'η = 0.9 by default (0.85–0.95). The area comes from the saved excavation or, without it, from the collar hull (underestimates).',
      ),
    ],
    status: 'implemented',
    where: t(
      'Subterránea › Análisis › Cubicación · Resultados',
      'Underground › Analysis › Volume · Results',
    ),
  },
  // ------------------------------------------------------------------ Secuencia
  {
    id: 'sequence.coupling',
    topic: 'sequence',
    name: t('Acoplamiento (carga por retardo)', 'Coupling (charge per delay)'),
    authors: 'Siskind et al. (1980); Blair (1987, 2008); Hinzen (1988)',
    reference: 'USBM RI 8507; Blair (2008) Int. J. Rock Mech. Min. Sci.',
    rules: ['FC-UG2', 'FC-23', 'DF-12'],
    formulas: [
      tex`\lvert t_i-t_j\rvert<w\ \Rightarrow\ \text{misma carga},\qquad w=8\ \mathrm{ms}`,
      tex`\text{en el receptor: } \left\lvert\left(t_i+\frac{R_i}{V_p}\right)-\left(t_j+\frac{R_j}{V_p}\right)\right\rvert<w`,
    ],
    variables: [
      v('w', 'w', 'ventana', 'window', 'ms', { decimals: 0 }),
      v('vp', 'V_p', 'velocidad de onda P', 'P-wave velocity', 'm/s', { decimals: 0 }),
      v('groups', 'N', 'grupos acoplados', 'coupled groups', '', { decimals: 0, output: true }),
    ],
    confidence: '[CG] · [P]',
    assumptions: [
      t(
        'Los taladros en cadena (cada uno a menos de w del anterior) forman un grupo.',
        'Chained holes (each within w of the previous one) form a group.',
      ),
    ],
    status: 'implemented',
    where: t(
      'Subterránea › Análisis › Secuencia · Tiempos',
      'Underground › Analysis › Sequence · Timing',
    ),
  },
  {
    id: 'sequence.waveCutoff',
    topic: 'sequence',
    name: t('Corte por la onda del vecino', 'Cut-off by a neighbour’s wave'),
    authors: 'Sumiya et al.; Missouri S&T',
    reference: 'Sumiya et al., Science and Technology of Energetic Materials 66(2)',
    rules: ['FC-UG3'],
    formulas: [
      tex`\text{riesgo si } d\le d_c\ \text{y}\ t_2>t_1+\frac{d}{V_p},\qquad d_c=0.5\ \mathrm{m}\ (\times2\ \text{con agua})`,
    ],
    variables: [
      v('dc', 'd_c', 'distancia crítica en seco', 'dry critical distance', 'm', { decimals: 2 }),
      v('vp', 'V_p', 'velocidad de onda P', 'P-wave velocity', 'm/s', { decimals: 0 }),
      v('risks', 'N', 'pares en riesgo', 'pairs at risk', '', { decimals: 0, output: true }),
    ],
    confidence: '[P] · d_c [V]',
    assumptions: [
      t(
        'd/Vp son décimas de ms: la defensa práctica es la distancia o un explosivo menos sensible.',
        'd/Vp is tenths of a ms: the practical defence is distance or a less sensitive explosive.',
      ),
      t(
        'Los alivios vacíos no cuentan; los pares dentro de la ventana se informan como acoplamiento.',
        'Empty relief holes do not count; pairs inside the window are reported as coupling.',
      ),
    ],
    status: 'implemented',
    where: t('Subterránea › Análisis › Secuencia', 'Underground › Analysis › Sequence'),
  },
  // ------------------------------------------------------------------ Pila banco
  {
    id: 'muckpile.zhang',
    topic: 'muckpile',
    name: t('Velocidad de burden de Zhang et al.', 'Zhang et al. burden velocity'),
    authors: 'Zhang, Chi & Yi (2021)',
    reference:
      'Zhang, Chi & Yi (2021), J. Rock Mech. Geotech. Eng., doi 10.1016/j.jrmge.2021.04.004',
    rules: ['FC-36', 'FC-37', 'FC-39'],
    formulas: [
      tex`v_B=\sqrt{\frac{\pi\,c_B\,\rho_e\,e_e\,c_e}{2\,\rho_r\tan\theta}}\cdot\frac{d}{B}`,
    ],
    variables: [
      v('cb', 'c_B', 'fracción de energía cinética', 'kinetic energy fraction', '', {
        decimals: 2,
      }),
      v('theta', String.raw`\theta`, 'semiángulo de rotura', 'breakage half-angle', '°', {
        decimals: 0,
      }),
      v('v', 'v_B', 'velocidad media', 'mean velocity', 'm/s', { decimals: 1, output: true }),
    ],
    confidence: 'R3',
    assumptions: [
      t(
        'Solo carga acoplada y B/Ø ≥ 7; con burden efectivo (FC-22) y reducción por fila k = 0,7 (R0).',
        'Coupled charge only and B/Ø ≥ 7; with effective burden (FC-22) and row reduction k = 0.7 (R0).',
      ),
    ],
    status: 'implemented',
    where: t('Análisis › Pila › Modelo de velocidad', 'Analysis › Muckpile › Velocity model'),
  },
  {
    id: 'muckpile.scaledBurden',
    topic: 'muckpile',
    name: t('Ley de potencia del burden escalado', 'Scaled-burden power law'),
    authors: 'Cronos (forma análoga a Richards & Moore)',
    reference: 'Pedido del usuario (A7); constantes de calibración del sitio',
    rules: ['FC-40'],
    formulas: [tex`v_0=k\left(\frac{Q^{1/3}}{B_{ef}}\right)^{n}`],
    variables: [
      v('k', 'k', 'constante', 'constant', 'm/s', { decimals: 2 }),
      v('n', 'n', 'exponente', 'exponent', '', { decimals: 2 }),
      v('v', 'v_0', 'velocidad media', 'mean velocity', 'm/s', { decimals: 1, output: true }),
    ],
    confidence: 'R0',
    assumptions: [
      t(
        'k y n sin fuente publicada: se calibran contra una superficie medida (calibración por grilla).',
        'k and n have no published source: calibrate them against a measured surface (grid calibration).',
      ),
    ],
    status: 'implemented',
    where: t('Análisis › Pila › Modelo de velocidad', 'Analysis › Muckpile › Velocity model'),
  },
  {
    id: 'muckpile.richardsMoore',
    topic: 'muckpile',
    name: t('Velocidad de cara de Richards & Moore', 'Richards & Moore face velocity'),
    authors: 'Richards & Moore (2004); Workman & Calder (1994)',
    reference: 'Richards & Moore (2004), «Flyrock control – by chance or design», 30th ISEE Conf.',
    rules: ['FC-45'],
    formulas: [tex`V_0=k\left(\frac{\sqrt{m}}{B}\right)^{1.3}`],
    variables: [
      v('k', 'k', 'constante (13,5 blanda, 27 dura)', 'constant (13.5 soft, 27 hard)', 'm/s', {
        decimals: 2,
      }),
      v('n', 'n', 'exponente', 'exponent', '', { decimals: 2 }),
      v('v', 'V_0', 'velocidad media', 'mean velocity', 'm/s', { decimals: 1, output: true }),
    ],
    confidence: 'R1',
    assumptions: [
      t(
        'Es la velocidad del caso peor de proyección: tiende a alargar la pila.',
        'It is the worst-case flyrock velocity: it tends to lengthen the pile.',
      ),
      t('m en kg/m, B = burden efectivo.', 'm in kg/m, B = effective burden.'),
    ],
    status: 'implemented',
    where: t('Análisis › Pila › Modelo de velocidad', 'Analysis › Muckpile › Velocity model'),
  },
  {
    id: 'muckpile.kinematic',
    topic: 'muckpile',
    name: t('Cinemática de bloques y reposo', 'Block kinematics and repose'),
    authors: 'Yang, Kavetsky & McKenzie (1989); López Jimeno (1995); Porter & Bleiwas (2003)',
    reference: 'Yang & Kavetsky (1990) IJMGE 8:13–34; USGS OFR 03-143',
    rules: ['FC-39', 'FC-41', 'FC-42', 'FC-43', 'FC-44', 'FC-46'],
    formulas: [
      tex`v_{bloque}=v_0\cdot f_{taco}\cdot f_{piso}\cdot e^{-0.2\,r/B}`,
      tex`V_{suelto}=S\cdot V_{in\ situ},\qquad \text{reposo }\varphi=37^\circ`,
    ],
    variables: [
      v('swell', 'S', 'esponjamiento', 'swell', '', { decimals: 2 }),
      v('repose', String.raw`\varphi`, 'ángulo de reposo', 'angle of repose', '°', {
        decimals: 0,
      }),
    ],
    confidence: 'R1 · R0',
    assumptions: [
      t(
        'Tiro parabólico de cada bloque hasta la superficie actual y avalancha que conserva volumen.',
        'Parabolic flight of each block to the current surface and a volume-preserving avalanche.',
      ),
      t(
        'Atenuaciones del bloque (taco ×0,5, piso ×0,7) sin fuente numérica (S-21): calibrar.',
        'Block attenuations (stemming ×0.5, floor ×0.7) have no numeric source (S-21): calibrate.',
      ),
    ],
    status: 'implemented',
    where: t('Análisis › Pila', 'Analysis › Muckpile'),
  },
  // ------------------------------------------------------------------ Pila subterránea
  {
    id: 'ugMuckpile.chamber',
    topic: 'ugMuckpile',
    name: t('Pila subterránea (modelo cinemático)', 'Underground muckpile (kinematic model)'),
    authors: 'Richards & Moore (2004), adaptado; Petropoulos (2024); Zhu (2024); Dick (1970)',
    reference:
      'Petropoulos (2024) MassMin, Kiruna (10–32 m/s medidos); Zhu (2024) Engineering Blasting 30(3) (DEM, 10 m/s); USBM RI 7356 (pilas de 13,7–23,5 m)',
    rules: [
      'UG-P1',
      'UG-P2',
      'UG-P2b',
      'UG-P3',
      'UG-P4',
      'UG-P5',
      'UG-P6',
      'UG-P7',
      'UG-P8',
      'UG-P9',
    ],
    formulas: [
      tex`v=k\left(\frac{\sqrt{m}}{B}\right)^{n},\ 3\le v\le 25\ \mathrm{m/s}\ (\times0.35\ \text{tajeos})`,
      tex`\text{choque: } v_n'=-e\,v_n,\ v_t'=0.8\,v_t;\qquad d_{desliz}=\frac{v^2}{2\mu g}`,
      tex`V_{pila}=S\cdot V_{in\ situ}`,
    ],
    variables: [
      v('k', 'k', 'constante de velocidad', 'velocity constant', 'm/s', { decimals: 1 }),
      v('n', 'n', 'exponente', 'exponent', '', { decimals: 2 }),
      v('swell', 'S', 'esponjamiento', 'swell', '', { decimals: 2 }),
      v('repose', String.raw`\varphi`, 'ángulo de reposo', 'angle of repose', '°', {
        decimals: 0,
      }),
      v('throw', 'f', 'factor de alcance', 'throw factor', '', { decimals: 2 }),
    ],
    confidence: '[P] ley · [V] rango de velocidades',
    assumptions: [
      t(
        'Usar Richards & Moore (flyrock de superficie) como velocidad de salida en subterránea es una adaptación propia [P]: ningún paper la valida; sin calibrar tiende a sobreestimar el alcance.',
        'Using Richards & Moore (surface flyrock) as underground launch velocity is our own adaptation [P]: no paper validates it; uncalibrated it tends to overestimate throw.',
      ),
      t(
        'Las velocidades que produce caen en lo medido: 10–32 m/s en Kiruna (Petropoulos 2024) y 10 m/s en un DEM calibrado (Zhu 2024) [V].',
        'Its velocities fall within measured values: 10–32 m/s at Kiruna (Petropoulos 2024) and 10 m/s in a calibrated DEM (Zhu 2024) [V].',
      ),
      t(
        'Es una estimación que se calibra con la pila medida (factor de alcance), no una predicción con error conocido: ninguna fuente da un error numérico.',
        'It is an estimate calibrated with the measured pile (throw factor), not a prediction with a known error: no source gives a numeric error.',
      ),
      t(
        'Frentes: alcance típico 10–25 m (USBM RI 7356). Tajeos abiertos ×0,35 [P]; sublevel caving casi sin vuelo (×0,1, UG-P2b). Esponjamiento 1,4–1,8.',
        'Faces: typical throw 10–25 m (USBM RI 7356). Open stopes ×0.35 [P]; sublevel caving almost no flight (×0.1, UG-P2b). Swell 1.4–1.8.',
      ),
    ],
    status: 'implemented',
    where: t('Subterránea › Análisis › Pila de material', 'Underground › Analysis › Muckpile'),
  },
  // ------------------------------------------------------------------ Simulación
  {
    id: 'simulation.visual',
    topic: 'simulation',
    name: t('Simulación visual de la secuencia', 'Visual sequence simulation'),
    authors: 'Cronos',
    reference: 'Tiempos de detonación por Dijkstra sobre los retardos (FC-21)',
    rules: ['FC-21'],
    formulas: [tex`t_{det}=t_{llegada}+\text{retardo de fondo}`],
    variables: [],
    confidence: 'R3 (tiempos) · visual',
    assumptions: [
      t(
        'No calcula nada nuevo: reproduce en el tiempo los resultados de Tiempos, Energía y Pila.',
        'It computes nothing new: it replays the Timing, Energy and Muckpile results over time.',
      ),
      t(
        'Los efectos (destello, polvo) son ilustrativos.',
        'Effects (flash, dust) are illustrative.',
      ),
    ],
    status: 'visual',
    where: t(
      'Subterránea › Análisis › Simular voladura · Tiempos › Reproducir',
      'Underground › Analysis › Simulate blast · Timing › Play',
    ),
  },
  // ------------------------------------------------------------------ Proyección
  {
    id: 'flyrock.lundborg',
    topic: 'flyrock',
    name: t('Alcance máximo de Lundborg', 'Lundborg maximum range'),
    authors: 'Lundborg (1981)',
    reference: 'Lundborg (1981), SveDeFo report DS 1981:5',
    rules: ['FC-29'],
    formulas: [
      tex`L_{max}=260\,d^{2/3}\ [\mathrm{m}],\qquad T=0.1\,d^{2/3}\ [\mathrm{m}]\quad(d\ \text{en pulgadas})`,
    ],
    variables: [
      v('d', 'd', 'diámetro', 'diameter', 'mm', { decimals: 0 }),
      v('sf', 'F_s', 'factor de seguridad', 'safety factor', '', { decimals: 2 }),
      v('range', 'L_{max}', 'alcance', 'range', 'm', { decimals: 0, output: true }),
    ],
    confidence: 'R1',
    assumptions: [
      t(
        'Cota superior sin taco ni burden: sirve para la zona de exclusión, no para el diseño.',
        'Upper bound ignoring stemming and burden: for the exclusion zone, not for design.',
      ),
    ],
    status: 'implemented',
    where: t('Análisis › Vibración › Proyección (flyrock)', 'Analysis › Vibration › Flyrock'),
  },
  {
    id: 'flyrock.airblast',
    topic: 'flyrock',
    name: t('Sobrepresión (raíz cúbica)', 'Airblast (cube root)'),
    authors: 'Siskind et al. (1980); Persson, Holmberg & Lee (1994)',
    reference: 'USBM RI 8485; ISEE Blasters’ Handbook',
    rules: ['FC-30', 'CT-05'],
    formulas: [
      tex`P=K\left(\frac{R}{\sqrt[3]{Q}}\right)^{-\beta},\qquad dB=20\log_{10}\frac{P}{20\,\mu\mathrm{Pa}}`,
    ],
    variables: [
      v('k', 'K', 'constante', 'constant', 'kPa', { decimals: 0 }),
      v('beta', String.raw`\beta`, 'exponente', 'exponent', '', { decimals: 3 }),
    ],
    confidence: 'R1',
    assumptions: [t('β típico 1,2–1,5; K es del sitio.', 'Typical β 1.2–1.5; K is site-specific.')],
    status: 'implemented',
    where: t('Análisis › Vibración › Sobrepresión', 'Analysis › Vibration › Airblast'),
  },
  // ------------------------------------------------------------------ Geotecnia
  {
    id: 'geotech.correlations',
    topic: 'geotech',
    name: t('Correlaciones geotécnicas', 'Geotechnical correlations'),
    authors: 'Bieniawski (1976); Hoek & Diederichs (2006); Barton (2002); Sheorey (1997)',
    reference: 'IJRMMS 43 (Hoek & Diederichs 2006); IJRMMS 39 (Barton 2002); Goodman (1989)',
    rules: [
      'GE-01',
      'GE-02',
      'GE-03',
      'GE-04',
      'GE-05',
      'GE-06',
      'GE-07',
      'GE-08',
      'GE-09',
      'GE-12',
    ],
    formulas: [
      tex`RMR=9\ln Q+44,\qquad GSI\approx RMR_{89}-5`,
      tex`E_m=E_i\left(0.02+\frac{1-D/2}{1+e^{(60+15D-GSI)/11}}\right),\quad E_i=MR\cdot UCS`,
      tex`V_p\approx 3.5+\log_{10}\frac{Q\,UCS}{100}\ [\mathrm{km/s}],\qquad \sigma_t\approx\frac{UCS}{12}`,
      tex`A\approx0.06\left(10+40\,\frac{RMR-20}{60}+RDI+HF\right)`,
    ],
    variables: [
      v('rmr', 'RMR', 'clasificación del macizo', 'rock mass rating', '', { decimals: 0 }),
      v('ucs', 'UCS', 'resistencia a compresión', 'compressive strength', 'MPa', { decimals: 0 }),
      v('e', 'E', 'módulo de Young', 'Young’s modulus', 'GPa', { decimals: 1 }),
      v('vp', 'V_p', 'velocidad de onda P', 'P-wave velocity', 'm/s', { decimals: 0 }),
    ],
    confidence: 'R1 · GE-08 R0',
    assumptions: [
      t(
        'Orden: columna del modelo → tabla de litologías → correlación → roca del proyecto.',
        'Order: model column → lithology table → correlation → project rock.',
      ),
      t(
        'Sin «Roca desde modelo geotécnico» ningún resultado cambia.',
        'Without «Rock from geotechnical model» no result changes.',
      ),
    ],
    status: 'implemented',
    where: t('Topografía › Modelo geotécnico › Roca', 'Topography › Geotechnical model › Rock'),
  },
] as const satisfies readonly MethodModel[];

/** Identificador de un modelo del catálogo (el tipo impide pedir un «Detalle» sin modelo). */
export type MethodId = (typeof MODELS_LIST)[number]['id'];

export const METHOD_MODELS: readonly MethodModel[] = MODELS_LIST;

const BY_ID = new Map<string, MethodModel>(METHOD_MODELS.map((m) => [m.id, m]));

export function methodModel(id: MethodId): MethodModel {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Modelo desconocido: ${id}`);
  return m;
}

export function isMethodId(id: string): id is MethodId {
  return BY_ID.has(id);
}

export function topicModels(topic: MethodTopicId): MethodModel[] {
  return METHOD_MODELS.filter((m) => m.topic === topic);
}

/**
 * Metodologías elegibles: cada opción liga el valor que guarda el proyecto con su modelo del
 * catálogo. Solo modelos implementados; los previstos se nombran en el «Detalle» como próximos.
 */
export const METHOD_CHOICES = {
  vibrationLaw: [
    { value: 'square-root', model: 'vibration.usbm' },
    { value: 'cube-root', model: 'vibration.ambraseys' },
    { value: 'langefors', model: 'vibration.langefors' },
  ],
  fragmentationModel: [
    { value: 'cunningham1987', model: 'fragmentation.cunningham1987' },
    { value: 'cunningham2005', model: 'fragmentation.cunningham2005' },
  ],
  fragmentationCurve: [
    { value: 'swebrec', model: 'fragmentation.swebrec' },
    { value: 'rosinRammler', model: 'fragmentation.rosinRammler' },
  ],
  nearFieldModel: [
    { value: 'holmbergPersson', model: 'energy.holmbergPersson' },
    { value: 'nioshModified', model: 'energy.nioshModified' },
  ],
  damageCriterion: [
    { value: 'vppcMultiples', model: 'energy.criticalPpv' },
    { value: 'bauerCalder', model: 'energy.bauerCalder' },
  ],
  muckpileVelocity: [
    { value: 'zhang', model: 'muckpile.zhang' },
    { value: 'scaledBurden', model: 'muckpile.scaledBurden' },
    { value: 'richardsMoore', model: 'muckpile.richardsMoore' },
  ],
} as const satisfies Record<string, readonly { value: string; model: MethodId }[]>;

export type MethodChoiceId = keyof typeof METHOD_CHOICES;

/** Modelo del catálogo de la opción `value` de una elección. */
export function choiceModel(choice: MethodChoiceId, value: string): MethodId {
  const options: readonly { value: string; model: MethodId }[] = METHOD_CHOICES[choice];
  return (options.find((o) => o.value === value) ?? options[0])?.model ?? 'vibration.usbm';
}

/** Modelos previstos del mismo tema (para nombrarlos como «próximamente» en el Detalle). */
export function plannedAlternatives(id: MethodId): MethodModel[] {
  const m = methodModel(id);
  return METHOD_MODELS.filter((x) => x.topic === m.topic && x.status === 'planned');
}
