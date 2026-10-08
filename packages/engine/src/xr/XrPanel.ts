import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';

/** Tramo de una barra apilada (la columna de carga de la ficha): fracción del total y color CSS. */
export interface XrBarSegment {
  fraction: number;
  color: string;
}

/**
 * Celda de un panel XR. Con `id` es un botón (el rayo lo resalta y el gatillo emite la acción); sin
 * `id`, texto. Los textos ya vienen traducidos de la web (`t()`), el engine solo dibuja.
 */
export interface XrRow {
  id?: string;
  label: string;
  /** Botón encendido (escenario elegido, pestaña abierta…). */
  active?: boolean;
  /** Glifo grande sobre la etiqueta (▶, ⟲, ●…; sin emoji: no todos los navegadores traen su fuente); la fila es más alta. */
  icon?: string;
  /** Pestaña: texto sin caja, subrayado si `active`. */
  tab?: boolean;
  /** Interruptor (capas): encendido o apagado. */
  toggle?: boolean;
  /** Barra deslizante 0–1: con `id` se arrastra con el gatillo; sin `id` es un indicador. */
  slider?: number;
  /** Muestra de color a la izquierda del texto (leyenda). */
  swatch?: string;
  /** Barra apilada a todo el ancho de la celda (la etiqueta no se dibuja). */
  bar?: readonly XrBarSegment[];
}

/** Línea del panel: una celda a todo el ancho o varias lado a lado (botones agrupados). */
export type XrLine = XrRow | readonly XrRow[];

const CANVAS_W = 640;
const GAP = 6;
/** Margen horizontal de la pista de un slider dentro de su celda [px]. */
const TRACK_PAD = 28;

const PANEL = 'rgba(15, 23, 42, 0.92)';
const CELL = '#1e293b';
const CELL_HOVER = '#334155';
const ACTIVE = '#1d4ed8';
const ACCENT = '#60a5fa';
const ON = '#22c55e';
const TEXT = '#f8fafc';
const MUTED = '#94a3b8';

const cellsOf = (line: XrLine): readonly XrRow[] => ('label' in line ? [line] : line);

/** Alto de una fila [px del canvas] según lo que lleva. */
export function rowHeight(cells: readonly XrRow[]): number {
  if (cells.some((c) => c.icon !== undefined)) return 100;
  if (cells.some((c) => c.slider !== undefined)) return 84;
  if (cells.some((c) => c.tab)) return 58;
  if (cells.some((c) => c.bar !== undefined)) return 48;
  return 60;
}

/** Fila bajo la coordenada `v` de la textura (0 abajo, 1 arriba) con filas de alto `heights`, o −1. */
export function rowAt(v: number, heights: readonly number[]): number {
  const total = heights.reduce((a, b) => a + b, 0);
  if (v < 0 || v > 1 || total <= 0) return -1;
  const y = (1 - v) * total;
  let acc = 0;
  for (let r = 0; r < heights.length; r++) {
    acc += heights[r] ?? 0;
    if (y < acc) return r;
  }
  return heights.length - 1;
}

/** Celda bajo la coordenada `u` (0 izquierda, 1 derecha) en una fila de `cells` celdas. */
export function cellAt(u: number, cells: number): number {
  if (u < 0 || u > 1 || cells <= 0) return -1;
  return Math.min(cells - 1, Math.floor(u * cells));
}

/** Valor 0–1 de un slider en la celda `c` de `cells` bajo `u`, descontando el margen de la pista. */
export function sliderAt(u: number, cells: number, c: number): number {
  // Misma geometría que `draw`: celdas de (ancho − GAP)/n y pista con TRACK_PAD a cada lado.
  const w = (CANVAS_W - GAP) / cells;
  const x = u * CANVAS_W - c * w;
  return Math.min(1, Math.max(0, (x - TRACK_PAD) / (w + GAP - 2 * TRACK_PAD)));
}

/**
 * Panel de texto dentro de la escena XR (los paneles HTML no se ven en el visor): un plano con una
 * textura de canvas. Admite tildes y cualquier texto sin dependencias de fuentes 3D.
 */
export class XrPanel {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private lines: readonly (readonly XrRow[])[] = [];
  private heights: number[] = [];
  private hovered = '';
  /** Celda que se arrastra (slider tomado con el gatillo): «fila:celda». */
  private dragging = '';
  /** Alto del panel [m] al tamaño completo. */
  private heightM = 0;
  private appear = 1;

  /** `width` = ancho del panel [m]; el alto sale de las filas. */
  constructor(private readonly width: number) {
    this.canvas.width = CANVAS_W;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.mesh = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: this.texture, transparent: true, side: DoubleSide }),
    );
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  get hasRows(): boolean {
    return this.lines.length > 0;
  }

  /** Alto del panel abierto [m] (para ubicarlo sobre el control). */
  get height(): number {
    return this.heightM;
  }

  /** Celdas actuales, fila por fila (para depurar y para las pruebas en el emulador). */
  get rows(): readonly (readonly XrRow[])[] {
    return this.lines;
  }

  setRows(lines: readonly XrLine[]): void {
    this.lines = lines.map(cellsOf);
    this.heights = this.lines.map(rowHeight);
    this.mesh.visible = lines.length > 0;
    this.draw();
  }

  /**
   * Aparición animada (0 = cerrado, 1 = abierto): crece desde el 60 % y se vuelve opaco, sin
   * redibujar el canvas.
   */
  setAppear(a: number): void {
    this.appear = a;
    const k = 0.6 + 0.4 * a;
    this.mesh.scale.set(this.width * k, this.heightM * k, 1);
    this.mesh.material.opacity = a;
  }

  /** Resalta el botón bajo (u, v) (fuera del panel con v < 0); devuelve su id. */
  hover(u: number, v: number): string | null {
    if (this.dragging) return this.cell(this.dragging)?.id ?? null;
    const r = v < 0 ? -1 : rowAt(v, this.heights);
    const line = this.lines[r] ?? [];
    const c = cellAt(u, line.length);
    const id = line[c]?.id;
    const key = id === undefined ? '' : `${r}:${c}`;
    if (key !== this.hovered) {
      this.hovered = key;
      this.draw();
    }
    return id ?? null;
  }

  /** Toma el slider bajo el rayo (si lo hay) para arrastrarlo; true si lo tomó. */
  beginDrag(): boolean {
    if (this.cell(this.hovered)?.slider === undefined) return false;
    this.dragging = this.hovered;
    return true;
  }

  /** Valor del slider tomado bajo `u` (la perilla se mueve ya, sin esperar a la web). */
  dragTo(u: number): number | null {
    const [r, c] = this.dragging.split(':').map(Number);
    const cell = this.cell(this.dragging);
    const line = this.lines[r ?? -1];
    if (!cell || !line || c === undefined) return null;
    const value = sliderAt(u, line.length, c);
    if (cell.slider !== value) {
      this.lines = this.lines.map((l, i) =>
        i === r ? l.map((x, j) => (j === c ? { ...x, slider: value } : x)) : l,
      );
      this.draw();
    }
    return value;
  }

  endDrag(): void {
    this.dragging = '';
  }

  get isDragging(): boolean {
    return this.dragging !== '';
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  private cell(key: string): XrRow | undefined {
    if (!key) return undefined;
    const [r, c] = key.split(':').map(Number);
    return this.lines[r ?? -1]?.[c ?? -1];
  }

  private draw(): void {
    if (this.lines.length === 0) return;
    const h = this.heights.reduce((a, b) => a + b, 0) + GAP;
    if (this.canvas.height !== h) {
      this.canvas.height = h;
      // La textura de GPU tiene tamaño fijo: con otro alto hay que crearla de nuevo.
      this.texture.dispose();
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, h);
    ctx.fillStyle = PANEL;
    ctx.beginPath();
    ctx.roundRect(0, 0, CANVAS_W, h, 22);
    ctx.fill();
    ctx.textBaseline = 'middle';
    let y = GAP / 2;
    this.lines.forEach((cells, r) => {
      const rh = this.heights[r] ?? 0;
      const w = (CANVAS_W - GAP) / cells.length;
      cells.forEach((cell, c) => {
        const box = { x: GAP + c * w, y: y + GAP / 2, w: w - GAP, h: rh - GAP };
        this.drawCell(ctx, cell, box, this.hovered === `${r}:${c}`, cells.length === 1, r === 0);
      });
      y += rh;
    });
    this.texture.needsUpdate = true;
    this.heightM = (this.width * h) / CANVAS_W;
    this.setAppear(this.appear);
  }

  private drawCell(
    ctx: CanvasRenderingContext2D,
    cell: XrRow,
    b: { x: number; y: number; w: number; h: number },
    hovered: boolean,
    alone: boolean,
    first: boolean,
  ): void {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const font = (px: number, bold = false) =>
      `${bold ? 'bold ' : ''}${px}px system-ui, sans-serif`;

    if (cell.bar) {
      const pad = 14;
      const bh = Math.min(26, b.h - 8);
      const x0 = b.x + pad;
      const bw = b.w - 2 * pad;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x0, cy - bh / 2, bw, bh, bh / 2);
      ctx.clip();
      ctx.fillStyle = CELL;
      ctx.fillRect(x0, cy - bh / 2, bw, bh);
      let x = x0;
      for (const s of cell.bar) {
        ctx.fillStyle = s.color;
        ctx.fillRect(x, cy - bh / 2, s.fraction * bw, bh);
        x += s.fraction * bw;
      }
      ctx.restore();
      return;
    }

    if (cell.tab) {
      if (hovered) {
        ctx.fillStyle = CELL_HOVER;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 12);
        ctx.fill();
      }
      ctx.fillStyle = cell.active ? TEXT : MUTED;
      ctx.font = font(26, cell.active);
      ctx.textAlign = 'center';
      ctx.fillText(cell.label, cx, cy - 2, b.w - 12);
      if (cell.active) {
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.roundRect(b.x + b.w * 0.2, b.y + b.h - 6, b.w * 0.6, 5, 2.5);
        ctx.fill();
      }
      return;
    }

    const button = cell.id !== undefined;
    if (button) {
      ctx.fillStyle = cell.active ? ACTIVE : hovered ? CELL_HOVER : CELL;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 16);
      ctx.fill();
      if (hovered) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    if (cell.slider !== undefined) {
      const v = Math.min(1, Math.max(0, cell.slider));
      const x0 = b.x + TRACK_PAD - GAP;
      const tw = b.w - 2 * (TRACK_PAD - GAP);
      const ty = b.y + b.h * 0.7;
      ctx.fillStyle = MUTED;
      ctx.font = font(22);
      ctx.textAlign = 'center';
      ctx.fillText(cell.label, cx, b.y + b.h * 0.3, b.w - 16);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(x0, ty - 5, tw, 10, 5);
      ctx.fill();
      ctx.fillStyle = button ? ACCENT : ON;
      ctx.beginPath();
      ctx.roundRect(x0, ty - 5, Math.max(10, v * tw), 10, 5);
      ctx.fill();
      if (button) {
        ctx.fillStyle = TEXT;
        ctx.beginPath();
        ctx.arc(x0 + v * tw, ty, hovered ? 15 : 12, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (cell.toggle !== undefined) {
      const sw = 64;
      const sh = 34;
      const sx = b.x + b.w - sw - 16;
      ctx.fillStyle = TEXT;
      ctx.font = font(26);
      ctx.textAlign = 'left';
      ctx.fillText(cell.label, b.x + 18, cy, b.w - sw - 44);
      ctx.fillStyle = cell.toggle ? ON : '#475569';
      ctx.beginPath();
      ctx.roundRect(sx, cy - sh / 2, sw, sh, sh / 2);
      ctx.fill();
      ctx.fillStyle = TEXT;
      ctx.beginPath();
      ctx.arc(cell.toggle ? sx + sw - sh / 2 : sx + sh / 2, cy, sh / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (cell.icon !== undefined) {
      ctx.fillStyle = TEXT;
      ctx.textAlign = 'center';
      ctx.font = font(40);
      ctx.fillText(cell.icon, cx, b.y + b.h * 0.38);
      ctx.font = font(22);
      ctx.fillStyle = button ? TEXT : MUTED;
      ctx.fillText(cell.label, cx, b.y + b.h * 0.78, b.w - 12);
      return;
    }

    // Texto suelto a todo el ancho (títulos, fichas) a la izquierda; botones y celdas, centrados.
    const left = (alone && !button) || cell.swatch !== undefined;
    let tx = left ? b.x + 18 : cx;
    if (cell.swatch !== undefined) {
      ctx.fillStyle = cell.swatch;
      ctx.beginPath();
      ctx.roundRect(b.x + 14, cy - 11, 22, 22, 5);
      ctx.fill();
      tx = b.x + 48;
    }
    ctx.fillStyle = button ? TEXT : '#cbd5e1';
    ctx.font = font(26, alone && !button && first);
    ctx.textAlign = left ? 'left' : 'center';
    ctx.fillText(cell.label, tx, cy, b.w - (tx - b.x) - 12);
  }
}
