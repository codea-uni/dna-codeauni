import {
  BackSide,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  type Matrix4,
  type Vector3,
} from 'three';

/**
 * Viñeta de comodidad (D-19): durante un traslado automático (ir a un punto de vista, salto del
 * teletransporte) los bordes de la vista se oscurecen, y en los saltos largos la vista entera se
 * funde a negro y vuelve. Así el movimiento que el cuerpo no siente no marea. Es una esfera
 * pequeña alrededor de la cabeza, orientada con la mirada y dibujada encima de todo.
 */
export class XrVignette {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  /** Oscurecimiento de los bordes (0–1) y fundido total (0–1). */
  private readonly uTunnel = { value: 0 };
  private readonly uFade = { value: 0 };

  constructor() {
    this.mesh = new Mesh(
      new SphereGeometry(0.2, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: { uTunnel: this.uTunnel, uFade: this.uFade },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTunnel;
          uniform float uFade;
          varying vec3 vDir;
          void main() {
            // Ángulo desde el frente de la mirada (−Z local): centro libre, bordes oscuros.
            float ang = acos(clamp(-vDir.z, -1.0, 1.0));
            float edge = smoothstep(0.38, 0.9, ang);
            float a = max(uFade, uTunnel * edge);
            if (a <= 0.003) discard;
            gl_FragColor = vec4(0.008, 0.016, 0.03, a);
          }
        `,
      }),
    );
    this.mesh.renderOrder = 1000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Fija la viñeta y el fundido, y la acomoda a la cabeza (`view` = matriz de la cámara XR). */
  set(tunnel: number, fade: number, head: Vector3, view: Matrix4): void {
    this.uTunnel.value = Math.min(1, Math.max(0, tunnel));
    this.uFade.value = Math.min(1, Math.max(0, fade));
    const on = this.uTunnel.value > 0.003 || this.uFade.value > 0.003;
    this.mesh.visible = on;
    if (!on) return;
    this.mesh.position.copy(head);
    this.mesh.quaternion.setFromRotationMatrix(view);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const RING_SEGMENTS = 48;

/**
 * Anillo de progreso que se va llenando (clic por permanencia del rayo con las manos, salir del
 * visor manteniendo B/Y): un fondo tenue y el arco lleno hasta `k`.
 */
export class XrRing {
  readonly root = new Group();
  private readonly fill: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly back: Mesh<RingGeometry, MeshBasicMaterial>;

  constructor(color: number) {
    // Empieza arriba y se llena en sentido horario visto de frente.
    const geo = () =>
      new RingGeometry(0.7, 1, RING_SEGMENTS, 1).rotateZ(Math.PI / 2).scale(-1, 1, 1);
    this.back = new Mesh(
      geo(),
      new MeshBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.55,
        side: DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.fill = new Mesh(
      geo(),
      new MeshBasicMaterial({ color, depthTest: false, depthWrite: false, side: DoubleSide }),
    );
    this.back.renderOrder = 20;
    this.fill.renderOrder = 21;
    this.root.add(this.back, this.fill);
    this.root.visible = false;
  }

  /** Muestra el anillo lleno hasta `k` (0–1) de radio `radius` [m] en `at`, mirando a `head`. */
  show(k: number, at: Vector3, head: Vector3, radius: number): void {
    this.root.visible = true;
    this.fill.geometry.setDrawRange(0, Math.round(RING_SEGMENTS * Math.min(1, k)) * 6);
    this.root.position.copy(at);
    this.root.scale.setScalar(radius);
    this.root.lookAt(head);
  }

  hide(): void {
    this.root.visible = false;
  }

  dispose(): void {
    for (const m of [this.fill, this.back]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
