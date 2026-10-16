import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
} from 'three';

/**
 * Efectos del pintado en vivo: anillos que se abren donde se perfora (celeste) o se borra (rojo) un
 * taladro y el «cabezal», un punto luminoso que viaja suave de un taladro al siguiente, como la
 * perforadora o la mano que dibuja. Una instancia para la planta (z = 0) y otra para el 3D/visor.
 */

const MAX_RINGS = 192;
const RING_MS = 650;
/** Constante de suavizado del cabezal [1/s] (mismo criterio que el seguimiento de FleetView). */
const PEN_RATE = 9;

export const FX_DRILL = new Color(0x7fd4ff);
export const FX_CHARGE = new Color(0xffa040);
export const FX_REMOVE = new Color(0xff4a4a);
export const FX_TIMING = new Color(0xffe066);
const TRACE_ADD = new Color(0x9fe8ff);

interface Ring {
  x: number;
  y: number;
  z: number;
  start: number;
  radius: number;
  color: Color;
}

export class BuildFx {
  readonly root = new Group();
  private readonly rings: Ring[] = [];
  private readonly ringMesh: InstancedMesh<RingGeometry, MeshBasicMaterial>;
  private readonly pen: Mesh<SphereGeometry, MeshBasicMaterial>;
  private readonly penHalo: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial> | null;
  private penAt: { x: number; y: number; z: number } | null = null;
  private penTarget: { x: number; y: number; z: number } | null = null;
  private penSize = 1;
  /** Contornos que se trazan (perímetros) o se borran. */
  private readonly traceLines: LineSegments<BufferGeometry, LineBasicMaterial>;
  private traceBusy = false;
  private readonly tmp = new Object3D();
  private readonly color = new Color();

  constructor(withBeam: boolean) {
    const ringMaterial = new MeshBasicMaterial({
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.ringMesh = new InstancedMesh(new RingGeometry(0.78, 1, 40), ringMaterial, MAX_RINGS);
    this.ringMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.ringMesh.instanceColor = new InstancedBufferAttribute(
      new Float32Array(MAX_RINGS * 3),
      3,
    ).setUsage(DynamicDrawUsage);
    this.ringMesh.count = 0;
    this.ringMesh.frustumCulled = false;
    this.ringMesh.renderOrder = 6;

    this.pen = new Mesh(
      new SphereGeometry(1, 16, 12),
      new MeshBasicMaterial({ color: 0xe8f6ff, depthTest: false, transparent: true }),
    );
    this.penHalo = new Mesh(
      new RingGeometry(1.3, 2.1, 40),
      new MeshBasicMaterial({
        color: 0x5b7aff,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.pen.renderOrder = 7;
    this.penHalo.renderOrder = 7;
    this.beam = withBeam
      ? new Mesh(
          new CylinderGeometry(1, 1, 1, 10, 1, true),
          new MeshBasicMaterial({
            color: 0x7fd4ff,
            transparent: true,
            opacity: 0.35,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        )
      : null;
    if (this.beam) {
      // El cilindro de Three es vertical en Y; el modelo usa Z arriba.
      this.beam.rotation.x = Math.PI / 2;
      this.root.add(this.beam);
    }
    this.traceLines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.traceLines.frustumCulled = false;
    this.traceLines.renderOrder = 6;
    this.root.add(this.traceLines, this.ringMesh, this.pen, this.penHalo);
    this.setPenVisible(false);
  }

  /** Tamaño de referencia [m] (≈ espaciamiento): anillos y cabezal se escalan con él. */
  setSize(meters: number): void {
    this.penSize = Math.max(0.2, meters);
  }

  ring(x: number, y: number, z: number, color: Color, now: number, scale = 1): void {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, z, start: now, radius: this.penSize * 0.75 * scale, color });
  }

  /** Lleva el cabezal hacia un punto (render); null lo apaga. */
  movePen(p: { x: number; y: number; z: number } | null): void {
    this.penTarget = p;
    if (p && !this.penAt) this.penAt = { ...p };
    if (!p) this.penAt = null;
    this.setPenVisible(p !== null);
  }

  get penPosition(): { x: number; y: number; z: number } | null {
    return this.penAt;
  }

  get busy(): boolean {
    return this.rings.length > 0 || this.penTarget !== null || this.traceBusy;
  }

  /**
   * Contornos en curso: hasta `progress` (0–1 del perímetro) a la cota `z`. Devuelve la punta del
   * primer trazo activo (para llevar el cabezal).
   */
  setTraces(
    list: readonly {
      points: readonly { x: number; y: number }[];
      progress: number;
      alpha: number;
      kind: 'add' | 'remove';
    }[],
    z: number,
  ): { x: number; y: number; z: number } | null {
    const pos: number[] = [];
    const col: number[] = [];
    let head: { x: number; y: number; z: number } | null = null;
    for (const tr of list) {
      if (tr.alpha <= 0) continue;
      const pts = tr.points;
      const n = pts.length;
      let total = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y);
      }
      // Borrar: el contorno se apaga desde el final; agregar: se dibuja desde el primer vértice.
      let left = total * (tr.kind === 'add' ? tr.progress : 1 - tr.progress);
      const c = (tr.kind === 'add' ? TRACE_ADD : FX_REMOVE).clone().multiplyScalar(tr.alpha);
      for (let i = 0; i < n && left > 0; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (!a || !b) continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const f = len > 0 ? Math.min(1, left / len) : 1;
        const ex = a.x + (b.x - a.x) * f;
        const ey = a.y + (b.y - a.y) * f;
        pos.push(a.x, a.y, z + 0.1, ex, ey, z + 0.1);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        left -= len;
        if (left <= 0 && tr.progress < 1 && !head) head = { x: ex, y: ey, z };
      }
    }
    this.traceLines.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.traceLines.geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.traceBusy = pos.length > 0;
    return head;
  }

  /** Avanza un cuadro; `dt` en segundos. */
  update(now: number, dt: number): void {
    let n = 0;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      if (!r) continue;
      if (now - r.start > RING_MS) this.rings.splice(i, 1);
    }
    for (const r of this.rings) {
      const t = Math.max(0, (now - r.start) / RING_MS);
      const s = r.radius * (0.25 + 0.75 * (1 - Math.pow(1 - t, 3)));
      this.tmp.position.set(r.x, r.y, r.z + 0.05);
      this.tmp.scale.set(s, s, s);
      this.tmp.updateMatrix();
      this.ringMesh.setMatrixAt(n, this.tmp.matrix);
      this.color.copy(r.color).multiplyScalar(1 - t);
      this.ringMesh.setColorAt(n, this.color);
      n++;
    }
    this.ringMesh.count = n;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;

    const at = this.penAt;
    const target = this.penTarget;
    if (at && target) {
      const k = 1 - Math.exp(-PEN_RATE * dt);
      at.x += (target.x - at.x) * k;
      at.y += (target.y - at.y) * k;
      at.z += (target.z - at.z) * k;
      const s = this.penSize * 0.22;
      const pulse = 1 + 0.18 * Math.sin(now / 90);
      this.pen.position.set(at.x, at.y, at.z + s);
      this.pen.scale.setScalar(s);
      this.penHalo.position.set(at.x, at.y, at.z + 0.06);
      this.penHalo.scale.setScalar(s * pulse);
      if (this.beam) {
        const h = this.penSize * 6;
        this.beam.position.set(at.x, at.y, at.z + h / 2);
        this.beam.scale.set(s * 0.25, h, s * 0.25);
      }
    }
  }

  clear(): void {
    this.rings.length = 0;
    this.ringMesh.count = 0;
    this.setTraces([], 0);
    this.movePen(null);
  }

  dispose(): void {
    this.ringMesh.geometry.dispose();
    this.ringMesh.material.dispose();
    this.ringMesh.dispose();
    this.pen.geometry.dispose();
    this.pen.material.dispose();
    this.penHalo.geometry.dispose();
    this.penHalo.material.dispose();
    this.beam?.geometry.dispose();
    this.traceLines.geometry.dispose();
    this.traceLines.material.dispose();
    this.beam?.material.dispose();
  }

  private setPenVisible(v: boolean): void {
    this.pen.visible = v;
    this.penHalo.visible = v;
    if (this.beam) this.beam.visible = v;
  }
}
