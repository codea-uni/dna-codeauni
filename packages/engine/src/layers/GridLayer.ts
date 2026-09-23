import { Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { COLORS } from './colors';

/**
 * Grilla adaptativa dibujada por shader sobre un plano que cubre la vista.
 * El paso se elige como potencia de 10 para que las líneas menores queden a ≥ 12 px.
 */
export class GridLayer {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  /** Paso actual de la grilla menor [m] (la mayor es 10×). */
  step = 10;

  constructor() {
    const material = new ShaderMaterial({
      uniforms: {
        uStep: { value: 10 },
        uMinor: { value: COLORS.gridMinor },
        uMajor: { value: COLORS.gridMajor },
      },
      vertexShader: /* glsl */ `
        varying vec2 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xy;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uStep;
        uniform vec3 uMinor;
        uniform vec3 uMajor;
        varying vec2 vWorld;
        float gridLine(vec2 p, float step) {
          vec2 g = abs(fract(p / step - 0.5) - 0.5) / fwidth(p / step);
          return 1.0 - clamp(min(g.x, g.y), 0.0, 1.0);
        }
        void main() {
          float minor = gridLine(vWorld, uStep);
          float major = gridLine(vWorld, uStep * 10.0);
          float a = max(minor * 0.6, major);
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(uMinor, uMajor, major), a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.position.z = -1;
  }

  /** Ajusta el plano a la vista (coordenadas de render) y el paso de la grilla. */
  update(
    centerX: number,
    centerY: number,
    widthM: number,
    heightM: number,
    metersPerPixel: number,
  ): void {
    this.mesh.position.set(centerX, centerY, -1);
    this.mesh.scale.set(widthM * 1.1, heightM * 1.1, 1);
    const step = Math.pow(10, Math.ceil(Math.log10(Math.max(1e-6, metersPerPixel * 12))));
    this.step = step;
    const uniform = this.mesh.material.uniforms.uStep;
    if (uniform) uniform.value = step;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
