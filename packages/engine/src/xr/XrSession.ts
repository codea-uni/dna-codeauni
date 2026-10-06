import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  Raycaster,
  RingGeometry,
  type Scene,
  Vector3,
  type WebGLRenderer,
  type XRGripSpace,
  type XRTargetRaySpace,
} from 'three';
import type { HoleId, Vec3 } from '@cronos/core';
import {
  dirToModel,
  headingOf,
  moveBy,
  placeAt,
  toModel,
  toXr,
  turnAbout,
  type XrPlacement,
} from './placement';
import { MIN_CLEARANCE, flySpeed, flyVelocity, snapTurn } from './locomotion';
import { rayGround } from './rayGround';
import { XrPanel, type XrRow } from './XrPanel';
import { Avatars, type XrAvatar, type XrTransform } from './Avatars';

/** Visor inmersivo (`immersive-vr`) o realidad aumentada con passthrough (`immersive-ar`). */
export type XrMode = 'vr' | 'ar';
/** A escala real dentro del tajo, o maqueta sobre una mesa. */
export type XrView = 'walk' | 'table';

interface Box3 {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Lo que la sesión necesita del engine (coordenadas de render, Z arriba). */
export interface XrHost {
  renderer: WebGLRenderer;
  scene: Scene;
  /** Raíz de la escena 3D: se cuelga del grupo de ubicación mientras dura la sesión. */
  model: Object3D;
  /** Cota del terreno (o del banco sin levantamiento) bajo (x, y); null fuera. */
  height: (x: number, y: number) => number | null;
  /** Centro de los taladros (o de la escena) a la cota del terreno. */
  focus: () => Vec3;
  bounds: () => Box3 | null;
  pickHole: (x: number, y: number, tolerance: number) => { id: HoleId; collar: Vec3 } | null;
  /** Alto de los caracteres de las etiquetas [m del usuario]; 0 = modo pantalla. */
  setLabelSize: (meters: number) => void;
  onSelectHole: (id: HoleId | null) => void;
  onAction: (id: string) => void;
  onView: (view: XrView, scale: number) => void;
  onEnd: () => void;
}

export interface XrStartOptions {
  /** Resolución del framebuffer XR (1 = nativa; < 1 alivia la GPU en el Quest 2). */
  framebufferScale?: number;
}

interface Hand {
  ray: XRTargetRaySpace;
  grip: XRGripSpace;
  source: XRInputSource | null;
  line: Line;
}

/** Ancho que ocupa la maqueta sobre la mesa [m] (supuesto editable, QUESTIONS §2). */
const TABLE_SIZE = 1.2;
/** Altura de la mesa en VR [m] y distancia frente al usuario. */
const TABLE_HEIGHT = 0.9;
const TABLE_DISTANCE = 0.9;
/** Punto de partida a escala real: al Sur del centro, en el aire, mirando al Norte [m]. */
const START_BACK = 60;
const START_UP = 25;
/** Alto de los caracteres de las etiquetas a escala real [m]. */
const LABEL_SIZE = 0.35;
const RAY_LENGTH = 5;
/** Separación entre el control y el borde inferior de su panel [m]. */
const PANEL_GAP = 0.06;

const v3 = (v: Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/**
 * Sesión WebXR de solo lectura (D-19): vuelo con los sticks, giro por saltos, teletransporte con el
 * agarre, selección de taladros con el gatillo, menú en la muñeca izquierda y ficha del taladro en
 * la mano derecha. El modelo no se copia ni se transforma: se cuelga de un grupo cuya matriz es la
 * ubicación (`placement.ts`).
 */
export class XrSession {
  static async supported(mode: XrMode): Promise<boolean> {
    const xr = typeof navigator === 'undefined' ? undefined : navigator.xr;
    if (!xr) return false;
    try {
      return await xr.isSessionSupported(mode === 'vr' ? 'immersive-vr' : 'immersive-ar');
    } catch {
      return false;
    }
  }

  readonly mode: XrMode;
  private session: XRSession | null = null;
  private readonly world = new Group();
  private placement: XrPlacement = { scale: 1, yaw: 0, offset: { x: 0, y: 0, z: 0 } };
  private currentView: XrView = 'walk';
  private readonly menu = new XrPanel(0.24);
  private readonly info = new XrPanel(0.28);
  private readonly hands: Hand[] = [];
  private readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  private beamAt: Vec3 | null = null;
  private readonly marker: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly reticle: Mesh<RingGeometry, MeshBasicMaterial>;
  private hitSource: XRHitTestSource | null = null;
  private teleporting = false;
  private snapArmed = true;
  private last = 0;
  private menuHover: string | null = null;
  private groundHit: Vec3 | null = null;
  private groundDist = Infinity;
  private reticleDist = Infinity;
  private readonly saved: {
    parent: Object3D | null;
    background: Scene['background'];
    clearAlpha: number;
  };
  private readonly avatars = new Avatars();
  private readonly raycaster = new Raycaster();
  private readonly placementQ = new Quaternion();

  constructor(
    private readonly host: XrHost,
    mode: XrMode,
  ) {
    this.mode = mode;
    this.world.matrixAutoUpdate = false;
    this.saved = {
      parent: host.model.parent,
      background: host.scene.background,
      clearAlpha: host.renderer.getClearAlpha(),
    };
    const beamGeo = new CylinderGeometry(1, 1, 1, 10, 1, true)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.5);
    this.beam = new Mesh(
      beamGeo,
      new MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    this.beam.visible = false;
    this.marker = new Mesh(
      new RingGeometry(0.7, 1, 32),
      new MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.marker.visible = false;
    this.marker.renderOrder = 9;
    // La retícula de AR está en el espacio XR (Y arriba): el anillo se acuesta.
    this.reticle = new Mesh(
      new RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xffffff }),
    );
    this.reticle.visible = false;
    this.world.add(this.beam, this.marker, this.avatars.root);
  }

  get view(): XrView {
    return this.currentView;
  }

  get scale(): number {
    return this.placement.scale;
  }

  async start(options: XrStartOptions = {}): Promise<void> {
    const xr = navigator.xr;
    if (!xr) throw new Error('WebXR no disponible');
    // requestSession debe ir antes de cualquier await: necesita el gesto del usuario.
    const session = await xr.requestSession(this.mode === 'vr' ? 'immersive-vr' : 'immersive-ar', {
      optionalFeatures: ['local-floor', 'hit-test', 'hand-tracking'],
    });
    const { renderer, scene, model } = this.host;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    renderer.xr.setFramebufferScaleFactor(options.framebufferScale ?? 1);
    renderer.xr.setFoveation(1);
    await renderer.xr.setSession(session);
    this.session = session;
    session.addEventListener('end', this.onSessionEnd);

    scene.add(this.world, this.reticle, this.menu.mesh, this.info.mesh);
    this.world.add(model);
    if (this.mode === 'ar') {
      scene.background = null;
      renderer.setClearAlpha(0);
    }
    for (let i = 0; i < 2; i++) this.addHand(i);
    this.last = performance.now();
    this.setView(this.mode === 'ar' ? 'table' : 'walk');
  }

  /** Termina la sesión; la limpieza corre en el evento `end` (también si sale el sistema). */
  end(): void {
    void this.session?.end();
  }

  setMenu(rows: readonly XrRow[]): void {
    this.menu.setRows(rows);
  }

  setInfo(rows: readonly XrRow[]): void {
    this.info.setRows(rows);
  }

  /** A escala real (parado en el aire al Sur de los taladros) o maqueta frente al usuario. */
  setView(view: XrView): void {
    this.currentView = view;
    const focus = this.host.focus();
    if (view === 'walk') {
      const start = { x: focus.x, y: focus.y - START_BACK, z: focus.z + START_UP };
      this.placement = placeAt(start, { x: 0, y: 0, z: 0 }, 0, 1);
    } else {
      const b = this.host.bounds();
      const size = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY, 1) : 200;
      const scale = TABLE_SIZE / size;
      this.placement = placeAt(
        this.tableAnchor(),
        { x: 0, y: TABLE_HEIGHT, z: -TABLE_DISTANCE },
        0,
        scale,
      );
    }
    this.applyScale();
  }

  /** Acerca (> 1) o aleja (< 1) la maqueta sin mover su centro sobre la mesa. */
  zoom(factor: number): void {
    if (this.currentView !== 'table') return;
    const anchor = this.tableAnchor();
    const at = toXr(this.placement, anchor);
    this.placement = placeAt(anchor, at, this.placement.yaw, this.placement.scale * factor);
    this.applyScale();
  }

  /** Haz sobre el taladro (collar en coordenadas de render) que eligió otra persona; null lo quita. */
  showHole(collar: Vec3 | null): void {
    this.beamAt = collar;
    this.applyBeam();
  }

  /** Otras personas de la sala, en coordenadas de render. */
  setAvatars(list: readonly XrAvatar[]): void {
    this.avatars.set(list, this.placement.scale);
  }

  /** Cabeza y controles de quien usa este visor, en coordenadas de render (para la sala). */
  pose(): { head: XrTransform; hands: XrTransform[] } | null {
    if (!this.session) return null;
    // q_modelo = q_ubicación⁻¹ · q_xr
    const inv = this.placementQ.clone().invert();
    const toT = (o: Object3D): XrTransform => {
      const pos = new Vector3();
      const q = new Quaternion();
      o.getWorldPosition(pos);
      o.getWorldQuaternion(q);
      const m = q.premultiply(inv);
      return { p: toModel(this.placement, v3(pos)), q: [m.x, m.y, m.z, m.w] };
    };
    const hands = (['left', 'right'] as const).flatMap((side) => {
      const h = this.hand(side);
      return h?.source ? [toT(h.grip)] : [];
    });
    return { head: toT(this.host.renderer.xr.getCamera()), hands };
  }

  /** Avance por cuadro: locomoción, rayos, menú y retícula. Lo llama el loop del engine. */
  update(): void {
    if (!this.session) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const cam = this.host.renderer.xr.getCamera();
    const head = new Vector3().setFromMatrixPosition(cam.matrixWorld);
    const forward = new Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
    const left = this.hand('left');
    const right = this.hand('right');

    // Vuelo: stick izquierdo en el plano, stick derecho vertical para subir y bajar.
    const lp = left?.source?.gamepad;
    const rp = right?.source?.gamepad;
    const headModel = toModel(this.placement, v3(head));
    const ground = this.host.height(headModel.x, headModel.y);
    const above = headModel.z - (ground ?? this.host.focus().z);
    const speed = flySpeed(above, this.placement.scale);
    const v = flyVelocity(
      { x: lp?.axes[2] ?? 0, y: lp?.axes[3] ?? 0 },
      rp?.axes[3] ?? 0,
      headingOf(v3(forward)),
      speed,
    );
    if (v.x !== 0 || v.y !== 0 || v.z !== 0)
      this.placement = moveBy(this.placement, { x: v.x * dt, y: v.y * dt, z: v.z * dt });
    const snap = snapTurn(this.snapArmed, rp?.axes[2] ?? 0);
    this.snapArmed = snap.armed;
    if (snap.angle !== 0) this.placement = turnAbout(this.placement, v3(head), snap.angle);
    if (this.currentView === 'walk') this.keepAboveGround(v3(head));
    this.applyPlacement();

    this.avatars.faceViewer(head);
    this.placePanel(this.menu, left, head);
    this.placePanel(this.info, right, head);
    this.menu.mesh.updateMatrixWorld();
    this.updateRay(right);
    if (left) left.line.visible = false;
    this.updateReticle();
  }

  // ---------------------------------------------------------------- privados

  private hand(handedness: 'left' | 'right'): Hand | undefined {
    return (
      this.hands.find((h) => h.source?.handedness === handedness) ??
      (handedness === 'right' ? this.hands.find((h) => h.source?.handedness === 'none') : undefined)
    );
  }

  private addHand(i: number): void {
    const { renderer, scene } = this.host;
    const ray = renderer.xr.getController(i);
    const grip = renderer.xr.getControllerGrip(i);
    const line = new Line(
      new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3),
      ),
      new LineBasicMaterial({ color: 0xffffff }),
    );
    line.visible = false;
    ray.add(line);
    const body = new Mesh(
      new BoxGeometry(0.03, 0.025, 0.1),
      new MeshBasicMaterial({ color: 0x374151 }),
    );
    grip.add(body);
    const hand: Hand = { ray, grip, source: null, line };
    this.hands.push(hand);
    ray.addEventListener('connected', (e) => {
      hand.source = e.data;
      if (this.mode === 'ar' && e.data.handedness !== 'left') this.requestHitTest(e.data);
    });
    ray.addEventListener('disconnected', () => {
      hand.source = null;
    });
    ray.addEventListener('select', () => {
      if (hand === this.hand('right')) this.onSelect();
    });
    ray.addEventListener('squeezestart', () => {
      if (hand === this.hand('right') && this.currentView === 'walk') this.teleporting = true;
    });
    ray.addEventListener('squeezeend', () => {
      if (hand === this.hand('right')) this.finishTeleport();
    });
    scene.add(ray, grip);
  }

  /**
   * Panel sobre un control y siempre de frente a la cabeza (pegado al control se ve espejado al
   * girar la mano). Sin control, el panel se oculta.
   */
  private placePanel(panel: XrPanel, hand: Hand | undefined, head: Vector3): void {
    const mesh = panel.mesh;
    if (!hand?.source) {
      mesh.visible = false;
      return;
    }
    mesh.visible = panel.hasRows;
    hand.grip.getWorldPosition(mesh.position);
    mesh.position.y += PANEL_GAP + mesh.scale.y / 2;
    mesh.lookAt(head);
  }

  private requestHitTest(source: XRInputSource): void {
    const request = this.session?.requestHitTestSource?.({ space: source.targetRaySpace });
    request
      ?.then((s) => {
        this.hitSource?.cancel();
        this.hitSource = s;
      })
      .catch(() => {
        // Sin hit-test la maqueta queda frente al usuario, a la altura de una mesa.
      });
  }

  private onSelect(): void {
    if (this.menuHover) {
      this.host.onAction(this.menuHover);
      return;
    }
    // En AR con la maqueta, el gatillo sobre una superficie real (más cerca que el modelo) la coloca.
    if (
      this.currentView === 'table' &&
      this.reticle.visible &&
      this.reticleDist < this.groundDist
    ) {
      const p = this.reticle.position;
      this.placement = placeAt(this.tableAnchor(), v3(p), this.placement.yaw, this.placement.scale);
      this.applyPlacement();
      return;
    }
    const hit = this.groundHit;
    const s = this.placement.scale;
    const picked = hit
      ? this.host.pickHole(hit.x, hit.y, Math.max(1.5, (this.groundDist / s) * 0.02))
      : null;
    this.beamAt = picked?.collar ?? null;
    this.applyBeam();
    this.host.onSelectHole(picked?.id ?? null);
  }

  private finishTeleport(): void {
    const was = this.teleporting;
    this.teleporting = false;
    this.marker.visible = false;
    if (!was || !this.groundHit) return;
    const cam = this.host.renderer.xr.getCamera();
    const head = new Vector3().setFromMatrixPosition(cam.matrixWorld);
    const target = toXr(this.placement, this.groundHit);
    this.placement = moveBy(this.placement, {
      x: target.x - head.x,
      y: target.y,
      z: target.z - head.z,
    });
    this.applyPlacement();
  }

  /** Rayo del control derecho: primero el menú, después el terreno (o el modelo de la maqueta). */
  private updateRay(hand: Hand | undefined): void {
    this.groundHit = null;
    this.groundDist = Infinity;
    if (!hand?.source) {
      this.menuHover = this.menu.hover(-1);
      return;
    }
    hand.line.visible = true;
    const o = new Vector3().setFromMatrixPosition(hand.ray.matrixWorld);
    const d = new Vector3(0, 0, -1).transformDirection(hand.ray.matrixWorld);
    this.raycaster.set(o, d);
    const menuHit = this.menu.mesh.visible
      ? this.raycaster.intersectObject(this.menu.mesh)[0]
      : undefined;
    this.menuHover = this.menu.hover(menuHit?.uv?.y ?? -1);
    let length = menuHit?.distance ?? RAY_LENGTH;
    if (!menuHit) {
      const s = this.placement.scale;
      const om = toModel(this.placement, v3(o));
      const dm = dirToModel(this.placement, v3(d));
      const len = Math.hypot(dm.x, dm.y, dm.z);
      const hit = rayGround(
        om,
        { x: dm.x / len, y: dm.y / len, z: dm.z / len },
        this.host.height,
        Math.max(5000, RAY_LENGTH / s),
      );
      if (hit) {
        this.groundHit = hit.point;
        this.groundDist = hit.distance * s;
        length = this.groundDist;
      }
    }
    hand.line.scale.set(1, 1, length);
    const tp = this.teleporting && this.groundHit !== null;
    this.marker.visible = tp;
    if (tp && this.groundHit) {
      this.marker.position.set(this.groundHit.x, this.groundHit.y, this.groundHit.z + 0.1);
    }
  }

  private updateReticle(): void {
    this.reticle.visible = false;
    this.reticleDist = Infinity;
    const source = this.hitSource;
    const ref = this.host.renderer.xr.getReferenceSpace();
    if (!source || !ref || this.currentView !== 'table') return;
    const pose = this.host.renderer.xr.getFrame().getHitTestResults(source)[0]?.getPose(ref);
    if (!pose) return;
    const p = pose.transform.position;
    this.reticle.position.set(p.x, p.y, p.z);
    this.reticle.visible = true;
    const right = this.hand('right');
    if (right) {
      const o = new Vector3().setFromMatrixPosition(right.ray.matrixWorld);
      this.reticleDist = o.distanceTo(this.reticle.position);
    }
  }

  /** A escala real la cabeza no baja de MIN_CLEARANCE sobre el terreno. */
  private keepAboveGround(head: Vec3): void {
    const m = toModel(this.placement, head);
    const g = this.host.height(m.x, m.y);
    if (g === null || m.z >= g + MIN_CLEARANCE) return;
    const lift = (g + MIN_CLEARANCE - m.z) * this.placement.scale;
    this.placement = moveBy(this.placement, { x: 0, y: lift, z: 0 });
  }

  /** Centro de la maqueta: centro de la escena apoyado en su punto más bajo. */
  private tableAnchor(): Vec3 {
    const b = this.host.bounds();
    const f = this.host.focus();
    return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: b.minZ } : f;
  }

  private applyPlacement(): void {
    const p = this.placement;
    // Ry(yaw) · Rx(−π/2) · escala, luego traslación (placement.ts).
    this.placementQ.setFromAxisAngle(new Vector3(0, 1, 0), p.yaw);
    this.placementQ.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2));
    this.world.matrix.compose(
      new Vector3(p.offset.x, p.offset.y, p.offset.z),
      this.placementQ,
      new Vector3(p.scale, p.scale, p.scale),
    );
    this.world.matrixWorldNeedsUpdate = true;
  }

  /** Tamaños que dependen de la escala (etiquetas, haz, marcador). */
  private applyScale(): void {
    const s = this.placement.scale;
    const walk = this.currentView === 'walk';
    this.host.setLabelSize(walk ? LABEL_SIZE : Math.max(0.005, LABEL_SIZE * s));
    this.marker.scale.setScalar(walk ? 1 : 0.02 / s);
    this.applyBeam();
    this.applyPlacement();
    this.host.onView(this.currentView, s);
  }

  /** Haz vertical sobre el taladro elegido: visible desde lejos y sobre la maqueta. */
  private applyBeam(): void {
    const at = this.beamAt;
    this.beam.visible = at !== null;
    if (!at) return;
    const s = this.placement.scale;
    const r = Math.max(0.3, 0.003 / s);
    const h = Math.max(30, 0.08 / s);
    this.beam.position.set(at.x, at.y, at.z);
    this.beam.scale.set(r, r, h);
  }

  private readonly onSessionEnd = (): void => {
    const { renderer, scene, model } = this.host;
    this.hitSource?.cancel();
    this.hitSource = null;
    for (const h of this.hands) {
      scene.remove(h.ray, h.grip);
      h.line.geometry.dispose();
    }
    this.hands.length = 0;
    this.menu.dispose();
    this.info.dispose();
    this.avatars.dispose();
    this.world.remove(model);
    this.saved.parent?.add(model);
    scene.remove(this.world, this.reticle, this.menu.mesh, this.info.mesh);
    scene.background = this.saved.background;
    renderer.setClearAlpha(this.saved.clearAlpha);
    this.host.setLabelSize(0);
    this.session = null;
    this.host.onEnd();
  };
}
