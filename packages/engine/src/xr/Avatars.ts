import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Vec3 } from '@cronos/core';
import { XrPanel } from './XrPanel';

/** Orientación como cuaternión [x, y, z, w]. */
export type Quat = readonly [number, number, number, number];

export interface XrTransform {
  p: Vec3;
  q: Quat;
}

/** Otra persona en la sala (multiusuario remoto, D-19), en coordenadas del modelo. */
export interface XrAvatar {
  id: string;
  name: string;
  color: number;
  head: XrTransform;
  hands: readonly XrTransform[];
  /** Escala con la que esa persona ve el modelo (1 = dentro de la voladura; 1/1000 = maqueta). */
  scale: number;
}

/** Tamaño mínimo de un avatar para quien mira [fracción del tamaño humano]: se ve aunque sea chico. */
const MIN_SIZE = 0.1;

const PALETTE = [0xf97316, 0x22c55e, 0x3b82f6, 0xe11d48, 0xa855f7, 0xeab308, 0x14b8a6, 0xf472b6];

/** Hombros respecto de la cabeza, en el marco del cuerpo (Y arriba, −Z al frente) [m humanos]. */
const SHOULDERS = [new Vector3(-0.19, -0.2, 0), new Vector3(0.19, -0.2, 0)] as const;

const UP_Y = new Vector3(0, 1, 0);
/** Arriba del modelo (Z) y frente de una cámara (−Z local). */
const UP = new Vector3(0, 0, 1);
const FRONT = new Vector3(0, 0, -1);

interface Entry {
  head: Group;
  body: Group;
  tag: XrPanel;
  hands: Mesh[];
  arms: Mesh[];
  helmet: MeshLambertMaterial;
  name: string;
}

/**
 * Avatares de minero low-poly (casco con linterna, visor, chaleco reflectivo, brazos y guantes)
 * dentro del grupo del modelo, al tamaño de quien los envía: quien mira la maqueta es un gigante
 * asomado sobre el tajo para quien está dentro de la voladura, y quien está dentro es una figura
 * chica sobre la maqueta (D-19). El cuerpo cuelga de la cabeza y solo sigue su rumbo; los brazos
 * van del hombro a cada control, sin IK.
 * ponytail: sin piernas ni animación de caminar; agregarlas si en el visor se ve raro.
 */
export class Avatars {
  readonly root = new Group();
  private readonly entries = new Map<string, Entry>();
  private readonly geo = {
    face: new SphereGeometry(0.1, 16, 12),
    helmet: new SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    brim: new CylinderGeometry(0.155, 0.155, 0.012, 20),
    lamp: new CylinderGeometry(0.026, 0.026, 0.035, 12).rotateX(Math.PI / 2),
    visor: new BoxGeometry(0.17, 0.06, 0.06),
    torso: new CapsuleGeometry(0.16, 0.32, 4, 12),
    stripe: new BoxGeometry(0.34, 0.035, 0.34),
    // Cilindro de largo 1 que crece hacia +Y: se estira del hombro a la mano.
    arm: new CylinderGeometry(0.045, 0.04, 1, 8).translate(0, 0.5, 0),
    glove: new BoxGeometry(0.08, 0.06, 0.12),
  };
  private readonly mat = {
    skin: new MeshLambertMaterial({ color: 0xd6a77a }),
    visor: new MeshBasicMaterial({ color: 0x111827 }),
    lamp: new MeshBasicMaterial({ color: 0xfff7a8 }),
    vest: new MeshLambertMaterial({ color: 0xff7a1a }),
    stripe: new MeshLambertMaterial({ color: 0xe5e7eb, emissive: 0x6b7280 }),
    sleeve: new MeshLambertMaterial({ color: 0x1e3a5f }),
    glove: new MeshLambertMaterial({ color: 0xfacc15 }),
  };
  private readonly tmp = {
    fwd: new Vector3(),
    x: new Vector3(),
    z: new Vector3(),
    m: new Matrix4(),
    q: new Quaternion(),
    shoulder: new Vector3(),
    hand: new Vector3(),
  };

  set(list: readonly XrAvatar[], viewerScale: number): void {
    const seen = new Set<string>();
    for (const a of list) {
      // Metros del modelo por metro humano: 1/escala de quien envía, con un mínimo visible.
      const k = Math.max(1 / a.scale, MIN_SIZE / viewerScale);
      seen.add(a.id);
      const e = this.entries.get(a.id) ?? this.create(a);
      if (e.name !== a.name) {
        e.name = a.name;
        e.tag.setRows([{ label: a.name }]);
      }
      e.head.position.set(a.head.p.x, a.head.p.y, a.head.p.z);
      e.head.quaternion.set(...a.head.q);
      e.head.scale.setScalar(k);
      this.placeBody(e, k);
      e.hands.forEach((m, i) => {
        const h = a.hands[i];
        const arm = e.arms[i];
        m.visible = h !== undefined;
        if (arm) arm.visible = m.visible;
        if (!h) return;
        m.position.set(h.p.x, h.p.y, h.p.z);
        m.quaternion.set(...h.q);
        m.scale.setScalar(k);
        if (arm) this.placeArm(arm, e.body, m.position, k);
      });
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) this.remove(id, e);
  }

  /** Los nombres miran a quien los ve (posición de su cabeza en el espacio XR). */
  faceViewer(head: Vector3): void {
    for (const e of this.entries.values()) e.tag.mesh.lookAt(head);
  }

  dispose(): void {
    for (const [id, e] of this.entries) this.remove(id, e);
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
  }

  /**
   * Cuerpo erguido bajo la cabeza (Z del modelo arriba) mirando hacia donde mira la cabeza en planta.
   * Mirando justo abajo se usa el «arriba» de la cabeza, que entonces apunta al frente.
   */
  private placeBody(e: Entry, k: number): void {
    const { fwd, x, z, m } = this.tmp;
    fwd.copy(FRONT).applyQuaternion(e.head.quaternion);
    fwd.z = 0;
    if (fwd.lengthSq() < 1e-4) {
      fwd.copy(UP_Y).applyQuaternion(e.head.quaternion);
      fwd.z = 0;
    }
    if (fwd.lengthSq() < 1e-8) fwd.set(0, 1, 0);
    fwd.normalize();
    // Marco del cuerpo: Y local = Z del modelo, −Z local = frente.
    z.copy(fwd).negate();
    x.crossVectors(UP, z);
    m.makeBasis(x, UP, z);
    e.body.quaternion.setFromRotationMatrix(m);
    e.body.position.copy(e.head.position);
    e.body.scale.setScalar(k);
  }

  /** Brazo del hombro más cercano a la mano: cilindro orientado y estirado hasta ella. */
  private placeArm(arm: Mesh, body: Group, hand: Vector3, k: number): void {
    const { shoulder, q } = this.tmp;
    let best = Infinity;
    for (const s of SHOULDERS) {
      const p = s.clone().multiplyScalar(k).applyQuaternion(body.quaternion).add(body.position);
      const d = p.distanceToSquared(hand);
      if (d < best) {
        best = d;
        shoulder.copy(p);
      }
    }
    const dir = this.tmp.hand.copy(hand).sub(shoulder);
    const len = dir.length();
    arm.position.copy(shoulder);
    q.setFromUnitVectors(UP_Y, len > 1e-9 ? dir.divideScalar(len) : UP_Y);
    arm.quaternion.copy(q);
    arm.scale.set(k, len, k);
  }

  private create(a: XrAvatar): Entry {
    const { geo, mat } = this;
    const helmet = new MeshLambertMaterial({
      color: PALETTE[a.color % PALETTE.length] ?? 0xffffff,
    });
    const mesh = (g: keyof typeof geo, material: MeshLambertMaterial | MeshBasicMaterial) =>
      new Mesh(geo[g], material);

    const head = new Group();
    const dome = mesh('helmet', helmet);
    dome.position.y = 0.03;
    const brim = mesh('brim', helmet);
    brim.position.y = 0.03;
    const lamp = mesh('lamp', mat.lamp);
    lamp.position.set(0, 0.08, -0.12);
    const visor = mesh('visor', mat.visor);
    visor.position.set(0, -0.01, -0.085);
    const tag = new XrPanel(0.3);
    tag.setRows([{ label: a.name }]);
    tag.mesh.position.set(0, 0.32, 0);
    head.add(mesh('face', mat.skin), dome, brim, lamp, visor, tag.mesh);

    const body = new Group();
    const torso = mesh('torso', mat.vest);
    torso.position.y = -0.42;
    const s1 = mesh('stripe', mat.stripe);
    s1.position.y = -0.36;
    const s2 = mesh('stripe', mat.stripe);
    s2.position.y = -0.52;
    body.add(torso, s1, s2);

    const hands = [mesh('glove', mat.glove), mesh('glove', mat.glove)];
    const arms = [mesh('arm', mat.sleeve), mesh('arm', mat.sleeve)];
    this.root.add(head, body, ...hands, ...arms);
    const e: Entry = { head, body, tag, hands, arms, helmet, name: a.name };
    this.entries.set(a.id, e);
    return e;
  }

  private remove(id: string, e: Entry): void {
    this.root.remove(e.head, e.body, ...e.hands, ...e.arms);
    e.tag.dispose();
    e.helmet.dispose();
    this.entries.delete(id);
  }
}
