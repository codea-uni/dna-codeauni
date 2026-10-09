import {
  BackSide,
  BoxGeometry,
  Color,
  Matrix4,
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
  SphereGeometry,
  Vector3,
  type WebGLRenderer,
  type XRGripSpace,
  type XRTargetRaySpace,
} from 'three';
import type { HoleId, Vec3 } from '@cronos/core';
import {
  dirToModel,
  dragPlacement,
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
import { XrPanel, type XrLine } from './XrPanel';
import { Avatars, type XrAvatar, type XrTransform } from './Avatars';
import { pickTable, type XrSurface } from './planes';

/** Visor inmersivo (`immersive-vr`) o realidad aumentada con passthrough (`immersive-ar`). */
export type XrMode = 'vr' | 'ar';
/**
 * Escenario dentro del visor: maqueta sobre la mesa real (passthrough si la sesión es AR), dentro de
 * la voladura a escala real, o maqueta aislada frente al usuario con fondo oscuro.
 */
export type XrView = 'table' | 'walk' | 'model';

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
  /** Botón del menú pulsado; `value` (0–1) si es un slider que se arrastra. */
  onAction: (id: string, value?: number) => void;
  /** Botón A del control derecho apretado (true) o soltado (false): hablar al asistente. */
  onTalk: (down: boolean) => void;
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
/** Ángulo entre la mirada y la mano izquierda para abrir y cerrar el menú [rad] (con histéresis). */
const MENU_OPEN = (35 * Math.PI) / 180;
const MENU_CLOSE = (55 * Math.PI) / 180;
/** Duración de la aparición del menú [s]. */
const MENU_ANIM = 0.15;
/** Botón A/X del gamepad (`xr-standard`). */
const BUTTON_A = 4;
/**
 * Panel de voz: abajo a la izquierda de la vista [rad], a esta distancia y bajo la mirada [m], para
 * no tapar la escena (se puede mover con el agarre).
 */
const VOICE_SIDE = (28 * Math.PI) / 180;
const VOICE_AHEAD = 0.8;
const VOICE_DROP = 0.3;
/** Leyenda de los mapas: a la derecha de la vista [rad], a esta distancia [m] y bajo la mirada. */
const LEGEND_SIDE = (40 * Math.PI) / 180;
const LEGEND_AHEAD = 0.8;
const LEGEND_DROP = 0.1;
/** Si la cabeza gira más que esto respecto de la leyenda, la leyenda se reacomoda [rad]. */
const LEGEND_FOLLOW = (75 * Math.PI) / 180;
/** Cuánto se espera a que el visor detecte una mesa antes de dejar la maqueta en el aire [ms]. */
const AUTO_PLACE_MS = 4000;
/** La maqueta ocupa a lo sumo esta fracción del lado menor de la mesa. */
const TABLE_FILL = 0.85;

const v3 = (v: Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/**
 * Rumbo al que queda anclado un panel: el de la mirada al aparecer, y se reacomoda solo si la
 * cabeza se aleja más de `LEGEND_FOLLOW` (si siguiera cada giro, se escaparía al mirarlo).
 */
function anchorYaw(anchor: number | null, forward: Vector3): number {
  const yaw = Math.atan2(-forward.x, -forward.z);
  return anchor === null || Math.abs(angleDiff(yaw, anchor)) > LEGEND_FOLLOW ? yaw : anchor;
}

/** Ubica un panel a `ahead` m de la cabeza en el rumbo `yaw`, `drop` m más abajo, mirándola. */
function placeAround(mesh: Object3D, head: Vector3, yaw: number, ahead: number, drop: number) {
  mesh.position.set(head.x - Math.sin(yaw) * ahead, head.y - drop, head.z - Math.cos(yaw) * ahead);
  mesh.lookAt(head);
}

/** Diferencia de ángulos en (−π, π]. */
export const angleDiff = (a: number, b: number): number => {
  const d = (a - b) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d <= -Math.PI ? d + 2 * Math.PI : d;
};

/**
 * Sesión WebXR (D-19): vuelo con los sticks, giro por saltos, teletransporte con el agarre,
 * selección de taladros con el gatillo, menú en la muñeca izquierda, ficha del taladro en la mano
 * derecha y panel de voz frente a la cabeza (las ediciones las hace el asistente en la web). El modelo no se copia ni se transforma: se cuelga de un grupo cuya matriz es la
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
  private readonly menu = new XrPanel(0.3);
  /** El menú se abre al mirar la mano izquierda y se cierra al dejar de mirarla. */
  private menuOpen = false;
  /** Aparición del menú, 0 (cerrado) a 1 (abierto). */
  private menuAppear = 0;
  private readonly info = new XrPanel(0.34);
  private readonly voice = new XrPanel(0.45, true);
  private readonly legend = new XrPanel(0.42, true);
  /** Ayuda corta bajo el control derecho («A: hablar», «agarre: mover»). */
  private readonly hint = new XrPanel(0.2);
  /** Paneles que se dejaron en un lugar con el agarre (espacio XR: se quedan en la habitación). */
  private readonly pinned = new Map<XrPanel, Vector3>();
  /** Panel tomado con el agarre: sigue el rayo a la distancia a la que se tomó. */
  private moving: { panel: XrPanel; hand: Hand; dist: number } | null = null;
  /** Panel flotante (voz, leyenda) bajo el rayo derecho, con su distancia. */
  private rayPanel: { panel: XrPanel; dist: number } | null = null;
  /** Botón bajo el rayo en un panel flotante. */
  private panelHover: string | null = null;
  /** Rumbos de la cabeza a los que están anclados la leyenda y la voz (null = sin anclar). */
  private legendYaw: number | null = null;
  private voiceYaw: number | null = null;
  private talking = false;
  private readonly hands: Hand[] = [];
  private readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  private beamAt: Vec3 | null = null;
  private readonly marker: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly reticle: Mesh<RingGeometry, MeshBasicMaterial>;
  /**
   * Fondo opaco en una sesión AR: con passthrough three limpia la pantalla en transparente aunque la
   * escena tenga color de fondo, así que una esfera alrededor de la cabeza tapa la habitación.
   */
  private readonly backdrop: Mesh<SphereGeometry, MeshBasicMaterial>;
  private hitSource: XRHitTestSource | null = null;
  private teleporting = false;
  /** Maqueta tomada con un control (agarre): sigue su posición y su giro. */
  private grab: { hand: Hand; from: { pos: Vec3; yaw: number }; p0: XrPlacement } | null = null;
  /** Hasta cuándo se busca una mesa para apoyar la maqueta (null = no se busca). */
  private autoPlaceUntil: number | null = null;
  private snapArmed = true;
  private last = 0;
  private menuHover: string | null = null;
  /** Último valor enviado del slider que se arrastra. */
  private dragValue: number | null = null;
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
    const bg = host.scene.background;
    this.backdrop = new Mesh(
      new SphereGeometry(10_000, 16, 8),
      new MeshBasicMaterial({
        color: bg instanceof Color ? bg : 0x10141c,
        side: BackSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.backdrop.renderOrder = -1000;
    this.backdrop.frustumCulled = false;
    this.backdrop.visible = false;
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
      optionalFeatures: ['local-floor', 'hit-test', 'plane-detection', 'hand-tracking'],
    });
    const { renderer, scene, model } = this.host;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    renderer.xr.setFramebufferScaleFactor(options.framebufferScale ?? 1);
    renderer.xr.setFoveation(1);
    await renderer.xr.setSession(session);
    this.session = session;
    session.addEventListener('end', this.onSessionEnd);

    scene.add(
      this.world,
      this.reticle,
      this.menu.mesh,
      this.info.mesh,
      this.voice.mesh,
      this.legend.mesh,
      this.hint.mesh,
      this.backdrop,
    );
    this.world.add(model);
    for (let i = 0; i < 2; i++) this.addHand(i);
    this.last = performance.now();
    this.setView('table');
  }

  /** Termina la sesión; la limpieza corre en el evento `end` (también si sale el sistema). */
  end(): void {
    void this.session?.end();
  }

  setMenu(rows: readonly XrLine[]): void {
    this.menu.setRows(rows);
  }

  setInfo(rows: readonly XrLine[]): void {
    this.info.setRows(rows);
  }

  /** Estado del asistente de voz (escuchando, pensando, respuesta); vacío lo oculta. */
  setVoice(rows: readonly XrLine[]): void {
    this.voice.setRows(rows);
  }

  /** Escala de colores y datos de los mapas prendidos (energía, vibración); vacía la oculta. */
  setLegend(rows: readonly XrLine[]): void {
    this.legend.setRows(rows);
  }

  /** Ayuda bajo el control derecho (qué hace cada botón); vacía la oculta. */
  setHint(rows: readonly XrLine[]): void {
    this.hint.setRows(rows);
  }

  /**
   * Cambia de escenario. A escala real se empieza en el aire al Sur de los taladros; las maquetas,
   * frente al usuario a la altura de una mesa. Sobre la mesa real, además, se busca una mesa
   * detectada por el visor para apoyarla sola.
   */
  setView(view: XrView): void {
    this.currentView = view;
    this.grab = null;
    const focus = this.host.focus();
    if (view === 'walk') {
      const start = { x: focus.x, y: focus.y - START_BACK, z: focus.z + START_UP };
      this.placement = placeAt(start, { x: 0, y: 0, z: 0 }, 0, 1);
    } else {
      this.placement = placeAt(
        this.tableAnchor(),
        { x: 0, y: TABLE_HEIGHT, z: -TABLE_DISTANCE },
        0,
        TABLE_SIZE / this.modelSize(),
      );
    }
    this.autoPlaceUntil = view === 'table' ? performance.now() + AUTO_PLACE_MS : null;
    this.applyBackground();
    this.applyScale();
  }

  /** Vuelve a buscar una mesa del cuarto y apoya la maqueta en ella (escenario de la mesa). */
  placeOnTable(): void {
    if (this.currentView !== 'table') this.setView('table');
    else this.autoPlaceUntil = performance.now() + AUTO_PLACE_MS;
  }

  /** Acerca (> 1) o aleja (< 1) la maqueta sin mover su centro sobre la mesa. */
  zoom(factor: number): void {
    if (this.currentView === 'walk') return;
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
  pose(): { head: XrTransform; hands: XrTransform[]; scale: number } | null {
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
    return { head: toT(this.host.renderer.xr.getCamera()), hands, scale: this.placement.scale };
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
    if (this.grab)
      this.placement = dragPlacement(this.grab.p0, this.grab.from, this.gripPose(this.grab.hand));
    if (this.autoPlaceUntil !== null) this.tryAutoPlace(v3(head));
    this.applyPlacement();

    this.backdrop.position.copy(head);
    this.avatars.faceViewer(head);
    this.updateMenuOpen(left, head, forward);
    const target = this.menuOpen ? 1 : 0;
    const step = dt / MENU_ANIM;
    this.menuAppear += Math.max(-step, Math.min(step, target - this.menuAppear));
    this.menu.setAppear(this.menuAppear);
    this.placePanel(this.menu, left, head, this.menuAppear > 0);
    this.placePanel(this.info, right, head, true);
    this.placeHint(right, head);
    this.moveHeld();
    this.placeVoice(head, forward);
    this.placeLegend(head, forward);
    this.menu.mesh.updateMatrixWorld();
    this.voice.mesh.updateMatrixWorld();
    this.legend.mesh.updateMatrixWorld();
    this.updateRay(right);
    if (left) left.line.visible = false;
    this.updateReticle();
    // Los controles sin botón A (manos) no lo traen: el índice puede faltar.
    const a: GamepadButton | undefined = rp?.buttons[BUTTON_A];
    const talk = a?.pressed ?? false;
    if (talk !== this.talking) {
      this.talking = talk;
      this.host.onTalk(talk);
    }
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
      // Al soltar un slider no hay clic (select llega antes que selectend).
      if (hand === this.hand('right') && !this.menu.isDragging) this.onSelect();
    });
    // Gatillo apretado sobre un slider: se arrastra hasta soltarlo.
    ray.addEventListener('selectstart', () => {
      if (hand !== this.hand('right') || !this.menuHover || !this.menu.beginDrag()) return;
      this.pulse(hand);
      this.dragMenu(hand);
    });
    ray.addEventListener('selectend', () => {
      this.menu.endDrag();
    });
    // Agarre: sobre un panel flotante, moverlo; a escala real, teletransporte (mano derecha); con
    // una maqueta, tomarla y moverla.
    ray.addEventListener('squeezestart', () => {
      if (hand === this.hand('right') && this.rayPanel) {
        this.moving = { panel: this.rayPanel.panel, hand, dist: this.rayPanel.dist };
        this.pulse(hand);
      } else if (this.currentView !== 'walk') {
        this.grab = { hand, from: this.gripPose(hand), p0: this.placement };
        this.autoPlaceUntil = null;
      } else if (hand === this.hand('right')) this.teleporting = true;
    });
    ray.addEventListener('squeezeend', () => {
      if (this.moving?.hand === hand) {
        this.moving = null;
        return;
      }
      if (this.grab?.hand === hand) this.grab = null;
      if (hand === this.hand('right')) this.finishTeleport();
    });
    scene.add(ray, grip);
  }

  /**
   * Panel sobre un control y siempre de frente a la cabeza (pegado al control se ve espejado al
   * girar la mano). Sin control, el panel se oculta.
   */
  private placePanel(panel: XrPanel, hand: Hand | undefined, head: Vector3, open: boolean): void {
    const mesh = panel.mesh;
    if (!hand?.source || !open) {
      mesh.visible = false;
      return;
    }
    mesh.visible = panel.hasRows;
    hand.grip.getWorldPosition(mesh.position);
    mesh.position.y += PANEL_GAP + panel.height / 2;
    mesh.lookAt(head);
  }

  /** Ayuda bajo el control derecho, de frente a la cabeza. */
  private placeHint(hand: Hand | undefined, head: Vector3): void {
    const mesh = this.hint.mesh;
    if (!hand?.source || !this.hint.hasRows) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    hand.grip.getWorldPosition(mesh.position);
    mesh.position.y -= PANEL_GAP + this.hint.height / 2;
    mesh.lookAt(head);
  }

  /** El panel tomado con el agarre sigue el rayo y queda fijo donde se suelta. */
  private moveHeld(): void {
    const m = this.moving;
    if (!m) return;
    if (!m.hand.source || !m.panel.hasRows) {
      this.moving = null;
      return;
    }
    const o = new Vector3().setFromMatrixPosition(m.hand.ray.matrixWorld);
    const d = new Vector3(0, 0, -1).transformDirection(m.hand.ray.matrixWorld);
    this.pinned.set(m.panel, o.addScaledVector(d, m.dist));
  }

  /** Un panel dejado en un lugar queda ahí, siempre de frente a la cabeza. */
  private placePinned(panel: XrPanel, head: Vector3): boolean {
    const at = this.pinned.get(panel);
    if (!at) return false;
    panel.mesh.position.copy(at);
    panel.mesh.lookAt(head);
    return true;
  }

  /** Panel de voz: abajo a la izquierda de la vista (anclado como la leyenda) o donde se dejó. */
  private placeVoice(head: Vector3, forward: Vector3): void {
    const mesh = this.voice.mesh;
    mesh.visible = this.voice.hasRows;
    if (!mesh.visible) {
      this.voiceYaw = null;
      return;
    }
    if (this.placePinned(this.voice, head)) return;
    this.voiceYaw = anchorYaw(this.voiceYaw, forward);
    placeAround(mesh, head, this.voiceYaw + VOICE_SIDE, VOICE_AHEAD, VOICE_DROP);
  }

  /**
   * Leyenda a la derecha de la vista. No sigue cada giro de la cabeza (si no, se escaparía al
   * mirarla): queda anclada a un rumbo y se reacomoda solo cuando la cabeza se aleja mucho.
   */
  private placeLegend(head: Vector3, forward: Vector3): void {
    const mesh = this.legend.mesh;
    mesh.visible = this.legend.hasRows;
    if (!mesh.visible) {
      this.legendYaw = null;
      return;
    }
    if (this.placePinned(this.legend, head)) return;
    this.legendYaw = anchorYaw(this.legendYaw, forward);
    placeAround(mesh, head, this.legendYaw - LEGEND_SIDE, LEGEND_AHEAD, LEGEND_DROP);
  }

  /** Pulso corto en el control (al pasar a otro botón y al hacer clic), si el visor lo admite. */
  private pulse(hand: Hand): void {
    const gp = hand.source?.gamepad as
      | { hapticActuators?: readonly { pulse?: (value: number, ms: number) => unknown }[] }
      | undefined;
    void gp?.hapticActuators?.[0]?.pulse?.(0.3, 15);
  }

  /** Mueve el slider tomado al punto del menú que apunta el rayo y avisa el valor. */
  private dragMenu(hand: Hand): void {
    const o = new Vector3().setFromMatrixPosition(hand.ray.matrixWorld);
    const d = new Vector3(0, 0, -1).transformDirection(hand.ray.matrixWorld);
    this.raycaster.set(o, d);
    const uv = this.raycaster.intersectObject(this.menu.mesh)[0]?.uv;
    if (!uv || !this.menuHover) return;
    const before = this.dragValue;
    const value = this.menu.dragTo(uv.x);
    if (value === null || (before !== null && Math.abs(value - before) < 0.005)) return;
    this.dragValue = value;
    this.host.onAction(this.menuHover, value);
  }

  /**
   * Menú dinámico: aparece al mirar la mano izquierda (como un reloj) y se va al dejar de mirarla,
   * salvo mientras el rayo lo apunta. Así no tapa la vista.
   */
  private updateMenuOpen(left: Hand | undefined, head: Vector3, forward: Vector3): void {
    if (!left?.source) {
      this.menuOpen = false;
      return;
    }
    const toHand = new Vector3().setFromMatrixPosition(left.grip.matrixWorld).sub(head).normalize();
    const angle = toHand.angleTo(forward);
    if (angle < MENU_OPEN) this.menuOpen = true;
    else if (angle > MENU_CLOSE && this.menuHover === null && !this.menu.isDragging)
      this.menuOpen = false;
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
      const right = this.hand('right');
      if (right) this.pulse(right);
      this.host.onAction(this.menuHover);
      return;
    }
    if (this.panelHover) {
      const right = this.hand('right');
      if (right) this.pulse(right);
      this.host.onAction(this.panelHover);
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
      this.menuHover = this.menu.hover(0, -1);
      this.panelHover = null;
      this.rayPanel = null;
      this.voice.hover(0, -1);
      this.legend.hover(0, -1);
      return;
    }
    hand.line.visible = true;
    const o = new Vector3().setFromMatrixPosition(hand.ray.matrixWorld);
    const d = new Vector3(0, 0, -1).transformDirection(hand.ray.matrixWorld);
    this.raycaster.set(o, d);
    // El panel más cercano bajo el rayo: menú, voz o leyenda (el que se mueve no capta el rayo).
    const panels = [this.menu, this.voice, this.legend].filter(
      (p) => p.mesh.visible && p !== this.moving?.panel,
    );
    const nearest = this.raycaster.intersectObjects(panels.map((p) => p.mesh))[0];
    const hit = (p: XrPanel) => (nearest?.object === p.mesh ? nearest : undefined);
    const menuHit = hit(this.menu);
    const prev = this.menuHover;
    const prevPanel = this.panelHover;
    this.menuHover = this.menu.hover(menuHit?.uv?.x ?? 0, menuHit?.uv?.y ?? -1);
    this.panelHover = null;
    this.rayPanel = null;
    for (const p of [this.voice, this.legend]) {
      const h = hit(p);
      const id = p.hover(h?.uv?.x ?? 0, h?.uv?.y ?? -1);
      if (h) {
        this.rayPanel = { panel: p, dist: h.distance };
        this.panelHover = id;
      }
    }
    if (this.menuHover !== null && this.menuHover !== prev) this.pulse(hand);
    if (this.panelHover !== null && this.panelHover !== prevPanel) this.pulse(hand);
    if (this.menu.isDragging) this.dragMenu(hand);
    else this.dragValue = null;
    let length = nearest?.distance ?? RAY_LENGTH;
    if (!nearest) {
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
    const pose = this.frame()?.getHitTestResults(source)[0]?.getPose(ref);
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

  /** Cuadro XR en curso; three lo da en null en los primeros cuadros (su tipo no lo dice). */
  private frame(): XRFrame | null {
    return this.host.renderer.xr.getFrame();
  }

  /** Posición y rumbo de un control (espacio XR). */
  private gripPose(hand: Hand): { pos: Vec3; yaw: number } {
    const pos = new Vector3().setFromMatrixPosition(hand.grip.matrixWorld);
    const fwd = new Vector3(0, 0, -1).transformDirection(hand.grip.matrixWorld);
    return { pos: v3(pos), yaw: headingOf(v3(fwd)) };
  }

  /**
   * Apoya la maqueta en la mesa que detecta el visor (`plane-detection`; el Quest usa la
   * configuración del espacio). Mientras no aparezca ninguna, la maqueta queda en el aire.
   */
  private tryAutoPlace(head: Vec3): void {
    if (this.autoPlaceUntil !== null && performance.now() > this.autoPlaceUntil) {
      this.autoPlaceUntil = null;
      return;
    }
    const frame = this.frame();
    const ref = this.host.renderer.xr.getReferenceSpace();
    const planes = frame?.detectedPlanes;
    if (!frame || !ref || !planes || planes.size === 0) return;
    const surfaces: XrSurface[] = [];
    for (const plane of planes) {
      if (plane.orientation !== 'horizontal') continue;
      const pose = frame.getPose(plane.planeSpace, ref);
      if (!pose) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const q of plane.polygon) {
        minX = Math.min(minX, q.x);
        maxX = Math.max(maxX, q.x);
        minZ = Math.min(minZ, q.z);
        maxZ = Math.max(maxZ, q.z);
      }
      if (!Number.isFinite(minX)) continue;
      const c = new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2).applyMatrix4(
        new Matrix4().fromArray(pose.transform.matrix),
      );
      surfaces.push({
        center: v3(c),
        width: maxX - minX,
        depth: maxZ - minZ,
        ...(plane.semanticLabel ? { label: plane.semanticLabel } : {}),
      });
    }
    const table = pickTable(surfaces, head);
    if (!table) return;
    const fit = Math.min(TABLE_SIZE, TABLE_FILL * Math.min(table.width, table.depth));
    this.placement = placeAt(
      this.tableAnchor(),
      table.center,
      this.placement.yaw,
      fit / this.modelSize(),
    );
    this.autoPlaceUntil = null;
    this.applyScale();
  }

  /** Lado mayor de la escena en planta [m del modelo]. */
  private modelSize(): number {
    const b = this.host.bounds();
    return b ? Math.max(b.maxX - b.minX, b.maxY - b.minY, 1) : 200;
  }

  /** Passthrough solo en la maqueta sobre la mesa real (sesión AR); el resto, fondo oscuro. */
  private applyBackground(): void {
    const { scene, renderer } = this.host;
    const see = this.mode === 'ar' && this.currentView === 'table';
    scene.background = see ? null : this.saved.background;
    renderer.setClearAlpha(see ? 0 : this.saved.clearAlpha);
    this.backdrop.visible = this.mode === 'ar' && !see;
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
    this.voice.dispose();
    this.legend.dispose();
    this.hint.dispose();
    this.pinned.clear();
    this.moving = null;
    this.avatars.dispose();
    this.world.remove(model);
    this.saved.parent?.add(model);
    scene.remove(
      this.world,
      this.reticle,
      this.menu.mesh,
      this.info.mesh,
      this.voice.mesh,
      this.legend.mesh,
      this.hint.mesh,
      this.backdrop,
    );
    this.backdrop.geometry.dispose();
    this.backdrop.material.dispose();
    scene.background = this.saved.background;
    renderer.setClearAlpha(this.saved.clearAlpha);
    this.host.setLabelSize(0);
    this.session = null;
    this.host.onEnd();
  };
}
