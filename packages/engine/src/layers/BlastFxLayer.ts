import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  NormalBlending,
  PointLight,
  Points,
  ShaderMaterial,
  Vector3,
  type Texture,
} from 'three';

/**
 * Efectos de detonación de la reproducción de la secuencia (solo presentación, no cambia ningún
 * cálculo): fogonazo aditivo en la boca y a lo largo de la carga, una luz puntual breve que ilumina
 * las paredes del túnel, gases y polvo que salen hacia la cara libre (en subterránea avanzan por la
 * galería alejándose del frente, confinados; en banco suben y se dispersan) y una sacudida breve de
 * la cámara al primer disparo. Los tiempos de vida son de reloj real (la secuencia suele ir lenta).
 * Dos `Points` con un shader propio: miles de partículas en un solo dibujo. Apagado no cuesta nada.
 */

/** Detonación de un taladro en coordenadas de render (ya restado el origen). */
export interface BlastFxHole {
  collar: Vector3;
  /** Dirección boca → fondo (unitaria) y largo [m]. */
  axis: Vector3;
  length: number;
  /** Subterráneo: el humo sale del frente por la galería (−eje) y queda confinado. */
  underground: boolean;
}

/** Partículas de humo y polvo en total (anillo: las más viejas se reciclan). */
export const MAX_SMOKE = 2400;
const MAX_FLASH = 256;
/** Vida del fogonazo [s] y del humo [s]. */
const FLASH_LIFE = 0.13;
const SMOKE_LIFE_MIN = 2;
const SMOKE_LIFE_MAX = 4;
/** Radio de la galería en que queda confinado el humo subterráneo [m]. */
const TUNNEL_RADIUS = 2.2;
const SHAKE_TIME = 0.35;

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aColor.a > 0.0 ? aSize * uScale / max(0.1, -mv.z) : 0.0;
  vColor = aColor;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vColor;
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

/** Textura suave (gradiente radial) dibujada en un canvas; null fuera del navegador. */
function softTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** Número pseudoaleatorio determinista en [0, 1) (la animación se repite igual). */
function hash(k: number): number {
  let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

class Pool {
  readonly points: Points;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly size: Float32Array;
  readonly color: Float32Array;
  readonly born: Float32Array;
  readonly life: Float32Array;
  readonly kind: Uint8Array;
  /** Eje del túnel y punto del frente para el confinamiento (por partícula). */
  readonly anchor: Float32Array;
  readonly dir: Float32Array;
  next = 0;
  alive = 0;

  constructor(
    readonly n: number,
    material: ShaderMaterial,
  ) {
    this.pos = new Float32Array(3 * n);
    this.vel = new Float32Array(3 * n);
    this.size = new Float32Array(n);
    this.color = new Float32Array(4 * n);
    this.born = new Float32Array(n);
    this.life = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.anchor = new Float32Array(3 * n);
    this.dir = new Float32Array(3 * n);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new BufferAttribute(this.size, 1));
    geo.setAttribute('aColor', new BufferAttribute(this.color, 4));
    this.points = new Points(geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  take(): number {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    return i;
  }

  clear(): void {
    this.color.fill(0);
    this.life.fill(0);
    this.alive = 0;
    this.touch();
  }

  touch(): void {
    const g = this.points.geometry;
    for (const name of ['position', 'aSize', 'aColor'])
      (g.getAttribute(name) as BufferAttribute).needsUpdate = true;
  }
}

export class BlastFxLayer {
  readonly root = new Group();
  private enabled = false;
  private texture: Texture | null = null;
  private flash: Pool | null = null;
  private smoke: Pool | null = null;
  private light: PointLight | null = null;
  private lightBorn = -1;
  private shakeBorn = -1;
  private counter = 0;
  /** Partículas de humo por taladro (se ajusta a la cantidad de taladros). */
  private perHole = 24;

  /** Prende o apaga los efectos (apagado se liberan las partículas y la luz). */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) this.build();
    else this.dispose();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Cantidad de taladros de la secuencia: reparte el tope de partículas entre ellos. */
  setHoleCount(n: number): void {
    this.perHole = Math.max(6, Math.min(40, Math.floor(MAX_SMOKE / Math.max(1, n))));
  }

  private build(): void {
    this.texture ??= softTexture();
    const mat = (blending: typeof AdditiveBlending | typeof NormalBlending) =>
      new ShaderMaterial({
        uniforms: { uMap: { value: this.texture }, uScale: { value: 400 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending,
      });
    this.smoke = new Pool(MAX_SMOKE, mat(NormalBlending));
    this.flash = new Pool(MAX_FLASH, mat(AdditiveBlending));
    this.flash.points.renderOrder = 11;
    this.light = new PointLight(0xffb347, 0, 30, 2);
    this.root.add(this.smoke.points, this.flash.points, this.light);
  }

  /** Quita todo lo que está en el aire (al buscar hacia atrás o detener la secuencia). */
  clear(): void {
    this.flash?.clear();
    this.smoke?.clear();
    if (this.light) this.light.intensity = 0;
    this.lightBorn = -1;
    this.shakeBorn = -1;
  }

  /** Detonación de un taladro en el instante real `now` [s]. */
  detonate(h: BlastFxHole, now: number, first: boolean): void {
    const flash = this.flash;
    const smoke = this.smoke;
    if (!this.enabled || !flash || !smoke) return;
    const k0 = this.counter++;
    // Fogonazo: boca y tres puntos a lo largo de la carga.
    for (let j = 0; j < 4; j++) {
      const i = flash.take();
      const f = j === 0 ? 0 : 0.25 + 0.25 * j;
      const d = Math.min(h.length, h.length * f);
      flash.pos[3 * i] = h.collar.x + h.axis.x * d;
      flash.pos[3 * i + 1] = h.collar.y + h.axis.y * d;
      flash.pos[3 * i + 2] = h.collar.z + h.axis.z * d;
      flash.born[i] = now;
      flash.life[i] = FLASH_LIFE * (j === 0 ? 1.2 : 1);
      flash.size[i] = j === 0 ? 4.5 : 3;
      flash.anchor[3 * i] = flash.size[i] ?? 2; // tamaño inicial
    }
    flash.alive = MAX_FLASH;
    // Luz breve en la boca (ilumina las paredes del túnel).
    if (this.light) {
      this.light.position.set(
        h.collar.x - h.axis.x * 0.8,
        h.collar.y - h.axis.y * 0.8,
        h.collar.z - h.axis.z * 0.8 + (h.underground ? 0 : 1.5),
      );
      this.lightBorn = now;
    }
    if (first) this.shakeBorn = now;
    // Humo y polvo hacia la cara libre.
    const out = h.underground ? new Vector3(-h.axis.x, -h.axis.y, -h.axis.z) : new Vector3(0, 0, 1);
    for (let j = 0; j < this.perHole; j++) {
      const i = smoke.take();
      const r1 = hash(k0 * 131 + j * 7 + 1) - 0.5;
      const r2 = hash(k0 * 131 + j * 7 + 2) - 0.5;
      const r3 = hash(k0 * 131 + j * 7 + 3);
      const along = hash(k0 * 131 + j * 7 + 4) * Math.min(h.length, 3) * (h.underground ? 0.3 : 1);
      smoke.pos[3 * i] = h.collar.x + h.axis.x * along;
      smoke.pos[3 * i + 1] = h.collar.y + h.axis.y * along;
      smoke.pos[3 * i + 2] = h.collar.z + h.axis.z * along;
      const speed = h.underground ? 3 + 6 * r3 : 2 + 5 * r3;
      const spread = h.underground ? 0.9 : 1.4;
      smoke.vel[3 * i] = out.x * speed + r1 * spread * speed;
      smoke.vel[3 * i + 1] = out.y * speed + r2 * spread * speed;
      smoke.vel[3 * i + 2] = out.z * speed + (r1 - r2) * 0.5 * spread * speed;
      smoke.born[i] = now + (0.02 * j) / this.perHole;
      smoke.life[i] =
        SMOKE_LIFE_MIN + (SMOKE_LIFE_MAX - SMOKE_LIFE_MIN) * hash(k0 * 131 + j * 7 + 5);
      smoke.size[i] = 0.6;
      smoke.kind[i] = h.underground ? 1 : 0;
      smoke.anchor[3 * i] = h.collar.x;
      smoke.anchor[3 * i + 1] = h.collar.y;
      smoke.anchor[3 * i + 2] = h.collar.z;
      smoke.dir[3 * i] = out.x;
      smoke.dir[3 * i + 1] = out.y;
      smoke.dir[3 * i + 2] = out.z;
    }
    smoke.alive = MAX_SMOKE;
  }

  /**
   * Avanza los efectos al instante real `now` [s]. `scale` = alto del lienzo × P[1][1] / 2 (tamaño
   * de las partículas en metros). Devuelve true si queda algo vivo (hay que seguir dibujando).
   */
  update(now: number, dt: number, scale: number): boolean {
    if (!this.enabled) return false;
    const live = [this.updateFlash(now), this.updateSmoke(now, Math.min(0.05, dt))];
    for (const p of [this.flash, this.smoke]) {
      const u = p ? (p.points.material as ShaderMaterial).uniforms.uScale : undefined;
      if (u) u.value = scale;
    }
    let lit = false;
    if (this.light && this.lightBorn >= 0) {
      const a = (now - this.lightBorn) / 0.16;
      this.light.intensity = a < 1 ? 900 * (1 - a) * (1 - a) : 0;
      lit = a < 1;
      if (!lit) this.lightBorn = -1;
    }
    return live.some(Boolean) || lit || this.shakeOffset(now) !== null;
  }

  /** Desplazamiento de la cámara por la sacudida del primer disparo (null sin sacudida). */
  shakeOffset(now: number): Vector3 | null {
    if (!this.enabled || this.shakeBorn < 0) return null;
    const a = (now - this.shakeBorn) / SHAKE_TIME;
    if (a >= 1) {
      this.shakeBorn = -1;
      return null;
    }
    const amp = 0.12 * (1 - a);
    const w = now * 90;
    return new Vector3(Math.sin(w) * amp, Math.cos(w * 1.3) * amp, Math.sin(w * 0.7) * amp * 0.6);
  }

  private updateFlash(now: number): boolean {
    const p = this.flash;
    if (!p || p.alive === 0) return false;
    let any = false;
    for (let i = 0; i < p.n; i++) {
      const life = p.life[i] ?? 0;
      if (life <= 0) continue;
      const a = (now - (p.born[i] ?? 0)) / life;
      if (a >= 1 || a < 0) {
        p.life[i] = 0;
        p.color[4 * i + 3] = 0;
        continue;
      }
      any = true;
      // Blanco-amarillo que pasa a naranja; crece y se apaga.
      p.color[4 * i] = 1;
      p.color[4 * i + 1] = 0.95 - 0.45 * a;
      p.color[4 * i + 2] = 0.6 - 0.55 * a;
      p.color[4 * i + 3] = (1 - a) * (1 - a);
      p.size[i] = (p.anchor[3 * i] ?? 2) * (1 + 0.8 * Math.sqrt(a));
    }
    if (!any) p.alive = 0;
    p.touch();
    return any;
  }

  private updateSmoke(now: number, dt: number): boolean {
    const p = this.smoke;
    if (!p || p.alive === 0) return false;
    let any = false;
    const drag = Math.exp(-1.6 * dt);
    for (let i = 0; i < p.n; i++) {
      const life = p.life[i] ?? 0;
      if (life <= 0) continue;
      const age = now - (p.born[i] ?? 0);
      if (age < 0) {
        p.color[4 * i + 3] = 0;
        any = true;
        continue;
      }
      const a = age / life;
      if (a >= 1) {
        p.life[i] = 0;
        p.color[4 * i + 3] = 0;
        continue;
      }
      any = true;
      const ug = p.kind[i] === 1;
      let vx = (p.vel[3 * i] ?? 0) * drag;
      let vy = (p.vel[3 * i + 1] ?? 0) * drag;
      let vz = (p.vel[3 * i + 2] ?? 0) * drag + (ug ? 0.15 : 0.9) * dt; // el gas caliente sube
      let x = (p.pos[3 * i] ?? 0) + vx * dt;
      let y = (p.pos[3 * i + 1] ?? 0) + vy * dt;
      let z = (p.pos[3 * i + 2] ?? 0) + vz * dt;
      if (ug) {
        // Confinado por la galería: la distancia al eje (desde la boca hacia afuera) no pasa el radio.
        const ax = p.anchor[3 * i] ?? 0;
        const ay = p.anchor[3 * i + 1] ?? 0;
        const az = p.anchor[3 * i + 2] ?? 0;
        const dx = p.dir[3 * i] ?? 0;
        const dy = p.dir[3 * i + 1] ?? 0;
        const dz = p.dir[3 * i + 2] ?? 0;
        const s = (x - ax) * dx + (y - ay) * dy + (z - az) * dz;
        let rx = x - ax - dx * s;
        let ry = y - ay - dy * s;
        let rz = z - az - dz * s;
        const r = Math.hypot(rx, ry, rz);
        if (r > TUNNEL_RADIUS) {
          const k = TUNNEL_RADIUS / r;
          rx *= k;
          ry *= k;
          rz *= k;
          x = ax + dx * s + rx;
          y = ay + dy * s + ry;
          z = az + dz * s + rz;
          // Pierde la componente hacia la pared y sigue por la galería.
          const vr = (vx * rx + vy * ry + vz * rz) / TUNNEL_RADIUS;
          if (vr > 0) {
            vx -= (vr * rx) / TUNNEL_RADIUS;
            vy -= (vr * ry) / TUNNEL_RADIUS;
            vz -= (vr * rz) / TUNNEL_RADIUS;
          }
        }
        // No vuelve hacia el frente.
        if (s < 0) {
          x -= dx * s;
          y -= dy * s;
          z -= dz * s;
        }
      }
      p.vel[3 * i] = vx;
      p.vel[3 * i + 1] = vy;
      p.vel[3 * i + 2] = vz;
      p.pos[3 * i] = x;
      p.pos[3 * i + 1] = y;
      p.pos[3 * i + 2] = z;
      // Del naranja oscuro (gases nitrosos y polvo caliente) al gris; crece y se desvanece.
      const warm = Math.max(0, 1 - a * 4);
      const gray = 0.42 + 0.18 * a;
      p.color[4 * i] = gray + 0.35 * warm;
      p.color[4 * i + 1] = gray + 0.08 * warm;
      p.color[4 * i + 2] = gray - 0.1 * warm;
      p.color[4 * i + 3] = 0.55 * Math.min(1, age / 0.08) * (1 - a);
      p.size[i] = 0.6 + (ug ? 3 : 5) * Math.sqrt(a);
    }
    if (!any) p.alive = 0;
    p.touch();
    return any;
  }

  dispose(): void {
    for (const p of [this.flash, this.smoke]) {
      if (!p) continue;
      this.root.remove(p.points);
      p.points.geometry.dispose();
      (p.points.material as ShaderMaterial).dispose();
    }
    if (this.light) this.root.remove(this.light);
    this.light?.dispose();
    this.flash = null;
    this.smoke = null;
    this.light = null;
    this.lightBorn = -1;
    this.shakeBorn = -1;
  }
}
