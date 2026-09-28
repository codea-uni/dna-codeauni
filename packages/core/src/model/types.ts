/**
 * Modelo de dominio de Cronos (convenciones en docs/ARCHITECTURE.md).
 * Unidades SI internamente; coordenadas de proyecto X = Este, Y = Norte, Z = Cota (Z arriba).
 */
import type { SCHEMA_VERSION } from './schema';

// ===================== Primitivas y unidades =====================
/** Alias documentales de unidades SI (el compilador no los distingue; el nombre es el contrato). */
export type Meters = number; // m
export type Kilograms = number; // kg
export type Seconds = number; // s
export type Radians = number; // rad
export type Pascals = number; // Pa
export type KgPerM3 = number; // kg/m³
export type MetersPerSecond = number; // m/s
export type JoulesPerKg = number; // J/kg
export type Ratio = number; // adimensional
export type Money = number; // moneda del proyecto (Project.currency)

/** Identificador estable con marca de tipo (UUID v7). */
export type Id<B extends string> = string & { readonly __brand: B };
export type ProjectId = Id<'Project'>;
export type BlastId = Id<'Blast'>;
export type PatternId = Id<'Pattern'>;
export type HoleId = Id<'Hole'>;
export type DeckId = Id<'Deck'>;
export type ExplosiveId = Id<'Explosive'>;
export type DetonatorId = Id<'Detonator'>;
export type SurfaceConnectorId = Id<'SurfaceConnector'>;
export type PrimerId = Id<'Primer'>;
export type StemmingMaterialId = Id<'StemmingMaterial'>;
export type RockMassId = Id<'RockMass'>;
export type SurfaceId = Id<'Surface'>;
export type SurfaceNodeId = Id<'SurfaceNode'>;
export type ConnectionId = Id<'Connection'>;
export type InitiationPointId = Id<'InitiationPoint'>;
export type VibrationLawId = Id<'VibrationLaw'>;
export type FreeFaceId = Id<'FreeFace'>;
export type InHoleInitiatorId = Id<'InHoleInitiator'>;
export type BoundaryId = Id<'Boundary'>;
export type MonitoringPointId = Id<'MonitoringPoint'>;
export type HoleGroupId = Id<'HoleGroup'>;

/** Punto en coordenadas de proyecto [m], float64. */
export interface Vec3 {
  x: Meters;
  y: Meters;
  z: Meters;
}
export interface Vec2 {
  x: Meters;
  y: Meters;
}
/** Polígono cerrado en planta (el último vértice no repite el primero). */
export type Polygon2 = readonly Vec2[];

// ===================== Archivo y proyecto =====================

/** Envoltorio serializado (.cronos.json). */
export interface ProjectFile {
  format: 'cronos-project';
  schemaVersion: typeof SCHEMA_VERSION; // migraciones en io/migrations
  savedAt: string; // ISO 8601
  appVersion: string;
  project: Project;
}

export interface Project {
  id: ProjectId;
  name: string;
  description?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  currency: string; // ISO 4217, p.ej. "USD"
  coordinateSystem: CoordinateSystem;
  library: ProductLibrary;
  rockMasses: RockMass[];
  siteModels: SiteModels;
  surfaces: Surface[];
  blasts: Blast[];
  /** Puntos de control (monitoreo de vibración y sobrepresión). */
  monitoringPoints?: MonitoringPoint[];
  /** Límites de PPV por distancia (RM-21: tabla configurable con fuente, no constantes). */
  ppvLimits?: PpvLimit[];
  /** Preferencias de visualización; nunca afectan cálculos. */
  displayUnits: DisplayUnits;
}

export interface MonitoringPoint {
  id: MonitoringPointId;
  name: string;
  /** Ubicación del receptor [m]. */
  position: Vec3;
  /** PPV admisible en este punto [m/s]; si falta, se toma de `Project.ppvLimits` por distancia. */
  ppvLimit?: MetersPerSecond;
  /** K y β propios del punto (sobrescriben la ley del sitio; K con PPV en m/s). */
  k?: number;
  beta?: number;
  /** Tipo de estructura (vivienda, planta, línea…): elige las filas de `Project.ppvLimits` (P-12). */
  structure?: string;
}

/**
 * Fila de la tabla de límites de vibración (`docs/theory/03 §2`, P-12): por tipo de estructura
 * (opcional; sin él aplica a todas) y rango de distancia. Los valores salen del instrumento de
 * gestión ambiental de la operación (EIA) y llevan su fuente.
 */
export interface PpvLimit {
  /** Tipo de estructura al que aplica; sin valor, a todas. */
  structure?: string;
  /** Distancia desde [m] (incluida). */
  from: Meters;
  /** Distancia hasta [m] (excluida); sin valor = sin límite superior. */
  to?: Meters;
  /** PPV máximo admisible [m/s]. */
  ppvMax: MetersPerSecond;
  /** Norma o criterio de donde sale el valor (obligatorio). */
  source: string;
}

export interface CoordinateSystem {
  name?: string;
  epsg?: number;
  /** Origen local [m] restado antes de enviar geometría a la GPU (precisión float32). */
  origin: Vec3;
}

// ===================== Voladura y banco =====================
export type BlastStatus = 'design' | 'drilled' | 'loaded' | 'fired';

export interface Blast {
  id: BlastId;
  name: string;
  status: BlastStatus;
  bench: Bench;
  rockMassId: RockMassId;
  /** Perímetros de la voladura en planta (cubicación, generación de mallas y caras libres). */
  boundaries: BlastBoundary[];
  freeFaces: FreeFace[];
  /** Grupos de taladros (precorte, buffer, producción…), RM-18. */
  groups: HoleGroup[];
  patterns: Pattern[];
  holes: Hole[];
  initiation: InitiationPlan;
  /** Parámetros de cálculo de esta voladura. */
  calcParams: CalcParams;
  notes?: string;
}

/**
 * Parámetros de cálculo guardados con la voladura (`docs/theory/03 §2`, «parametros_calculo»).
 * Las reglas por debajo de R3 son parámetros, no constantes (`docs/reglas.md`).
 */
export interface CalcParams {
  /** Ventana de la carga máxima por retardo [s], semiabierta [t, t + w) (DF-12: 8 ms). */
  micWindow: Seconds;
  /** γ de la presión de detonación PD = ρ·VOD²/(γ + 1) (DF-02: 3). */
  detonationGamma: Ratio;
  /**
   * Tiempo de alivio por metro de burden [s/m] (P-02): un taladro previo cuenta como cara libre si
   * detonó al menos reliefRate·B antes. Defecto 3 ms/m (roca dura; 5–6 ms/m en roca blanda); 0 es
   * el caso límite optimista.
   */
  reliefRate: number;
  /**
   * Sobreperforación de taladros inclinados (P-05): `vertical` = J bajo el piso medido en vertical,
   * L = (H + J)/cos α (geometría exacta, defecto); `lopezJimeno` = L = H/cos α + (1 − α°/100)·J y
   * volumen B·S·H/cos α (criterio empírico con el que se construyó CR-03).
   */
  subdrillConvention: SubdrillConvention;
  /**
   * Guía de retardos por metro [s/m] (H-505, `02 §3`, P-11): entre taladros de una fila por metro de
   * espaciamiento (3–8 ms/m) y entre filas por metro de burden (6–12 ms/m). Solo avisa.
   */
  delayGuide: { interHole: { min: number; max: number }; interRow: { min: number; max: number } };
  /** Umbrales de la revisión del diseño. */
  checks: {
    /** Taco mínimo como fracción del burden (DF-09: 0,7). */
    minStemmingRatio: Ratio;
    /** Bocas a menos de esta distancia se consideran duplicadas [m] (⚙). */
    duplicateDistance: Meters;
    /** Radio de vecindad como múltiplo del mayor entre B y S (⚙). */
    neighborFactor: Ratio;
    /** Taco máximo como fracción del burden (CK-02: 1,3). */
    maxStemmingRatio: Ratio;
    /** Taco en diámetros (CK-02: 15–25·Ø). */
    stemmingDiameterRatio: { min: Ratio; max: Ratio };
    /** Sobreperforación en burdens (CK-03: 0,2–0,5·B). */
    subdrillBurdenRatio: { min: Ratio; max: Ratio };
    /** Rigidez H/B igual o menor: atención (CK-01: 2). */
    minStiffness: Ratio;
    /** Altura de banco en diámetros (CK-04: 50–70). */
    benchDiameterRatio: { min: Ratio; max: Ratio };
    /** Taco mínimo en diámetros (P-04: ~20·Ø). */
    minStemmingDiameters: Ratio;
    /** Profundidad escalada de enterramiento [m/kg^(1/3)]: severa por debajo, sin proyección por encima (DF-20). */
    sdob: { severe: number; safe: number };
    /** Factor de roca A de Kuz-Ram fuera de este rango: aviso (P-08: 0,8–22). */
    rockFactorRange: { min: Ratio; max: Ratio };
    /** Burden efectivo ≥ este múltiplo del nominal: cara libre no despejada (FC-22, CR-05: 2). */
    maxEffectiveBurdenRatio: Ratio;
    /** Burden efectivo < este múltiplo del nominal: alivio muy cercano (informativo, 0,5). */
    minEffectiveBurdenRatio: Ratio;
  };
}

export type SubdrillConvention = 'vertical' | 'lopezJimeno';

export type HoleGroupKind = 'presplit' | 'buffer' | 'production' | 'other';

/** Grupo de taladros con su configuración por defecto (`docs/theory/03 §2`). */
export interface HoleGroup {
  id: HoleGroupId;
  name: string;
  kind: HoleGroupKind;
  /** Color de presentación (#rrggbb). */
  color: string;
  /** Diámetro, sobreperforación, inclinación y regla de carga por defecto. */
  template?: HoleTemplate;
}

/**
 * Perímetro de voladura. Las aristas marcadas como cara libre (talud) indican hacia dónde se
 * desplaza el material: hacia afuera del polígono, a través de esa arista.
 */
export interface BlastBoundary {
  id: BoundaryId;
  name: string;
  /** Polígono cerrado en planta (el último vértice no repite el primero) [m]. */
  polygon: Polygon2;
  /** Índices de aristas de cara libre; la arista i va del vértice i al i+1 (la última cierra con el 0). */
  freeFaceEdges: number[];
}

export interface Bench {
  /** Cota de piso/grade [m]. */
  floorElevation: Meters;
  /** Altura nominal de banco [m]. */
  height: Meters;
  /** Topografía de la superficie superior (opcional; si falta, plano en floorElevation + height). */
  topSurfaceId?: SurfaceId;
  /** Superficie de piso de diseño (opcional; si falta, plano en floorElevation). */
  floorSurfaceId?: SurfaceId;
  /** Ángulo de la cara del banco medido desde la horizontal [rad]. */
  faceAngle: Radians;
}

export interface FreeFace {
  id: FreeFaceId;
  /** Línea de cresta de la cara libre [m]. */
  crest: Vec3[];
  /** Línea de pie (opcional) [m]. */
  toe?: Vec3[];
}

/** Topografía como TIN. Los buffers grandes se guardan en OPFS y aquí solo la referencia. */
export interface Surface {
  id: SurfaceId;
  name: string;
  kind: 'topography' | 'floor' | 'other';
  /** Vértices [x0,y0,z0, x1,...] en m (coordenadas de proyecto). */
  vertices: number[];
  /** Índices de triángulos. */
  triangles: number[];
}

// ===================== Malla / patrón =====================
export type PatternKind = 'square' | 'rectangular' | 'staggered';

/** Parámetros con los que se generó un grupo de taladros. Tras generarlos, cada taladro es editable individualmente. */
export interface Pattern {
  id: PatternId;
  name: string;
  kind: PatternKind; // 'staggered' = tresbolillo
  burden: Meters; // distancia entre filas
  spacing: Meters; // distancia entre taladros de una fila
  /** Origen del patrón (primer taladro de la primera fila) [m]. */
  origin: Vec2;
  /** Azimut de la dirección de las filas [rad], horario desde el Norte. */
  rowAzimuth: Radians;
  /** Sentido de avance de las filas respecto a rowAzimuth. */
  rowAdvance: 'left' | 'right';
  rows: number;
  holesPerRow: number;
  /** Si existe, recorta el patrón a este polígono. */
  clipBoundary?: Polygon2;
  /** Perímetro con el que se generó (si se recortó a uno). */
  boundaryId?: BoundaryId;
  holeTemplate: HoleTemplate;
}

export interface HoleTemplate {
  diameter: Meters;
  inclination: Radians;
  azimuth: Radians;
  subdrill: Meters;
  /** Decks por defecto aplicados al generar (longitudes relativas se resuelven en charging). */
  chargeRule?: ChargeRule;
}

/** Regla de carguío paramétrica (p.ej. "taco 3 m, resto explosivo X"). */
export interface ChargeRule {
  stemmingLength: Meters;
  stemmingMaterialId: StemmingMaterialId;
  explosiveId: ExplosiveId;
  /** Aire/tapón opcional entre carga y taco. */
  airDeckLength?: Meters;
  primerId?: PrimerId;
  detonatorId?: DetonatorId;
  /** Distancia del primer al fondo [m]. */
  primerOffsetFromToe: Meters;
}

// ===================== Taladro =====================
export type HoleWater = 'dry' | 'static' | 'dynamic';

export type HoleStatus = 'designed' | 'drilled' | 'loaded' | 'fired' | 'abandoned';

export interface Hole {
  id: HoleId;
  /** Etiqueta visible, única dentro de la voladura (p.ej. "R3-12"). */
  label: string;
  patternId?: PatternId;
  row?: number;
  col?: number;
  groupId?: HoleGroupId;
  /** Estado de agua (RM-02, P-09): filtra productos por resistencia al agua. */
  water?: HoleWater;
  /** Boca del taladro [m]. */
  collar: Vec3;
  diameter: Meters;
  /** Longitud total a lo largo del eje, boca → fondo [m]. Fuente de verdad de la geometría. */
  length: Meters;
  /** Ángulo desde la vertical [rad]; 0 = vertical. */
  inclination: Radians;
  /** Rumbo de la proyección horizontal del eje [rad], horario desde el Norte. Irrelevante si inclination = 0. */
  azimuth: Radians;
  /** Sobreperforación de diseño bajo el piso, medida en vertical [m]. Se valida contra length y Bench. */
  subdrill: Meters;
  /** Columna de carga ordenada de FONDO a BOCA. Suma de longitudes ≤ length (el resto superior se reporta como vacío). */
  decks: Deck[];
  /** Iniciadores dentro del taladro. */
  initiators: InHoleInitiator[];
  status: HoleStatus;
  /** Geometría real (as-drilled) si difiere del diseño. */
  actual?: Partial<Pick<Hole, 'collar' | 'length' | 'inclination' | 'azimuth' | 'diameter'>>;
  tags?: string[];
}

// ===================== Decks =====================
export interface DeckBase {
  id: DeckId;
  /** Longitud del deck a lo largo del eje [m]. */
  length: Meters;
}
export interface ExplosiveDeck extends DeckBase {
  kind: 'explosive';
  explosiveId: ExplosiveId;
  /** Densidad en taladro si difiere de la nominal (p.ej. densidad de copa) [kg/m³]. */
  densityOverride?: KgPerM3;
  /**
   * Esponjamiento [m] (emulsión gasificada, `03 §2`): la carga se coloca en `length − swell` y sube
   * al gasificar hasta `length`. Masa = DCL·(length − swell); densidad media = masa/(A·length).
   */
  swell?: Meters;
  /** Diámetro efectivo de la carga [m] (cartuchos aplastados por la columna: CR-03, +10 %). */
  effectiveDiameter?: Meters;
}
export interface StemmingDeck extends DeckBase {
  kind: 'stemming';
  materialId: StemmingMaterialId;
}
export interface AirDeck extends DeckBase {
  kind: 'air';
}
export interface WaterDeck extends DeckBase {
  kind: 'water';
}
/** Tapón/gas bag separador. */
export interface PlugDeck extends DeckBase {
  kind: 'plug';
  name?: string;
  cost?: Money;
}
export type Deck = ExplosiveDeck | StemmingDeck | AirDeck | WaterDeck | PlugDeck;

export interface InHoleInitiator {
  id: InHoleInitiatorId;
  detonatorId: DetonatorId;
  primerId?: PrimerId;
  /** Posición a lo largo del eje medida desde la BOCA [m]. */
  depth: Meters;
  /** Retardo en taladro [s]. Nonel/eléctrico: nominal del producto (editable). Electrónico: tiempo programado. */
  delay: Seconds;
}

// ===================== Productos =====================
export interface ProductLibrary {
  explosives: Explosive[];
  detonators: Detonator[];
  surfaceConnectors: SurfaceConnector[];
  primers: Primer[];
  stemmingMaterials: StemmingMaterial[];
}

/** Origen de los datos de un producto (DF-22: ficha técnica con URL y versión). */
export interface Sourced {
  /** URL o cita de la ficha técnica. */
  source?: string;
  /** Versión o fecha de la ficha. */
  version?: string;
}

export type WaterResistance = 'none' | 'limited' | 'high';

export type ExplosiveFamily =
  'anfo' | 'heavy-anfo' | 'emulsion' | 'watergel' | 'dynamite' | 'other';

export interface Explosive extends Sourced {
  id: ExplosiveId;
  name: string;
  manufacturer?: string;
  family: ExplosiveFamily;
  form: 'bulk' | 'packaged';
  /** Densidad de diseño [kg/m³]. */
  density: KgPerM3;
  /** Rango de densidad de la ficha [kg/m³]. */
  densityRange?: { min: KgPerM3; max: KgPerM3 };
  /** Velocidad de detonación (confinada, nominal) [m/s]. */
  vod: MetersPerSecond;
  /** Energía absoluta por masa (AWS) [J/kg]. */
  energy: JoulesPerKg;
  /** Potencia relativa en masa vs ANFO (RWS), ANFO = 1.0. RBS se deriva: RWS·ρ/ρ_ANFO. */
  rws: Ratio;
  /** Volumen de gases [m³/kg] (opcional). */
  gasVolume?: number;
  waterResistance: WaterResistance;
  /** Diámetro crítico [m]: por debajo no detona de forma estable. */
  criticalDiameter?: Meters;
  /** Emulsión gasificada: densidad antes y después de gasificar [kg/m³]. */
  gassing?: { initialDensity: KgPerM3; finalDensity: KgPerM3 };
  /** Agente de voladura que necesita booster para iniciarse (RM-05). */
  needsBooster?: boolean;
  cartridge?: { diameter: Meters; length: Meters; mass: Kilograms };
  costPerKg?: Money;
}

export type DetonatorType = 'electronic' | 'nonel' | 'electric';

export interface Detonator extends Sourced {
  id: DetonatorId;
  name: string;
  manufacturer?: string;
  type: DetonatorType;
  /** Retardo nominal [s] (0 en electrónicos programables). */
  nominalDelay: Seconds;
  /** Dispersión (desviación estándar) del retardo [s]. */
  delayScatter: Seconds;
  /** Rango programable [s] (solo electrónicos). */
  programmableRange?: { min: Seconds; max: Seconds; step: Seconds };
  costPerUnit?: Money;
}

export interface SurfaceConnector extends Sourced {
  id: SurfaceConnectorId;
  name: string;
  type: 'nonel-surface' | 'detonating-cord' | 'electronic-lead';
  delay: Seconds;
  delayScatter: Seconds;
  costPerUnit?: Money;
}

export interface Primer extends Sourced {
  id: PrimerId;
  name: string;
  mass: Kilograms;
  /** Explosivo del booster (para energía), si se conoce. */
  explosiveId?: ExplosiveId;
  costPerUnit?: Money;
}

export interface StemmingMaterial extends Sourced {
  id: StemmingMaterialId;
  name: string;
  kind?: 'crushed-rock' | 'sand' | 'drill-cuttings' | 'plug' | 'other';
  /** RM-04: el material angular traba mejor. */
  angularity?: 'angular' | 'rounded';
  /** Granulometría recomendada [m] (RM-04: 6–14 mm en Ø 50–130 mm, como sugerencia). */
  grading?: { min: Meters; max: Meters };
  density: KgPerM3;
  costPerM3?: Money;
}

// ===================== Macizo rocoso y modelos de sitio =====================
export interface RockMass {
  id: RockMassId;
  name: string;
  /** Densidad in situ [kg/m³] (para kg/t y tonelaje). */
  density: KgPerM3;
  /** Resistencia a compresión uniaxial [Pa]. */
  ucs: Pascals;
  /** Módulo de Young [Pa]. */
  youngModulus: Pascals;
  /** Resistencia a la tracción RT [Pa] (precorte). */
  tensileStrength?: Pascals;
  /** Velocidad de onda P [m/s]. */
  vp?: MetersPerSecond;
  /** RQD como fracción [0–1]. */
  rqd?: Ratio;
  /** Índice de volabilidad de Lilly/Cunningham (opcional, alternativa a rockFactor). */
  blastability?: { rmd: number; jps: number; jpa: number; rdi: number; hf: number };
  /** Factor de roca A de Kuz-Ram (si se fija, prevalece sobre blastability). */
  rockFactor?: number;
  /** Parámetro b de Swebrec (opcional; si falta se estima). */
  swebrecB?: number;
}

export interface SiteModels {
  vibrationLaws: VibrationLaw[];
  /** Holmberg–Persson (campo cercano): v = k·[Σ q·dx / d^(β/α)]^α, v y k en m/s. Opcional: hay valores por defecto. */
  nearField?: { k: number; alpha: number; beta: number };
  airblast: AirblastLaw;
  flyrock: FlyrockParams;
}

/** PPV = k · SD^(−beta). SD = R / W^(1/2) (raíz cuadrada) o R / W^(1/3) (raíz cúbica). R [m], W [kg] por retardo. */
export interface VibrationLaw {
  id: VibrationLawId;
  name: string;
  scaling: 'square-root' | 'cube-root';
  /** Constante de sitio con PPV en m/s [m/s · (m/kg^n)^beta]. */
  k: number;
  beta: number;
  /** Nivel de confianza asociado (p.ej. 0.5 = mediana, 0.95). */
  confidence?: Ratio;
}

/** Sobrepresión: P = k · (R / W^(1/3))^(−beta) [Pa]. */
export interface AirblastLaw {
  k: number;
  beta: number;
}

/** Lundborg: L_max = k · d^(2/3) con d en pulgadas en la forma empírica original; aquí la constante se ajusta a d [m], L [m]. */
export interface FlyrockParams {
  k: number;
  safetyFactor: Ratio;
}

// ===================== Iniciación =====================
export type InitiationSystem = 'nonel' | 'electronic' | 'electric' | 'mixed';

/** Nodo de la red de superficie: un taladro o un punto auxiliar. */
export type NodeRef = { kind: 'hole'; holeId: HoleId } | { kind: 'node'; nodeId: SurfaceNodeId };

export interface SurfaceNode {
  id: SurfaceNodeId;
  position: Vec3;
}

/** Conexión dirigida de superficie from → to con retardo. */
export interface SurfaceConnection {
  id: ConnectionId;
  from: NodeRef;
  to: NodeRef;
  connectorId: SurfaceConnectorId;
  /** Sobrescribe el retardo del conector [s]. */
  delayOverride?: Seconds;
}

export interface InitiationPoint {
  id: InitiationPointId;
  at: NodeRef;
  /** Tiempo de inicio [s] (normalmente 0). */
  time: Seconds;
}

/**
 * Semántica de tiempos:
 * - Taladros con detonador electrónico: t_fuego = t0 del punto de inicio asociado (o el primero) + delay programado.
 * - Nonel/eléctrico: t_superficie(hole) = camino más corto (Dijkstra) desde puntos de inicio por conexiones;
 *   t_fuego = t_superficie + delay en taladro (se toma el iniciador más temprano del taladro).
 */
export interface InitiationPlan {
  system: InitiationSystem;
  nodes: SurfaceNode[];
  connections: SurfaceConnection[];
  initiationPoints: InitiationPoint[];
}

// ===================== Presentación =====================
export interface DisplayUnits {
  length: 'm' | 'ft';
  diameter: 'mm' | 'in';
  mass: 'kg' | 'lb';
  time: 'ms' | 's';
  angle: 'deg' | 'rad';
  ppv: 'mm/s' | 'in/s';
  pressure: 'dB' | 'kPa' | 'psi';
}
