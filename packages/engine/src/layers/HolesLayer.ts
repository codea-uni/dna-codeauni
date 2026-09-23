import type { Color } from 'three';
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Group,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from 'three';
import { holeToe, type Hole, type HoleId, type Vec3 } from '@blastlab/core';
import { COLORS } from './colors';

const INITIAL_CAPACITY = 1024;

/**
 * Taladros en planta: símbolo de tamaño constante en pantalla (InstancedMesh + shader)
 * y traza boca→fondo (LineSegments). Cada taladro ocupa un "slot"; al borrar se compacta
 * moviendo el último slot al hueco, así las actualizaciones son O(cambios).
 */
export class HolesLayer {
  readonly root = new Group();
  private capacity = INITIAL_CAPACITY;
  private count = 0;
  private readonly ids: HoleId[] = [];
  private readonly slotOf = new Map<HoleId, number>();
  /** Boca y fondo por slot en coordenadas de render: [cx, cy, cz, tx, ty, tz]. */
  private geom = new Float32Array(INITIAL_CAPACITY * 6);
  private selected = new Uint8Array(INITIAL_CAPACITY);
  private hoverSlot = -1;
  private previewIds: HoleId[] = [];
  /** Color base por taladro (p.ej. por tiempo o kg); null = color por defecto. */
  private colorSource: ((id: HoleId) => Color | null) | null = null;

  private readonly quad = new PlaneGeometry(2, 2);
  private readonly material: ShaderMaterial;
  private mesh: InstancedMesh;
  private readonly traces: LineSegments<BufferGeometry, LineBasicMaterial>;
  private tracePositions = new Float32Array(INITIAL_CAPACITY * 6);

  constructor() {
    this.material = new ShaderMaterial({
      uniforms: {
        uViewport: { value: new Vector2(1, 1) },
        uRadiusPx: { value: 6 },
      },
      vertexShader: /* glsl */ `
        uniform vec2 uViewport;
        uniform float uRadiusPx;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vec4 center = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          center.xy += position.xy * (uRadiusPx * 2.0 / uViewport) * center.w;
          gl_Position = center;
          vUv = position.xy;
          vColor = instanceColor;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          float r = length(vUv);
          float aa = fwidth(r);
          float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, r);
          if (alpha <= 0.0) discard;
          float ring = smoothstep(0.62 - aa, 0.62, r);
          vec3 color = mix(vColor * 0.28, vColor, ring);
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthTest: false,
    });
    this.mesh = this.createMesh(this.capacity);

    const traceGeometry = new BufferGeometry();
    traceGeometry.setAttribute(
      'position',
      new BufferAttribute(this.tracePositions, 3).setUsage(DynamicDrawUsage),
    );
    traceGeometry.setDrawRange(0, 0);
    this.traces = new LineSegments(
      traceGeometry,
      new LineBasicMaterial({ color: COLORS.trace, depthTest: false }),
    );
    this.traces.frustumCulled = false;
    this.traces.renderOrder = 1;
    this.root.add(this.traces, this.mesh);
  }

  get size(): number {
    return this.count;
  }

  get object(): InstancedMesh {
    return this.mesh;
  }

  get traceObject(): LineSegments {
    return this.traces;
  }

  setViewport(widthPx: number, heightPx: number, radiusPx: number): void {
    const viewport = this.material.uniforms.uViewport;
    const radius = this.material.uniforms.uRadiusPx;
    if (viewport) (viewport.value as Vector2).set(widthPx, heightPx);
    if (radius) radius.value = radiusPx;
  }

  clear(): void {
    this.count = 0;
    this.ids.length = 0;
    this.slotOf.clear();
    this.hoverSlot = -1;
    this.previewIds = [];
    this.selected.fill(0);
    this.flush();
  }

  /** Inserta o actualiza un taladro. `origin` se resta para trabajar en float32 sin pérdida. */
  upsert(hole: Hole, origin: Vec3, isSelected: boolean): void {
    let slot = this.slotOf.get(hole.id);
    if (slot === undefined) {
      if (this.count === this.capacity) this.grow();
      slot = this.count++;
      this.ids[slot] = hole.id;
      this.slotOf.set(hole.id, slot);
    }
    const toe = holeToe(hole);
    const g = this.geom;
    const o = slot * 6;
    g[o] = hole.collar.x - origin.x;
    g[o + 1] = hole.collar.y - origin.y;
    g[o + 2] = hole.collar.z - origin.z;
    g[o + 3] = toe.x - origin.x;
    g[o + 4] = toe.y - origin.y;
    g[o + 5] = toe.z - origin.z;
    this.selected[slot] = isSelected ? 1 : 0;
    this.writeSlot(slot, 0, 0);
  }

  remove(id: HoleId): void {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return;
    const last = this.count - 1;
    if (this.hoverSlot === slot) this.hoverSlot = -1;
    if (slot !== last) {
      const lastId = this.ids[last];
      if (lastId === undefined) throw new Error('Slot de taladro inconsistente');
      this.geom.copyWithin(slot * 6, last * 6, last * 6 + 6);
      this.selected[slot] = this.selected[last] ?? 0;
      this.ids[slot] = lastId;
      this.slotOf.set(lastId, slot);
      if (this.hoverSlot === last) this.hoverSlot = slot;
      this.writeSlot(slot, 0, 0);
    }
    this.slotOf.delete(id);
    this.ids.length = last;
    this.count = last;
  }

  setSelected(ids: Iterable<HoleId>, value: boolean): void {
    for (const id of ids) {
      const slot = this.slotOf.get(id);
      if (slot === undefined) continue;
      this.selected[slot] = value ? 1 : 0;
      this.writeColor(slot);
    }
  }

  setHover(id: HoleId | null): boolean {
    const slot = id === null ? -1 : (this.slotOf.get(id) ?? -1);
    if (slot === this.hoverSlot) return false;
    const prev = this.hoverSlot;
    this.hoverSlot = slot;
    if (prev >= 0 && prev < this.count) this.writeColor(prev);
    if (slot >= 0) this.writeColor(slot);
    return true;
  }

  /** Desplaza visualmente (sin tocar el documento) los taladros indicados, para arrastres. */
  setPreviewOffset(ids: readonly HoleId[], dx: number, dy: number): void {
    this.previewIds = ids.slice();
    for (const id of ids) {
      const slot = this.slotOf.get(id);
      if (slot !== undefined) this.writeSlot(slot, dx, dy);
    }
  }

  clearPreview(): void {
    for (const id of this.previewIds) {
      const slot = this.slotOf.get(id);
      if (slot !== undefined) this.writeSlot(slot, 0, 0);
    }
    this.previewIds = [];
  }

  /** Define el color base por taladro y recolorea todo. Selección y hover tienen prioridad. */
  setColorSource(source: ((id: HoleId) => Color | null) | null): void {
    this.colorSource = source;
    this.refreshColors();
  }

  refreshColors(): void {
    for (let slot = 0; slot < this.count; slot++) this.writeColor(slot);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Sube los buffers modificados a la GPU. Llamar una vez por lote de cambios. */
  flush(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    const attr = this.traces.geometry.getAttribute('position');
    attr.needsUpdate = true;
    this.traces.geometry.setDrawRange(0, this.count * 2);
  }

  /** Posición de boca (render) del slot de un taladro. */
  collarOf(id: HoleId): { x: number; y: number } | null {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return null;
    return { x: this.geom[slot * 6] ?? 0, y: this.geom[slot * 6 + 1] ?? 0 };
  }

  dispose(): void {
    this.quad.dispose();
    this.material.dispose();
    this.mesh.dispose();
    this.traces.geometry.dispose();
    this.traces.material.dispose();
  }

  private createMesh(capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(this.quad, this.material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(
      DynamicDrawUsage,
    );
    // Matrices identidad: solo se escribe la traslación.
    const m = mesh.instanceMatrix.array;
    for (let i = 0; i < capacity; i++) {
      const o = i * 16;
      m[o] = 1;
      m[o + 5] = 1;
      m[o + 10] = 1;
      m[o + 15] = 1;
    }
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return mesh;
  }

  private grow(): void {
    const capacity = this.capacity * 2;
    const old = this.mesh;
    const mesh = this.createMesh(capacity);
    mesh.instanceMatrix.array.set(old.instanceMatrix.array);
    if (mesh.instanceColor && old.instanceColor)
      mesh.instanceColor.array.set(old.instanceColor.array);
    this.root.remove(old);
    old.dispose();
    this.mesh = mesh;
    this.root.add(mesh);

    const geom = new Float32Array(capacity * 6);
    geom.set(this.geom);
    this.geom = geom;
    const selected = new Uint8Array(capacity);
    selected.set(this.selected);
    this.selected = selected;
    const trace = new Float32Array(capacity * 6);
    trace.set(this.tracePositions);
    this.tracePositions = trace;
    this.traces.geometry.setAttribute(
      'position',
      new BufferAttribute(trace, 3).setUsage(DynamicDrawUsage),
    );
    this.capacity = capacity;
  }

  private writeSlot(slot: number, dx: number, dy: number): void {
    const g = this.geom;
    const o = slot * 6;
    const cx = (g[o] ?? 0) + dx;
    const cy = (g[o + 1] ?? 0) + dy;
    const m = this.mesh.instanceMatrix.array;
    m[slot * 16 + 12] = cx;
    m[slot * 16 + 13] = cy;
    m[slot * 16 + 14] = 0;
    const t = this.tracePositions;
    t[o] = cx;
    t[o + 1] = cy;
    t[o + 2] = 0;
    t[o + 3] = (g[o + 3] ?? 0) + dx;
    t[o + 4] = (g[o + 4] ?? 0) + dy;
    t[o + 5] = 0;
    this.writeColor(slot);
  }

  private writeColor(slot: number): void {
    let c: Color;
    if (slot === this.hoverSlot) c = COLORS.holeHover;
    else if (this.selected[slot]) c = COLORS.holeSelected;
    else {
      const id = this.ids[slot];
      c = (id !== undefined ? this.colorSource?.(id) : null) ?? COLORS.hole;
    }
    const colors = this.mesh.instanceColor;
    if (!colors) return;
    colors.array[slot * 3] = c.r;
    colors.array[slot * 3 + 1] = c.g;
    colors.array[slot * 3 + 2] = c.b;
  }
}
