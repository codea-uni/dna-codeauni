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
  Object3D,
  Quaternion,
  Raycaster,
  RingGeometry,
  type Scene,
  SphereGeometry,
  Vector3,
  type WebGLRenderer,
  type XRGripSpace,
  type XRHandSpace,
  type XRTargetRaySpace,
} from 'three';
import type { HoleId, Vec3 } from '@cronos/core';
import {
  blendPlacement,
  dirToModel,
  dragPlacement,
  easeInOut,
  headingOf,
  moveBy,
  placeAt,
  samePlacement,
  standPlacement,
  toModel,
  toXr,
  turnAbout,
  twoHandPlacement,
  walkDragGain,
  walkTwoHandPlacement,
  type XrPlacement,
} from './placement';
import {
  ARC_OFF,
  ARC_ON,
  MIN_CLEARANCE,
  axis,
  flySpeed,
  flyVelocity,
  snapTurn,
  teleportArc,
} from './locomotion';
import { rayGround } from './rayGround';
import { XrPanel, type XrLine } from './XrPanel';
import { XrEnvironment } from './environment';
import { Avatars, type XrAvatar, type XrTransform } from './Avatars';
import { pickTable, type XrSurface } from './planes';
import { XrRing, XrVignette } from './comfort';
import { EYE_HEIGHT, azimuthOf, dirOf, standPoint } from './viewpoints';

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

/**
 * Ir a un lugar a escala real (`goTo`): pararse a `standDistance` [m] del objetivo, mirando con
 * rumbo `yawDeg` (azimut desde el Norte; sin rumbo, desde donde está el usuario), con los ojos a
 * `eyeHeight` [m] sobre el terreno, mirando `lookAt` (por defecto, el objetivo). `animate` = false
 * salta sin vuelo.
 */
export interface XrGoToOptions {
  standDistance?: number;
  yawDeg?: number;
  eyeHeight?: number;
  lookAt?: Vec3;
  animate?: boolean;
}

/** Dónde quedó el usuario tras `goTo` (render) y hacia dónde mira (azimut [°]). */
export interface XrGoToResult {
  eye: Vec3;
  yawDeg: number;
}

/** Estado del visor para el asistente: escenario, escala, cabeza (render) y rumbo de la mirada. */
export interface XrState {
  view: XrView;
  scale: number;
  head: Vec3;
  headingDeg: number;
}

export interface XrStartOptions {
  /** Resolución del framebuffer XR (1 = nativa; < 1 alivia la GPU en el Quest 2). */
  framebufferScale?: number;
}

interface Hand {
  ray: XRTargetRaySpace;
  grip: XRGripSpace;
  /** Articulaciones de la mano (seguimiento de manos, sin control). */
  joints: XRHandSpace;
  source: XRInputSource | null;
  line: Line<BufferGeometry, LineBasicMaterial>;
  /** Cuerpo del control (se oculta con manos). */
  body: Mesh;
  /** Pellizco o gatillo apretado. */
  pinching: boolean;
  /** Cuándo empezó el pellizco [ms] (con manos: corto = elegir, largo = teletransporte). */
  pinchSince: number;
  /** Posición de la mano sin el temblor del seguimiento (filtro de ~30 ms, como FleetView). */
  steady: Vector3 | null;
  /** Este pellizco se volvió arrastre (no es clic). */
  dragged: boolean;
  /** Agarre apretado (control). */
  squeezing: boolean;
}

/** Radio de las esferas de las articulaciones de la mano [m]. */
const JOINT_RADIUS = 0.008;
const isHand = (h: Hand | undefined): boolean => !!h?.source?.hand;
/** Constante de tiempo del filtro del temblor de las manos [s]. */
const HAND_STEADY_S = 0.03;
/**
 * Suavizado de la maqueta hacia su ubicación [1/s]: rápido mientras se toma con la mano o se vuela
 * (sigue al gesto sin tirones) y lento en los cambios de vista o de zoom (se ve como un vuelo).
 */
const FOLLOW_RATE = 22;
/** Pellizco de la derecha: si la mano se mueve más que esto [m], es arrastre y no clic. */
const DRAG_START_M = 0.03;
/**
 * Dos manos a escala real: cuánto se acerca o aleja por metro que se separan o juntan las manos,
 * por metro de altura sobre el terreno (a 60 m de altura, abrir 30 cm avanza ~36 m).
 */
const WALK_ZOOM_PER_M = 2;
/** Enfoque: tamaño de lo enfocado sobre la mesa [m] y distancia frente a la cabeza [m]. */
const FOCUS_SPAN = 0.7;
const FOCUS_AHEAD = 0.6;
const FOCUS_DROP = 0.4;
const FLIGHT_RATE = 4.5;
/** Seguimiento del dibujo en la maqueta: tamaño en la mesa [m] y vaivén [rad]. */
const TRACK_SPAN = 0.55;
const TRACK_SWAY = 0.14;

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
/** Botones A/X y B/Y del gamepad (`xr-standard`). */
const BUTTON_A = 4;
const BUTTON_B = 5;
/** B/Y mantenido este tiempo sale del visor [ms] (como FleetView). */
const EXIT_HOLD_MS = 900;
/** Manos: mantener el rayo sobre un botón lo elige [ms] («salir», más largo). */
const DWELL_MS = 650;
const DWELL_EXIT_MS = 1500;
/** Tras un clic por permanencia hay que mover el rayo más que esto para volver a elegir [rad]. */
const DWELL_REARM = 0.04;
/**
 * Traslados a escala real: hasta esta distancia [m] se vuela (con viñeta); más lejos, la vista se
 * funde a negro, salta y vuelve (cruzar el tajo volando marea). Duraciones [s].
 */
const FADE_OVER_M = 150;
const FADE_OUT_S = 0.18;
const FADE_IN_S = 0.32;
/** Zambullida desde la maqueta a la escala real [s] y salto del teletransporte [s]. */
const DIVE_S = 1.8;
const JUMP_S = 0.3;
/** Oscurecimiento de los bordes mientras se vuela solo (0–1) y su suavizado [1/s]. */
const TUNNEL = 0.75;
const TUNNEL_RATE = 8;
/** Puntos máximos del arco del teletransporte. */
const ARC_POINTS = 128;
/** HUD de la secuencia: frente a la vista, un poco arriba de la mirada [m]. */
const HUD_AHEAD = 1.0;
const HUD_RISE = 0.24;
/**
 * Panel de voz: abajo a la izquierda de la vista [rad], a esta distancia y bajo la mirada [m], para
 * no tapar la escena (se puede mover con el agarre).
 */
const VOICE_SIDE = (28 * Math.PI) / 180;
const VOICE_AHEAD = 0.8;
const VOICE_DROP = 0.3;
/** Leyenda de los mapas: a la derecha de la vista [rad], a esta distancia [m] y bajo la mirada. */
const LEGEND_SIDE = (40 * Math.PI) / 180;
/**
 * Tarjetas de reporte del asistente (como FleetView): en arco a la derecha de la vista, la nueva
 * primero; ancho [m], primer ángulo, paso entre tarjetas, distancia y caída bajo los ojos.
 */
const CARD_W = 0.36;
const CARD_SIDE = (24 * Math.PI) / 180;
const CARD_STEP = (26 * Math.PI) / 180;
const CARD_AHEAD = 0.85;
const CARD_DROP = 0.05;
/** Entrada con rebote [ms] y suavizado del corrimiento entre lugares [1/s]. */
const CARD_IN_MS = 420;
const CARD_RATE = 6;
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
 * Sesión WebXR (D-19). Controles primero (las manos siguen andando): rayo en los dos controles
 * (apunta el último que se usó o el que está sobre un panel), gatillo = elegir, stick izquierdo =
 * volar, stick derecho = giro por saltos y, a escala real, adelante = arco de teletransporte (al
 * soltar se salta), agarre = mover un panel o la maqueta (a escala real, teletransporte por el rayo
 * o, con el stick derecho, subir y bajar), A = hablar, B/Y mantenido = salir. Con manos: pellizco
 * corto o señalar y sostener (anillo) = elegir; pellizcar y mover una mano = arrastrar el mundo;
 * pellizcar con las dos = girar, escalar (a escala real, acercar/alejar) y arrastrar. Menú en la muñeca izquierda, ficha del taladro en la
 * mano derecha, panel de voz, tarjetas y HUD de la secuencia frente a la cabeza. Los traslados
 * (`goTo`, zambullida desde la maqueta, saltos) son animados con viñeta o fundido. El modelo no se
 * copia ni se transforma: se cuelga de un grupo cuya matriz es la ubicación (`placement.ts`).
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
  /** Ubicación que se ve: persigue a `placement` con suavizado (null = todavía ninguna). */
  private shown: XrPlacement | null = null;
  /** El próximo cuadro salta sin suavizar (teletransporte, inicio). */
  private snapNext = true;
  /**
   * Seguimiento del pintado en vivo (maqueta): la maqueta vuela para traer al frente el punto que
   * se dibuja. `home` es la ubicación de antes, a la que vuelve al terminar; tomarla con la mano
   * suelta el seguimiento.
   */
  private tracking: { point: Vec3; size: number } | null = null;
  private trackHome: XrPlacement | null = null;
  private trackSince = 0;
  private trackHeld = false;
  /** Lugar frente al usuario donde se trae lo que se dibuja (fijo durante el seguimiento). */
  private trackSpot: Vec3 = { x: 0, y: 0, z: 0 };
  /** Dos manos pellizcando: posiciones del cuadro anterior. */
  private twoHandPrev: { a: Vec3; b: Vec3 } | null = null;
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
  /** Tarjetas de reporte: panel, cuándo entró (o se actualizó) y su posición suavizada. */
  private readonly cards = new Map<
    string,
    { panel: XrPanel; t0: number; pos: Vector3 | null; key: string }
  >();
  private cardOrder: string[] = [];
  private cardsYaw: number | null = null;
  private readonly cardSpot = new Object3D();
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
  /** Cielo y piso de grilla en VR inmersiva (sin habitación). */
  private readonly environment = new XrEnvironment();
  private hitSource: XRHitTestSource | null = null;
  private teleporting = false;
  /** Maqueta tomada con un control (agarre): sigue su posición y su giro. */
  private grab: {
    hand: Hand;
    from: { pos: Vec3; yaw: number };
    p0: XrPlacement;
    /** A escala real el arrastre es por cuadro (la ganancia cambia con la altura): mano anterior. */
    last?: Vec3;
  } | null = null;
  /** Pellizco de la derecha que todavía puede ser clic o arrastre (manos). */
  private pendingGrab: { hand: Hand; from: Vec3; p0: XrPlacement } | null = null;
  private readonly jointGeometry = new SphereGeometry(JOINT_RADIUS, 8, 6);
  private readonly jointMaterial = new MeshBasicMaterial({ color: 0x9fb4ff });
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
  /**
   * Traslado animado en curso (ir a un punto de vista, zambullida desde la maqueta, salto del
   * teletransporte): la ubicación que se ve va de `from` a `to` alrededor de `pivot` (escala en
   * forma geométrica), con `tunnel` de viñeta. Si el usuario se mueve, se cancela.
   */
  private flight: {
    from: XrPlacement;
    to: XrPlacement;
    pivot: Vec3;
    t: number;
    dur: number;
    tunnel: number;
  } | null = null;
  /** Fundido a negro de un salto largo: la vista se congela, se funde, salta y vuelve. */
  private fade: { t: number; switched: boolean } | null = null;
  private tunnel = 0;
  private readonly vignette = new XrVignette();
  /** Control con el que se apunta (el último que se usó); con manos, la derecha. */
  private pointer: Hand | null = null;
  /** Arco del teletransporte (stick derecho adelante, a escala real) y dónde cae. */
  private arcOn = false;
  private arcHit: Vec3 | null = null;
  private readonly arcLine: Line<BufferGeometry, LineBasicMaterial>;
  /** Desde cuándo se mantiene B/Y (salir) y su anillo. */
  private exitSince: number | null = null;
  private exiting = false;
  private readonly exitRing = new XrRing(0xef4444);
  /** Clic por permanencia del rayo de una mano sobre un botón. */
  private dwell: { id: string; t0: number; done: boolean; dir: Vector3 } | null = null;
  private readonly dwellRing = new XrRing(0x60a5fa);
  /** Avance de la secuencia de disparo (tiempo, taladros) arriba de la vista. */
  private readonly hud = new XrPanel(0.36);
  private hudYaw: number | null = null;
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
    this.arcLine = new Line(
      new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute(new Float32Array(ARC_POINTS * 3), 3),
      ),
      new LineBasicMaterial({ color: 0x22d3ee, depthTest: false, transparent: true }),
    );
    this.arcLine.frustumCulled = false;
    this.arcLine.renderOrder = 9;
    this.arcLine.visible = false;
    this.world.add(this.beam, this.marker, this.arcLine, this.avatars.root);
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
      this.hud.mesh,
      this.backdrop,
      this.environment.root,
      this.vignette.mesh,
      this.exitRing.root,
      this.dwellRing.root,
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

  /** Avance de la secuencia de disparo arriba de la vista; vacío lo oculta. */
  setHud(rows: readonly XrLine[]): void {
    this.hud.setRows(rows);
  }

  /** Escenario, escala, cabeza (render) y rumbo de la mirada (azimut [°]). */
  state(): XrState {
    const cam = this.host.renderer.xr.getCamera();
    const fwd = dirToModel(
      this.placement,
      v3(new Vector3(0, 0, -1).transformDirection(cam.matrixWorld)),
    );
    return {
      view: this.currentView,
      scale: this.placement.scale,
      head: this.headModel(),
      headingDeg: Math.hypot(fwd.x, fwd.y) < 1e-9 ? 0 : azimuthOf({ x: fwd.x, y: fwd.y }),
    };
  }

  /**
   * Lleva al usuario a escala real, de pie sobre el terreno (los ojos a `eyeHeight` sobre la cota
   * del terreno en el lugar), a `standDistance` del objetivo (render) y mirándolo. El mundo gira
   * para que el objetivo quede adelante de la mirada actual (no hay que darse vuelta). Desde la
   * maqueta es una zambullida (escala en forma geométrica); a escala real, un vuelo corto con
   * viñeta o, si el salto es largo, un fundido a negro.
   */
  goTo(target: Vec3, opts: XrGoToOptions = {}): XrGoToResult {
    const cam = this.host.renderer.xr.getCamera();
    const headXr = v3(new Vector3().setFromMatrixPosition(cam.matrixWorld));
    const fwdXr = v3(new Vector3(0, 0, -1).transformDirection(cam.matrixWorld));
    const head = toModel(this.placement, headXr);
    const fm = dirToModel(this.placement, fwdXr);
    const fallback = Math.hypot(fm.x, fm.y) < 1e-9 ? 0 : azimuthOf({ x: fm.x, y: fm.y });
    const { stand, yawDeg } = standPoint(
      target,
      Math.max(0, opts.standDistance ?? 0),
      opts.yawDeg,
      head,
      fallback,
    );
    const ground = this.host.height(stand.x, stand.y) ?? target.z;
    const eye = { x: stand.x, y: stand.y, z: ground + (opts.eyeHeight ?? EYE_HEIGHT) };
    const look = opts.lookAt ?? target;
    let dir = { x: look.x - eye.x, y: look.y - eye.y };
    if (Math.hypot(dir.x, dir.y) < 1e-3) dir = dirOf(yawDeg);
    const to = standPlacement(eye, dir, headXr, headingOf(fwdXr));
    this.moveTo(to, eye, opts.animate ?? true);
    return { eye, yawDeg: azimuthOf(dir) };
  }

  /**
   * Cambia de escenario. A escala real se empieza en el aire al Sur de los taladros; las maquetas,
   * frente al usuario a la altura de una mesa. Sobre la mesa real, además, se busca una mesa
   * detectada por el visor para apoyarla sola.
   */
  setView(view: XrView): void {
    // Un cambio de vista manda sobre el seguimiento del dibujo.
    this.tracking = null;
    this.trackHome = null;
    this.grab = null;
    if (view === 'walk') {
      // A escala real se entra con una zambullida hasta el punto de partida: al Sur de los
      // taladros, en alto, mirando al Norte.
      const focus = this.host.focus();
      this.goTo(focus, { standDistance: START_BACK, yawDeg: 0, eyeHeight: START_UP });
      return;
    }
    const leaving = this.currentView === 'walk' && this.shown !== null;
    // Entre maquetas el cambio es un corte; al salir de la escala real, un fundido.
    if (view !== this.currentView) this.snapNext = true;
    this.currentView = view;
    this.flight = null;
    this.placement = placeAt(
      this.tableAnchor(),
      { x: 0, y: TABLE_HEIGHT, z: -TABLE_DISTANCE },
      0,
      TABLE_SIZE / this.modelSize(),
    );
    this.autoPlaceUntil = view === 'table' ? performance.now() + AUTO_PLACE_MS : null;
    if (leaving) {
      this.snapNext = false;
      this.fade = { t: 0, switched: false };
    } else this.applyBackground();
    this.resetAnchors();
    this.applyScale();
  }

  /** Vuelve a buscar una mesa del cuarto y apoya la maqueta en ella (escenario de la mesa). */
  placeOnTable(): void {
    if (this.currentView !== 'table') this.setView('table');
    else this.autoPlaceUntil = performance.now() + AUTO_PLACE_MS;
  }

  /** Acerca (> 1) o aleja (< 1) la maqueta sin mover su centro sobre la mesa. */
  zoom(factor: number): void {
    if (this.currentView === 'walk') {
      // A escala real, «acércate» es avanzar hacia la voladura (y «aléjate», retroceder).
      const b = this.host.bounds();
      const head = this.headModel();
      const c = b
        ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: b.maxZ }
        : this.host.focus();
      const d = Math.hypot(c.x - head.x, c.y - head.y);
      this.focus(c, Math.max(20, d / factor), true);
      return;
    }
    // Sobre la maqueta, el zoom es alrededor de lo que se tiene al frente.
    const spot = this.frontSpot();
    const m = toModel(this.placement, spot);
    this.placement = placeAt(m, spot, this.placement.yaw, this.placement.scale * factor);
    this.applyScale();
  }

  /**
   * Enfoca un punto del modelo (render): sobre la maqueta, la trae al frente y la acerca para que
   * `size` [m del modelo] ocupe ~70 cm (vuela suave); a escala real, te pone a esa distancia del
   * punto mirándolo, a la misma altura sobre el terreno (vuelo corto o fundido: `goTo`).
   * `keepDistance` usa `size` como distancia.
   */
  focus(point: Vec3, size: number, keepDistance = false): void {
    this.tracking = null;
    this.trackHome = null;
    if (this.currentView !== 'walk') {
      const spot = this.frontSpot();
      const scale = FOCUS_SPAN / Math.max(1, size);
      this.placement = placeAt(point, spot, this.placement.yaw, scale);
      this.autoPlaceUntil = null;
      this.applyScale();
      return;
    }
    const head = this.headModel();
    const g = this.host.height(head.x, head.y);
    const above = g === null ? EYE_HEIGHT : Math.max(EYE_HEIGHT, head.z - g);
    const dist = keepDistance ? size : Math.max(15, size * 0.8);
    this.goTo(point, { standDistance: dist, eyeHeight: above });
  }

  /**
   * Pasa a la ubicación `to` (escala real): animada desde la maqueta (zambullida alrededor de
   * `pivot`, los ojos de llegada) o a escala real (vuelo corto, o fundido si es largo).
   */
  private moveTo(to: XrPlacement, pivot: Vec3, animate: boolean): void {
    const wasWalk = this.currentView === 'walk';
    this.tracking = null;
    this.trackHome = null;
    this.trackHeld = false;
    this.grab = null;
    this.pendingGrab = null;
    this.autoPlaceUntil = null;
    this.teleporting = false;
    this.currentView = 'walk';
    const from = this.shown;
    this.placement = to;
    this.flight = null;
    this.fade = null;
    if (!animate || !from) this.snapNext = true;
    else if (!wasWalk) this.flight = { from, to, pivot, t: 0, dur: DIVE_S, tunnel: TUNNEL * 0.6 };
    else {
      const cam = this.host.renderer.xr.getCamera();
      const head = toModel(from, v3(new Vector3().setFromMatrixPosition(cam.matrixWorld)));
      const dist = Math.hypot(pivot.x - head.x, pivot.y - head.y, pivot.z - head.z);
      if (dist > FADE_OVER_M) this.fade = { t: 0, switched: false };
      else {
        const dur = Math.min(1.6, Math.max(0.5, 0.4 + dist / 80));
        this.flight = { from, to, pivot, t: 0, dur, tunnel: TUNNEL };
      }
    }
    if (!this.fade) this.applyBackground();
    this.resetAnchors();
    this.applyScale();
  }

  /** Los paneles anclados a un rumbo (leyenda, voz, tarjetas, HUD) se reacomodan a la mirada. */
  private resetAnchors(): void {
    this.legendYaw = null;
    this.voiceYaw = null;
    this.cardsYaw = null;
    this.hudYaw = null;
  }

  /** Cabeza en coordenadas del modelo (render). */
  private headModel(): Vec3 {
    const cam = this.host.renderer.xr.getCamera();
    return toModel(this.placement, v3(new Vector3().setFromMatrixPosition(cam.matrixWorld)));
  }

  /** Lugar frente al usuario, a la altura de una mesa (donde se trae lo que se enfoca). */
  private frontSpot(): Vec3 {
    const cam = this.host.renderer.xr.getCamera();
    const head = new Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    return {
      x: head.x + fwd.x * FOCUS_AHEAD,
      y: head.y - FOCUS_DROP,
      z: head.z + fwd.z * FOCUS_AHEAD,
    };
  }

  /**
   * Sigue un punto del modelo (render) mientras el asistente dibuja: en la maqueta, la acerca y la
   * corre para dejar ese punto al centro, con un leve vaivén. `size` = tamaño de lo que se dibuja
   * [m del modelo]. null vuelve a la ubicación de antes. A escala real no hace nada.
   */
  track(point: Vec3 | null, size = 50): void {
    if (!point) {
      // Al terminar queda enfocado lo que se dibujó (no vuelve atrás: el resultado queda al frente).
      this.tracking = null;
      this.trackHome = null;
      this.trackHeld = false;
      return;
    }
    if (this.currentView === 'walk') return;
    if (!this.trackHome) {
      this.trackHome = this.placement;
      this.trackSpot = this.frontSpot();
      this.trackSince = performance.now();
    }
    this.tracking = { point, size };
  }

  /**
   * Tarjetas de reporte (la primera es la más nueva). Una tarjeta nueva o con datos nuevos entra con
   * rebote; las que salen de la lista se cierran. Se toman con pellizco (o agarre) y quedan donde
   * se dejan; su botón × emite la acción `card:close:<id>`.
   */
  setCards(list: readonly { id: string; rows: readonly XrLine[] }[]): void {
    const keep = new Set(list.map((c) => c.id));
    for (const [id, c] of this.cards) {
      if (keep.has(id)) continue;
      this.host.scene.remove(c.panel.mesh);
      this.pinned.delete(c.panel);
      if (this.moving?.panel === c.panel) this.moving = null;
      c.panel.dispose();
      this.cards.delete(id);
    }
    const now = performance.now();
    for (const item of list) {
      const key = JSON.stringify(item.rows);
      let c = this.cards.get(item.id);
      if (!c) {
        const panel = new XrPanel(CARD_W, true);
        this.host.scene.add(panel.mesh);
        c = { panel, t0: now, pos: null, key: '' };
        this.cards.set(item.id, c);
      } else if (c.key !== key) c.t0 = now;
      if (c.key !== key) c.panel.setRows(item.rows);
      c.key = key;
    }
    this.cardOrder = list.map((c) => c.id);
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
      return { p: toModel(this.shown ?? this.placement, v3(pos)), q: [m.x, m.y, m.z, m.w] };
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
    const walk = this.currentView === 'walk';
    this.updateExitHold(now, head, forward);

    // Vuelo: stick izquierdo en el plano. Stick derecho: en la maqueta sube y baja; a escala real,
    // adelante arma el arco del teletransporte y, con el agarre apretado, sube y baja.
    const lp = left?.source?.gamepad;
    const rp = right?.source?.gamepad;
    const rightPad = right && !isHand(right) ? rp : undefined;
    const squeezing = this.hands.some((h) => h.squeezing && !isHand(h));
    const ry = rp?.axes[3] ?? 0;
    const lift = !walk || squeezing ? ry : 0;
    // Con el agarre apretado, usar el stick para subir o bajar anula el teletransporte al soltar.
    if (walk && squeezing && axis(ry) !== 0) {
      this.teleporting = false;
      this.marker.visible = false;
    }
    const arcY = walk && rightPad && !squeezing ? ry : 0;
    if (!this.arcOn && arcY < -ARC_ON) this.arcOn = true;
    else if (this.arcOn && arcY > -ARC_OFF) {
      this.arcOn = false;
      if (this.arcHit) this.jumpTo(this.arcHit);
      this.arcHit = null;
    }
    const headModel = toModel(this.placement, v3(head));
    const ground = this.host.height(headModel.x, headModel.y);
    const above = headModel.z - (ground ?? this.host.focus().z);
    const speed = flySpeed(above, this.placement.scale);
    const v = flyVelocity(
      { x: lp?.axes[2] ?? 0, y: lp?.axes[3] ?? 0 },
      lift,
      headingOf(v3(forward)),
      speed,
    );
    if (v.x !== 0 || v.y !== 0 || v.z !== 0)
      this.placement = moveBy(this.placement, { x: v.x * dt, y: v.y * dt, z: v.z * dt });
    // Con el arco armado el stick no gira (en diagonal saltaría un giro sin querer).
    const snap = snapTurn(this.snapArmed, this.arcOn ? 0 : (rp?.axes[2] ?? 0));
    this.snapArmed = snap.armed;
    if (snap.angle !== 0) {
      this.placement = turnAbout(this.placement, v3(head), snap.angle);
      // El giro por pasos es instantáneo a propósito (girar suave marea).
      if (walk) this.snapNext = true;
    }
    if (walk) this.keepAboveGround(v3(head));
    this.steadyHands(dt);
    this.updateHands(head, above);
    const pend = this.pendingGrab;
    if (pend && !this.grab && pend.hand.steady) {
      const at = pend.hand.steady;
      const moved = Math.hypot(at.x - pend.from.x, at.y - pend.from.y, at.z - pend.from.z);
      if (moved > DRAG_START_M && !this.teleporting) {
        pend.hand.dragged = true;
        this.grab = { hand: pend.hand, from: { pos: pend.from, yaw: 0 }, p0: pend.p0 };
        this.autoPlaceUntil = null;
        this.pendingGrab = null;
      }
    }
    if (this.grab) {
      const g = this.grab;
      const pose = this.gripPose(g.hand);
      if (walk) {
        // A escala real se arrastra el mundo en 3D (también arriba y abajo) con ganancia según la
        // altura: tomar el terreno y tirar hacia uno acerca, hacia abajo sube.
        const prev = g.last ?? g.from.pos;
        const k = walkDragGain(above);
        this.placement = moveBy(this.placement, {
          x: -(pose.pos.x - prev.x) * k,
          y: -(pose.pos.y - prev.y) * k,
          z: -(pose.pos.z - prev.z) * k,
        });
        g.last = pose.pos;
      } else this.placement = dragPlacement(g.p0, g.from, pose);
    }
    if (this.autoPlaceUntil !== null) this.tryAutoPlace(v3(head));
    if (this.grab || this.twoHandPrev) this.trackHeld = this.tracking !== null;
    this.applyTracking(now);
    const gesture =
      this.grab !== null || this.twoHandPrev !== null || v.x !== 0 || v.y !== 0 || v.z !== 0;
    this.advanceMotion(dt, gesture ? FOLLOW_RATE : FLIGHT_RATE, head);
    this.applyPlacement();
    this.vignette.set(this.tunnel, this.fadeAmount(), head, cam.matrixWorld);

    this.backdrop.position.copy(head);
    this.environment.follow(head);
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
    this.placeHud(head, forward);
    this.placeCards(head, forward, dt, now);
    this.menu.mesh.updateMatrixWorld();
    this.voice.mesh.updateMatrixWorld();
    this.legend.mesh.updateMatrixWorld();
    const pointer = this.choosePointer();
    this.updateRay(pointer);
    this.updateOtherRays(pointer);
    this.updateArc(right);
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
    const joints = renderer.xr.getHand(i);
    const hand: Hand = {
      ray,
      grip,
      joints,
      source: null,
      line,
      body,
      pinching: false,
      pinchSince: 0,
      steady: null,
      dragged: false,
      squeezing: false,
    };
    this.hands.push(hand);
    ray.addEventListener('connected', (e) => {
      hand.source = e.data;
      body.visible = !e.data.hand;
      if (this.mode === 'ar' && e.data.handedness !== 'left') this.requestHitTest(e.data);
    });
    ray.addEventListener('disconnected', () => {
      hand.source = null;
      hand.pinching = false;
      hand.squeezing = false;
      hand.steady = null;
    });
    ray.addEventListener('select', () => {
      // Al soltar un slider no hay clic (select llega antes que selectend). Con manos, un pellizco
      // que arrastró el mundo o pellizcar un panel fuera de sus botones (moverlo) no es clic.
      if (this.teleporting && isHand(hand)) return;
      if (this.moving?.hand === hand || hand.dragged) return;
      if (this.isPointer(hand) && !this.menu.isDragging) this.onSelect();
    });
    // Gatillo o pellizco apretado sobre un slider: se arrastra hasta soltarlo.
    ray.addEventListener('selectstart', () => {
      hand.pinching = true;
      hand.pinchSince = performance.now();
      // El control con el que se aprieta pasa a ser el que apunta (cualquiera de los dos).
      this.setPointer(hand);
      // Solo manos: pellizcar un panel flotante (voz, leyenda, tarjetas) fuera de sus botones lo
      // toma; sigue a la mano hasta soltar y queda ahí (con control es el agarre).
      if (isHand(hand) && hand === this.hand('right') && this.rayPanel && !this.panelHover) {
        this.moving = { panel: this.rayPanel.panel, hand, dist: this.rayPanel.dist };
        return;
      }
      hand.dragged = false;
      // Manos: pellizcar fuera de los botones toma la maqueta (a escala real, el terreno). La
      // izquierda la toma al instante; la derecha, solo si se mueve (si no, es clic).
      if (isHand(hand) && hand === this.hand('right') && !this.menuHover && !this.panelHover) {
        this.pendingGrab = {
          hand,
          from: this.gripPose(hand).pos,
          p0: this.placement,
        };
      }
      if (isHand(hand) && hand === this.hand('left')) {
        this.grab = { hand, from: this.gripPose(hand), p0: this.placement };
        this.autoPlaceUntil = null;
      }
      if (!this.isPointer(hand) || !this.menuHover || !this.menu.beginDrag()) return;
      this.pulse(hand);
      this.dragMenu(hand);
    });
    ray.addEventListener('selectend', () => {
      hand.pinching = false;
      this.menu.endDrag();
      if (this.pendingGrab?.hand === hand) this.pendingGrab = null;
      if (isHand(hand) && this.moving?.hand === hand) {
        this.moving = null;
        return;
      }
      if (isHand(hand)) {
        if (this.grab?.hand === hand) this.grab = null;
      }
    });
    // Agarre: sobre un panel flotante, moverlo; a escala real, teletransporte por el rayo al
    // soltar (o, si mientras tanto se usa el stick derecho, subir y bajar); con una maqueta,
    // tomarla y moverla.
    ray.addEventListener('squeezestart', () => {
      hand.squeezing = true;
      this.setPointer(hand);
      if (this.isPointer(hand) && this.rayPanel) {
        this.moving = { panel: this.rayPanel.panel, hand, dist: this.rayPanel.dist };
        this.pulse(hand);
      } else if (this.currentView !== 'walk') {
        this.grab = { hand, from: this.gripPose(hand), p0: this.placement };
        this.autoPlaceUntil = null;
      } else if (this.isPointer(hand)) this.teleporting = true;
    });
    ray.addEventListener('squeezeend', () => {
      hand.squeezing = false;
      if (this.moving?.hand === hand) {
        this.moving = null;
        return;
      }
      if (this.grab?.hand === hand) this.grab = null;
      if (this.isPointer(hand)) this.finishTeleport();
    });
    scene.add(ray, grip, joints);
  }

  /**
   * Manos: se dibujan sus articulaciones. Dos manos pellizcando (o dos controles con el agarre)
   * toman el mundo como un mapa: girar el segmento entre ellas gira, separarlas o juntarlas escala
   * (a escala real, acerca o aleja) y correrlas lo arrastra. Al soltar una, la otra sigue
   * arrastrando sin saltos.
   */
  private updateHands(head: Vector3, above: number): void {
    for (const h of this.hands) {
      if (!isHand(h)) continue;
      for (const joint of Object.values(h.joints.joints)) {
        if (joint.children.length === 0)
          joint.add(new Mesh(this.jointGeometry, this.jointMaterial));
      }
    }
    const left = this.hand('left');
    const right = this.hand('right');
    const held = (h: Hand | undefined): h is Hand =>
      !!h?.steady && (isHand(h) ? h.pinching : h.squeezing);
    const walk = this.currentView === 'walk';
    if (
      !held(left) ||
      !held(right) ||
      this.menuHover !== null ||
      this.moving !== null ||
      this.menu.isDragging
    ) {
      const prev = this.twoHandPrev;
      this.twoHandPrev = null;
      if (prev) {
        // Se soltó una: la que sigue apretada continúa el arrastre desde donde quedó.
        const still = held(left) ? left : held(right) ? right : null;
        if (still && (isHand(still) || !walk)) {
          still.dragged = true;
          this.grab = { hand: still, from: this.gripPose(still), p0: this.placement };
        }
      }
      return;
    }
    // Con dos manos no hay teletransporte ni arrastre de una sola.
    this.grab = null;
    this.pendingGrab = null;
    this.teleporting = false;
    this.marker.visible = false;
    left.dragged = true;
    right.dragged = true;
    this.autoPlaceUntil = null;
    if (!left.steady || !right.steady) return;
    const a = v3(left.steady);
    const b = v3(right.steady);
    const prev = this.twoHandPrev;
    if (prev) {
      this.placement = walk
        ? walkTwoHandPlacement(
            this.placement,
            v3(head),
            prev.a,
            prev.b,
            a,
            b,
            walkDragGain(above),
            Math.max(20, above) * WALK_ZOOM_PER_M,
          )
        : twoHandPlacement(this.placement, prev.a, prev.b, a, b);
      if (!walk) this.applyScale();
    }
    this.twoHandPrev = { a, b };
  }

  /** Ubicación objetivo mientras se sigue el dibujo (la maqueta vuela con el suavizado lento). */
  private applyTracking(now: number): void {
    const tr = this.tracking;
    const home = this.trackHome;
    if (!tr || !home || this.trackHeld || this.currentView === 'walk') return;
    // Lo que se dibuja ocupa ~55 cm frente al usuario, con un leve vaivén de presentación.
    const scale = TRACK_SPAN / Math.max(1, tr.size);
    const t = (now - this.trackSince) / 1000;
    const yaw = home.yaw + TRACK_SWAY * Math.sin(t * 0.55);
    this.placement = placeAt(tr.point, this.trackSpot, yaw, scale);
  }

  /** Filtra el temblor del seguimiento de manos (y controles) antes de usarlo para mover. */
  private steadyHands(dt: number): void {
    const k = 1 - Math.exp(-dt / HAND_STEADY_S);
    for (const h of this.hands) {
      if (!h.source) continue;
      const p = this.handPoint(h);
      if (!p) continue;
      if (!h.steady) h.steady = p;
      else h.steady.lerp(p, k);
    }
  }

  /**
   * Punto de la mano para arrastrar: con seguimiento de manos, el punto del pellizco (entre las
   * puntas del pulgar y el índice: el «grip» de una mano casi no se actualiza en el Quest); con
   * control, su empuñadura.
   */
  private handPoint(h: Hand): Vector3 | null {
    if (isHand(h)) {
      const joints = h.joints.joints as Partial<Record<string, Object3D>>;
      const thumb = joints['thumb-tip'];
      const index = joints['index-finger-tip'];
      if (thumb?.visible !== false && index?.visible !== false && thumb && index) {
        const a = new Vector3().setFromMatrixPosition(thumb.matrixWorld);
        const b = new Vector3().setFromMatrixPosition(index.matrixWorld);
        if (a.lengthSq() > 0 || b.lengthSq() > 0) return a.add(b).multiplyScalar(0.5);
      }
      return new Vector3().setFromMatrixPosition(h.ray.matrixWorld);
    }
    return new Vector3().setFromMatrixPosition(h.grip.matrixWorld);
  }

  /**
   * La maqueta que se ve persigue su ubicación con suavizado exponencial, alrededor de la cabeza a
   * escala real (los giros no la desplazan) o del centro de la maqueta.
   */
  private smoothPlacement(dt: number, rate: number, head: Vector3): void {
    const target = this.placement;
    const from = this.shown;
    if (!from || this.snapNext) {
      this.shown = target;
      this.snapNext = false;
      return;
    }
    if (samePlacement(from, target)) {
      this.shown = target;
      return;
    }
    const pivot = this.currentView === 'walk' ? toModel(target, v3(head)) : this.tableAnchor();
    this.shown = blendPlacement(from, target, pivot, 1 - Math.exp(-rate * dt));
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

  /** HUD de la secuencia: al frente, apenas arriba de la mirada (anclado como la leyenda). */
  private placeHud(head: Vector3, forward: Vector3): void {
    const mesh = this.hud.mesh;
    mesh.visible = this.hud.hasRows;
    if (!mesh.visible) {
      this.hudYaw = null;
      return;
    }
    this.hudYaw = anchorYaw(this.hudYaw, forward);
    placeAround(mesh, head, this.hudYaw, HUD_AHEAD, -HUD_RISE);
  }

  /**
   * Tarjetas en arco a la derecha (ancladas a un rumbo como la leyenda), corriéndose suave cuando
   * entra una nueva; entran creciendo con un rebote corto. Las que se dejaron en un lugar, quedan.
   */
  private placeCards(head: Vector3, forward: Vector3, dt: number, now: number): void {
    if (this.cards.size === 0) {
      this.cardsYaw = null;
      return;
    }
    this.cardsYaw = anchorYaw(this.cardsYaw, forward);
    const k = 1 - Math.exp(-CARD_RATE * dt);
    let slot = 0;
    for (const id of this.cardOrder) {
      const c = this.cards.get(id);
      if (!c) continue;
      const mesh = c.panel.mesh;
      mesh.visible = c.panel.hasRows;
      const e = Math.min(1, (now - c.t0) / CARD_IN_MS);
      const bounce = 1 + 0.1 * Math.sin(Math.PI * e) * (1 - e);
      c.panel.setAppear(Math.max(0.02, 1 - Math.pow(1 - e, 3)));
      mesh.scale.multiplyScalar(bounce);
      if (this.placePinned(c.panel, head)) continue;
      placeAround(
        this.cardSpot,
        head,
        this.cardsYaw - CARD_SIDE - slot * CARD_STEP,
        CARD_AHEAD,
        CARD_DROP,
      );
      slot++;
      if (!c.pos) c.pos = this.cardSpot.position.clone();
      else c.pos.lerp(this.cardSpot.position, k);
      mesh.position.copy(c.pos);
      mesh.lookAt(head);
      mesh.updateMatrixWorld();
    }
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
    const pointer = this.pointerHand();
    if (this.menuHover) {
      if (pointer) this.pulse(pointer);
      this.host.onAction(this.menuHover);
      return;
    }
    if (this.panelHover) {
      if (pointer) this.pulse(pointer);
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
    this.jumpTo(this.groundHit);
  }

  /**
   * Salto a un punto del terreno (modelo): ese punto queda bajo los pies (piso del cuarto). Es un
   * vuelo muy corto con viñeta (deslizar el mundo bajo los pies sin aviso marea).
   */
  private jumpTo(ground: Vec3): void {
    const cam = this.host.renderer.xr.getCamera();
    const head = new Vector3().setFromMatrixPosition(cam.matrixWorld);
    const target = toXr(this.placement, ground);
    const to = moveBy(this.placement, { x: target.x - head.x, y: target.y, z: target.z - head.z });
    const from = this.shown ?? this.placement;
    this.placement = to;
    this.flight = { from, to, pivot: ground, t: 0, dur: JUMP_S, tunnel: TUNNEL };
    this.applyPlacement();
  }

  /**
   * Mueve la ubicación que se ve: fundido (congelada hasta el negro, luego salta), traslado
   * animado, o el suavizado exponencial de siempre. También lleva la viñeta.
   */
  private advanceMotion(dt: number, rate: number, head: Vector3): void {
    const fade = this.fade;
    if (fade) {
      fade.t += dt;
      if (!fade.switched && fade.t >= FADE_OUT_S) {
        fade.switched = true;
        this.snapNext = true;
        this.applyBackground();
      }
      if (fade.t >= FADE_OUT_S + FADE_IN_S) this.fade = null;
    }
    // Si el usuario se movió (stick, agarre, giro), el traslado se suelta y sigue el suavizado.
    if (this.flight && this.placement !== this.flight.to) this.flight = null;
    let tunnel = 0;
    const f = this.flight;
    if (fade && !fade.switched) {
      // Se funde a negro con la vista quieta.
    } else if (f) {
      f.t += dt;
      this.shown = blendPlacement(f.from, f.to, f.pivot, easeInOut(f.t / f.dur));
      tunnel = f.tunnel;
      // En la zambullida las etiquetas crecen con la maqueta (si no, saltarían a su tamaño real).
      if (f.from.scale !== f.to.scale)
        this.host.setLabelSize(Math.max(0.005, LABEL_SIZE * Math.min(1, this.shown.scale)));
      if (f.t >= f.dur) {
        this.shown = f.to;
        this.flight = null;
      }
    } else this.smoothPlacement(dt, rate, head);
    this.tunnel += (tunnel - this.tunnel) * (1 - Math.exp(-TUNNEL_RATE * dt));
    if (this.tunnel < 0.004) this.tunnel = 0;
  }

  /** Fundido a negro (0–1) del salto largo en curso. */
  private fadeAmount(): number {
    const f = this.fade;
    if (!f) return 0;
    return f.switched ? 1 - (f.t - FADE_OUT_S) / FADE_IN_S : f.t / FADE_OUT_S;
  }

  /** B/Y mantenido (cualquier control) sale del visor; un anillo rojo frente a la vista se llena. */
  private updateExitHold(now: number, head: Vector3, forward: Vector3): void {
    const held = this.hands.some((h) => {
      // Los controles sin B/Y (manos) no lo traen: el índice puede faltar.
      const b: GamepadButton | undefined = h.source?.gamepad?.buttons[BUTTON_B];
      return !isHand(h) && (b?.pressed ?? false);
    });
    if (!held || this.exiting) {
      this.exitSince = null;
      this.exitRing.hide();
      return;
    }
    this.exitSince ??= now;
    const k = (now - this.exitSince) / EXIT_HOLD_MS;
    this.exitRing.show(k, head.clone().addScaledVector(forward, 0.5), head, 0.035);
    if (k < 1) return;
    this.exiting = true;
    this.exitRing.hide();
    this.end();
  }

  /** Control que apunta: el último que se usó; con manos, la derecha. */
  private pointerHand(): Hand | undefined {
    const p = this.pointer;
    return p?.source && !isHand(p) ? p : this.hand('right');
  }

  private isPointer(hand: Hand): boolean {
    return hand === this.pointerHand();
  }

  /** El control que se aprieta pasa a apuntar; su rayo se recalcula ya (para este mismo gesto). */
  private setPointer(hand: Hand): void {
    if (isHand(hand) || !hand.source || this.pointerHand() === hand) return;
    this.pointer = hand;
    this.updateRay(hand);
  }

  /**
   * Con dos controles, apunta el que está sobre un panel si el otro no lo está (como FleetView:
   * se elige un botón con cualquiera de las dos manos sin apretar antes).
   */
  private choosePointer(): Hand | undefined {
    const cur = this.pointerHand();
    if (!cur || isHand(cur) || this.moving || this.grab || this.menu.isDragging) return cur;
    const other = this.hands.find((h) => h !== cur && h.source && !isHand(h));
    if (other && this.panelDistance(other) !== null && this.panelDistance(cur) === null)
      this.pointer = other;
    return this.pointerHand();
  }

  /** Paneles que captan el rayo (el que se está moviendo no). */
  private rayPanels(): XrPanel[] {
    const cardPanels = [...this.cards.values()].map((c) => c.panel);
    return [this.menu, this.voice, this.legend, ...cardPanels].filter(
      (p) => p.mesh.visible && p !== this.moving?.panel,
    );
  }

  /** Distancia del rayo de un control al panel más cercano, o null si no apunta a ninguno. */
  private panelDistance(hand: Hand): number | null {
    const o = new Vector3().setFromMatrixPosition(hand.ray.matrixWorld);
    const d = new Vector3(0, 0, -1).transformDirection(hand.ray.matrixWorld);
    this.raycaster.set(o, d);
    return (
      this.raycaster.intersectObjects(this.rayPanels().map((p) => p.mesh))[0]?.distance ?? null
    );
  }

  /** El control que no apunta muestra un rayo corto y tenue (se sabe que también sirve). */
  private updateOtherRays(pointer: Hand | undefined): void {
    for (const h of this.hands) {
      if (h === pointer) {
        h.line.material.color.setHex(0xffffff);
        continue;
      }
      const show = !!h.source && !isHand(h);
      h.line.visible = show;
      if (!show) continue;
      h.line.scale.set(1, 1, 1.2);
      h.line.material.color.setHex(0x64748b);
    }
  }

  /** Arco del teletransporte desde el control derecho; azul si cae en el terreno, rojo si no. */
  private updateArc(hand: Hand | undefined): void {
    if (!this.arcOn || !hand?.source || this.currentView !== 'walk') {
      this.arcLine.visible = false;
      this.arcHit = null;
      return;
    }
    const shown = this.shown ?? this.placement;
    const o = toModel(shown, v3(new Vector3().setFromMatrixPosition(hand.ray.matrixWorld)));
    const d = dirToModel(shown, v3(new Vector3(0, 0, -1).transformDirection(hand.ray.matrixWorld)));
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    const { points, hit } = teleportArc(
      o,
      { x: d.x / len, y: d.y / len, z: d.z / len },
      this.host.height,
    );
    const attr = this.arcLine.geometry.getAttribute('position');
    const n = Math.min(points.length, ARC_POINTS);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (p) attr.setXYZ(i, p.x, p.y, p.z + 0.05);
    }
    attr.needsUpdate = true;
    this.arcLine.geometry.setDrawRange(0, n);
    this.arcLine.material.color.setHex(hit ? 0x22d3ee : 0xef4444);
    this.arcLine.visible = true;
    hand.line.visible = false;
    this.arcHit = hit;
    this.marker.visible = hit !== null;
    if (hit) this.marker.position.set(hit.x, hit.y, hit.z + 0.1);
  }

  /**
   * Manos: mantener el rayo quieto sobre un botón lo elige (un anillo se llena en la punta). Tras
   * elegir hay que sacar el rayo (o moverlo) para volver a elegir; los sliders no cuentan.
   */
  private updateDwell(hand: Hand, id: string | null, slider: boolean, point: Vector3 | null): void {
    const now = performance.now();
    const d = new Vector3(0, 0, -1).transformDirection(hand.ray.matrixWorld);
    const key = isHand(hand) && !hand.pinching && !slider && point ? id : null;
    const prev = this.dwell;
    if (key !== prev?.id) {
      // Si el panel cambió bajo un rayo quieto (otro botón donde se eligió), no se repite.
      const still = prev?.done === true && prev.dir.angleTo(d) < DWELL_REARM;
      this.dwell = key === null ? null : { id: key, t0: now, done: still, dir: d };
    }
    const w = this.dwell;
    if (!w || w.done || !point) {
      this.dwellRing.hide();
      return;
    }
    const k = (now - w.t0) / (w.id === 'exit' ? DWELL_EXIT_MS : DWELL_MS);
    const cam = this.host.renderer.xr.getCamera();
    const head = new Vector3().setFromMatrixPosition(cam.matrixWorld);
    // El anillo aparece tras un instante: pasar el rayo por encima no lo muestra.
    if (k > 0.15)
      this.dwellRing.show(k, point, head, 0.016 * (0.8 + point.distanceTo(head) * 0.35));
    else this.dwellRing.hide();
    if (k < 1) return;
    w.done = true;
    w.dir = d;
    this.dwellRing.hide();
    this.pulse(hand);
    this.host.onAction(w.id);
  }

  /**
   * Rayo del control que apunta (o de la mano derecha): primero los paneles, después el terreno
   * (o el modelo de la maqueta).
   */
  private updateRay(hand: Hand | undefined): void {
    this.groundHit = null;
    this.groundDist = Infinity;
    const cardPanels = [...this.cards.values()].map((c) => c.panel);
    if (!hand?.source) {
      this.menuHover = this.menu.hover(0, -1);
      this.panelHover = null;
      this.rayPanel = null;
      for (const p of [this.voice, this.legend, ...cardPanels]) p.hover(0, -1);
      this.dwell = null;
      this.dwellRing.hide();
      return;
    }
    hand.line.visible = true;
    const o = new Vector3().setFromMatrixPosition(hand.ray.matrixWorld);
    const d = new Vector3(0, 0, -1).transformDirection(hand.ray.matrixWorld);
    this.raycaster.set(o, d);
    // El panel más cercano bajo el rayo: menú, voz o leyenda (el que se mueve no capta el rayo).
    const panels = this.rayPanels();
    const nearest = this.raycaster.intersectObjects(panels.map((p) => p.mesh))[0];
    const hit = (p: XrPanel) => (nearest?.object === p.mesh ? nearest : undefined);
    const menuHit = hit(this.menu);
    const prev = this.menuHover;
    const prevPanel = this.panelHover;
    this.menuHover = this.menu.hover(menuHit?.uv?.x ?? 0, menuHit?.uv?.y ?? -1);
    this.panelHover = null;
    this.rayPanel = null;
    for (const p of [this.voice, this.legend, ...cardPanels]) {
      const h = hit(p);
      const id = p.hover(h?.uv?.x ?? 0, h?.uv?.y ?? -1);
      if (h) {
        this.rayPanel = { panel: p, dist: h.distance };
        this.panelHover = id;
      }
    }
    if (this.menuHover !== null && this.menuHover !== prev) this.pulse(hand);
    if (this.panelHover !== null && this.panelHover !== prevPanel) this.pulse(hand);
    const hovered = this.menuHover ?? this.panelHover;
    const slider =
      this.menuHover !== null
        ? this.menu.hoveredSlider
        : (this.rayPanel?.panel.hoveredSlider ?? false);
    this.updateDwell(hand, hovered, slider, nearest?.point ?? null);
    if (this.menu.isDragging) this.dragMenu(hand);
    else this.dragValue = null;
    let length = nearest?.distance ?? RAY_LENGTH;
    if (!nearest) {
      const shown = this.shown ?? this.placement;
      const s = shown.scale;
      const om = toModel(shown, v3(o));
      const dm = dirToModel(shown, v3(d));
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
    const pos = hand.steady ?? new Vector3().setFromMatrixPosition(hand.grip.matrixWorld);
    // Con la mano solo se traslada: el giro de la muñeca tiembla y hacía girar la maqueta (para
    // girar están las dos manos). Con el control se sigue también su rumbo.
    if (isHand(hand)) return { pos: v3(pos), yaw: 0 };
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
    this.environment.set(this.mode === 'vr', this.currentView !== 'walk');
  }

  /** Centro de la maqueta: centro de la escena apoyado en su punto más bajo. */
  private tableAnchor(): Vec3 {
    const b = this.host.bounds();
    const f = this.host.focus();
    return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: b.minZ } : f;
  }

  private applyPlacement(): void {
    const p = this.shown ?? this.placement;
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
      scene.remove(h.ray, h.grip, h.joints);
      h.line.geometry.dispose();
    }
    this.hands.length = 0;
    this.menu.dispose();
    this.info.dispose();
    this.voice.dispose();
    this.legend.dispose();
    this.hint.dispose();
    this.hud.dispose();
    this.vignette.dispose();
    this.exitRing.dispose();
    this.dwellRing.dispose();
    this.arcLine.geometry.dispose();
    this.arcLine.material.dispose();
    this.flight = null;
    this.fade = null;
    for (const c of this.cards.values()) {
      scene.remove(c.panel.mesh);
      c.panel.dispose();
    }
    this.cards.clear();
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
      this.hud.mesh,
      this.backdrop,
      this.environment.root,
      this.vignette.mesh,
      this.exitRing.root,
      this.dwellRing.root,
    );
    this.environment.dispose();
    this.backdrop.geometry.dispose();
    this.backdrop.material.dispose();
    scene.background = this.saved.background;
    renderer.setClearAlpha(this.saved.clearAlpha);
    this.host.setLabelSize(0);
    this.session = null;
    this.host.onEnd();
  };
}
