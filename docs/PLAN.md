# BlastLab: plan de implementación

## 1. Objetivos y principios

- **Fluidez ante todo.** Pan, zoom y edición a 60 fps con 5.000 taladros y ≥ 30 fps con 20.000.
  - El render es a demanda: se redibuja solo cuando algo lo invalida, salvo durante las animaciones.
- **Toda la simulación en el navegador.** Los cálculos pesados van en Web Workers; en esta fase no hay backend.
- **Un único modelo de dominio.** Vive en `packages/core`, usa unidades SI, es serializable a JSON y tiene esquema versionado.
- **Cobertura progresiva de herramientas de simulación.** Cada módulo lee del modelo y nunca duplica datos.

## 2. Estructura del monorepo

```
/
├─ package.json               # scripts raíz: dev, build, test, lint, typecheck, format
├─ pnpm-workspace.yaml        # packages/*, apps/*
├─ tsconfig.base.json         # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
├─ eslint.config.js           # flat config, typescript-eslint strict-type-checked
├─ .prettierrc  .editorconfig  .nvmrc  .gitignore
├─ vitest.config.ts           # projects: core, engine, workers, web
├─ CLAUDE.md
├─ docs/
│  ├─ PLAN.md
│  ├─ ARCHITECTURE.md
│  └─ adr/                    # Architecture Decision Records (0001-...)
├─ packages/
│  ├─ core/
│  │  └─ src/
│  │     ├─ model/            # tipos del dominio (este documento, §4)
│  │     ├─ units/            # alias de unidades y conversiones SI ↔ presentación
│  │     ├─ geometry/         # vectores, trayectoria de taladro, polígonos, índice espacial
│  │     ├─ document/         # DocumentStore, comandos, ChangeSet, undo/redo
│  │     ├─ patterns/         # generadores de malla (cuadrada, rectangular, tresbolillo)
│  │     ├─ charging/         # decks, kg/taladro, factor de carga, cubicación
│  │     ├─ timing/           # red de iniciación, tiempos, isócronas, coincidencias
│  │     ├─ energy/           # distribución de energía sobre grilla
│  │     ├─ fragmentation/    # Kuz-Ram, Swebrec/KCO
│  │     ├─ vibration/        # PPV, sobrepresión, flyrock (Lundborg)
│  │     ├─ cost/             # costos
│  │     ├─ io/               # JSON (+migraciones), CSV, DXF
│  │     ├─ pack/             # empaquetado a typed arrays para engine/workers
│  │     └─ index.ts
│  ├─ engine/
│  │  └─ src/
│  │     ├─ Engine.ts         # API pública (fachada)
│  │     ├─ loop/             # rAF propio, render on demand, métricas FPS
│  │     ├─ cameras/          # ortográfica (planta) + perspectiva (3D), transición
│  │     ├─ controls/         # pan/zoom/orbit propios
│  │     ├─ layers/           # holes, decks, bench, surfaces, labels, contours, sequence
│  │     ├─ picking/          # flatbush 2D, selección por caja/lazo
│  │     └─ tools/            # select, move, add, delete, pattern (emiten comandos)
│  └─ workers/
│     └─ src/
│        ├─ compute.worker.ts # expone la API de core con Comlink
│        ├─ pool.ts           # pool, cancelación, latest-wins
│        └─ client.ts         # API tipada para la app
└─ apps/
   └─ web/
      └─ src/
         ├─ main.tsx  App.tsx
         ├─ viewport/          # <Viewport> monta el canvas y crea el Engine una vez
         ├─ stores/            # Zustand: ui, selection-view, settings
         ├─ panels/            # propiedades, tablas, librería de productos, resultados
         ├─ charts/            # ECharts (lazy)
         ├─ persistence/       # IndexedDB (proyectos) + OPFS (archivos grandes)
         └─ i18n/              # es por defecto
```

## 3. Paquetes y dependencias

| Paquete             | Responsabilidad                                                                                      | Depende de            | Externas principales                  |
| ------------------- | ---------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------- |
| `@blastlab/core`    | Modelo de dominio, DocumentStore (comandos/undo), todos los cálculos, IO (JSON/CSV/DXF), empaquetado | —                     | zod, flatbush, dxf-parser, dxf-writer |
| `@blastlab/engine`  | Escena Three.js, cámaras, capas instanciadas, picking, herramientas de edición, loop de render       | core                  | three                                 |
| `@blastlab/workers` | Workers y pool que ejecutan los cálculos de core fuera del hilo principal                            | core                  | comlink                               |
| `@blastlab/web`     | UI React, paneles, tablas, gráficos, persistencia, orquestación                                      | core, engine, workers | react, zustand, echarts, idb          |

Reglas:

- **Grafo acíclico:** `core ← engine`, `core ← workers`, `{core, engine, workers} ← web`.
- **`engine` no conoce a `workers`.** Los resultados (por ejemplo, contornos) llegan a través de la app.
- **Paquetes internos consumidos desde el fuente.** Se exportan con `exports: "./src/index.ts"`; Vite los compila y `tsc -b` los chequea.

## 4. Modelo de dominio (`packages/core/src/model`)

Convenciones:

- **Coordenadas de proyecto:** X = Este, Y = Norte, Z = Cota. Z hacia arriba, sistema dextrógiro.
- **Unidades internas:** SI puro (m, kg, s, rad, Pa, J/kg, kg/m³, m/s). Las conversiones ocurren solo en presentación.
- **Referencias por `Id`, nunca por anidamiento duplicado.** Los productos viven en la librería del proyecto, que es una _snapshot_ para reproducibilidad.
- **Resultados de cálculo:** son derivados y nunca se persisten dentro de `Project`.

```ts
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
export const SCHEMA_VERSION = 1 as const;

/** Envoltorio serializado (.blastlab.json). */
export interface ProjectFile {
  format: 'blastlab-project';
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
  /** Preferencias de visualización; nunca afectan cálculos. */
  displayUnits: DisplayUnits;
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
  /** Perímetro de la voladura en planta (opcional; se usa en cubicación y generación). */
  boundary?: Polygon2;
  freeFaces: FreeFace[];
  patterns: Pattern[];
  holes: Hole[];
  initiation: InitiationPlan;
  notes?: string;
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
  id: Id<'FreeFace'>;
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
export type HoleStatus = 'designed' | 'drilled' | 'loaded' | 'fired' | 'abandoned';

export interface Hole {
  id: HoleId;
  /** Etiqueta visible, única dentro de la voladura (p.ej. "R3-12"). */
  label: string;
  patternId?: PatternId;
  row?: number;
  col?: number;
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
interface DeckBase {
  id: DeckId;
  /** Longitud del deck a lo largo del eje [m]. */
  length: Meters;
}
export interface ExplosiveDeck extends DeckBase {
  kind: 'explosive';
  explosiveId: ExplosiveId;
  /** Densidad en taladro si difiere de la nominal (p.ej. densidad de copa) [kg/m³]. */
  densityOverride?: KgPerM3;
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
  id: Id<'InHoleInitiator'>;
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

export type ExplosiveFamily =
  'anfo' | 'heavy-anfo' | 'emulsion' | 'watergel' | 'dynamite' | 'other';

export interface Explosive {
  id: ExplosiveId;
  name: string;
  manufacturer?: string;
  family: ExplosiveFamily;
  form: 'bulk' | 'packaged';
  /** Densidad nominal [kg/m³]. */
  density: KgPerM3;
  /** Velocidad de detonación (confinada, nominal) [m/s]. */
  vod: MetersPerSecond;
  /** Energía absoluta por masa (AWS) [J/kg]. */
  energy: JoulesPerKg;
  /** Potencia relativa en masa vs ANFO (RWS), ANFO = 1.0. RBS se deriva: RWS·ρ/ρ_ANFO. */
  rws: Ratio;
  /** Volumen de gases [m³/kg] (opcional). */
  gasVolume?: number;
  waterResistant: boolean;
  /** Diámetro crítico/mínimo recomendado [m]. */
  minDiameter?: Meters;
  cartridge?: { diameter: Meters; length: Meters; mass: Kilograms };
  costPerKg?: Money;
}

export type DetonatorType = 'electronic' | 'nonel' | 'electric';

export interface Detonator {
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

export interface SurfaceConnector {
  id: SurfaceConnectorId;
  name: string;
  type: 'nonel-surface' | 'detonating-cord' | 'electronic-lead';
  delay: Seconds;
  delayScatter: Seconds;
  costPerUnit?: Money;
}

export interface Primer {
  id: PrimerId;
  name: string;
  mass: Kilograms;
  /** Explosivo del booster (para energía), si se conoce. */
  explosiveId?: ExplosiveId;
  costPerUnit?: Money;
}

export interface StemmingMaterial {
  id: StemmingMaterialId;
  name: string;
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
  /** Índice de volabilidad de Lilly/Cunningham (opcional, alternativa a rockFactor). */
  blastability?: { rmd: number; jps: number; jpa: number; rdi: number; hf: number };
  /** Factor de roca A de Kuz-Ram (si se fija, prevalece sobre blastability). */
  rockFactor?: number;
  /** Parámetro b de Swebrec (opcional; si falta se estima). */
  swebrecB?: number;
}

export interface SiteModels {
  vibrationLaws: VibrationLaw[];
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
```

**Resultados derivados** (en `core`; no se persisten, se calculan en workers). Se identifican por `docVersion` para poder cachearlos:

```ts
export interface ChargeResult {
  perHole: Float64Array; // kg de explosivo por taladro (índice = orden en blast.holes)
  totalExplosive: Kilograms;
  volume: number; // m³ (cubicación)
  tonnage: Kilograms;
  powderFactorVolume: number; // kg/m³
  powderFactorMass: Ratio; // kg/kg (se muestra como kg/t)
}
export interface TimingResult {
  fireTime: Float64Array; // s por taladro (NaN = no iniciado)
  coincidentGroups: HoleId[][]; // taladros dentro de la ventana de coincidencia
  interRowDelays: { rowA: number; rowB: number; min: Seconds; max: Seconds }[];
}
export interface GridResult {
  // energía, PPV, etc.
  origin: Vec2;
  cellSize: Meters;
  nx: number;
  ny: number;
  values: Float32Array;
}
export interface FragmentationResult {
  x50: Meters;
  x80: Meters;
  n: number; // Kuz-Ram
  curve: { size: Meters; passing: Ratio }[];
}
```

## 5. Comunicación React ↔ engine ↔ workers

- **DocumentStore (core, TS puro)** es la fuente de verdad del proyecto.
  - Toda mutación pasa por `store.dispatch(command)`, lo que produce un `ChangeSet { added, updated, removed }` por entidad y su inverso, que sirve para undo/redo.
  - Los comandos de edición continua (por ejemplo, arrastrar) se agrupan en una sola transacción para undo con `beginTransaction`/`commit`.
- **Engine.** Se suscribe al store directamente y aplica solo el ChangeSet: actualiza matrices o colores de las instancias afectadas y marca el frame como _dirty_.
  - Sus herramientas (seleccionar, mover, agregar) traducen eventos de puntero en comandos. React no participa en ese camino caliente.
- **React/Zustand**
  - Zustand guarda el estado de UI (herramienta activa, vista, paneles, preferencias), el `docVersion` y la selección visible.
  - Los paneles leen del DocumentStore con selectores memoizados por `docVersion`.
  - La UI emite **comandos** al engine (`engine.setTool`, `setView`, `focus`, `setLayerVisible`) y al store (`dispatch`).
  - La selección vive en un `SelectionStore` sin React que el engine y Zustand observan.
- **Workers**
  - La app llama a `workers.client.compute('timing', packed)`, donde `packed` es la voladura empaquetada con `core/pack` en typed arrays transferibles.
  - Política _latest-wins_: cada job lleva el `docVersion` y los resultados obsoletos se descartan. Hay debounce durante los arrastres.
  - Los resultados vuelven a la app, que actualiza Zustand (tablas, gráficos) y pasa al engine las capas visuales (contornos, isócronas, colores por tiempo).
- **Persistencia.** IndexedDB guarda el índice de proyectos y el JSON; OPFS guarda los binarios grandes (superficies). El autosave se debouncea y serializa en un worker.

## 6. Fases y criterios de "hecho"

Todas las fases comparten estos criterios de "hecho":

- `typecheck`, `lint` y `test` en verde
- tests unitarios de core con valores de referencia (bibliografía o cálculo manual documentado), los suficientes para asegurar la precisión de los cálculos sin sobredimensionar la suite
- sin `any`
- presupuesto de rendimiento verificado con un fixture de 5.000 taladros
- commit convencional

**Fase 0: Bootstrap.**

- El monorepo compila.
- Escena ortográfica vacía con grilla, pan y zoom al cursor.
- Un test de core en verde.
- Ping por Comlink a un worker.
- Primer commit.

**Fase 1: Editor de malla en planta.**

- Generar patrones cuadrados, rectangulares y en tresbolillo a partir de burden, espaciamiento, azimut, filas y columnas, con recorte opcional a un polígono.
- Agregar, mover y borrar taladros, y editar sus propiedades desde un panel.
- Selección simple, aditiva, por caja y por lazo.
- Snapping a grilla, a taladros y a nodos del patrón.
- Undo/redo ilimitado (Ctrl+Z / Ctrl+Shift+Z).
- Etiquetas con LOD.
- Criterios de hecho:
  - 5.000 taladros: pan/zoom a 60 fps; arrastrar 500 seleccionados sin caer de 50 fps.
  - Generar 5.000 taladros en menos de 50 ms.
  - Guardar y abrir el JSON sin pérdidas (ida y vuelta testeado).

> **Reordenamiento (2026-09-23):** la vista 3D pasa al final; primero van las herramientas técnicas.
> Carguío y Tiempos se implementan juntos, y la importación CSV se adelanta para validar con datos reales.

**Fase 2: Carguío.**

- Librería de productos editable (explosivos, detonadores, conectores de superficie, primas, tacos) con valores por defecto de referencia.
- Reglas de carga aplicables en lote y editor de decks por taladro, con diagrama de columna 2D (sustituye a la vista 3D para el diseño de decks).
- Cálculo en worker de: kg/taladro, factor de carga en kg/m³ y kg/t, y cubicación por área de influencia (Voronoi recortado al perímetro, o al contorno de los taladros expandido si no hay perímetro).
- Criterio de hecho: cálculos contra casos manuales documentados.

**Fase 3: Tiempos.**

- Retardos en taladro y en superficie, con edición gráfica de conexiones y generador de amarres por filas (línea a línea o en V desde una columna).
- Asignación de tiempos electrónicos.
- Tiempos de detonación calculados con Dijkstra.
- Animación de la secuencia.
- Isócronas (sobre la triangulación de las bocas).
- Detección de coincidencias con ventana configurable (por defecto 8 ms), máxima carga por retardo.
- Ventana de tiempos entre filas.
- Criterios de hecho:
  - Casos de prueba de redes (en V, línea por línea, electrónicos).
  - 5.000 taladros resueltos en menos de 20 ms dentro del worker.

**Fase 4: Importación CSV.**

- CSV de taladros, con mapeo de columnas y selección de unidades.
- Criterio de hecho: ida y vuelta CSV sin pérdida de geometría.

**Fase 5: Energía.**

> Implementado con dos métricas en un plano horizontal: PPV de campo cercano (Holmberg–Persson,
> integrado por taladro y tomando el máximo entre taladros, porque detonan en tiempos distintos) y
> densidad de carga (núcleo gaussiano). Las secciones verticales quedan para una fase posterior.

- Distribución de energía y explosivo sobre una grilla, a una cota o sección.
- Contornos (marching squares en worker) mostrados como capa del engine.
- Criterio de hecho: el cálculo no bloquea la UI y se actualiza en menos de 300 ms tras una edición.

**Fase 6: Fragmentación.**

- Kuz-Ram (factor A de Cunningham) y Swebrec/KCO.
- Curva granulométrica en ECharts; P50 y P80.
- Criterio de hecho: se reproducen ejemplos publicados (Cunningham 2005; Ouchterlony 2005) con error menor al 1 %.

**Fase 7: Vibración.**

- PPV por distancia escalada (raíz cuadrada y raíz cúbica) sobre grilla y en puntos de control, con constantes de sitio editables.
- Sobrepresión.
- Flyrock con Lundborg, dibujado como zona de exclusión.
- Criterio de hecho: tests con valores tabulados.

**Fase 8: DXF y reportes.**

- DXF de entrada y salida con dxf-parser y dxf-writer (collars, trazas, polígonos).
- Reporte PDF generado en worker.
- Criterio de hecho: ida y vuelta DXF sin pérdida de geometría, y PDF con plano, tablas y gráficos.

**Fase 9: Vista 3D.**

- Cambiar entre planta y 3D sobre la misma escena, con transición de cámara y órbita.
- Banco plano o con topografía.
- Taladros como cilindros instanciados y decks coloreados por material (una sola InstancedMesh con `instanceColor`).
- Criterio de hecho: 5.000 taladros × 4 decks a ≥ 45 fps en órbita.

Cada fase posterior (costos, secciones, simulación Monte Carlo de dispersión de retardos, etc.) se agrega como módulo de core + panel, siempre leyendo del mismo modelo.
