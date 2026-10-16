import type { HoleId } from '../model/types';
import { PointIndex } from '../geometry/spatialIndex';

/**
 * Riesgo de tiro cortado por adelanto de la detonación sobre la señal de superficie.
 *
 * Con iniciación no eléctrica por superficie, cada taladro recibe la señal en su boca en
 * t_superficie y detona t_superficie + retardo en el taladro. Si un vecino a menos de `radius`
 * detona antes de que la señal llegue a la boca del taladro (más un margen `minLead`), el
 * movimiento del terreno y la proyección pueden cortar su línea de superficie o su tubo de choque:
 * el taladro no sale y queda explosivo sin detonar en la pila. Es el criterio del «frente de
 * iniciación por delante del frente de detonación» (ISEE Blasters' Handbook, cap. de sistemas no
 * eléctricos; `docs/agent/CONOCIMIENTO-VOLADURA.md` §6). Regla bajo R3: advertencia, con radio y
 * margen como parámetros.
 *
 * Los electrónicos quedan armados antes del primer disparo: el llamador los marca en `skip`.
 */
export interface CutoffOptions {
  /** Radio de vecindad [m] (p. ej. un múltiplo del burden). */
  radius: number;
  /** Margen mínimo entre la llegada de la señal y la primera detonación vecina [s]. */
  minLead: number;
}

export interface CutoffRisk {
  holeId: HoleId;
  /** Vecino que detona antes de que el taladro reciba la señal. */
  neighborId: HoleId;
  /** t_detonación(vecino) − t_superficie(taladro) [s] (negativo: la señal llega después). */
  lead: number;
  distance: number;
}

export function cutoffRisks(
  holes: readonly { id: HoleId; collar: { x: number; y: number } }[],
  surfaceTime: Float64Array,
  fireTime: Float64Array,
  options: CutoffOptions,
  skip?: readonly boolean[],
): CutoffRisk[] {
  const fired = holes
    .map((h, i) => ({ h, i }))
    .filter(({ i }) => Number.isFinite(fireTime[i] ?? NaN));
  const index = new PointIndex(
    fired.map(({ i }) => i),
    Float64Array.from(fired, ({ h }) => h.collar.x),
    Float64Array.from(fired, ({ h }) => h.collar.y),
  );
  const risks: CutoffRisk[] = [];
  holes.forEach((h, j) => {
    const s = surfaceTime[j] ?? NaN;
    if (skip?.[j] || !Number.isFinite(s)) return;
    let worst: CutoffRisk | null = null;
    for (const i of index.neighbors(h.collar.x, h.collar.y, Infinity, options.radius)) {
      if (i === j) continue;
      const t = fireTime[i] ?? NaN;
      const lead = t - s;
      if (lead >= options.minLead) continue;
      const other = holes[i];
      if (!other) continue;
      if (!worst || lead < worst.lead)
        worst = {
          holeId: h.id,
          neighborId: other.id,
          lead,
          distance: Math.hypot(other.collar.x - h.collar.x, other.collar.y - h.collar.y),
        };
    }
    if (worst) risks.push(worst);
  });
  return risks;
}
