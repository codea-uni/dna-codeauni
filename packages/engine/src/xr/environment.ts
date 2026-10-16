import {
  BackSide,
  CircleGeometry,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  type Vector3,
} from 'three';

/**
 * Entorno del visor en VR inmersiva (sin ver la habitación): un cielo en degradado con un brillo
 * suave en el horizonte (paleta CODEa UNI) y un piso de grilla tenue que se desvanece, para no
 * flotar en un vacío negro. El cielo sigue a la cabeza; el piso queda fijo en el cuarto (si se
 * moviera con la cabeza parecería una cinta). A escala real el piso es el terreno: se oculta.
 */
export class XrEnvironment {
  readonly root = new Group();
  private readonly sky: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly floor: Mesh<CircleGeometry, ShaderMaterial>;

  constructor() {
    this.sky = new Mesh(
      new SphereGeometry(400, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthTest: false,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            float y = vDir.y;
            vec3 top = vec3(0.020, 0.055, 0.090);
            vec3 horizon = vec3(0.085, 0.165, 0.265);
            vec3 below = vec3(0.030, 0.060, 0.090);
            vec3 c = y > 0.0 ? mix(horizon, top, pow(clamp(y, 0.0, 1.0), 0.55))
                             : mix(horizon, below, pow(clamp(-y, 0.0, 1.0), 0.4));
            // Brillo del horizonte con el azul de la marca.
            c += vec3(0.28, 0.41, 1.0) * 0.10 * exp(-abs(y) * 22.0);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    this.sky.renderOrder = -1001;
    this.sky.frustumCulled = false;

    this.floor = new Mesh(
      new CircleGeometry(7, 96).rotateX(-Math.PI / 2),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec2 vXZ;
          void main() {
            vXZ = position.xz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vXZ;
          void main() {
            vec2 g = abs(fract(vXZ / 0.5 - 0.5) - 0.5) / fwidth(vXZ / 0.5);
            float line = 1.0 - min(min(g.x, g.y), 1.0);
            float r = length(vXZ);
            float fade = 1.0 - smoothstep(1.5, 7.0, r);
            float ring = (1.0 - smoothstep(0.0, 0.02, abs(r - 1.2))) * 0.6;
            float a = (line * 0.22 + ring * 0.5) * fade;
            if (a <= 0.003) discard;
            gl_FragColor = vec4(vec3(0.36, 0.48, 1.0), a);
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    this.floor.renderOrder = -999;
    this.root.add(this.sky, this.floor);
    this.root.visible = false;
  }

  /** Visible en VR inmersiva; el piso solo con la maqueta (a escala real el piso es el terreno). */
  set(visible: boolean, floor: boolean): void {
    this.root.visible = visible;
    this.floor.visible = floor;
  }

  /** El cielo acompaña a la cabeza (nunca se llega a su borde). */
  follow(head: Vector3): void {
    this.sky.position.copy(head);
  }

  dispose(): void {
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
  }
}
