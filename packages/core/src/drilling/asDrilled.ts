import { holeToe } from '../geometry/hole';
import type {
  Blast,
  Hole,
  HoleId,
  Meters,
  Project,
  Radians,
  SurveyStation,
  Vec3,
} from '../model/types';

/**
 * Perforación real (as-drilled): la sonda de desviación mide rumbo e inclinación cada ~1 m y con
 * eso se reconstruye por dónde fue de verdad el taladro. La broca se dobla y rebota en las
 * fisuras, así que el fondo casi nunca queda donde se diseñó; con los taladros reales se ve la
 * malla que de verdad se cargó y disparó.
 */

/** Desvío relativo del fondo (corrimiento / largo) desde el que se considera alto o aceptable. */
export const DEVIATION_HIGH = 0.05;
export const DEVIATION_OK = 0.02;
/** Pares vecinos al fondo: más juntos que esta fracción del diseño concentran energía. */
export const TOE_CLOSE_RATIO = 0.6;
/** Pares vecinos al fondo: más separados que esto dejan roca sin romper (bolones, repié). */
export const TOE_FAR_RATIO = 1.4;

export function hasSurvey(hole: Hole): boolean {
  return (hole.actual?.survey?.length ?? 0) > 0;
}

/** Dirección unitaria de una lectura (x Este, y Norte, z arriba: el taladro baja). */
function direction(inclination: Radians, azimuth: Radians): Vec3 {
  const s = Math.sin(inclination);
  return { x: s * Math.sin(azimuth), y: s * Math.cos(azimuth), z: -Math.cos(inclination) };
}

/**
 * Trayectoria medida de la boca al fondo por tangente equilibrada: cada tramo entre dos estaciones
 * avanza la mitad con la dirección de cada una (la boca toma la primera lectura). Si `length`
 * supera la última estación, se prolonga en línea recta con la última dirección.
 */
export function surveyPath(
  hole: Hole,
  azimuthCorrection: Radians = 0,
  length: Meters = hole.actual?.length ?? hole.length,
): Vec3[] {
  const stations = [...(hole.actual?.survey ?? [])].sort((a, b) => a.depth - b.depth);
  const collar = hole.actual?.collar ?? hole.collar;
  const first = stations[0];
  if (!first) return [collar, holeToe(hole)];
  const p = { ...collar };
  const path: Vec3[] = [{ ...p }];
  let prev: SurveyStation = { ...first, depth: 0 };
  const step = (from: SurveyStation, to: SurveyStation, upTo: Meters) => {
    const dl = Math.min(to.depth, upTo) - from.depth;
    if (dl <= 0) return;
    for (const s of [from, to]) {
      const d = direction(s.inclination, s.azimuth + azimuthCorrection);
      p.x += (dl / 2) * d.x;
      p.y += (dl / 2) * d.y;
      p.z += (dl / 2) * d.z;
    }
    path.push({ ...p });
  };
  for (const s of stations) {
    if (prev.depth >= length) break;
    step(prev, s, length);
    prev = s;
  }
  if (prev.depth < length) step(prev, { ...prev, depth: length }, length);
  return path;
}

/**
 * Taladro equivalente con la geometría medida: misma boca y largo de carga, dirección de la cuerda
 * boca → fondo real. Así todo el cálculo (carguío, energía, vibración, pila) sigue funcionando con
 * taladros rectos y el fondo queda donde quedó de verdad. Sin medición devuelve el mismo taladro.
 */
export function asDrilledHole(hole: Hole, azimuthCorrection: Radians = 0): Hole {
  const a = hole.actual;
  if (!a) return hole;
  const collar = a.collar ?? hole.collar;
  const length = a.length ?? hole.length;
  let { inclination, azimuth } = hole;
  if (a.survey && a.survey.length > 0) {
    const path = surveyPath(hole, azimuthCorrection, length);
    const toe = path[path.length - 1] ?? collar;
    const dx = toe.x - collar.x;
    const dy = toe.y - collar.y;
    const dz = toe.z - collar.z;
    const chord = Math.hypot(dx, dy, dz);
    if (chord > 0) {
      inclination = Math.acos(Math.min(1, Math.max(-1, -dz / chord)));
      azimuth = Math.atan2(dx, dy);
      if (azimuth < 0) azimuth += 2 * Math.PI;
    }
  } else {
    inclination = a.inclination ?? inclination;
    azimuth = a.azimuth ?? azimuth;
  }
  return {
    ...hole,
    collar,
    length,
    inclination,
    azimuth,
    diameter: a.diameter ?? hole.diameter,
  };
}

/** Taladros de la voladura como quedaron, si su medición está marcada para el cálculo. */
export function asDrilledHoles(blast: Blast): Blast {
  const info = blast.drillSurvey;
  if (!info?.useInCalc) return blast;
  return { ...blast, holes: blast.holes.map((h) => asDrilledHole(h, info.azimuthCorrection)) };
}

/** Voladura para simular: taladros como quedaron y la W de Kuz-Ram medida en vez de la supuesta. */
export function asDrilledBlast(blast: Blast): Blast {
  if (!blast.drillSurvey?.useInCalc) return blast;
  const drillDeviation = drillDeviationReport(blast)?.rmsOffset;
  return {
    ...asDrilledHoles(blast),
    calcParams: {
      ...blast.calcParams,
      drillDeviation: drillDeviation ?? blast.calcParams.drillDeviation,
    },
  };
}

/** Proyecto para simular: igual al documento salvo las voladuras con perforación real en uso. */
export function asDrilledProject(project: Project): Project {
  if (!project.blasts.some((b) => b.drillSurvey?.useInCalc)) return project;
  return { ...project, blasts: project.blasts.map(asDrilledBlast) };
}

export interface HoleDeviation {
  holeId: HoleId;
  label: string;
  length: Meters;
  designToe: Vec3;
  actualToe: Vec3;
  /** Corrimiento horizontal del fondo real respecto del diseño [m]. */
  offset: Meters;
  /** Corrimiento / largo. */
  ratio: number;
  /** Rumbo hacia donde se corrió el fondo [rad]. */
  direction: Radians;
  /** Diferencia de cota del fondo (real − diseño) [m]: negativo = más profundo. */
  dz: Meters;
  /** Distancia del fondo real al fondo real más cercano, y la misma en el diseño [m]. */
  toeSpacing: Meters;
  designToeSpacing: Meters;
}

export interface ToePair {
  a: HoleId;
  b: HoleId;
  labelA: string;
  labelB: string;
  design: Meters;
  actual: Meters;
}

export interface DeviationReport {
  holes: HoleDeviation[];
  /** Taladros de la voladura (medidos o no). */
  total: number;
  meanOffset: Meters;
  maxOffset: Meters;
  /** Raíz del corrimiento cuadrático medio: la W de Kuz-Ram medida [m]. */
  rmsOffset: Meters;
  meanRatio: number;
  /** Taladros con desvío mayor a DEVIATION_HIGH del largo. */
  highCount: number;
  /** Parte repetida (promedio de los corrimientos): máquina, referencia del rumbo, estratos. */
  systematic: { offset: Meters; direction: Radians };
  /** Parte al azar que queda al quitar la repetida (raíz cuadrática media) [m]. */
  random: Meters;
  /** Vecinos al fondo: mínimo/medio del real y medio del diseño [m]. */
  toeSpacing: { min: Meters; mean: Meters; design: Meters };
  close: ToePair[];
  far: ToePair[];
}

/** Desviación medida de la voladura: corrimiento de cada fondo y cómo quedó la malla al fondo. */
export function drillDeviationReport(blast: Blast): DeviationReport | null {
  const correction = blast.drillSurvey?.azimuthCorrection ?? 0;
  const designToe = new Map<HoleId, Vec3>();
  const actualToe = new Map<HoleId, Vec3>();
  for (const h of blast.holes) {
    const design = holeToe(h);
    designToe.set(h.id, design);
    actualToe.set(h.id, hasSurvey(h) ? holeToe(asDrilledHole(h, correction)) : design);
  }
  const measured = blast.holes.filter(hasSurvey);
  if (measured.length === 0) return null;

  // Vecinos del diseño al fondo: los que están a ≤ 1,2 × la distancia al más cercano.
  const pairs = new Map<string, ToePair>();
  const nearest = (id: HoleId, toes: Map<HoleId, Vec3>) => {
    const p = toes.get(id);
    let best = Infinity;
    if (!p) return best;
    for (const [other, q] of toes) {
      if (other !== id) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
    }
    return best;
  };
  const labels = new Map(blast.holes.map((h) => [h.id, h.label]));
  const holes: HoleDeviation[] = measured.map((h) => {
    const d = designToe.get(h.id) ?? h.collar;
    const r = actualToe.get(h.id) ?? d;
    const dx = r.x - d.x;
    const dy = r.y - d.y;
    const offset = Math.hypot(dx, dy);
    const designSpacing = nearest(h.id, designToe);
    for (const h2 of blast.holes) {
      if (h2.id === h.id) continue;
      const d2 = designToe.get(h2.id);
      const r2 = actualToe.get(h2.id);
      if (!d2 || !r2) continue;
      const design = Math.hypot(d.x - d2.x, d.y - d2.y);
      if (design > designSpacing * 1.2) continue;
      const key = h.id < h2.id ? `${h.id}|${h2.id}` : `${h2.id}|${h.id}`;
      if (pairs.has(key)) continue;
      const [a, b] = h.id < h2.id ? [h.id, h2.id] : [h2.id, h.id];
      pairs.set(key, {
        a,
        b,
        labelA: labels.get(a) ?? '',
        labelB: labels.get(b) ?? '',
        design,
        actual: Math.hypot(r.x - r2.x, r.y - r2.y),
      });
    }
    return {
      holeId: h.id,
      label: h.label,
      length: h.actual?.length ?? h.length,
      designToe: d,
      actualToe: r,
      offset,
      ratio: offset / Math.max(h.actual?.length ?? h.length, 1e-6),
      direction: (Math.atan2(dx, dy) + 2 * Math.PI) % (2 * Math.PI),
      dz: r.z - d.z,
      toeSpacing: nearest(h.id, actualToe),
      designToeSpacing: designSpacing,
    };
  });

  const n = holes.length;
  const mean = (f: (h: HoleDeviation) => number) => holes.reduce((s, h) => s + f(h), 0) / n;
  const mx = mean((h) => h.actualToe.x - h.designToe.x);
  const my = mean((h) => h.actualToe.y - h.designToe.y);
  const random = Math.sqrt(
    mean(
      (h) => (h.actualToe.x - h.designToe.x - mx) ** 2 + (h.actualToe.y - h.designToe.y - my) ** 2,
    ),
  );
  const finite = holes.filter((h) => Number.isFinite(h.toeSpacing));
  const all = [...pairs.values()];
  return {
    holes,
    total: blast.holes.length,
    meanOffset: mean((h) => h.offset),
    maxOffset: Math.max(...holes.map((h) => h.offset)),
    rmsOffset: Math.sqrt(mean((h) => h.offset ** 2)),
    meanRatio: mean((h) => h.ratio),
    highCount: holes.filter((h) => h.ratio > DEVIATION_HIGH).length,
    systematic: {
      offset: Math.hypot(mx, my),
      direction: (Math.atan2(mx, my) + 2 * Math.PI) % (2 * Math.PI),
    },
    random,
    toeSpacing: {
      min: finite.length ? Math.min(...finite.map((h) => h.toeSpacing)) : NaN,
      mean: finite.length ? finite.reduce((s, h) => s + h.toeSpacing, 0) / finite.length : NaN,
      design: finite.length
        ? finite.reduce((s, h) => s + h.designToeSpacing, 0) / finite.length
        : NaN,
    },
    close: all
      .filter((p) => p.actual < p.design * TOE_CLOSE_RATIO)
      .sort((p, q) => p.actual / p.design - q.actual / q.design),
    far: all
      .filter((p) => p.actual > p.design * TOE_FAR_RATIO)
      .sort((p, q) => q.actual / q.design - p.actual / p.design),
  };
}
