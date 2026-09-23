import { Color, OrthographicCamera, Scene, Vector2, WebGLRenderer } from 'three';
import {
  DEFAULT_HOLE_TEMPLATE,
  snapPoint,
  type Blast,
  type BlastId,
  type BoundaryId,
  type ChangeSet,
  type ConnectionId,
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
} from '@blastlab/core';
import { fitBounds, screenToWorld, type PlanViewState } from './cameras/planView';
import { Emitter } from './events';
import { InputRouter } from './input/InputRouter';
import { BoundaryLayer } from './layers/BoundaryLayer';
import { COLORS } from './layers/colors';
import { GridLayer } from './layers/GridLayer';
import { turbo } from './layers/colormap';
import { EnergyLayer, type EnergyData } from './layers/EnergyLayer';
import { HolesLayer } from './layers/HolesLayer';
import { InitiationLayer } from './layers/InitiationLayer';
import { IsochronesLayer, type IsochroneData } from './layers/IsochronesLayer';
import { LabelsLayer } from './layers/LabelsLayer';
import { OverlayLayer } from './layers/OverlayLayer';
import { RenderLoop, type FrameStats } from './loop/RenderLoop';
import { HolePicker } from './picking/HolePicker';
import { AddHoleTool } from './tools/AddHoleTool';
import { BoundaryTool } from './tools/BoundaryTool';
import { FreeFaceTool } from './tools/FreeFaceTool';
import { InitiateTool } from './tools/InitiateTool';
import { TieTool } from './tools/TieTool';
import { PanTool } from './tools/PanTool';
import { SelectTool } from './tools/SelectTool';
import type { Tool, ToolContext, ToolName, ToolPointer } from './tools/types';

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
}

export type EngineLayer = 'labels' | 'traces' | 'connections' | 'isochrones' | 'energy';

/** Valores escalares por taladro para colorear con el mapa turbo. */
export interface HoleScalars {
  values: ReadonlyMap<HoleId, number>;
  min: number;
  max: number;
}

export interface SnapSettings {
  grid: boolean;
  gridSize: number;
  holes: boolean;
  pattern: boolean;
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
  private readonly initiation = new InitiationLayer();
  private readonly isochrones = new IsochronesLayer();
  private readonly energy = new EnergyLayer();
  private energyData: EnergyData | null = null;
  private isochroneData: IsochroneData | null = null;
  private layerVisible: Record<EngineLayer, boolean> = {
    labels: true,
    traces: true,
    connections: true,
    isochrones: true,
    energy: true,
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
    this.scene.background = COLORS.background;
    this.camera.position.set(0, 0, 1000);
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.lookAt(0, 0, 0);
    this.scene.add(
      this.grid.mesh,
      this.energy.root,
      this.isochrones.lines,
      this.boundaries.root,
      this.initiation.root,
      this.holes.root,
      this.labels.mesh,
      this.boundaryLabels.mesh,
      this.overlay.root,
    );

    this.loop = new RenderLoop(
      () => {
        this.flushPointer();
        this.advanceSequence();
        this.renderer.render(this.scene, this.camera);
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
    this.setView(fitBounds(bounds, this.width, this.height, 0.05));
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
    this.loop.invalidate();
  }

  /** Mapa de energía (raster coloreado + contornos); null lo oculta. */
  setEnergy(data: EnergyData | null, opacity = 0.6): void {
    this.energyData = data;
    this.energy.setOpacity(opacity);
    this.energy.set(data, this.origin);
    this.loop.invalidate();
  }

  setIsochrones(data: IsochroneData | null): void {
    this.isochroneData = data;
    this.isochrones.set(data, this.origin);
    this.loop.invalidate();
  }

  /**
   * Animación de la secuencia de disparo. `times` en segundos por taladro.
   * `speed` = segundos de secuencia por segundo real (p.ej. 0.1 → 10× más lento).
   */
  playSequence(times: ReadonlyMap<HoleId, number>, speed: number, from?: number): void {
    let first = Infinity;
    let end = -Infinity;
    for (const t of times.values()) {
      first = Math.min(first, t);
      end = Math.max(end, t);
    }
    if (!Number.isFinite(first)) return;
    const start = from ?? (this.sequence && this.sequence.t < end ? this.sequence.t : first - 0.05);
    this.sequence = {
      times,
      t: start,
      playing: true,
      speed,
      end: end + 0.3,
      last: performance.now(),
    };
    this.applyHoleColors();
  }

  pauseSequence(): void {
    if (this.sequence) this.sequence.playing = false;
  }

  setSequenceSpeed(speed: number): void {
    if (this.sequence) this.sequence.speed = speed;
  }

  /** Posiciona la animación en `t` (en pausa). */
  seekSequence(times: ReadonlyMap<HoleId, number>, t: number): void {
    const speed = this.sequence?.speed ?? 0.1;
    this.sequence = { times, t, playing: false, speed, end: Infinity, last: performance.now() };
    this.applyHoleColors();
    this.events.emit('sequenceTime', t);
  }

  stopSequence(): void {
    if (!this.sequence) return;
    this.sequence = null;
    this.applyHoleColors();
    this.events.emit('sequenceTime', null);
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
    this.energy.dispose();
    this.overlay.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ Sincronización con el documento

  private onDocumentChange(cs: ChangeSet): void {
    if (cs.reset) {
      this.activeBlastId = undefined;
      this.activeBoundaryId = null;
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
    if (cs.blasts.length > 0) this.rebuildBoundaries();
    // Las conexiones siguen a los taladros: se reconstruyen si cambian taladros, iniciación o librería.
    if (cs.blasts.length > 0 || cs.project || added.length + removed.length + updated.length > 0)
      this.rebuildInitiation();
    if (cs.patterns) this.updateTypicalSpacing();
    this.applyView();
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
          b.name.replace('Perímetro ', 'P'),
        );
      }
    }
    this.boundaryLabels.flush();
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
    this.energy.set(this.energyData, this.origin);
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
    for (const blast of this.document.project.blasts) {
      const h = blast.holes[0];
      if (h && far(h.collar.x, h.collar.y)) return true;
    }
    return false;
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
    if (n === 0) return;
    const next = { x: Math.round(sx / n), y: Math.round(sy / n), z: Math.round(sz / n) };
    this.view = {
      ...this.view,
      centerX: this.view.centerX + this.origin.x - next.x,
      centerY: this.view.centerY + this.origin.y - next.y,
    };
    this.origin = next;
    this.rebuildAll(false);
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
    this.energy.root.visible = this.layerVisible.energy;
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
      tool === 'add' || tool === 'boundary' || tool === 'freeFace' || tool === 'pan'
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
      tolerance: toleranceM,
    };
    const patterns: Pattern[] = [];
    for (const blast of this.document.project.blasts) patterns.push(...blast.patterns);
    return snapPoint(x, y, options, {
      nearestHole: (px, py, maxDistance) => this.picker.current.nearest(px, py, maxDistance),
      patterns,
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
      holeTemplate: () => this.template,
      tieConnector: () => {
        const connectors = this.document.project.library.surfaceConnectors;
        return connectors.find((c) => c.id === this.tieConnectorId)?.id ?? connectors[0]?.id;
      },
      pickConnection: (x, y) => this.pickConnection(x, y),
      setActiveBoundary: (id) => {
        this.setActiveBoundary(id);
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
    };
  }
}
