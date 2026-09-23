import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from 'three';
import { COLORS } from './colors';

/** Caracteres por etiqueta; las más largas se truncan con "~". */
export const MAX_LABEL_CHARS = 8;
const ATLAS_COLS = 16;
const ATLAS_ROWS = 6;
const CELL_W = 32;
const CELL_H = 48;
const FIRST_CHAR = 32; // ' '
const LAST_CHAR = 126; // '~'
/** Alto del glifo en pantalla [px CSS]; el ancho del quad conserva la proporción de la celda. */
const CHAR_H_PX = 12;
const CHAR_QUAD_W_PX = (CHAR_H_PX * CELL_W) / CELL_H;
const INITIAL_CAPACITY = 1024;

/** Atlas de glifos + avance horizontal del carácter como fracción del ancho de celda. */
function createAtlas(): { texture: CanvasTexture; advance: number } {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL_W;
  canvas.height = ATLAS_ROWS * CELL_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible para el atlas de glifos');
  ctx.font = `bold ${CELL_H * 0.72}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(10, 13, 18, 0.9)';
  ctx.fillStyle = '#ffffff';
  for (let code = FIRST_CHAR; code <= LAST_CHAR; code++) {
    const i = code - FIRST_CHAR;
    const x = (i % ATLAS_COLS) * CELL_W + CELL_W / 2;
    const y = Math.floor(i / ATLAS_COLS) * CELL_H + CELL_H / 2;
    const ch = String.fromCharCode(code);
    ctx.strokeText(ch, x, y);
    ctx.fillText(ch, x, y);
  }
  const advance = Math.min(1, ctx.measureText('0').width / CELL_W);
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, advance };
}

function glyphIndex(code: number): number {
  return code >= FIRST_CHAR && code <= LAST_CHAR
    ? code - FIRST_CHAR
    : '?'.charCodeAt(0) - FIRST_CHAR;
}

/**
 * Etiquetas de taladros como quads instanciados que muestrean un atlas de glifos.
 * Cada taladro reserva MAX_LABEL_CHARS instancias (glifo −1 = vacío), con los mismos
 * slots compactables que HolesLayer para actualizar de forma incremental.
 */
export class LabelsLayer {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private capacity = INITIAL_CAPACITY;
  private count = 0;
  private readonly ids: string[] = [];
  private readonly slotOf = new Map<string, number>();
  /** Ancla base por slot (x, y) en coordenadas de render. */
  private base = new Float32Array(INITIAL_CAPACITY * 3);
  private previewIds: string[] = [];
  private readonly texture: CanvasTexture;

  constructor() {
    const atlas = createAtlas();
    this.texture = atlas.texture;
    const advancePx = CHAR_QUAD_W_PX * atlas.advance;
    const material = new ShaderMaterial({
      uniforms: {
        uAtlas: { value: this.texture },
        uViewport: { value: new Vector2(1, 1) },
        uPixelRatio: { value: 1 },
        uOffsetPx: { value: new Vector2(8, 8) },
        uColor: { value: COLORS.label },
      },
      vertexShader: /* glsl */ `
        uniform vec2 uViewport;
        uniform float uPixelRatio;
        uniform vec2 uOffsetPx;
        attribute vec3 aAnchor;
        attribute float aGlyph;
        attribute float aChar;
        varying vec2 vUv;
        void main() {
          if (aGlyph < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          vec4 c = projectionMatrix * modelViewMatrix * vec4(aAnchor, 1.0);
          vec2 quadPx = vec2(${CHAR_QUAD_W_PX.toFixed(3)}, ${CHAR_H_PX.toFixed(1)});
          vec2 px = (uOffsetPx + vec2((aChar + 0.5) * ${advancePx.toFixed(3)}, 0.0) + position.xy * quadPx) * uPixelRatio;
          c.xy += px * 2.0 / uViewport * c.w;
          gl_Position = c;
          float col = mod(aGlyph, ${ATLAS_COLS.toFixed(1)});
          float row = floor(aGlyph / ${ATLAS_COLS.toFixed(1)});
          vec2 uv = position.xy + 0.5;
          vUv = vec2((col + uv.x) / ${ATLAS_COLS.toFixed(1)}, 1.0 - (row + 1.0 - uv.y) / ${ATLAS_ROWS.toFixed(1)});
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          vec4 t = texture2D(uAtlas, vUv);
          if (t.a < 0.05) discard;
          gl_FragColor = vec4(t.rgb * uColor, t.a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthTest: false,
    });
    this.mesh = new Mesh(this.createGeometry(this.capacity), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  setViewport(widthPx: number, heightPx: number, pixelRatio: number, symbolRadiusPx: number): void {
    const u = this.mesh.material.uniforms;
    (u.uViewport?.value as Vector2).set(widthPx, heightPx);
    if (u.uPixelRatio) u.uPixelRatio.value = pixelRatio;
    (u.uOffsetPx?.value as Vector2).set(
      symbolRadiusPx / pixelRatio + 2,
      symbolRadiusPx / pixelRatio + 4,
    );
  }

  clear(): void {
    this.count = 0;
    this.ids.length = 0;
    this.slotOf.clear();
    this.previewIds = [];
    this.flush();
  }

  /** Ancla en coordenadas de render; `z` para usarla en 3D (en planta, 0). */
  upsert(id: string, x: number, y: number, text: string, z = 0): void {
    let slot = this.slotOf.get(id);
    if (slot === undefined) {
      if (this.count === this.capacity) this.grow();
      slot = this.count++;
      this.ids[slot] = id;
      this.slotOf.set(id, slot);
    }
    this.base[slot * 3] = x;
    this.base[slot * 3 + 1] = y;
    this.base[slot * 3 + 2] = z;
    const glyphs = this.glyphs.array;
    const label = text.length > MAX_LABEL_CHARS ? `${text.slice(0, MAX_LABEL_CHARS - 1)}~` : text;
    for (let i = 0; i < MAX_LABEL_CHARS; i++) {
      glyphs[slot * MAX_LABEL_CHARS + i] = i < label.length ? glyphIndex(label.charCodeAt(i)) : -1;
    }
    this.writeAnchor(slot, 0, 0);
  }

  remove(id: string): void {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return;
    const last = this.count - 1;
    if (slot !== last) {
      const lastId = this.ids[last];
      if (lastId === undefined) throw new Error('Slot de taladro inconsistente');
      this.base.copyWithin(slot * 3, last * 3, last * 3 + 3);
      const g = this.glyphs.array;
      g.copyWithin(slot * MAX_LABEL_CHARS, last * MAX_LABEL_CHARS, (last + 1) * MAX_LABEL_CHARS);
      this.ids[slot] = lastId;
      this.slotOf.set(lastId, slot);
      this.writeAnchor(slot, 0, 0);
    }
    this.slotOf.delete(id);
    this.ids.length = last;
    this.count = last;
  }

  setPreviewOffset(ids: readonly string[], dx: number, dy: number): void {
    this.previewIds = ids.slice();
    for (const id of ids) {
      const slot = this.slotOf.get(id);
      if (slot !== undefined) this.writeAnchor(slot, dx, dy);
    }
  }

  clearPreview(): void {
    for (const id of this.previewIds) {
      const slot = this.slotOf.get(id);
      if (slot !== undefined) this.writeAnchor(slot, 0, 0);
    }
    this.previewIds = [];
  }

  flush(): void {
    const geometry = this.mesh.geometry;
    geometry.instanceCount = this.count * MAX_LABEL_CHARS;
    this.anchors.needsUpdate = true;
    this.glyphs.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }

  private get anchors(): InstancedBufferAttribute {
    return this.mesh.geometry.getAttribute('aAnchor') as InstancedBufferAttribute;
  }

  private get glyphs(): InstancedBufferAttribute {
    return this.mesh.geometry.getAttribute('aGlyph') as InstancedBufferAttribute;
  }

  private createGeometry(capacity: number): InstancedBufferGeometry {
    const quad = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    const n = capacity * MAX_LABEL_CHARS;
    const chars = new Float32Array(n);
    for (let i = 0; i < n; i++) chars[i] = i % MAX_LABEL_CHARS;
    geometry.setAttribute(
      'aAnchor',
      new InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage),
    );
    geometry.setAttribute(
      'aGlyph',
      new InstancedBufferAttribute(new Float32Array(n).fill(-1), 1).setUsage(DynamicDrawUsage),
    );
    geometry.setAttribute('aChar', new InstancedBufferAttribute(chars, 1));
    geometry.instanceCount = 0;
    return geometry;
  }

  private grow(): void {
    const capacity = this.capacity * 2;
    const old = this.mesh.geometry;
    const geometry = this.createGeometry(capacity);
    (geometry.getAttribute('aAnchor') as InstancedBufferAttribute).array.set(this.anchors.array);
    (geometry.getAttribute('aGlyph') as InstancedBufferAttribute).array.set(this.glyphs.array);
    this.mesh.geometry = geometry;
    old.dispose();
    const base = new Float32Array(capacity * 3);
    base.set(this.base);
    this.base = base;
    this.capacity = capacity;
  }

  private writeAnchor(slot: number, dx: number, dy: number): void {
    const x = (this.base[slot * 3] ?? 0) + dx;
    const y = (this.base[slot * 3 + 1] ?? 0) + dy;
    const z = this.base[slot * 3 + 2] ?? 0;
    const a = this.anchors.array;
    for (let i = 0; i < MAX_LABEL_CHARS; i++) {
      const o = (slot * MAX_LABEL_CHARS + i) * 3;
      a[o] = x;
      a[o + 1] = y;
      a[o + 2] = z;
    }
  }
}
