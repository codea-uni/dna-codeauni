/**
 * Módulos del servicio de cálculo sin estado: proyecto (formato `cronos-project`) + voladura +
 * opciones → resultados. Llaman al núcleo igual que la aplicación web (perforación real si está
 * activada, solo el disparo elegido en subterránea) y devuelven SOLO resultados de ingeniería:
 * nunca coeficientes de los modelos (K y β de la ley, A, n o b de la fragmentación, k y n de la
 * pila) ni pasos intermedios. Unidades de salida para leer: cm, mm/s, kg, m, ms, t.
 *
 * Corre dentro de los procesos de cálculo (`worker.ts`): todo lo de aquí es síncrono y puro.
 */
import {
  analyzeBlast,
  asDrilledProject,
  computeCharges,
  computeMuckpile,
  computeUndergroundMuckpile,
  computeVibration,
  DEFAULT_ANALYSIS_OPTIONS,
  DEFAULT_VIBRATION_OPTIONS,
  fragmentation,
  fragmentationHeadline,
  isUndergroundBlast,
  kuzRamInputsFromBlast,
  monitoringPointSchema,
  parseProjectFile,
  projectForShot,
  resolveShot,
  SCHEMA_VERSION,
  type Blast,
  type MonitoringPoint,
  type MuckpileResult,
  type Project,
} from '@cronos/core';
import { z } from 'zod';
import { designSignature, type Signature } from './guard';

export const MODULES = ['analysis', 'fragmentation', 'vibration', 'muckpile'] as const;
export type ModuleName = (typeof MODULES)[number];

/** Error de entrada: el servicio lo devuelve como 400 con este mensaje. */
export class InputError extends Error {
  readonly code = 'bad_input';
}

export const runRequestSchema = z.object({
  /** Archivo de proyecto (`format: 'cronos-project'`) o el proyecto solo. */
  project: z.record(z.string(), z.unknown()),
  /** Voladura a calcular; sin valor, la primera con taladros. */
  blast_id: z.string().min(1).optional(),
  /** Subterránea: disparo a calcular (etiqueta); sin valor, el que elegiría la aplicación. */
  shot: z.string().nullable().optional(),
  /** Puntos de control de la mina (compartidos por sus proyectos), además de los del proyecto. */
  mine_points: z.array(z.unknown()).max(500).optional(),
  options: z
    .object({
      /** Fragmentación: tamaño de sobretamaño [m] y de finos [m] (por defecto 1 m y 10 mm, como la app). */
      oversize_m: z.number().positive().max(10).optional(),
      fines_m: z.number().positive().max(1).optional(),
      /** Fragmentación: P80 objetivo [cm] para comparar. */
      target_p80_cm: z.number().positive().max(500).optional(),
    })
    .optional(),
});
export type RunRequest = z.infer<typeof runRequestSchema>;

export interface PreparedRun {
  project: Project;
  blast: Blast;
  minePoints: MonitoringPoint[];
}

const round = (v: number, d: number) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
const finite = (v: number, d: number) => (Number.isFinite(v) ? round(v, d) : null);

/** Valida el proyecto (con las migraciones del núcleo) y elige voladura y disparo. */
export function prepare(req: RunRequest): PreparedRun {
  const raw = req.project;
  const file =
    raw.format === 'cronos-project'
      ? raw
      : {
          format: 'cronos-project',
          schemaVersion: SCHEMA_VERSION,
          savedAt: new Date(0).toISOString(),
          appVersion: 'calc',
          project: raw,
        };
  const parsed = parseProjectFile(JSON.stringify(file));
  if (!parsed.ok) throw new InputError(`Proyecto inválido: ${parsed.error}`);
  const project = parsed.file.project;
  const blast =
    (req.blast_id
      ? project.blasts.find((b) => b.id === req.blast_id)
      : project.blasts.find((b) => b.holes.length > 0)) ?? null;
  if (!blast)
    throw new InputError(
      req.blast_id ? `No existe la voladura ${req.blast_id}.` : 'El proyecto no tiene taladros.',
    );
  const tag = resolveShot(blast, req.shot ?? null);
  // Con la perforación real activada, se calcula con los taladros como quedaron (como la app).
  const shot = asDrilledProject(projectForShot(project, blast.id, tag));
  const shotBlast = shot.blasts.find((b) => b.id === blast.id);
  if (!shotBlast) throw new InputError('La voladura no está en el proyecto.');
  const minePoints: MonitoringPoint[] = [];
  for (const p of req.mine_points ?? []) {
    const r = monitoringPointSchema.safeParse(p);
    if (!r.success) throw new InputError('Hay un punto de control de la mina inválido.');
    minePoints.push(r.data);
  }
  return { project: shot, blast: shotBlast, minePoints };
}

const rockOf = (project: Project, blast: Blast) =>
  project.rockMasses.find((r) => r.id === blast.rockMassId) ?? {
    density: 2650,
    ucs: 150e6,
    youngModulus: 50e9,
  };

// ------------------------------------------------------------------ módulos

/** Carga, cubicación, secuencia y revisión del diseño. */
export function runAnalysis({ project, blast }: PreparedRun) {
  const a = analyzeBlast(project, blast.id, DEFAULT_ANALYSIS_OPTIONS);
  if (!a) throw new InputError('No se pudo analizar la voladura.');
  const c = a.charge;
  const t = a.timing;
  const charged = Array.from(c.perHole).filter((kg) => kg > 0).length;
  const timed = t.initiated > 0;
  return {
    holes: blast.holes.length,
    charged_holes: charged,
    total_explosive_kg: round(c.totalExplosive, 1),
    primers: round(c.totalPrimers, 2),
    drilled_length_m: round(c.drilledLength, 1),
    volume_m3: round(c.volume, 0),
    tonnage_t: round(c.tonnage / 1000, 0),
    powder_factor_kg_m3: round(c.loadingFactor, 3),
    powder_factor_kg_t: c.tonnage > 0 ? round(c.totalExplosive / (c.tonnage / 1000), 3) : null,
    firing: {
      initiated_holes: t.initiated,
      not_initiated_holes: t.notInitiated,
      holes_without_detonator: t.withoutDetonator,
      span_ms: timed ? round((t.lastTime - t.firstTime) * 1000, 0) : null,
      max_charge_per_8ms_kg: timed ? round(t.maxChargePerWindow, 1) : null,
      max_holes_per_8ms: timed ? t.maxHolesPerWindow : null,
      coincident_groups: t.coincidentGroups.length,
    },
    checks: a.checks.map((k) => ({
      id: k.id,
      severity: k.severity,
      title: k.title,
      holes: k.holes.length,
    })),
  };
}

/** P20/P50/P80, sobretamaño, finos y curva granulométrica (sin los parámetros del modelo). */
export function runFragmentation({ project, blast }: PreparedRun, req: RunRequest) {
  const rock = rockOf(project, blast);
  const charge = computeCharges(blast, project.library, rock.density);
  const method = blast.calcParams.fragmentation ?? { model: 'cunningham1987', curve: 'swebrec' };
  const inputs = kuzRamInputsFromBlast(blast, project.library, charge, rock);
  if (!inputs) throw new InputError('La fragmentación necesita taladros cargados.');
  const o = req.options ?? {};
  const r = fragmentation(
    { ...inputs, variant: method.model },
    { oversizeSize: o.oversize_m ?? 1, finesSize: o.fines_m ?? 0.01 },
  );
  const h = fragmentationHeadline(r, method.curve);
  const p80cm = h.p80 * 100;
  const target = o.target_p80_cm;
  return {
    method:
      method.model === 'cunningham2005' ? 'Kuz-Ram (Cunningham 2005)' : 'Kuz-Ram (Cunningham 1987)',
    curve: method.curve === 'swebrec' ? 'Swebrec' : 'Rosin-Rammler',
    calibrated: false,
    p20_cm: round(h.p20 * 100, 1),
    p50_cm: round(h.p50 * 100, 1),
    p80_cm: round(p80cm, 1),
    oversize_pct: round(h.oversize * 100, 1),
    oversize_size_m: r.oversize.size,
    fines_pct: round(h.fines * 100, 1),
    fines_size_mm: round(r.fines.size * 1000, 1),
    ...(target !== undefined
      ? {
          target_p80_cm: target,
          vs_target:
            p80cm > target * 1.05 ? 'coarser' : p80cm < target * 0.8 ? 'finer' : 'on_target',
        }
      : {}),
    passing: r.curve.map((p) => ({
      size_cm: round(p.size * 100, 2),
      pct: round((method.curve === 'swebrec' ? p.swebrec : p.rosinRammler) * 100, 1),
    })),
  };
}

/** PPV y sobrepresión en cada punto de control, carga gobernante y proyección (sin la ley). */
export function runVibration({ project, blast, minePoints }: PreparedRun) {
  const v = computeVibration(project, blast, {
    ...DEFAULT_VIBRATION_OPTIONS,
    skipGrid: true,
    extraPoints: minePoints,
  });
  const timed = v.notInitiated === 0;
  const label = new Map(blast.holes.map((h) => [h.id, h.label] as const));
  return {
    law_available: v.law !== null,
    law_calibrated: Boolean(v.law?.fit),
    ...(v.law?.fit
      ? { law_fit: { zone: v.law.fit.zone, records: v.law.fit.n, r2: round(v.law.fit.r2, 2) } }
      : {}),
    max_charge_per_delay_kg: finite(v.mic, 1),
    holes_without_firing_time: v.notInitiated,
    underground: v.underground,
    points: v.receivers.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind ?? null,
      mine_point: p.shared,
      distance_m: round(p.distance, 1),
      ppv_mm_s: finite(p.ppv * 1000, 2),
      limit_mm_s: p.limit ? round(p.limit.ppvMax * 1000, 2) : null,
      status: p.limit ? (p.exceeds ? 'over_limit' : 'ok') : 'no_limit',
      charge_per_delay_kg: finite(p.charge, 1),
      admissible_charge_kg: p.admissibleCharge !== null ? finite(p.admissibleCharge, 1) : null,
      airblast_db: finite(p.airblastDb, 0),
      governing_hole: p.governingHole ? (label.get(p.governingHole) ?? null) : null,
    })),
    flyrock_range_m: finite(v.flyrock.range, 0),
    warnings: [
      ...(v.law ? [] : ['El proyecto no tiene ley de vibración: no se puede calcular el PPV.']),
      ...(timed
        ? []
        : [
            `${String(v.notInitiated)} taladros cargados sin tiempo de salida: el PPV supone que salen solos y puede quedar bajo.`,
          ]),
    ],
  };
}

const muckpileStats = (r: MuckpileResult) => ({
  in_situ_volume_m3: round(r.stats.inSituVolume, 0),
  pile_volume_m3: round(r.stats.pileVolume, 0),
  max_displacement_m: round(r.stats.maxDisplacement, 1),
  mean_displacement_m: round(r.stats.meanDisplacement, 1),
  throw_m: round(r.stats.throw, 1),
  max_drop_m: round(r.stats.maxDrop, 1),
  lateral_spread_m: round(r.stats.lateralSpread, 1),
  max_height_m: round(r.stats.maxHeight, 1),
  static_blocks: r.stats.staticBlocks,
  warnings: r.warnings.map((w) => w.id),
});

/** Pila de material (banco o subterránea), sin los parámetros de velocidad. */
export function runMuckpile({ project, blast }: PreparedRun) {
  if (isUndergroundBlast(blast)) {
    const r = computeUndergroundMuckpile(project, blast.id);
    if (!r) throw new InputError('No se pudo simular la pila subterránea.');
    return { underground: true, ...muckpileStats(r) };
  }
  const r = computeMuckpile(project, blast.id, null);
  if (!r) throw new InputError('No se pudo simular la pila.');
  return { underground: false, ...muckpileStats(r) };
}

/** Ejecuta un módulo. Lo llama el proceso de cálculo. */
export function runModule(
  module: ModuleName,
  req: RunRequest,
): { result: unknown; signature: Signature } {
  const prepared = prepare(req);
  const signature = designSignature(prepared.project, prepared.blast, req.options);
  switch (module) {
    case 'analysis':
      return { result: runAnalysis(prepared), signature };
    case 'fragmentation':
      return { result: runFragmentation(prepared, req), signature };
    case 'vibration':
      return { result: runVibration(prepared), signature };
    case 'muckpile':
      return { result: runMuckpile(prepared), signature };
  }
}
