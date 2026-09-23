import { deckIntervals } from '../charging/charge';
import { boundaryAt } from '../geometry/boundary';
import type { Blast, HoleId } from '../model/types';
import type { TimingResult } from '../timing/timing';

export type CheckSeverity = 'error' | 'warning' | 'info';

export interface DesignCheck {
  id: string;
  severity: CheckSeverity;
  title: string;
  /** Detalle con la regla aplicada. */
  detail: string;
  holes: HoleId[];
}

export interface DesignCheckOptions {
  /** Taco mínimo como fracción del burden (regla práctica: 0.7 B). */
  minStemmingRatio: number;
  /** Distancia por debajo de la cual dos bocas se consideran duplicadas [m]. */
  duplicateDistance: number;
  /** Ventana de coincidencia [s]. */
  coincidenceWindow: number;
  /** Radio de vecindad como múltiplo del mayor entre burden y espaciamiento. */
  neighborFactor: number;
}

export const DEFAULT_CHECK_OPTIONS: DesignCheckOptions = {
  minStemmingRatio: 0.7,
  duplicateDistance: 0.5,
  coincidenceWindow: 0.008,
  neighborFactor: 1.5,
};

/**
 * Revisión del diseño con reglas prácticas de voladura. No reemplaza el criterio del ingeniero:
 * señala situaciones frecuentes para revisar (carga, taco, iniciación, tiempos, geometría).
 */
export function designChecks(
  blast: Blast,
  timing: TimingResult | null,
  options: DesignCheckOptions = DEFAULT_CHECK_OPTIONS,
): DesignCheck[] {
  const checks: DesignCheck[] = [];
  const add = (c: DesignCheck) => {
    if (c.holes.length > 0) checks.push(c);
  };
  const burdenOf = new Map(blast.patterns.map((p) => [p.id, p.burden]));
  const defaultBurden = blast.patterns[0]?.burden;

  const unloaded: HoleId[] = [];
  const shortStemming: HoleId[] = [];
  const noStemming: HoleId[] = [];
  const overcharged: HoleId[] = [];
  const noDetonator: HoleId[] = [];
  const loaded: HoleId[] = [];
  for (const h of blast.holes) {
    const hasExplosive = h.decks.some((d) => d.kind === 'explosive' && d.length > 0);
    if (!hasExplosive) {
      unloaded.push(h.id);
      continue;
    }
    loaded.push(h.id);
    const used = h.decks.reduce((s, d) => s + d.length, 0);
    if (used > h.length + 1e-6) overcharged.push(h.id);
    // Taco = decks de taco sobre el explosivo más alto.
    const intervals = deckIntervals(h);
    const topExplosive = Math.min(
      ...intervals.filter((i) => i.deck.kind === 'explosive').map((i) => i.top),
    );
    const stemming = intervals
      .filter((i) => i.deck.kind === 'stemming' && i.bottom <= topExplosive + 1e-6)
      .reduce((s, i) => s + i.deck.length, 0);
    const burden = (h.patternId ? burdenOf.get(h.patternId) : undefined) ?? defaultBurden;
    if (stemming <= 0) noStemming.push(h.id);
    else if (burden !== undefined && stemming < options.minStemmingRatio * burden)
      shortStemming.push(h.id);
    if (h.initiators.length === 0) noDetonator.push(h.id);
  }
  add({
    id: 'unloaded',
    severity: 'warning',
    title: 'Taladros sin carga',
    detail: 'No tienen explosivo asignado.',
    holes: unloaded,
  });
  add({
    id: 'overcharged',
    severity: 'error',
    title: 'Columna más larga que el taladro',
    detail: 'La suma de decks supera la longitud del taladro.',
    holes: overcharged,
  });
  add({
    id: 'noStemming',
    severity: 'error',
    title: 'Sin taco',
    detail: 'Explosivo hasta la boca: alto riesgo de proyecciones y sobrepresión.',
    holes: noStemming,
  });
  add({
    id: 'shortStemming',
    severity: 'warning',
    title: 'Taco corto',
    detail: `Taco menor que ${options.minStemmingRatio} × burden (riesgo de proyecciones).`,
    holes: shortStemming,
  });
  add({
    id: 'noDetonator',
    severity: 'error',
    title: 'Cargados sin detonador',
    detail: 'Tienen explosivo pero ningún iniciador en el taladro.',
    holes: noDetonator,
  });

  if (timing) {
    const idx = new Map(timing.holeIds.map((id, i) => [id as string, i]));
    add({
      id: 'notInitiated',
      severity: 'error',
      title: 'Cargados sin iniciar',
      detail: 'No les llega la señal: falta amarre o punto de inicio.',
      holes: loaded.filter((id) => !Number.isFinite(timing.fireTime[idx.get(id) ?? -1] ?? NaN)),
    });
    add({
      id: 'coincident',
      severity: 'warning',
      title: 'Vecinos que disparan juntos',
      detail: `Taladros a menos de ${options.neighborFactor} × el espaciamiento que detonan dentro de ${fmtMs(options.coincidenceWindow)}: pierden alivio (mala fragmentación y más vibración).`,
      holes: neighborCoincidences(blast, timing, options),
    });
  }

  // Bocas duplicadas (rejilla espacial para no ser O(n²)).
  const cell = options.duplicateDistance;
  const grid = new Map<string, HoleId[]>();
  const dup = new Set<HoleId>();
  const byId = new Map(blast.holes.map((h) => [h.id, h]));
  for (const h of blast.holes) {
    const gx = Math.floor(h.collar.x / cell);
    const gy = Math.floor(h.collar.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const o = byId.get(other);
          if (o && Math.hypot(o.collar.x - h.collar.x, o.collar.y - h.collar.y) < cell) {
            dup.add(o.id);
            dup.add(h.id);
          }
        }
      }
    }
    const key = `${gx},${gy}`;
    const list = grid.get(key) ?? [];
    list.push(h.id);
    grid.set(key, list);
  }
  add({
    id: 'duplicate',
    severity: 'error',
    title: 'Bocas duplicadas',
    detail: `Taladros a menos de ${cell} m entre sí.`,
    holes: [...dup],
  });

  if (blast.boundaries.length > 0) {
    add({
      id: 'outside',
      severity: 'info',
      title: 'Fuera de los perímetros',
      detail: 'Taladros que no caen dentro de ningún perímetro.',
      holes: blast.holes
        .filter((h) => !boundaryAt(blast.boundaries, h.collar.x, h.collar.y))
        .map((h) => h.id),
    });
  }
  const order: Record<CheckSeverity, number> = { error: 0, warning: 1, info: 2 };
  return checks.sort((a, b) => order[a.severity] - order[b.severity]);
}

const fmtMs = (s: number) => `${Math.round(s * 1000)} ms`;

/** Pares de vecinos (distancia < factor × max(B, S)) cuyos tiempos difieren menos que la ventana. */
function neighborCoincidences(
  blast: Blast,
  timing: TimingResult,
  options: DesignCheckOptions,
): HoleId[] {
  let spacing = 0;
  for (const p of blast.patterns) spacing = Math.max(spacing, p.burden, p.spacing);
  if (spacing === 0) spacing = 5;
  const radius = options.neighborFactor * spacing;
  const w = options.coincidenceWindow - 1e-9;
  const t = new Map(timing.holeIds.map((id, i) => [id as string, timing.fireTime[i] ?? NaN]));
  const grid = new Map<string, { id: HoleId; x: number; y: number; t: number }[]>();
  const out = new Set<HoleId>();
  for (const h of blast.holes) {
    const th = t.get(h.id) ?? NaN;
    if (!Number.isFinite(th)) continue;
    const gx = Math.floor(h.collar.x / radius);
    const gy = Math.floor(h.collar.y / radius);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const o of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          if (Math.abs(o.t - th) < w && Math.hypot(o.x - h.collar.x, o.y - h.collar.y) < radius) {
            out.add(o.id);
            out.add(h.id);
          }
        }
      }
    }
    const key = `${gx},${gy}`;
    const list = grid.get(key) ?? [];
    list.push({ id: h.id, x: h.collar.x, y: h.collar.y, t: th });
    grid.set(key, list);
  }
  return [...out];
}
