import {
  applyHoleDensities,
  buildGeotechModel,
  chargeCenter,
  computeCharges,
  projectRock,
  rockAlongPath,
  rockAt,
  rockForHoles,
  summarizeHoleRocks,
  type Blast,
  type BlockModelData,
  type ChargeResult,
  type GeotechModel,
  type HoleRockSummary,
  type PathRock,
  type Project,
  type RockProvider,
  type RockSample,
  type Vec3,
} from '@cronos/core';

/**
 * Modelos de bloques que el navegador pasó al worker (una vez, al cargarlos), por levantamiento.
 * El mapeo y si se usan para la roca salen siempre del proyecto de cada cálculo.
 */
const blocksBySurvey = new Map<string, BlockModelData>();
let cache: { key: string; provider: RockProvider } | null = null;

export function setRockBlocks(models: { surveyId: string; blocks: BlockModelData }[]): void {
  blocksBySurvey.clear();
  for (const m of models) blocksBySurvey.set(m.surveyId, m.blocks);
  cache = null;
}

/**
 * Roca de cálculo de la voladura: los modelos geotécnicos con «Roca desde modelo» activo y la
 * roca del proyecto. null si no hay ninguno (los cálculos quedan como siempre).
 */
export function rockProviderFor(project: Project, blast: Blast): RockProvider | null {
  const active = project.topography.filter(
    (s) => s.blockModel?.geotechnical && s.blockModel.useForRock && blocksBySurvey.has(s.id),
  );
  if (active.length === 0) return null;
  const base = projectRock(project, blast);
  const key = JSON.stringify([base, active.map((s) => [s.id, s.blockModel])]);
  if (cache?.key === key) return cache.provider;
  const models: GeotechModel[] = [];
  for (const s of active) {
    const blocks = blocksBySurvey.get(s.id);
    if (blocks && s.blockModel) models.push(buildGeotechModel(s.id, blocks, s.blockModel, base));
  }
  cache = { key, provider: { models, base } };
  return cache.provider;
}

/** Cubicación con la densidad del bloque de cada taladro (GE-13). */
export function chargeWithBlockDensities(
  project: Project,
  blast: Blast,
  charge: ChargeResult,
): ChargeResult {
  const provider = rockProviderFor(project, blast);
  if (!provider) return charge;
  return applyHoleDensities(
    charge,
    rockForHoles(blast, provider).map((r) => r.density),
  );
}

export interface HoleRocks {
  /** Roca por taladro (mismo orden que `blast.holes`). */
  holes: {
    id: string;
    label: string;
    lithology: string | null;
    rmr: number | null;
    ucs: number;
    inModel: boolean;
  }[];
  summary: HoleRockSummary;
  /** Litología y competencia del camino carga–punto de control (solo informa; la ley no cambia). */
  paths: { pointId: string; name: string; path: Omit<PathRock, 'rock'> & { vp: number | null } }[];
}

/** Roca de los taladros y de los caminos hacia los puntos de control (para el panel y la IA). */
export function holeRocks(project: Project, blast: Blast): HoleRocks | null {
  const provider = rockProviderFor(project, blast);
  if (!provider) return null;
  const rocks = rockForHoles(blast, provider);
  const charge = computeCharges(blast, project.library, provider.base.density);
  const centers = blast.holes.map(chargeCenter);
  const loaded = centers.filter((_, i) => (charge.perHole[i] ?? 0) > 0);
  const sources = loaded.length > 0 ? loaded : centers;
  const paths = (project.monitoringPoints ?? []).flatMap((p) => {
    let best: Vec3 | null = null;
    let d = Infinity;
    for (const c of sources) {
      const r = Math.hypot(c.x - p.position.x, c.y - p.position.y, c.z - p.position.z);
      if (r < d) {
        d = r;
        best = c;
      }
    }
    if (!best) return [];
    const { rock, ...path } = rockAlongPath(provider, best, p.position);
    return [{ pointId: p.id, name: p.name, path: { ...path, vp: rock.vp ?? null } }];
  });
  return {
    holes: rocks.map((r, i) => ({
      id: blast.holes[i]?.id ?? '',
      label: blast.holes[i]?.label ?? '',
      lithology: r.lithology,
      rmr: r.rmr,
      ucs: r.ucs,
      inModel: r.inModel,
    })),
    summary: summarizeHoleRocks(rocks, charge.perHole),
    paths,
  };
}

/** Roca en un punto (con los modelos geotécnicos activos o, si no hay, la del proyecto). */
export function rockAtPoint(project: Project, blast: Blast, p: Vec3): RockSample {
  const provider = rockProviderFor(project, blast) ?? {
    models: [],
    base: projectRock(project, blast),
  };
  return rockAt(provider, p.x, p.y, p.z);
}
