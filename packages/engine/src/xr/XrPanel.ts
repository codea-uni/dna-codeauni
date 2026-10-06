import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';

/**
 * Celda de un panel XR. Con `id` es un botón (el rayo lo resalta y el gatillo emite la acción); sin
 * `id`, texto. Los textos ya vienen traducidos de la web (`t()`), el engine solo dibuja.
 */
export interface XrRow {
  id?: string;
  label: string;
  /** Botón encendido (capa visible, escenario elegido…). */
  active?: boolean;
}

/** Línea del panel: una celda a todo el ancho o varias lado a lado (botones agrupados). */
export type XrLine = XrRow | readonly XrRow[];

const CANVAS_W = 640;
const ROW_PX = 64;
const GAP = 6;

const cellsOf = (line: XrLine): readonly XrRow[] => ('label' in line ? [line] : line);

/** Fila bajo la coordenada `v` de la textura (0 abajo, 1 arriba), o −1 fuera del panel. */
export function rowAt(v: number, rows: number): number {
  if (v < 0 || v > 1 || rows <= 0) return -1;
  return Math.min(rows - 1, Math.floor((1 - v) * rows));
}

/** Celda bajo la coordenada `u` (0 izquierda, 1 derecha) en una fila de `cells` celdas. */
export function cellAt(u: number, cells: number): number {
  if (u < 0 || u > 1 || cells <= 0) return -1;
  return Math.min(cells - 1, Math.floor(u * cells));
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
  private hovered = '';

  /** `width` = ancho del panel [m]; el alto sale de la cantidad de filas. */
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

  /** Celdas actuales, fila por fila (para depurar y para las pruebas en el emulador). */
  get rows(): readonly (readonly XrRow[])[] {
    return this.lines;
  }

  setRows(lines: readonly XrLine[]): void {
    this.lines = lines.map(cellsOf);
    this.hovered = '';
    this.mesh.visible = lines.length > 0;
    this.draw();
  }

  /** Resalta el botón bajo (u, v) (fuera del panel con v < 0); devuelve su id. */
  hover(u: number, v: number): string | null {
    const r = v < 0 ? -1 : rowAt(v, this.lines.length);
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

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  private draw(): void {
    const n = this.lines.length;
    if (n === 0) return;
    const h = n * ROW_PX;
    if (this.canvas.height !== h) {
      this.canvas.height = h;
      // La textura de GPU tiene tamaño fijo: con otro alto hay que crearla de nuevo.
      this.texture.dispose();
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, h);
    ctx.fillStyle = 'rgba(16, 20, 28, 0.9)';
    ctx.beginPath();
    ctx.roundRect(0, 0, CANVAS_W, h, 18);
    ctx.fill();
    ctx.textBaseline = 'middle';
    this.lines.forEach((cells, r) => {
      const y = r * ROW_PX;
      const w = (CANVAS_W - GAP) / cells.length;
      cells.forEach((cell, c) => {
        const x = GAP + c * w;
        const cw = w - GAP;
        if (cell.id !== undefined) {
          ctx.fillStyle =
            this.hovered === `${r}:${c}` ? '#3b82f6' : cell.active ? '#1e3a8a' : '#1f2937';
          ctx.beginPath();
          ctx.roundRect(x, y + GAP, cw, ROW_PX - 2 * GAP, 12);
          ctx.fill();
        }
        // Texto suelto a todo el ancho (títulos, fichas) a la izquierda; botones y celdas, centrados.
        const alone = cells.length === 1 && cell.id === undefined;
        ctx.fillStyle = cell.id === undefined ? '#cbd5e1' : '#ffffff';
        ctx.font = `${alone && r === 0 ? 'bold ' : ''}28px system-ui, sans-serif`;
        ctx.textAlign = alone ? 'left' : 'center';
        ctx.fillText(cell.label, alone ? x + 18 : x + cw / 2, y + ROW_PX / 2, cw - 16);
      });
    });
    this.texture.needsUpdate = true;
    this.mesh.scale.set(this.width, (this.width * h) / CANVAS_W, 1);
  }
}
