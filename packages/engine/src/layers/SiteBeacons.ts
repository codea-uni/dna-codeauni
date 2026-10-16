import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three';
import type { MonitoringPoint, Vec3 } from '@cronos/core';

type Ground = (x: number, y: number) => number | null;

/** Radio del poste y de la esfera a corta distancia [m del modelo]. */
const POLE_R = 1.2;
const BALL_R = 5;
/**
 * Fracción de la distancia al ojo que ocupa la esfera (≈1,4° de radio): desde 2 km es una esfera de
 * ~50 m, visible a simple vista; de cerca no baja de su tamaño real.
 */
const ANGULAR = 0.025;

/**
 * Faros de los puntos protegidos (comunidad, instalaciones) en el visor: un poste vertical y una
 * esfera en la punta que crecen con la distancia para no perderse. Las líneas del sitio (diana y
 * poste de `SiteLayer`) miden 1 px en el visor y desde 1–2 km no se veían.
 */
export class SiteBeacons {
  readonly root = new Group();
  private readonly poleGeometry = new CylinderGeometry(1, 1, 1, 10, 1, true);
  private readonly ballGeometry = new SphereGeometry(1, 16, 12);
  private readonly material = new MeshBasicMaterial({ color: 0x34d399 });
  private items: { pole: Mesh; ball: Mesh; base: Vec3; height: number }[] = [];

  constructor() {
    this.root.visible = false;
    this.root.name = 'site-beacons';
  }

  /** Puntos en coordenadas de proyecto; el faro se apoya en el terreno (o en `fallbackZ`). */
  set(
    points: readonly MonitoringPoint[],
    origin: Vec3,
    ground: Ground | null,
    fallbackZ: number,
    height: number,
  ): void {
    for (const it of this.items) this.root.remove(it.pole, it.ball);
    this.items = points.map((p) => {
      const g = ground?.(p.position.x, p.position.y);
      const base = {
        x: p.position.x - origin.x,
        y: p.position.y - origin.y,
        z: g === null || g === undefined ? fallbackZ : g - origin.z,
      };
      const pole = new Mesh(this.poleGeometry, this.material);
      // El cilindro de three es vertical en Y: el modelo usa Z arriba.
      pole.rotation.x = Math.PI / 2;
      const ball = new Mesh(this.ballGeometry, this.material);
      this.root.add(pole, ball);
      return { pole, ball, base, height };
    });
    this.place(null);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible && this.items.length > 0;
  }

  /**
   * Ajusta el grosor según la distancia del ojo (coordenadas de render). Devuelve la distancia al
   * punto más cercano (para agrandar los nombres) o null si no hay puntos.
   */
  place(eye: Vec3 | null): number | null {
    let nearest: number | null = null;
    for (const it of this.items) {
      const top = { x: it.base.x, y: it.base.y, z: it.base.z + it.height };
      const d = eye ? Math.hypot(top.x - eye.x, top.y - eye.y, top.z - eye.z) : 0;
      nearest = nearest === null ? d : Math.min(nearest, d);
      const ball = Math.max(BALL_R, d * ANGULAR);
      const pole = Math.max(POLE_R, d * ANGULAR * 0.25);
      it.pole.scale.set(pole, it.height, pole);
      it.pole.position.set(it.base.x, it.base.y, it.base.z + it.height / 2);
      it.ball.scale.setScalar(ball);
      it.ball.position.set(top.x, top.y, top.z);
    }
    return nearest;
  }

  dispose(): void {
    this.poleGeometry.dispose();
    this.ballGeometry.dispose();
    this.material.dispose();
    for (const it of this.items) this.root.remove(it.pole, it.ball);
    this.items = [];
  }
}
