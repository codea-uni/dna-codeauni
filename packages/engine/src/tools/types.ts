import type {
  Blast,
  BoundaryId,
  ConnectionId,
  SurfaceConnectorId,
  DocumentStore,
  HoleId,
  HoleTemplate,
  SelectionStore,
  SnapResult,
  Vec2,
} from '@blastlab/core';

export type ToolName =
  | 'select'
  | 'lasso'
  | 'add'
  | 'boundary'
  | 'freeFace'
  | 'pan'
  | 'tie'
  | 'initiate'
  | 'monitor'
  | 'measure';

/** Evento de puntero ya traducido a coordenadas de proyecto [m]. */
export interface ToolPointer {
  x: number;
  y: number;
  /** Pantalla (px CSS relativos al canvas). */
  sx: number;
  sy: number;
  button: number;
  buttons: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

export interface SnapQuery {
  /** Ignora taladros al buscar snapping (p.ej. al moverlos). */
  ignoreHoles?: boolean;
}

/** Lo que el engine ofrece a las herramientas. Todas las coordenadas en proyecto [m]. */
export interface ToolContext {
  readonly document: DocumentStore;
  readonly selection: SelectionStore;
  pickHole(x: number, y: number): HoleId | null;
  holesInBox(minX: number, minY: number, maxX: number, maxY: number): HoleId[];
  holesInPolygon(polygon: readonly Vec2[]): HoleId[];
  snap(x: number, y: number, query?: SnapQuery): SnapResult;
  /** Metros por píxel CSS en la vista actual. */
  metersPerPixel(): number;
  activeBlast(): Blast | undefined;
  holeTemplate(): HoleTemplate;
  /** Conector que usa la herramienta Amarre. */
  tieConnector(): SurfaceConnectorId | undefined;
  pickConnection(x: number, y: number): ConnectionId | null;
  /** Etiqueta de medición entre a y b (null la oculta). */
  showMeasure(a: Vec2 | null, b: Vec2 | null): void;
  /** Perímetro activo (resaltado; destino de la generación de mallas). */
  setActiveBoundary(id: BoundaryId | null): void;
  showPolyline(points: readonly Vec2[] | null): void;
  showPolygon(points: readonly Vec2[] | null): void;
  showSnapMarker(point: SnapResult | null): void;
  previewMove(ids: readonly HoleId[], dx: number, dy: number): void;
  clearPreviewMove(): void;
  invalidate(): void;
}

export interface Tool {
  readonly name: ToolName;
  readonly cursor: string;
  onPointerDown?(p: ToolPointer, ctx: ToolContext): void;
  onPointerMove?(p: ToolPointer, ctx: ToolContext): void;
  onPointerUp?(p: ToolPointer, ctx: ToolContext): void;
  onDoubleClick?(p: ToolPointer, ctx: ToolContext): void;
  /** Devuelve true si consumió la tecla. */
  onKeyDown?(e: KeyboardEvent, ctx: ToolContext): boolean;
  /** Aborta la interacción en curso (Esc, cambio de herramienta). Devuelve true si había algo que cancelar. */
  cancel?(ctx: ToolContext): boolean;
}

/** Umbral de arrastre en px CSS para distinguir clic de arrastre. */
export const DRAG_THRESHOLD_PX = 4;

export function screenDistance(a: ToolPointer, b: ToolPointer): number {
  return Math.hypot(a.sx - b.sx, a.sy - b.sy);
}
