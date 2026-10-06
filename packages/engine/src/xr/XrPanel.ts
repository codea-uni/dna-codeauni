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
 * Fila de un panel XR. Con `id` es un botón (el rayo lo resalta y el gatillo emite la acción); sin
 * `id`, una línea de texto. Los textos ya vienen traducidos de la web (`t()`), el engine solo dibuja.
 */
export interface XrRow {
  id?: string;
  label: string;
  /** Botón encendido (capa visible, secuencia en curso…). */
  active?: boolean;
}

const CANVAS_W = 512;
const ROW_PX = 64;

/** Fila bajo la coordenada `v` de la textura (0 abajo, 1 arriba), o −1 fuera del panel. */
export function rowAt(v: number, rows: number): number {
  if (v < 0 || v > 1 || rows <= 0) return -1;
  return Math.min(rows - 1, Math.floor((1 - v) * rows));
}

/**
 * Panel de texto dentro de la escena XR (los paneles HTML no se ven en el visor): un plano con una
 * textura de canvas. Admite tildes y cualquier texto sin dependencias de fuentes 3D.
 */
export class XrPanel {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private rows: readonly XrRow[] = [];
  private hovered = -1;

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
    return this.rows.length > 0;
  }

  setRows(rows: readonly XrRow[]): void {
    this.rows = rows;
    this.hovered = -1;
    this.mesh.visible = rows.length > 0;
    this.draw();
  }

  /** Resalta el botón bajo `v` (o ninguno con −1); devuelve su id. */
  hover(v: number): string | null {
    const i = v < 0 ? -1 : rowAt(v, this.rows.length);
    const id = this.rows[i]?.id;
    const next = id === undefined ? -1 : i;
    if (next !== this.hovered) {
      this.hovered = next;
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
    const n = this.rows.length;
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
    ctx.fillStyle = 'rgba(16, 20, 28, 0.88)';
    ctx.fillRect(0, 0, CANVAS_W, h);
    ctx.textBaseline = 'middle';
    this.rows.forEach((row, i) => {
      const y = i * ROW_PX;
      if (row.id !== undefined) {
        ctx.fillStyle =
          i === this.hovered ? '#3b82f6' : row.active ? 'rgba(59,130,246,0.35)' : '#1f2937';
        ctx.fillRect(8, y + 6, CANVAS_W - 16, ROW_PX - 12);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = `${row.id === undefined && i === 0 ? 'bold ' : ''}30px system-ui, sans-serif`;
      ctx.fillText(row.label, 24, y + ROW_PX / 2, CANVAS_W - 48);
    });
    this.texture.needsUpdate = true;
    this.mesh.scale.set(this.width, (this.width * h) / CANVAS_W, 1);
  }
}
