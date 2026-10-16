import type { Hole, Vec3 } from '@cronos/core';

/** Espera 1,2 s cerca; conserva el taladro hasta salir de 8 m / 18 m de altura. */
export class HoleProximity {
  private active: string | null = null;
  private candidate: string | null = null;
  private since = 0;
  private dismissed = new Set<string>();

  dismiss(id: string): void {
    this.dismissed.add(id);
    if (this.active === id) this.active = null;
    this.candidate = null;
  }

  update(
    holes: readonly Hole[],
    head: Vec3 | null,
    now: number,
    explicitId: string | null,
  ): Hole | null {
    const near = (h: Hole, distance: number, height: number) =>
      head !== null &&
      Math.hypot(h.collar.x - head.x, h.collar.y - head.y) < distance &&
      head.z - h.collar.z >= -2 &&
      head.z - h.collar.z < height;
    for (const id of this.dismissed) {
      const h = holes.find((hole) => hole.id === id);
      if (!h || !near(h, 8, 18)) this.dismissed.delete(id);
    }
    if (explicitId) this.dismissed.add(explicitId);
    if (!head || explicitId) {
      this.active = this.candidate = null;
      return null;
    }
    const active = holes.find((h) => h.id === this.active);
    if (active && near(active, 8, 18)) return active;
    this.active = null;
    const nearest = holes
      .filter((h) => !this.dismissed.has(h.id) && near(h, 6, 15))
      .reduce<Hole | null>(
        (best, h) =>
          !best ||
          Math.hypot(h.collar.x - head.x, h.collar.y - head.y) <
            Math.hypot(best.collar.x - head.x, best.collar.y - head.y)
            ? h
            : best,
        null,
      );
    if (nearest?.id !== this.candidate) {
      this.candidate = nearest?.id ?? null;
      this.since = now;
    }
    if (!nearest || now - this.since < 1200) return null;
    this.active = nearest.id;
    return nearest;
  }
}
