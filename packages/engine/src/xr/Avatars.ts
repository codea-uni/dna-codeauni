import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  type Vector3,
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

interface Entry {
  head: Group;
  tag: XrPanel;
  hands: Mesh[];
  name: string;
}

/**
 * Avatares simples (cabeza con visor, controles y nombre) dentro del grupo del modelo, al tamaño de
 * quien los envía: quien mira la maqueta es un gigante asomado sobre el tajo para quien está dentro
 * de la voladura, y quien está dentro es una figura chica sobre la maqueta (D-19).
 */
export class Avatars {
  readonly root = new Group();
  private readonly entries = new Map<string, Entry>();
  private readonly headGeo = new SphereGeometry(0.12, 16, 12);
  private readonly visorGeo = new BoxGeometry(0.18, 0.07, 0.06);
  private readonly handGeo = new BoxGeometry(0.04, 0.03, 0.1);
  private readonly visorMat = new MeshBasicMaterial({ color: 0x111827 });

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
      e.hands.forEach((m, i) => {
        const h = a.hands[i];
        m.visible = h !== undefined;
        if (!h) return;
        m.position.set(h.p.x, h.p.y, h.p.z);
        m.quaternion.set(...h.q);
        m.scale.setScalar(k);
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
    this.headGeo.dispose();
    this.visorGeo.dispose();
    this.handGeo.dispose();
    this.visorMat.dispose();
  }

  private create(a: XrAvatar): Entry {
    const mat = new MeshLambertMaterial({ color: PALETTE[a.color % PALETTE.length] ?? 0xffffff });
    const head = new Group();
    const visor = new Mesh(this.visorGeo, this.visorMat);
    visor.position.set(0, 0.01, -0.1);
    const tag = new XrPanel(0.3);
    tag.setRows([{ label: a.name }]);
    tag.mesh.position.set(0, 0.26, 0);
    head.add(new Mesh(this.headGeo, mat), visor, tag.mesh);
    const hands = [new Mesh(this.handGeo, mat), new Mesh(this.handGeo, mat)];
    this.root.add(head, ...hands);
    const e: Entry = { head, tag, hands, name: a.name };
    this.entries.set(a.id, e);
    return e;
  }

  private remove(id: string, e: Entry): void {
    this.root.remove(e.head, ...e.hands);
    e.tag.dispose();
    (e.hands[0]?.material as MeshLambertMaterial | undefined)?.dispose();
    this.entries.delete(id);
  }
}
