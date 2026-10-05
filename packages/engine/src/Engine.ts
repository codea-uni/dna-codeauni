import {
  Color,
  Group,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import {
  DEFAULT_HOLE_TEMPLATE,
  LineSnapIndex,
  freeFaceQuads,
  pointInPolygon,
  snapPoint,
  type Blast,
  type BlastId,
  type BoundaryId,
  type ChangeSet,
  type ConnectionId,
  type DiffMarker,
  type TinData,
  type Ground,
  type ScalarGrid,
  type SurfaceConnectorId,
  type DocumentStore,
  type HoleId,
  type HoleTemplate,
  type Pattern,
  type SelectionStore,
  type SnapOptions,
  type SnapResult,
  type Vec2,
  type Vec3,
} from '@cronos/core';
import { fitBounds, screenToWorld, type PlanViewState } from './cameras/planView';
import {
  dollyOrbit,
  fitOrbit,
  orbitBy,
  orbitPosition,
  panOrbit,
  type OrbitState,
} from './cameras/orbit';
import { DEFAULT_3D_OPTIONS, Scene3D, type Scene3DOptions } from './scene3d/Scene3D';
import { Emitter } from './events';
import { InputRouter } from './input/InputRouter';
import { BoundaryLayer } from './layers/BoundaryLayer';
import { COLORS } from './layers/colors';
import { GridLayer } from './layers/GridLayer';
import { turbo } from './layers/colormap';
import { EnergyLayer, type EnergyData } from './layers/EnergyLayer';
import { SiteLayer } from './layers/SiteLayer';
import { TopographyLayer, type TopographyViewData } from './layers/TopographyLayer';
import { VersionDiffLayer } from './layers/VersionDiffLayer';
import { HolesLayer } from './layers/HolesLayer';
import { InitiationLayer } from './layers/InitiationLayer';
import { IsochronesLayer, type IsochroneData } from './layers/IsochronesLayer';
import { LabelsLayer } from './layers/LabelsLayer';
import { BlocksLayer, type BlocksData } from './layers/BlocksLayer';
import { DomainsLayer } from './layers/DomainsLayer';
import {
  MuckpileBeforeLayer,
  MuckpileSurfaceLayer,
  type MuckpileSurfaceData,
} from './layers/MuckpileLayer';
import { VectorsLayer, type VectorsData } from './layers/VectorsLayer';
import { OverlayLayer } from './layers/OverlayLayer';
import { RenderLoop, type FrameStats } from './loop/RenderLoop';
import { HolePicker } from './picking/HolePicker';
import { AddHoleTool } from './tools/AddHoleTool';
import { BoundaryTool } from './tools/BoundaryTool';
import { FreeFaceTool } from './tools/FreeFaceTool';
import { MonitorTool } from './tools/MonitorTool';
import { MeasureTool } from './tools/MeasureTool';
import { SectionTool } from './tools/SectionTool';
import { DomainTool } from './tools/DomainTool';
import {
  DEFAULT_DECORATIONS,
  MapDecorations,
  type DecorationSettings,
} from './overlay/MapDecorations';
import { InitiateTool } from './tools/InitiateTool';
import { TieTool } from './tools/TieTool';
import { PanTool } from './tools/PanTool';
import { SelectTool } from './tools/SelectTool';
import type { Tool, ToolContext, ToolName, ToolPointer } from './tools/types';
import { defaultEngineText, type EngineText } from './text';

export interface EngineOptions {
  document: DocumentStore;
  selection: SelectionStore;
}

export interface EngineEvents extends Record<string, unknown> {
  /** Estadísticas de frames durante la actividad (≈ 2 Hz mientras hay interacción). */
  frameStats: FrameStats;
  /** Posición del cursor en coordenadas de proyecto, o null si salió del canvas. */
  pointer: Vec2 | null;
  hover: HoleId | null;
  tool: ToolName;
  /** Tiempo actual de la animación de secuencia [s] (null al detenerla). */
  sequenceTime: number | null;
  /** La animación llegó al final. */
  sequenceEnded: null;
  /** Cambió el perímetro activo (por herramienta o al dibujar uno nuevo). */
  activeBoundary: BoundaryId | null;
  /** Cambió la vista (planta o 3D). */
  viewMode: ViewMode;
  /** Se trazó una sección para el perfil de la pila (A7). */
  section: { a: Vec2; b: Vec2 };
}

export type ViewMode = 'plan' | '3d';

export type EngineLayer =
  | 'labels'
  | 'traces'
  | 'connections'
  | 'isochrones'
  | 'energy'
  | 'vibration'
  | 'flyrock'
  | 'displacement'
  | 'topoImage'
  | 'topoShade'
  | 'topoContours'
  | 'topoLines'
  | 'muckpile'
  | 'muckpileBefore'
  | 'muckpileVectors'
  | 'muckpileBlocks'
  | 'domains'
  | 'faces'
  | 'benchPlanes';

/**
 * Pila de material (A7) lista para dibujar: superficie (3D y raster en planta), techo in situ,
 * vectores por taladro y bloques animados con el reloj de la secuencia.
 */
export interface MuckpileView {
  surface: MuckpileSurfaceData | null;
  /** Raster coloreado para la planta (mismo color que la superficie 3D). */
  plan: EnergyData | null;
  before: { before: ScalarGrid; base: ScalarGrid } | null;
  vectors: VectorsData | null;
  blocks: BlocksData | null;
  /** Fin del movimiento [s] (último impacto y asentamiento): la animación llega hasta aquí. */
  end: number;
}

/** Valores escalares por taladro para colorear con el mapa turbo. */
export interface HoleScalars {
  values: ReadonlyMap<HoleId, number>;
  min: number;
  max: number;
  /** Colores por categoría (p. ej. grupo) en CSS; si están, reemplazan la escala continua. */
  colors?: ReadonlyMap<HoleId, string>;
}

export interface SnapSettings {
  grid: boolean;
  gridSize: number;
  holes: boolean;
  pattern: boolean;
  /** Líneas de referencia de la topografía (cresta, pie, curvas). */
  topography: boolean;
  /** Radio de captura en px CSS. */
  tolerancePx: number;
}

/** Distancia a partir de la cual se recentra el origen de render (precisión float32). */
const REBASE_DISTANCE_M = 5_000;
/** Separación mínima en pantalla entre taladros para mostrar etiquetas. */
const LABEL_MIN_SPACING_PX = 34;

/**
 * Fachada del motor de render. Imperativo y desacoplado de React: la app lo crea una vez
 * sobre un canvas y le envía comandos; el engine se suscribe al DocumentStore y a la
 * selección y actualiza solo lo que cambió.
 */
export class Engine {
  private readonly events = new Emitter<EngineEvents>();
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera();
  private readonly camera3d = new PerspectiveCamera(45, 1, 0.5, 200_000);
  private readonly planRoot = new Group();
  private readonly decorations: MapDecorations;
  private decorationSettings: DecorationSettings = DEFAULT_DECORATIONS;
  private text: EngineText = defaultEngineText;
  private measureA: Vec2 | null = null;
  private measureB: Vec2 | null = null;
  private readonly scene3d = new Scene3D();
  private viewMode: ViewMode = 'plan';
  private orbit: OrbitState | null = null;
  private scene3dDirty = true;
  /** Triangulaciones de los levantamientos cargados (D-16), por id de levantamiento. */
  private topographyTins: ReadonlyMap<string, TinData> = new Map();
  /** Cota del terreno de cada levantamiento (índice O(log n)): el 3D se apoya en el relieve. */
  private topographyGrounds: ReadonlyMap<string, Ground> = new Map();
  /** Topografía en planta: sombreado, curvas y líneas de referencia. */
  private readonly topography = new TopographyLayer();
  private topographyData: readonly TopographyViewData[] = [];
  private lineSnaps: LineSnapIndex[] = [];
  /** Cota del terreno bajo un punto (la da la web con el índice del worker), para medir ΔZ. */
  private elevationAt: ((x: number, y: number) => number | null) | null = null;
  private options3d: Scene3DOptions = DEFAULT_3D_OPTIONS;
  private readonly loop: RenderLoop;
  private readonly input: InputRouter;
  private readonly resizeObserver: ResizeObserver;

  private readonly grid = new GridLayer();
  private readonly holes = new HolesLayer();
  private readonly labels = new LabelsLayer();
  private readonly boundaries = new BoundaryLayer();
  private readonly boundaryLabels = new LabelsLayer();
  private activeBoundaryId: BoundaryId | null = null;
  private lastVertexMpp = 0;
  private lastSiteMpp = 0;
  private readonly initiation = new InitiationLayer();
  private readonly isochrones = new IsochronesLayer();
  /** Flechas de desplazamiento (A5): segmentos coloreados por velocidad con el mismo mapa. */
  private readonly displacement = new IsochronesLayer();
  private displacementData: IsochroneData | null = null;
  private readonly energy = new EnergyLayer();
  private energyData: EnergyData | null = null;
  private readonly vibration = new EnergyLayer();
  private vibrationData: EnergyData | null = null;
  // Pila de material (A7): raster y flechas en planta; superficie, vectores y bloques en 3D.
  private readonly muckpilePlan = new EnergyLayer();
  private readonly muckpileArrows = new IsochronesLayer();
  private readonly muckpileSurface3d = new MuckpileSurfaceLayer();
  private readonly muckpileBefore3d = new MuckpileBeforeLayer();
  private readonly muckpileVectors3d = new VectorsLayer();
  private readonly muckpileBlocks = new BlocksLayer();
  private readonly muckpileBlocksRoot = new Group();
  private muckpileData: MuckpileView | null = null;
  private lastCut: { data: MuckpileView | null; blasts: readonly Blast[] } | null = null;
  private readonly domains = new DomainsLayer();
  /** Sección trazada (perfil de la pila). */
  private readonly sectionLine = new IsochronesLayer();
  private sectionData: IsochroneData | null = null;
  private readonly site = new SiteLayer();
  /** Comparación de versiones (D-14): marcadores de taladros agregados, quitados y movidos. */
  private readonly versionDiff = new VersionDiffLayer();
  private versionDiffData: readonly DiffMarker[] | null = null;
  private lastDiffMpp = 0;
  // Capas equivalentes en la escena 3D (mismos datos, a la cota que corresponde).
  private readonly initiation3d = new InitiationLayer();
  private readonly isochrones3d = new IsochronesLayer();
  private readonly energy3d = new EnergyLayer();
  private readonly vibration3d = new EnergyLayer();
  private readonly site3d = new SiteLayer();
  private readonly labels3d = new LabelsLayer();
  private readonly siteLabels3d = new LabelsLayer();
  private readonly siteLabels = new LabelsLayer();
  private flyrockZone: Vec2[] | null = null;
  private isochroneData: IsochroneData | null = null;
  private layerVisible: Record<EngineLayer, boolean> = {
    labels: true,
    traces: true,
    connections: true,
    isochrones: true,
    energy: true,
    vibration: true,
    flyrock: true,
    displacement: false,
    topoImage: true,
    topoShade: true,
    topoContours: true,
    topoLines: true,
    muckpile: true,
    muckpileBefore: false,
    muckpileVectors: true,
    muckpileBlocks: true,
    domains: true,
    faces: true,
    benchPlanes: true,
  };
  private scalars: HoleScalars | null = null;
  private labelOverride: ReadonlyMap<HoleId, string> | null = null;
  private tieConnectorId: SurfaceConnectorId | undefined;
  private sequence: {
    times: ReadonlyMap<HoleId, number>;
    t: number;
    playing: boolean;
    speed: number;
    end: number;
    last: number;
  } | null = null;
  private readonly overlay = new OverlayLayer();
  private readonly picker: HolePicker;

  private readonly document: DocumentStore;
  private readonly selection: SelectionStore;
  private readonly unsubscribers: (() => void)[] = [];
  private readonly tools: Record<ToolName, Tool> = {
    select: new SelectTool('box'),
    lasso: new SelectTool('lasso'),
    add: new AddHoleTool(),
    boundary: new BoundaryTool(),
    freeFace: new FreeFaceTool(),
    monitor: new MonitorTool(),
    measure: new MeasureTool(),
    section: new SectionTool(),
    domain: new DomainTool(),
    pan: new PanTool(),
    tie: new TieTool(),
    initiate: new InitiateTool(),
  };
  private tool: Tool = this.tools.select;
  private readonly toolContext: ToolContext;

  /** Origen de render: se resta a toda la geometría enviada a la GPU. */
  private origin: Vec3;
  private view: PlanViewState = { centerX: 0, centerY: 0, metersPerPixel: 0.1 };
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private typicalSpacing = 5;
  /** Radio de captura del picking [px CSS]: símbolo + margen. */
  private pickTolerancePx = 8;
  private lastSelection: ReadonlySet<HoleId> = new Set();
  private hover: HoleId | null = null;
  private snap: SnapSettings = {
    grid: false,
    gridSize: 1,
    holes: true,
    pattern: true,
    topography: true,
    tolerancePx: 10,
  };
  private template: HoleTemplate = DEFAULT_HOLE_TEMPLATE;
  private activeBlastId: BlastId | undefined;
  private pendingPointer: Vec2 | null | undefined;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: EngineOptions,
  ) {
    this.document = options.document;
    this.selection = options.selection;
    this.origin = { ...this.document.project.coordinateSystem.origin };
    this.picker = new HolePicker(() => this.document.project);

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.decorations = new MapDecorations(canvas.parentElement ?? document.body);
    this.scene.background = COLORS.background;
    this.camera.position.set(0, 0, 1000);
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.lookAt(0, 0, 0);
    this.camera3d.up.set(0, 0, 1);
    this.scene.add(this.planRoot, this.scene3d.root);
    this.scene3d.root.add(
      this.energy3d.root,
      this.vibration3d.root,
      this.isochrones3d.lines,
      this.initiation3d.root,
      this.site3d.root,
      this.labels3d.mesh,
      this.siteLabels3d.mesh,
      this.muckpileSurface3d.root,
      this.muckpileBefore3d.root,
      this.muckpileVectors3d.root,
      this.muckpileBlocksRoot,
    );
    this.muckpileBlocks.onMeshChange = (mesh, previous) => {
      if (previous) this.muckpileBlocksRoot.remove(previous);
      if (mesh) this.muckpileBlocksRoot.add(mesh);
      this.loop.invalidate();
    };
    this.planRoot.add(
      this.topography.shadeRoot,
      this.topography.imageRoot,
      this.grid.mesh,
      this.topography.contourRoot,
      this.topography.lineRoot,
      this.energy.root,
      this.vibration.root,
      this.muckpilePlan.root,
      this.domains.lines,
      this.isochrones.lines,
      this.displacement.lines,
      this.muckpileArrows.lines,
      this.sectionLine.lines,
      this.boundaries.root,
      this.initiation.root,
      this.holes.root,
      this.labels.mesh,
      this.boundaryLabels.mesh,
      this.site.root,
      this.siteLabels.mesh,
      this.versionDiff.lines,
      this.overlay.root,
    );

    this.loop = new RenderLoop(
      () => {
        this.flushPointer();
        this.advanceSequence();
        this.renderer.render(this.scene, this.viewMode === '3d' ? this.camera3d : this.camera);
      },
      (stats) => {
        this.events.emit('frameStats', stats);
      },
    );

    this.toolContext = this.createToolContext();
    canvas.tabIndex = 0;
    canvas.style.cursor = this.tool.cursor;
    this.input = new InputRouter({
      element: canvas,
      getView: () => this.view,
      setView: (view) => {
        this.setView(view);
      },
      getTool: () => this.tool,
      toToolPointer: (e) => this.toToolPointer(e),
      is3D: () => this.viewMode === '3d',
      orbit3d: (dx, dy) => {
        if (!this.orbit) return;
        this.orbit = orbitBy(this.orbit, dx, dy);
        this.applyCamera3d();
      },
      pan3d: (dx, dy) => {
        if (!this.orbit) return;
        const mpp =
          (2 * this.orbit.distance * Math.tan((this.camera3d.fov * Math.PI) / 360)) / this.height;
        this.orbit = panOrbit(this.orbit, dx, dy, mpp);
        this.applyCamera3d();
      },
      dolly3d: (factor) => {
        if (!this.orbit) return;
        this.orbit = dollyOrbit(this.orbit, factor);
        this.applyCamera3d();
      },
      onPointerDown: (p) => this.tool.onPointerDown?.(p, this.toolContext),
      onPointerMove: (p) => {
        this.queuePointer({ x: p.x, y: p.y });
        if (p.buttons === 0) this.updateHover(p);
        this.tool.onPointerMove?.(p, this.toolContext);
      },
      onPointerUp: (p) => this.tool.onPointerUp?.(p, this.toolContext),
      onDoubleClick: (p) => this.tool.onDoubleClick?.(p, this.toolContext),
      onPointerLeave: () => {
        this.queuePointer(null);
        this.setHover(null);
        if (this.tool.name === 'add') this.overlay.setMarker(null, 0);
        this.loop.invalidate();
      },
      onKeyDown: (e) => this.handleKey(e),
      onCursorChange: (cursor) => {
        canvas.style.cursor = cursor;
      },
    });

    this.unsubscribers.push(
      this.document.subscribe((cs) => {
        this.onDocumentChange(cs);
      }),
      this.selection.subscribe((ids) => {
        this.onSelectionChange(ids);
      }),
    );

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(canvas);
    this.resize();
    this.rebuildAll();
    this.zoomToFit();
  }

  // ------------------------------------------------------------------ API pública

  on<K extends keyof EngineEvents>(
    event: K,
    handler: (payload: EngineEvents[K]) => void,
  ): () => void {
    return this.events.on(event, handler);
  }

  get toolName(): ToolName {
    return this.tool.name;
  }

  setTool(name: ToolName): void {
    if (this.tool.name === name) return;
    this.tool.cancel?.(this.toolContext);
    this.tool = this.tools[name];
    this.canvas.style.cursor = this.tool.cursor;
    this.events.emit('tool', name);
    this.loop.invalidate();
  }

  getSnapSettings(): SnapSettings {
    return { ...this.snap };
  }

  setSnapSettings(settings: Partial<SnapSettings>): void {
    this.snap = { ...this.snap, ...settings };
  }

  /** Plantilla con la que la herramienta "Agregar" crea taladros. */
  setHoleTemplate(template: HoleTemplate): void {
    this.template = template;
  }

  setActiveBlast(id: BlastId): void {
    this.activeBlastId = id;
  }

  /** Centro de la vista en coordenadas de proyecto. */
  getViewCenter(): Vec2 {
    return { x: this.view.centerX + this.origin.x, y: this.view.centerY + this.origin.y };
  }

  /** Coordenadas de proyecto → píxeles CSS relativos al canvas. */
  projectToScreen(x: number, y: number): Vec2 {
    const { centerX, centerY, metersPerPixel: mpp } = this.view;
    return {
      x: (x - this.origin.x - centerX) / mpp + this.width / 2,
      y: this.height / 2 - (y - this.origin.y - centerY) / mpp,
    };
  }

  /** Encuadra todos los taladros y perímetros (o la selección si `selectionOnly`). */
  zoomToFit(selectionOnly = false): void {
    if (this.viewMode === '3d') {
      if (this.scene3dDirty) this.rebuild3d();
      this.fit3d();
      this.applyCamera3d();
      return;
    }
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const add = (x: number, y: number): void => {
      bounds.minX = Math.min(bounds.minX, x - this.origin.x);
      bounds.minY = Math.min(bounds.minY, y - this.origin.y);
      bounds.maxX = Math.max(bounds.maxX, x - this.origin.x);
      bounds.maxY = Math.max(bounds.maxY, y - this.origin.y);
    };
    for (const blast of this.document.project.blasts) {
      for (const h of blast.holes) {
        if (!selectionOnly || this.selection.has(h.id)) add(h.collar.x, h.collar.y);
      }
      if (!selectionOnly)
        for (const b of blast.boundaries) for (const p of b.polygon) add(p.x, p.y);
    }
    // Sin diseño, se encuadra la topografía.
    if (!Number.isFinite(bounds.minX) && !selectionOnly)
      for (const t of this.topographyData) {
        add(t.bounds.minX, t.bounds.minY);
        add(t.bounds.maxX, t.bounds.maxY);
      }
    if (!Number.isFinite(bounds.minX)) {
      if (selectionOnly) return;
      this.setView({ centerX: 0, centerY: 0, metersPerPixel: 0.1 });
      return;
    }
    const pad = this.typicalSpacing;
    bounds.minX -= pad;
    bounds.minY -= pad;
    bounds.maxX += pad;
    bounds.maxY += pad;
    // Encuadra en el área libre de reglas y desplaza el centro para que quede centrado en ella.
    const inset = this.decorations.rulerInset;
    const fit = fitBounds(bounds, this.width - inset.left, this.height - inset.top, 0.05);
    this.setView({
      ...fit,
      centerX: fit.centerX - (inset.left / 2) * fit.metersPerPixel,
      centerY: fit.centerY + (inset.top / 2) * fit.metersPerPixel,
    });
  }

  /** Encuadra una caja en coordenadas de proyecto (p. ej. la vista previa de una topografía). */
  fitBounds(b: { minX: number; minY: number; maxX: number; maxY: number }): void {
    if (this.viewMode === '3d') return;
    const inset = this.decorations.rulerInset;
    const fit = fitBounds(
      {
        minX: b.minX - this.origin.x,
        minY: b.minY - this.origin.y,
        maxX: b.maxX - this.origin.x,
        maxY: b.maxY - this.origin.y,
      },
      this.width - inset.left,
      this.height - inset.top,
      0.05,
    );
    this.setView({
      ...fit,
      centerX: fit.centerX - (inset.left / 2) * fit.metersPerPixel,
      centerY: fit.centerY + (inset.top / 2) * fit.metersPerPixel,
    });
  }

  get currentViewMode(): ViewMode {
    return this.viewMode;
  }

  /** Traductor de los textos visibles del engine (G8); por defecto, español. */
  setText(text: EngineText): void {
    this.text = text;
    this.decorations.setText(text);
    this.applyView();
  }

  /** Grilla, reglas, barra de escala y brújula. */
  setDecorations(settings: Partial<DecorationSettings>): void {
    this.decorationSettings = { ...this.decorationSettings, ...settings };
    this.decorations.setSettings(this.decorationSettings);
    this.applyView();
  }

  /** Planta (edición) o 3D (visualización del banco, taladros y decks). */
  setViewMode(mode: ViewMode): void {
    if (mode === this.viewMode) return;
    this.tool.cancel?.(this.toolContext);
    this.viewMode = mode;
    const is3d = mode === '3d';
    this.planRoot.visible = !is3d;
    this.scene3d.root.visible = is3d;
    if (is3d) {
      if (this.scene3dDirty) this.rebuild3d();
      else this.rebuild3dOverlays();
      if (!this.orbit) this.fit3d();
      this.applyCamera3d();
    }
    this.canvas.style.cursor = is3d ? 'grab' : this.tool.cursor;
    this.decorations.setMode(mode);
    if (!is3d) this.applyView();
    this.events.emit('viewMode', mode);
    this.loop.invalidate();
  }

  set3DOptions(options: Partial<Scene3DOptions>): void {
    const prev = this.options3d;
    this.options3d = { ...prev, ...options };
    // La opacidad de la topografía no obliga a reconstruir la escena.
    if (Object.keys(options).every((k) => k === 'surfaceOpacity')) {
      this.scene3d.setSurfaceOpacity(this.options3d.surfaceOpacity);
      this.loop.invalidate();
      return;
    }
    this.scene3dDirty = true;
    if (this.viewMode === '3d') this.rebuild3d();
  }

  /** Cantidad de tramos (cilindros) dibujados en 3D. */
  get segments3d(): number {
    return this.scene3d.segmentCount;
  }

  /** Resalta un perímetro (el que usará la generación de mallas). */
  setActiveBoundary(id: BoundaryId | null): void {
    if (id === this.activeBoundaryId) return;
    this.activeBoundaryId = id;
    this.rebuildBoundaries();
    this.events.emit('activeBoundary', id);
    this.loop.invalidate();
  }

  setLayerVisible(layer: EngineLayer, visible: boolean): void {
    this.layerVisible = { ...this.layerVisible, [layer]: visible };
    this.applyView();
  }

  /** Conector con el que la herramienta Amarre crea conexiones. */
  setTieConnector(id: SurfaceConnectorId | undefined): void {
    this.tieConnectorId = id;
  }

  /** Colorea los taladros por un valor (tiempo, kg…); null vuelve al color por defecto. */
  setHoleScalars(scalars: HoleScalars | null): void {
    this.scalars = scalars;
    if (!this.sequence) this.applyHoleColors();
  }

  /** Reemplaza el texto de las etiquetas (p.ej. tiempos); null vuelve a la etiqueta del taladro. */
  setHoleLabels(labels: ReadonlyMap<HoleId, string> | null): void {
    this.labelOverride = labels;
    for (const blast of this.document.project.blasts) {
      for (const h of blast.holes)
        this.labels.upsert(
          h.id,
          h.collar.x - this.origin.x,
          h.collar.y - this.origin.y,
          this.labelFor(h.id, h.label),
        );
    }
    this.labels.flush();
    if (this.viewMode === '3d') this.rebuild3dOverlays();
    this.loop.invalidate();
  }

  /** Mapa de energía (raster coloreado + contornos); null lo oculta. */
  setEnergy(data: EnergyData | null, opacity = 0.6): void {
    this.energyData = data;
    this.energy.setOpacity(opacity);
    this.energy.set(data, this.origin);
    this.energy3d.setOpacity(Math.min(1, opacity + 0.15));
    if (this.viewMode === '3d') this.energy3d.set(data, this.origin, true, this.ground());
    this.loop.invalidate();
  }

  /** Mapa de vibración o sobrepresión; null lo oculta. */
  setVibration(data: EnergyData | null, opacity = 0.5): void {
    this.vibrationData = data;
    this.vibration.setOpacity(opacity);
    this.vibration.set(data, this.origin);
    this.vibration3d.setOpacity(Math.min(1, opacity + 0.15));
    if (this.viewMode === '3d') this.rebuild3dOverlays();
    this.loop.invalidate();
  }

  /** Zona de exclusión por proyecciones (polígono en coordenadas de proyecto). */
  setFlyrockZone(zone: Vec2[] | null): void {
    this.flyrockZone = zone;
    this.site.setZone(zone, this.origin, this.view.metersPerPixel);
    if (this.viewMode === '3d') this.rebuild3dOverlays();
    this.applyView();
  }

  /**
   * Triangulaciones de los levantamientos topográficos cargados (D-16), por id, y la cota del
   * terreno de cada uno: con ella la cara libre, el techo, la cresta y los mapas siguen el relieve.
   */
  setTopographyTins(
    tins: ReadonlyMap<string, TinData>,
    grounds: ReadonlyMap<string, Ground> = new Map(),
  ): void {
    const changed =
      tins.size !== this.topographyTins.size ||
      [...tins].some(([id, tin]) => this.topographyTins.get(id) !== tin);
    this.topographyTins = tins;
    this.topographyGrounds = grounds;
    this.scene3dDirty = true;
    if (this.viewMode === '3d') {
      this.rebuild3d();
      // Un levantamiento puede llegar después de entrar a 3D: no conservar la cámara vacía.
      if (changed && this.designEmpty()) {
        this.fit3d();
        this.applyCamera3d();
      }
    }
    this.loop.invalidate();
  }

  /**
   * Topografía en planta (D-16): sombreado, curvas y líneas de cada levantamiento cargado. Si no
   * hay taladros, sus límites deciden el origen de render y el encuadre.
   */
  setTopography(data: readonly TopographyViewData[]): void {
    const first = this.topographyData.length === 0 && data.length > 0;
    this.topographyData = data;
    this.lineSnaps = data.flatMap((d) =>
      d.lines ? [LineSnapIndex.fromData(d.lines, d.lineIndex ?? null)] : [],
    );
    if (this.needsRebase([])) {
      this.rebase();
    } else {
      this.topography.set(data, this.origin);
      this.applyView();
    }
    if (first && this.designEmpty()) this.zoomToFit();
  }

  /**
   * Cota del terreno bajo un punto (O(log n) con el índice del worker); la medición suma ΔZ y
   * pendiente cuando ambos extremos caen sobre la topografía. `null` la quita.
   */
  setElevationSource(source: ((x: number, y: number) => number | null) | null): void {
    this.elevationAt = source;
    this.positionMeasure();
  }

  /** Opacidad del relieve sombreado (0–1). */
  setTopographyShadeOpacity(opacity: number): void {
    this.topography.setShadeOpacity(opacity);
    this.loop.invalidate();
  }

  /** Opacidad de la ortofoto (0–1). */
  setTopographyImageOpacity(opacity: number): void {
    this.topography.setImageOpacity(opacity);
    this.loop.invalidate();
  }

  /**
   * Comparación con otra versión del proyecto (D-14): marcadores de taladros agregados, quitados,
   * movidos y cambiados, en coordenadas de proyecto. `null` la quita.
   */
  setVersionDiff(markers: readonly DiffMarker[] | null): void {
    this.versionDiffData = markers && markers.length > 0 ? markers : null;
    this.rebuildVersionDiff();
    this.applyView();
  }

  private rebuildVersionDiff(): void {
    const mpp = this.view.metersPerPixel;
    this.lastDiffMpp = mpp;
    // Anillo de ~9 px de radio: rodea el símbolo del taladro sin taparlo.
    this.versionDiff.set(this.versionDiffData, this.origin, 9 * mpp);
  }

  /** Flechas de desplazamiento en planta (segmentos en coordenadas de proyecto, color por nivel). */
  setDisplacement(data: IsochroneData | null): void {
    this.displacementData = data;
    this.displacement.set(data, this.origin);
    this.loop.invalidate();
  }

  setIsochrones(data: IsochroneData | null): void {
    this.isochroneData = data;
    this.isochrones.set(data, this.origin);
    if (this.viewMode === '3d')
      this.isochrones3d.set(data, this.origin, this.topZ() + 0.25, this.ground());
    this.loop.invalidate();
  }

  /**
   * Animación de la secuencia de disparo. `times` en segundos por taladro.
   * `speed` = segundos de secuencia por segundo real (p.ej. 0.1 → 10× más lento).
   */
  playSequence(
    times: ReadonlyMap<HoleId, number>,
    speed: number,
    from?: number,
    /** Fin de la animación [s] si va más allá del último disparo (vuelo de la pila, A7). */
    until?: number,
  ): void {
    let first = Infinity;
    let end = -Infinity;
    for (const t of times.values()) {
      first = Math.min(first, t);
      end = Math.max(end, t);
    }
    if (!Number.isFinite(first)) return;
    const last = Math.max(end, until ?? this.muckpileData?.end ?? -Infinity);
    const start =
      from ?? (this.sequence && this.sequence.t < last ? this.sequence.t : first - 0.05);
    this.sequence = {
      times,
      t: start,
      playing: true,
      speed,
      end: Math.max(end + 0.3, until ?? this.muckpileData?.end ?? -Infinity),
      last: performance.now(),
    };
    this.applyHoleColors();
  }

  pauseSequence(): void {
    if (this.sequence) this.sequence.playing = false;
  }

  /** Continúa una secuencia pausada sin cambiar su tiempo ni su límite final. */
  resumeSequence(): void {
    if (!this.sequence) return;
    this.sequence.playing = true;
    this.sequence.last = performance.now();
    this.loop.invalidate();
  }

  setSequenceSpeed(speed: number): void {
    if (this.sequence) this.sequence.speed = speed;
  }

  /** Posiciona la animación en `t` (en pausa). */
  seekSequence(times: ReadonlyMap<HoleId, number>, t: number): void {
    const speed = this.sequence?.speed ?? 0.1;
    this.sequence = { times, t, playing: false, speed, end: Infinity, last: performance.now() };
    this.applyHoleColors();
    this.muckpileBlocks.update(t);
    this.applyMuckpileSurfaceVisibility();
    this.loop.invalidate();
    this.events.emit('sequenceTime', t);
  }

  stopSequence(): void {
    if (!this.sequence) return;
    this.sequence = null;
    this.applyHoleColors();
    this.muckpileBlocks.update(null);
    this.applyMuckpileSurfaceVisibility();
    this.loop.invalidate();
    this.events.emit('sequenceTime', null);
  }

  /** Pila de material (A7); `null` la quita. Los bloques quedan en la pila final hasta animarlos. */
  setMuckpile(view: MuckpileView | null): void {
    this.muckpileData = view;
    this.applyMuckpilePlan();
    this.rebuildMuckpile3d();
    this.applyView();
  }

  /** Colores nuevos de superficie y bloques (otro modo de color) sin rehacer la geometría. */
  setMuckpileColors(
    surface: Uint8Array | null,
    plan: EnergyData | null,
    blocks: Uint8Array | null,
  ): void {
    const data = this.muckpileData;
    if (!data) return;
    this.muckpileData = {
      ...data,
      surface: data.surface && surface ? { ...data.surface, colors: surface } : data.surface,
      plan,
      blocks: data.blocks && blocks ? { ...data.blocks, colors: blocks } : data.blocks,
    };
    this.applyMuckpilePlan();
    this.muckpileSurface3d.set(this.muckpileData.surface, this.origin);
    if (blocks) this.muckpileBlocks.setColors(blocks);
    this.loop.invalidate();
  }

  /** Opacidad de la superficie de la pila (0–1). */
  setMuckpileOpacity(opacity: number): void {
    this.muckpileSurface3d.setOpacity(opacity);
    this.muckpilePlan.setOpacity(Math.min(0.9, opacity));
    this.loop.invalidate();
  }

  /** Línea de la sección del perfil (A7); `null` la quita. */
  setSectionLine(a: Vec2 | null, b: Vec2 | null): void {
    this.sectionData =
      a && b
        ? {
            segments: Float64Array.from([a.x, a.y, b.x, b.y]),
            levels: Float32Array.from([1]),
            min: 0,
            max: 1,
          }
        : null;
    this.sectionLine.set(this.sectionData, this.origin);
    this.loop.invalidate();
  }

  /** La superficie final de la pila se oculta mientras los bloques todavía vuelan. */
  private applyMuckpileSurfaceVisibility(): void {
    const seq = this.sequence;
    const end = this.muckpileData?.end ?? -Infinity;
    const flying = seq !== null && seq.t < end;
    this.muckpileSurface3d.root.visible = this.layerVisible.muckpile && !flying;
  }

  private applyMuckpilePlan(): void {
    const data = this.muckpileData;
    this.muckpilePlan.set(data?.plan ?? null, this.origin);
    this.muckpileArrows.set(data?.vectors ? planArrows(data.vectors) : null, this.origin);
  }

  /**
   * Con la pila a la vista, la topografía se recorta en los perímetros volados y su talud (la roca
   * ya salió): se ve la pila, también delante de la cara libre (A7b).
   */
  private applyTopographyCut(): void {
    const v = this.layerVisible;
    const show = this.muckpileData !== null && (v.muckpile || v.muckpileBlocks);
    // Solo se recalcula si cambió algo que lo afecta (se llama en cada cambio de vista).
    const key = { data: show ? this.muckpileData : null, blasts: this.document.project.blasts };
    if (this.lastCut?.data === key.data && this.lastCut.blasts === key.blasts) return;
    this.lastCut = key;
    if (!show) {
      this.scene3d.setSurfaceMask(null);
      return;
    }
    const polygons: Vec2[][] = [];
    for (const blast of this.document.project.blasts)
      for (const b of blast.boundaries) {
        if (b.polygon.length < 3) continue;
        const charged = blast.holes.some(
          (h) =>
            h.decks.some((d) => d.kind === 'explosive') &&
            pointInPolygon(h.collar.x, h.collar.y, b.polygon),
        );
        if (!charged) continue;
        polygons.push([...b.polygon]);
        for (const q of freeFaceQuads(b, blast.bench))
          polygons.push(q.map((p) => ({ x: p.x, y: p.y })));
      }
    this.scene3d.setSurfaceMask(polygons);
  }

  /** Capas 3D de la pila (se rehacen al cambiar datos, vista u origen). */
  private rebuildMuckpile3d(): void {
    this.applyTopographyCut();
    const data = this.muckpileData;
    this.muckpileSurface3d.set(data?.surface ?? null, this.origin);
    this.muckpileBefore3d.set(data?.before ?? null, this.origin);
    this.muckpileVectors3d.set(data?.vectors ?? null, this.origin);
    this.muckpileBlocks.set(data?.blocks ?? null, this.origin);
    if (this.sequence) this.muckpileBlocks.update(this.sequence.t);
    this.loop.invalidate();
  }

  /**
   * Imagen PNG (data URL) de la vista actual. Se dibuja y se captura en la misma tarea, así no hace
   * falta `preserveDrawingBuffer`. Las reglas y la escala son DOM y no salen en la imagen.
   */
  captureImage(): string {
    this.renderer.render(this.scene, this.viewMode === '3d' ? this.camera3d : this.camera);
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.loop.dispose();
    this.events.clear();
    this.grid.dispose();
    this.holes.dispose();
    this.labels.dispose();
    this.boundaries.dispose();
    this.boundaryLabels.dispose();
    this.initiation.dispose();
    this.isochrones.dispose();
    this.displacement.dispose();
    this.energy.dispose();
    this.energy3d.dispose();
    this.vibration3d.dispose();
    this.initiation3d.dispose();
    this.isochrones3d.dispose();
    this.site3d.dispose();
    this.labels3d.dispose();
    this.siteLabels3d.dispose();
    this.vibration.dispose();
    this.site.dispose();
    this.versionDiff.dispose();
    this.topography.dispose();
    this.siteLabels.dispose();
    this.overlay.dispose();
    this.muckpilePlan.dispose();
    this.muckpileArrows.dispose();
    this.muckpileSurface3d.dispose();
    this.muckpileBefore3d.dispose();
    this.muckpileVectors3d.dispose();
    this.muckpileBlocks.dispose();
    this.domains.dispose();
    this.sectionLine.dispose();
    this.decorations.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ Sincronización con el documento

  private onDocumentChange(cs: ChangeSet): void {
    // El reset puede encuadrar en 3D dentro de onDocumentChangePlan. Debe usar la escena nueva.
    this.scene3dDirty = true;
    this.onDocumentChangePlan(cs);
    if (this.viewMode === '3d') {
      this.rebuild3d();
      if (!this.orbit) {
        this.fit3d();
        this.applyCamera3d();
      }
    }
  }

  private onDocumentChangePlan(cs: ChangeSet): void {
    if (cs.reset) {
      this.activeBlastId = undefined;
      this.activeBoundaryId = null;
      this.orbit = null;
      this.stopSequence();
      // Un resultado del proyecto anterior no debe extender el encuadre del modelo nuevo.
      this.setMuckpile(null);
      this.origin = { ...this.document.project.coordinateSystem.origin };
      this.rebuildAll();
      this.zoomToFit();
      return;
    }
    const { added, removed, updated } = cs.holes;
    if (added.length + removed.length + updated.length > 0) {
      for (const id of removed) {
        this.holes.remove(id);
        this.labels.remove(id);
      }
      if (added.length > 0 && this.needsRebase(added)) {
        this.rebase();
        return;
      }
      for (const id of added) this.upsertHole(id);
      for (const id of updated) this.upsertHole(id);
      if (this.hover !== null && removed.includes(this.hover)) this.setHover(null);
      this.holes.flush();
      this.labels.flush();
      this.picker.markDirty();
    }
    if (cs.blasts.length > 0) {
      this.rebuildBoundaries();
      this.domains.rebuild(this.document.project.blasts, this.origin);
    }
    // Las conexiones siguen a los taladros: se reconstruyen si cambian taladros, iniciación o librería.
    if (cs.blasts.length > 0 || cs.project || added.length + removed.length + updated.length > 0)
      this.rebuildInitiation();
    if (cs.project) this.rebuildSite();
    if (cs.patterns) this.updateTypicalSpacing();
    this.applyView();
  }

  /** Coloca la etiqueta de medición junto al extremo B (sigue a la vista al desplazar/zoom). */
  private positionMeasure(): void {
    const a = this.measureA;
    const b = this.measureB;
    const za = a && this.elevationAt ? this.elevationAt(a.x, a.y) : null;
    const zb = b && this.elevationAt ? this.elevationAt(b.x, b.y) : null;
    this.decorations.setMeasure(
      a,
      b,
      b ? this.projectToScreen(b.x, b.y) : null,
      za !== null && zb !== null ? zb - za : null,
    );
  }

  private rebuild3d(): void {
    const project = this.document.project;
    this.scene3d.rebuild(
      project,
      project.blasts,
      this.origin,
      this.options3d,
      this.topographyTins,
      this.topographyGrounds,
    );
    this.scene3dDirty = false;
    this.rebuild3dOverlays();
    this.loop.invalidate();
  }

  /** Cota de render de la superficie del banco (para mapas y marcas en 3D). */
  private topZ(): number {
    const b = this.document.project.blasts[0]?.bench;
    return (b ? b.floorElevation + b.height : 0) - this.origin.z;
  }

  /**
   * Cota del terreno del banco activo (su levantamiento cargado), o null: con ella los mapas, las
   * isócronas y la zona de proyecciones se apoyan en el relieve en 3D.
   */
  private ground(): Ground | null {
    const id = this.document.project.blasts[0]?.bench.topographyId;
    return id && this.topographyTins.has(id) ? (this.topographyGrounds.get(id) ?? null) : null;
  }

  /** Amarres, isócronas, mapas, sitio y etiquetas en 3D (baratos: se rehacen enteros). */
  private rebuild3dOverlays(): void {
    const project = this.document.project;
    const top = this.topZ();
    const ground = this.ground();
    this.initiation3d.rebuild(project.blasts, project.library, this.origin, true);
    this.isochrones3d.set(this.isochroneData, this.origin, top + 0.25, ground);
    this.energy3d.set(this.energyData, this.origin, true, ground);
    // La vibración se evalúa en los receptores sobre el terreno (o a la cota del banco sin él).
    this.vibration3d.set(
      this.vibrationData
        ? { ...this.vibrationData, elevation: top + this.origin.z, onTerrain: true }
        : null,
      this.origin,
      true,
      ground,
    );
    this.site3d.setElevation(top + 0.3);
    this.site3d.setZone(this.flyrockZone, this.origin, 0.6, ground);
    const points = this.document.project.monitoringPoints ?? [];
    this.site3d.setMarkers(points, this.origin, 3);
    this.siteLabels3d.clear();
    for (const p of points) {
      this.siteLabels3d.upsert(
        p.id,
        p.position.x - this.origin.x,
        p.position.y - this.origin.y,
        p.name,
        top + 0.3,
      );
    }
    this.siteLabels3d.flush();
    this.labels3d.clear();
    for (const blast of project.blasts) {
      for (const h of blast.holes) {
        this.labels3d.upsert(
          h.id,
          h.collar.x - this.origin.x,
          h.collar.y - this.origin.y,
          this.labelFor(h.id, h.label),
          h.collar.z - this.origin.z + 1.2,
        );
      }
    }
    this.labels3d.flush();
    this.apply3dVisibility();
    this.loop.invalidate();
  }

  private apply3dVisibility(): void {
    const v = this.layerVisible;
    this.initiation3d.root.visible = v.connections;
    this.isochrones3d.lines.visible = v.isochrones;
    this.energy3d.root.visible = v.energy;
    this.vibration3d.root.visible = v.vibration;
    this.site3d.setZoneVisible(v.flyrock);
    this.applyMuckpileSurfaceVisibility();
    this.scene3d.faces.visible = v.faces;
    this.applyTopographyCut();
    this.scene3d.benchPlanes.visible = v.benchPlanes;
    this.muckpileBefore3d.root.visible = v.muckpileBefore;
    this.muckpileVectors3d.root.visible = v.muckpileVectors;
    this.muckpileBlocksRoot.visible = v.muckpileBlocks;
    // Etiquetas en 3D solo con cantidades legibles.
    const n = this.document.project.blasts.reduce((sum, b) => sum + b.holes.length, 0);
    this.labels3d.mesh.visible = v.labels && n <= 2500;
  }

  private fit3d(): void {
    const b = this.withMuckpileBounds(this.scene3d.bounds) ?? {
      minX: -50,
      minY: -50,
      minZ: -10,
      maxX: 50,
      maxY: 50,
      maxZ: 10,
    };
    this.orbit = fitOrbit(b, (this.camera3d.fov * Math.PI) / 180, this.width / this.height);
  }

  /** Agrega la extensión de la pila (puede salir muy por delante de la voladura) al encuadre 3D. */
  private withMuckpileBounds(b: typeof this.scene3d.bounds): typeof this.scene3d.bounds {
    const layers = this.layerVisible;
    if (!layers.muckpile && !layers.muckpileBlocks && !layers.muckpileVectors) return b;
    const g = this.muckpileData?.surface?.after;
    if (!g || g.nx === 0) return b;
    const minX = g.originX - this.origin.x;
    const minY = g.originY - this.origin.y;
    const maxX = minX + g.nx * g.cellSize;
    const maxY = minY + g.ny * g.cellSize;
    if (!b) return null;
    return {
      ...b,
      minX: Math.min(b.minX, minX),
      minY: Math.min(b.minY, minY),
      maxX: Math.max(b.maxX, maxX),
      maxY: Math.max(b.maxY, maxY),
    };
  }

  private applyCamera3d(): void {
    if (!this.orbit) return;
    const p = orbitPosition(this.orbit);
    this.camera3d.position.set(p.x, p.y, p.z);
    this.camera3d.lookAt(this.orbit.targetX, this.orbit.targetY, this.orbit.targetZ);
    this.camera3d.near = Math.max(0.1, this.orbit.distance / 2000);
    this.camera3d.far = this.orbit.distance * 50;
    this.camera3d.updateProjectionMatrix();
    this.decorations.update3d(this.orbit.yaw);
    const buffer = this.renderer.getDrawingBufferSize(new Vector2());
    this.labels3d.setViewport(buffer.x, buffer.y, this.pixelRatio, 4 * this.pixelRatio);
    this.siteLabels3d.setViewport(buffer.x, buffer.y, this.pixelRatio, 6 * this.pixelRatio);
    this.loop.invalidate();
  }

  private rebuildBoundaries(): void {
    const blasts = this.document.project.blasts;
    if (
      this.activeBoundaryId &&
      !blasts.some((b) => b.boundaries.some((x) => x.id === this.activeBoundaryId))
    ) {
      this.activeBoundaryId = null;
      this.events.emit('activeBoundary', null);
    }
    this.boundaries.rebuild(
      blasts,
      this.origin,
      this.activeBoundaryId,
      4 * this.view.metersPerPixel,
    );
    this.boundaryLabels.clear();
    for (const blast of blasts) {
      for (const b of blast.boundaries) {
        if (b.polygon.length === 0) continue;
        // Nombre junto al vértice más al Norte-Oeste (esquina superior izquierda en planta).
        let anchor = b.polygon[0] ?? { x: 0, y: 0 };
        for (const p of b.polygon) if (p.y - p.x > anchor.y - anchor.x) anchor = p;
        this.boundaryLabels.upsert(
          b.id,
          anchor.x - this.origin.x,
          anchor.y - this.origin.y,
          b.name.replace(/^(Perímetro|Boundary) /, 'P'),
        );
      }
    }
    this.boundaryLabels.flush();
  }

  /** Marcadores y nombres de los puntos de control (tamaño constante en pantalla). */
  private rebuildSite(): void {
    const points = this.document.project.monitoringPoints ?? [];
    this.site.setMarkers(points, this.origin, 5 * this.view.metersPerPixel);
    this.siteLabels.clear();
    for (const p of points) {
      this.siteLabels.upsert(
        p.id,
        p.position.x - this.origin.x,
        p.position.y - this.origin.y,
        p.name,
      );
    }
    this.siteLabels.flush();
  }

  private rebuildInitiation(): void {
    this.initiation.rebuild(
      this.document.project.blasts,
      this.document.project.library,
      this.origin,
    );
  }

  private labelFor(id: HoleId, fallback: string): string {
    return this.labelOverride?.get(id) ?? fallback;
  }

  private readonly firedColor = new Color(0xff5a1f);
  private readonly flashColor = new Color(0xfff3b0);
  private readonly pendingColor = new Color(0x2a3442);

  /** Color de taladros según prioridad: secuencia > escalares > por defecto. */
  private applyHoleColors(): void {
    const seq = this.sequence;
    if (seq) {
      this.holes.setColorSource((id) => {
        const t = seq.times.get(id);
        if (t === undefined || seq.t < t) return this.pendingColor;
        return seq.t - t < 0.025 ? this.flashColor : this.firedColor;
      });
    } else if (this.scalars?.colors) {
      const colors = this.scalars.colors;
      const cache = new Map<string, Color>();
      this.holes.setColorSource((id) => {
        const css = colors.get(id);
        if (css === undefined) return null;
        let c = cache.get(css);
        if (!c) cache.set(css, (c = new Color(css)));
        return c;
      });
    } else if (this.scalars) {
      const { values, min, max } = this.scalars;
      const span = max - min;
      const cache = new Map<HoleId, Color>();
      this.holes.setColorSource((id) => {
        const v = values.get(id);
        if (v === undefined || !Number.isFinite(v)) return null;
        let c = cache.get(id);
        if (!c) cache.set(id, (c = turbo(span > 0 ? (v - min) / span : 0.5, new Color())));
        return c;
      });
    } else {
      this.holes.setColorSource(null);
    }
    this.scene3d.setColorSource(this.holes.currentColorSource);
    this.holes.flush();
    this.loop.invalidate();
  }

  private advanceSequence(): void {
    const seq = this.sequence;
    if (!seq?.playing) return;
    const now = performance.now();
    seq.t += ((now - seq.last) / 1000) * seq.speed;
    seq.last = now;
    if (seq.t >= seq.end) {
      seq.t = seq.end;
      seq.playing = false;
      this.events.emit('sequenceEnded', null);
    }
    this.holes.refreshColors();
    this.holes.flush();
    if (this.viewMode === '3d') {
      this.scene3d.refreshColors();
      this.muckpileBlocks.update(seq.t);
      this.applyMuckpileSurfaceVisibility();
    }
    this.events.emit('sequenceTime', seq.t);
    if (seq.playing) this.loop.invalidate();
  }

  private onSelectionChange(ids: ReadonlySet<HoleId>): void {
    const prev = this.lastSelection;
    const deselected: HoleId[] = [];
    for (const id of prev) if (!ids.has(id)) deselected.push(id);
    const selected: HoleId[] = [];
    for (const id of ids) if (!prev.has(id)) selected.push(id);
    this.holes.setSelected(deselected, false);
    this.holes.setSelected(selected, true);
    this.holes.flush();
    this.lastSelection = ids;
    this.loop.invalidate();
  }

  private upsertHole(id: HoleId): void {
    const loc = this.document.findHole(id);
    if (!loc) return;
    const h = loc.hole;
    this.holes.upsert(h, this.origin, this.selection.has(id));
    this.labels.upsert(
      id,
      h.collar.x - this.origin.x,
      h.collar.y - this.origin.y,
      this.labelFor(id, h.label),
    );
  }

  private rebuildAll(checkRebase = true): void {
    this.holes.clear();
    this.labels.clear();
    this.hover = null;
    this.lastSelection = this.selection.ids;
    for (const blast of this.document.project.blasts) {
      for (const h of blast.holes) {
        this.holes.upsert(h, this.origin, this.selection.has(h.id));
        this.labels.upsert(
          h.id,
          h.collar.x - this.origin.x,
          h.collar.y - this.origin.y,
          this.labelFor(h.id, h.label),
        );
      }
    }
    if (checkRebase && this.needsRebase([])) {
      this.rebase();
      return;
    }
    this.holes.flush();
    this.labels.flush();
    this.picker.markDirty();
    this.rebuildBoundaries();
    this.rebuildInitiation();
    this.isochrones.set(this.isochroneData, this.origin);
    this.displacement.set(this.displacementData, this.origin);
    this.energy.set(this.energyData, this.origin);
    this.vibration.set(this.vibrationData, this.origin);
    this.site.setZone(this.flyrockZone, this.origin, this.view.metersPerPixel);
    this.rebuildSite();
    this.rebuildVersionDiff();
    this.topography.set(this.topographyData, this.origin);
    this.domains.rebuild(this.document.project.blasts, this.origin);
    this.sectionLine.set(this.sectionData, this.origin);
    this.applyMuckpilePlan();
    this.rebuildMuckpile3d();
    this.holes.refreshColors();
    this.updateTypicalSpacing();
    this.applyView();
  }

  /** ¿Hay geometría demasiado lejos del origen de render para float32? */
  private needsRebase(added: readonly HoleId[]): boolean {
    const far = (x: number, y: number): boolean =>
      Math.abs(x - this.origin.x) > REBASE_DISTANCE_M ||
      Math.abs(y - this.origin.y) > REBASE_DISTANCE_M;
    if (added.length > 0) {
      return added.some((id) => {
        const h = this.document.findHole(id)?.hole;
        return h !== undefined && far(h.collar.x, h.collar.y);
      });
    }
    let anyHole = false;
    for (const blast of this.document.project.blasts) {
      const h = blast.holes[0];
      if (h && far(h.collar.x, h.collar.y)) return true;
      anyHole ||= h !== undefined;
    }
    if (anyHole) return false;
    // Sin taladros: el centro de la topografía.
    const c = this.topographyCenter();
    return c !== null && far(c.x, c.y);
  }

  /** Centro de los levantamientos cargados, o null si no hay. */
  private topographyCenter(): Vec3 | null {
    const t = this.topographyData[0];
    if (!t) return null;
    return {
      x: (t.bounds.minX + t.bounds.maxX) / 2,
      y: (t.bounds.minY + t.bounds.maxY) / 2,
      z: (t.bounds.minZ + t.bounds.maxZ) / 2,
    };
  }

  /** ¿El proyecto no tiene taladros ni perímetros? */
  private designEmpty(): boolean {
    return this.document.project.blasts.every(
      (b) => b.holes.length === 0 && b.boundaries.length === 0,
    );
  }

  /** Recentra el origen de render en los datos y reconstruye; la vista no se mueve en el mundo. */
  private rebase(): void {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (const blast of this.document.project.blasts) {
      for (const h of blast.holes) {
        sx += h.collar.x;
        sy += h.collar.y;
        sz += h.collar.z;
        n++;
      }
    }
    const topo = n === 0 ? this.topographyCenter() : null;
    if (n === 0 && !topo) return;
    const next = topo
      ? { x: Math.round(topo.x), y: Math.round(topo.y), z: Math.round(topo.z) }
      : { x: Math.round(sx / n), y: Math.round(sy / n), z: Math.round(sz / n) };
    this.view = {
      ...this.view,
      centerX: this.view.centerX + this.origin.x - next.x,
      centerY: this.view.centerY + this.origin.y - next.y,
    };
    if (this.orbit) {
      this.orbit = {
        ...this.orbit,
        targetX: this.orbit.targetX + this.origin.x - next.x,
        targetY: this.orbit.targetY + this.origin.y - next.y,
        targetZ: this.orbit.targetZ + this.origin.z - next.z,
      };
    }
    this.origin = next;
    this.scene3dDirty = true;
    this.rebuildAll(false);
    if (this.viewMode === '3d') {
      this.rebuild3d();
      this.applyCamera3d();
    }
  }

  private updateTypicalSpacing(): void {
    let spacing = Infinity;
    for (const blast of this.document.project.blasts) {
      for (const p of blast.patterns) spacing = Math.min(spacing, p.burden, p.spacing);
    }
    this.typicalSpacing = Number.isFinite(spacing) ? spacing : 5;
  }

  // ------------------------------------------------------------------ Vista y render

  private setView(view: PlanViewState): void {
    this.view = view;
    this.applyView();
  }

  private resize(): void {
    this.width = Math.max(1, this.canvas.clientWidth);
    this.height = Math.max(1, this.canvas.clientHeight);
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera3d.aspect = this.width / this.height;
    this.camera3d.updateProjectionMatrix();
    this.applyView();
  }

  /** Actualiza cámara, grilla, tamaños en pantalla y LOD de etiquetas; agenda un frame. */
  private applyView(): void {
    const { centerX, centerY, metersPerPixel: mpp } = this.view;
    const halfW = (this.width / 2) * mpp;
    const halfH = (this.height / 2) * mpp;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.position.set(centerX, centerY, 1000);
    this.camera.updateProjectionMatrix();
    this.grid.update(centerX, centerY, halfW * 2, halfH * 2, mpp);
    this.grid.mesh.visible = this.decorationSettings.grid;
    this.decorations.updatePlan({
      minX: centerX - halfW + this.origin.x,
      maxX: centerX + halfW + this.origin.x,
      minY: centerY - halfH + this.origin.y,
      maxY: centerY + halfH + this.origin.y,
      metersPerPixel: mpp,
      width: this.width,
      height: this.height,
      gridStep: this.grid.step,
    });
    this.positionMeasure();

    const spacingPx = this.typicalSpacing / mpp;
    const radiusCss = Math.min(7, Math.max(2.5, spacingPx * 0.18));
    this.pickTolerancePx = radiusCss + 3;
    const buffer = this.renderer.getDrawingBufferSize(new Vector2());
    this.holes.setViewport(buffer.x, buffer.y, radiusCss * this.pixelRatio);
    this.labels.setViewport(buffer.x, buffer.y, this.pixelRatio, radiusCss * this.pixelRatio);
    this.boundaryLabels.setViewport(buffer.x, buffer.y, this.pixelRatio, 4 * this.pixelRatio);
    // Los marcadores de vértice del perímetro activo tienen tamaño fijo en pantalla.
    if (this.activeBoundaryId && Math.abs(this.lastVertexMpp - mpp) > mpp * 0.05) {
      this.lastVertexMpp = mpp;
      this.rebuildBoundaries();
    }
    this.labels.mesh.visible = this.layerVisible.labels && spacingPx >= LABEL_MIN_SPACING_PX;
    this.holes.traceObject.visible = this.layerVisible.traces && spacingPx >= 8;
    this.initiation.root.visible = this.layerVisible.connections;
    this.isochrones.lines.visible = this.layerVisible.isochrones;
    this.displacement.lines.visible = this.layerVisible.displacement;
    this.topography.imageRoot.visible = this.layerVisible.topoImage;
    this.topography.shadeRoot.visible = this.layerVisible.topoShade;
    this.topography.contourRoot.visible = this.layerVisible.topoContours;
    this.topography.lineRoot.visible = this.layerVisible.topoLines;
    this.energy.root.visible = this.layerVisible.energy;
    this.muckpilePlan.root.visible = this.layerVisible.muckpile;
    this.muckpileArrows.lines.visible = this.layerVisible.muckpileVectors;
    this.domains.lines.visible = this.layerVisible.domains;
    this.apply3dVisibility();
    this.vibration.root.visible = this.layerVisible.vibration;
    this.site.setDashScale(mpp);
    this.site.setZoneVisible(this.layerVisible.flyrock);
    this.siteLabels.setViewport(buffer.x, buffer.y, this.pixelRatio, 5 * this.pixelRatio);
    if (Math.abs(this.lastSiteMpp - mpp) > mpp * 0.05) {
      this.lastSiteMpp = mpp;
      this.rebuildSite();
    }
    if (this.versionDiffData && Math.abs(this.lastDiffMpp - mpp) > mpp * 0.05)
      this.rebuildVersionDiff();
    this.versionDiff.lines.visible = this.viewMode === 'plan' && this.versionDiffData !== null;
    this.loop.invalidate();
  }

  // ------------------------------------------------------------------ Interacción

  private toToolPointer(e: PointerEvent | MouseEvent): ToolPointer {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(this.view, sx, sy, rect.width, rect.height);
    return {
      x: w.x + this.origin.x,
      y: w.y + this.origin.y,
      sx,
      sy,
      button: e.button,
      buttons: e.buttons,
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
    };
  }

  private pickHole(x: number, y: number): HoleId | null {
    return (
      this.picker.current.nearest(x, y, this.pickTolerancePx * this.view.metersPerPixel)?.id ?? null
    );
  }

  private updateHover(p: ToolPointer): void {
    const tool = this.tool.name;
    this.setHover(
      tool === 'add' ||
        tool === 'boundary' ||
        tool === 'freeFace' ||
        tool === 'monitor' ||
        tool === 'measure' ||
        tool === 'section' ||
        tool === 'domain' ||
        tool === 'pan'
        ? null
        : this.pickHole(p.x, p.y),
    );
  }

  private setHover(id: HoleId | null): void {
    if (id === this.hover) return;
    this.hover = id;
    if (this.holes.setHover(id)) {
      this.holes.flush();
      this.loop.invalidate();
    }
    this.events.emit('hover', id);
  }

  /** El evento de puntero se emite como máximo una vez por frame. */
  private queuePointer(p: Vec2 | null): void {
    this.pendingPointer = p;
    this.loop.invalidate();
  }

  private flushPointer(): void {
    if (this.pendingPointer === undefined) return;
    this.events.emit('pointer', this.pendingPointer);
    this.pendingPointer = undefined;
  }

  private handleKey(e: KeyboardEvent): boolean {
    if (this.tool.onKeyDown?.(e, this.toolContext)) return true;
    if (e.key === 'Escape') return this.tool.cancel?.(this.toolContext) ?? false;
    return false;
  }

  /** Conexión más cercana (distancia punto-segmento) dentro de la tolerancia de picking. */
  private pickConnection(x: number, y: number): ConnectionId | null {
    const blast = this.activeBlast();
    if (!blast) return null;
    const tol = this.pickTolerancePx * this.view.metersPerPixel;
    let best: ConnectionId | null = null;
    let bestD = tol;
    for (const c of blast.initiation.connections) {
      if (c.from.kind !== 'hole' || c.to.kind !== 'hole') continue;
      const a = this.document.findHole(c.from.holeId)?.hole.collar;
      const b = this.document.findHole(c.to.holeId)?.hole.collar;
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
      const d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
      if (d < bestD) {
        bestD = d;
        best = c.id;
      }
    }
    return best;
  }

  private activeBlast(): Blast | undefined {
    const blasts = this.document.project.blasts;
    const active =
      this.activeBlastId === undefined
        ? undefined
        : blasts.find((b) => b.id === this.activeBlastId);
    return active ?? blasts[0];
  }

  private snapAt(x: number, y: number, ignoreHoles: boolean): SnapResult {
    const toleranceM = this.snap.tolerancePx * this.view.metersPerPixel;
    const options: SnapOptions = {
      grid: this.snap.grid,
      gridSize: this.snap.gridSize,
      holes: this.snap.holes && !ignoreHoles,
      pattern: this.snap.pattern,
      topography: this.snap.topography,
      tolerance: toleranceM,
    };
    const patterns: Pattern[] = [];
    for (const blast of this.document.project.blasts) patterns.push(...blast.patterns);
    return snapPoint(x, y, options, {
      nearestHole: (px, py, maxDistance) => this.picker.current.nearest(px, py, maxDistance),
      patterns,
      nearestLinePoint: (px, py, maxDistance) => {
        let best: ReturnType<LineSnapIndex['nearest']> = null;
        for (const idx of this.lineSnaps) {
          const p = idx.nearest(px, py, maxDistance);
          // Un vértice gana a un borde; entre iguales, el más cercano.
          if (
            p &&
            (!best ||
              (p.kind === 'lineVertex' && best.kind === 'lineEdge') ||
              (p.kind === best.kind &&
                Math.hypot(p.x - px, p.y - py) < Math.hypot(best.x - px, best.y - py)))
          )
            best = p;
        }
        return best;
      },
    });
  }

  private createToolContext(): ToolContext {
    const toRender = (points: readonly Vec2[]): Vec2[] =>
      points.map((p) => ({ x: p.x - this.origin.x, y: p.y - this.origin.y }));
    return {
      document: this.document,
      selection: this.selection,
      pickHole: (x, y) => this.pickHole(x, y),
      holesInBox: (minX, minY, maxX, maxY) => this.picker.current.inBox(minX, minY, maxX, maxY),
      holesInPolygon: (polygon) => this.picker.current.inPolygon(polygon),
      snap: (x, y, query) => this.snapAt(x, y, query?.ignoreHoles ?? false),
      metersPerPixel: () => this.view.metersPerPixel,
      activeBlast: () => this.activeBlast(),
      groundAt: (x, y) =>
        this.activeBlast()?.bench.topographyId && this.elevationAt ? this.elevationAt(x, y) : null,
      holeTemplate: () => this.template,
      tieConnector: () => {
        const connectors = this.document.project.library.surfaceConnectors;
        return connectors.find((c) => c.id === this.tieConnectorId)?.id ?? connectors[0]?.id;
      },
      pickConnection: (x, y) => this.pickConnection(x, y),
      showMeasure: (a, b) => {
        this.measureA = a;
        this.measureB = b;
        this.positionMeasure();
      },
      setActiveBoundary: (id) => {
        this.setActiveBoundary(id);
      },
      setSection: (a, b) => {
        this.setSectionLine(a, b);
        this.events.emit('section', { a, b });
      },
      showPolyline: (points) => {
        this.overlay.setPolyline(points ? toRender(points) : null);
      },
      showPolygon: (points) => {
        this.overlay.setPolygon(points ? toRender(points) : null);
      },
      showSnapMarker: (point) => {
        const visible = point && point.kind !== 'none';
        this.overlay.setMarker(
          visible ? { x: point.x - this.origin.x, y: point.y - this.origin.y } : null,
          6 * this.view.metersPerPixel,
        );
      },
      previewMove: (ids, dx, dy) => {
        this.holes.setPreviewOffset(ids, dx, dy);
        this.labels.setPreviewOffset(ids, dx, dy);
        this.holes.flush();
        this.labels.flush();
      },
      clearPreviewMove: () => {
        this.holes.clearPreview();
        this.labels.clearPreview();
        this.holes.flush();
        this.labels.flush();
      },
      invalidate: () => {
        this.loop.invalidate();
      },
      text: (key, vars) => this.text(key, vars),
    };
  }
}

/** Flechas en planta a partir de los vectores 3D: cuerpo y dos barbas por vector. */
function planArrows(v: VectorsData): IsochroneData | null {
  const segs: number[] = [];
  const levels: number[] = [];
  for (let i = 0; i < v.values.length; i++) {
    const x0 = v.from[3 * i] ?? 0;
    const y0 = v.from[3 * i + 1] ?? 0;
    const x1 = v.to[3 * i] ?? 0;
    const y1 = v.to[3 * i + 1] ?? 0;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-3) continue;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const head = Math.min(0.25 * len, 3);
    const c = Math.cos(0.45);
    const sn = Math.sin(0.45);
    segs.push(x0, y0, x1, y1);
    segs.push(x1, y1, x1 - head * (ux * c - uy * sn), y1 - head * (uy * c + ux * sn));
    segs.push(x1, y1, x1 - head * (ux * c + uy * sn), y1 - head * (uy * c - ux * sn));
    const val = v.values[i] ?? 0;
    levels.push(val, val, val);
  }
  if (levels.length === 0) return null;
  return {
    segments: Float64Array.from(segs),
    levels: Float32Array.from(levels),
    min: v.min,
    max: v.max,
  };
}
