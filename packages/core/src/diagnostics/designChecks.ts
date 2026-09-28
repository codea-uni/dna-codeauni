import { deckIntervals } from '../charging/charge';
import { boundaryAt } from '../geometry/boundary';
import type { Blast, CalcParams, HoleId } from '../model/types';
import type { TimingResult } from '../timing/timing';
import { DEFAULT_CALC_PARAMS } from '../model/factories';

export type CheckSeverity = 'error' | 'warning' | 'info';

export interface DesignCheck {
  id: string;
  severity: CheckSeverity;
  title: string;
  /** Detalle con la regla aplicada. */
  detail: string;
  holes: HoleId[];
}

/** Umbrales de `blast.calcParams.checks` más la ventana de coincidencia [s]. */
export type DesignCheckOptions = CalcParams['checks'] & { coincidenceWindow: number };

export const DEFAULT_CHECK_OPTIONS: DesignCheckOptions = checkOptionsOf({
  calcParams: DEFAULT_CALC_PARAMS,
});

/** Umbrales guardados en la voladura (`blast.calcParams`). */
export function checkOptionsOf(blast: Pick<Blast, 'calcParams'>): DesignCheckOptions {
  return { ...blast.calcParams.checks, coincidenceWindow: blast.calcParams.micWindow };
}

/**
 * Revisión del diseño con reglas prácticas de voladura. No reemplaza el criterio del ingeniero:
 * señala situaciones frecuentes para revisar (carga, taco, iniciación, tiempos, geometría).
 */
export function designChecks(
  blast: Blast,
  timing: TimingResult | null,
  options: DesignCheckOptions = checkOptionsOf(blast),
): DesignCheck[] {
  const checks: DesignCheck[] = [];
  const add = (c: DesignCheck) => {
    if (c.holes.length > 0) checks.push(c);
  };
  const burdenOf = new Map(blast.patterns.map((p) => [p.id, p.burden]));
  const defaultBurden = blast.patterns[0]?.burden;
  const outside = (v: number, r: { min: number; max: number }) => v < r.min || v > r.max;
  const fmtRange = (r: { min: number; max: number }) => `${String(r.min)}–${String(r.max)}`;
  const H = blast.bench.height;

  // Geometría (docs/theory/02 §6, CK-01, CK-03, CK-04, CK-06): advertencias, nunca bloqueos.
  const lowStiffness: HoleId[] = [];
  const subdrillRange: HoleId[] = [];
  const benchDiameter: HoleId[] = [];
  for (const h of blast.holes) {
    const burden = h.patternId ? burdenOf.get(h.patternId) : undefined;
    if (burden !== undefined) {
      if (H / burden <= options.minStiffness) lowStiffness.push(h.id);
      if (outside(h.subdrill / burden, options.subdrillBurdenRatio)) subdrillRange.push(h.id);
    }
    if (h.diameter > 0 && outside(H / h.diameter, options.benchDiameterRatio))
      benchDiameter.push(h.id);
  }
  const hasFreeFace =
    blast.freeFaces.length > 0 || blast.boundaries.some((b) => b.freeFaceEdges.length > 0);
  add({
    id: 'noFreeFace',
    severity: 'warning',
    title: 'Sin cara libre definida',
    detail:
      'Solo queda la superficie del banco como cara libre: voladura confinada, más vibración y peor fragmentación (RM-06). Marca la cara libre en el perímetro (herramienta C).',
    holes: hasFreeFace ? [] : blast.holes.map((h) => h.id),
  });
  add({
    id: 'lowStiffness',
    severity: 'warning',
    title: 'Rigidez del burden baja',
    detail: `H/B ≤ ${String(options.minStiffness)} (tabla de Konya: mala distribución de energía, más proyección y vibración).`,
    holes: lowStiffness,
  });
  add({
    id: 'subdrillRange',
    severity: 'warning',
    title: 'Sobreperforación fuera de rango',
    detail: `J/B fuera de ${fmtRange(options.subdrillBurdenRatio)} (rango de las fuentes; configurable).`,
    holes: subdrillRange,
  });
  add({
    id: 'benchDiameter',
    severity: 'info',
    title: 'Diámetro poco usual para la altura de banco',
    detail: `H/Ø fuera de ${fmtRange(options.benchDiameterRatio)} (regla informativa, R0).`,
    holes: benchDiameter,
  });

  const longStemming: HoleId[] = [];
  const stemmingDiameter: HoleId[] = [];

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
    else {
      // P-04: 0,7·B; sin burden conocido (taladro suelto), ~20·Ø como respaldo.
      const minStemming =
        burden !== undefined
          ? options.minStemmingRatio * burden
          : options.minStemmingDiameters * h.diameter;
      if (stemming < minStemming) shortStemming.push(h.id);
      if (burden !== undefined && stemming > options.maxStemmingRatio * burden)
        longStemming.push(h.id);
      if (outside(stemming / h.diameter, options.stemmingDiameterRatio))
        stemmingDiameter.push(h.id);
    }
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
    detail:
      'Explosivo hasta la boca: alto riesgo de proyecciones y sobrepresión (P-04). Confirma que es intencional (alivio o prueba).',
    holes: noStemming,
  });
  add({
    id: 'shortStemming',
    severity: 'warning',
    title: 'Taco corto',
    detail: `Taco menor que ${String(options.minStemmingRatio)} × burden (sin malla: ${String(options.minStemmingDiameters)} × Ø); riesgo de proyecciones (P-04).`,
    holes: shortStemming,
  });
  add({
    id: 'longStemming',
    severity: 'warning',
    title: 'Taco largo',
    detail: `Taco mayor que ${String(options.maxStemmingRatio)} × burden: roca sin fragmentar en el collar.`,
    holes: longStemming,
  });
  add({
    id: 'stemmingDiameter',
    severity: 'info',
    title: 'Taco fuera del rango en diámetros',
    detail: `Taco fuera de ${fmtRange(options.stemmingDiameterRatio)} × Ø (regla de las fuentes; configurable).`,
    holes: stemmingDiameter,
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
