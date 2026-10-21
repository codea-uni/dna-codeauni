import {
  commands,
  DEFAULT_VIBRATION_OPTIONS,
  defaultVibrationLaw,
  excavationCenter,
  fitByZone,
  isUncalibratedLaw,
  lawFromFit,
  MONITORING_POINT_KINDS,
  type MonitoringPointKind,
  type VibrationFit,
} from '@cronos/core';
import { z } from 'zod';
import { getCompute, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { topographyTin } from '../topography/session';
import {
  minePointsForCalc,
  namedWorkings,
  sharePoint,
  useMineVibration,
} from '../vibration/mineStore';
import { blastOrFail, r, readOnlyGuard, ToolError, type ToolDef } from './tools';

/**
 * Herramientas del asistente para vibración en 3D y de la mina: punto de control en una labor (por
 * nombre o coordenadas), reporte de vibración en los puntos del proyecto y de la mina, y
 * calibración de la ley con las mediciones de sismógrafo de la mina.
 */

const { document } = session;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// ------------------------------------------------------------------ Punto en una labor

const pointSchema = z.object({
  name: z.string().optional().describe('Point name; default PCn or the working name.'),
  working: z
    .string()
    .optional()
    .describe(
      'Name of the working/excavation (e.g. "Frente de túnel · galería", "galería", or a working of another project of the mine shown as context). The point goes to its center.',
    ),
  x: z.number().optional().describe('East [m] (with y and z instead of a working).'),
  y: z.number().optional().describe('North [m].'),
  z: z.number().optional().describe('Elevation [m]; below ground for an underground working.'),
  kind: z
    .enum(MONITORING_POINT_KINDS as [MonitoringPointKind, ...MonitoringPointKind[]])
    .optional()
    .describe(
      'What the point protects: surface-structure, community, slope (pit wall), underground-working (default with a working), other.',
    ),
  ppv_limit_mm_s: z.number().positive().optional().describe('Own PPV limit [mm/s] if given.'),
  share_with_mine: z
    .boolean()
    .optional()
    .describe('true = also share it with the mine so every project of the mine uses it.'),
});

async function addWorkingPoint(args: z.infer<typeof pointSchema>) {
  readOnlyGuard();
  let position: { x: number; y: number; z: number } | null = null;
  let working: string | undefined;
  if (args.working) {
    const list = namedWorkings();
    const key = norm(args.working);
    const w =
      list.find((x) => norm(x.name) === key || norm(x.alias ?? '') === key) ??
      list.find((x) => norm(x.name).includes(key));
    if (!w)
      throw new ToolError(
        list.length === 0
          ? 'No workings: design a face/rings, or show the workings of another project of the mine in the vibration panel, or give x, y, z.'
          : `Working not found. Available: ${list.map((x) => x.name).join(', ')}`,
      );
    position = excavationCenter(w.sections);
    working = w.name;
  } else if (args.x !== undefined && args.y !== undefined && args.z !== undefined)
    position = { x: args.x, y: args.y, z: args.z };
  if (!position) throw new ToolError('Give a working name or x, y and z.');
  const kind: MonitoringPointKind = args.kind ?? (working ? 'underground-working' : 'other');
  const { ops, point } = commands.addMonitoringPoint(document, position, args.name ?? working, {
    kind,
    ...(working ? { working } : {}),
  });
  const withLimit =
    args.ppv_limit_mm_s !== undefined ? { ...point, ppvLimit: args.ppv_limit_mm_s / 1000 } : point;
  const list = document.project.monitoringPoints ?? [];
  document.dispatch(
    args.ppv_limit_mm_s !== undefined
      ? [{ type: 'project/patch', patch: { monitoringPoints: [...list, withLimit] } }]
      : ops,
    `IA: punto de control ${point.name}`,
  );
  useAnalysisStore.getState().set({ vibEnabled: true });
  let shared = false;
  if (args.share_with_mine) {
    if (!useMineVibration.getState().mineId)
      throw new ToolError('Point added, but there is no mine to share with (local project).');
    await sharePoint(withLimit);
    shared = true;
  }
  return {
    point: point.name,
    kind,
    x: r(position.x, 1),
    y: r(position.y, 1),
    z: r(position.z, 1),
    working: working ?? null,
    shared_with_mine: shared,
  };
}

// ------------------------------------------------------------------ Reporte

async function vibrationReport() {
  const blast = blastOrFail();
  const project = document.project;
  const tin = blast.bench.topographyId ? (topographyTin(blast.bench.topographyId) ?? null) : null;
  const lawId = useAnalysisStore.getState().vibLawId;
  const v = await getCompute().api.computeVibration(
    project,
    blast.id,
    {
      ...DEFAULT_VIBRATION_OPTIONS,
      skipGrid: true,
      ...(lawId ? { lawId } : {}),
      extraPoints: minePointsForCalc(),
    },
    tin,
  );
  if (!v) throw new ToolError('The project has no blast.');
  const law = v.law ?? defaultVibrationLaw(project, blast);
  const warnings: string[] = [];
  if (isUncalibratedLaw(law))
    warnings.push(
      'Uncalibrated vibration law (not fitted to seismograph records of this mine): results are indicative.',
    );
  for (const rec of v.receivers)
    if (rec.exceeds && rec.crossing)
      warnings.push(
        v.underground
          ? `Underground blast exceeds the limit at surface point ${rec.name} (${rec.kind ?? 'surface'}).`
          : `Surface blast exceeds the limit at underground working ${rec.name}.`,
      );
  return {
    blast: v.underground ? 'underground' : 'surface',
    law: law
      ? {
          name: law.name,
          k_mm_s: r(law.k * 1000, 0),
          beta: r(law.beta, 2),
          calibrated: !isUncalibratedLaw(law),
        }
      : null,
    max_charge_per_delay_kg: r(v.mic, 1),
    points: v.receivers.map((p) => ({
      name: p.name,
      kind: p.kind ?? 'surface',
      mine_point: p.shared,
      distance_3d_m: r(p.distance, 1),
      charge_per_delay_kg: r(p.charge, 1),
      ppv_mm_s: r(p.ppv * 1000, 1),
      limit_mm_s: p.limit ? r(p.limit.ppvMax * 1000, 1) : null,
      status: !p.limit
        ? 'no limit'
        : p.exceeds
          ? 'EXCEEDS'
          : p.ppv > 0.8 * p.limit.ppvMax
            ? 'near'
            : 'ok',
      admissible_charge_kg: p.admissibleCharge !== null ? r(p.admissibleCharge, 1) : null,
    })),
    warnings,
    note:
      v.receivers.length === 0
        ? 'No monitoring points: add them with add_working_point or add_protected_point, or share them from another project of the mine.'
        : undefined,
  };
}

// ------------------------------------------------------------------ Calibración

const calibrateSchema = z.object({
  zone: z
    .string()
    .optional()
    .describe('Zone/sector of the records; default all zones of the type.'),
  context: z
    .enum(['surface', 'underground'])
    .optional()
    .describe('Blast type of the records; default the type of the current blast.'),
  scaling: z
    .enum(['square-root', 'cube-root', 'best'])
    .optional()
    .describe('Scaled distance; default best R².'),
  level: z
    .union([z.literal(50), z.literal(95)])
    .optional()
    .describe('Default 95 % (design).'),
  apply: z.boolean().optional().describe('true (default) = use the law in the project.'),
});

function calibrateLaw(args: z.infer<typeof calibrateSchema>) {
  const records = useMineVibration.getState().records;
  if (records.length === 0)
    throw new ToolError(
      'The mine has no seismograph records: import a CSV in Vibration → Calibration first.',
    );
  const blast = document.project.blasts[0];
  const ug = blast?.holes.some((h) => h.tags?.some((t) => t.startsWith('ug-'))) ?? false;
  const context = args.context ?? (ug ? 'underground' : 'surface');
  const zones = fitByZone(records).filter((f) => f.context === context);
  const key = args.zone ? norm(args.zone) : '';
  const zone =
    (key ? zones.find((f) => norm(f.zone) === key) : null) ??
    zones.find((f) => f.zone === '') ??
    (zones.length === 1 ? zones[0] : undefined);
  if (!zone)
    throw new ToolError(
      `No records for that zone and type. Zones: ${zones.map((f) => f.zone || 'all').join(', ') || 'none'}`,
    );
  const options = [zone.squareRoot, zone.cubeRoot].filter((f): f is VibrationFit => f !== null);
  const fit =
    args.scaling === 'square-root'
      ? zone.squareRoot
      : args.scaling === 'cube-root'
        ? zone.cubeRoot
        : (options.sort((a, b) => b.r2 - a.r2)[0] ?? null);
  if (!fit) throw new ToolError('At least 3 records with different distances are needed.');
  const level = args.level ?? 95;
  const result = {
    zone: zone.zone || 'all',
    context,
    scaling: fit.scaling,
    n: fit.n,
    k50_mm_s: r(fit.k * 1000, 0),
    k95_mm_s: r(fit.k95 * 1000, 0),
    beta: r(fit.beta, 3),
    r2: r(fit.r2, 3),
    applied: false,
  };
  if (args.apply === false) return result;
  readOnlyGuard();
  const law = lawFromFit(fit, { zone: zone.zone, context, level });
  const site = document.project.siteModels;
  const others = site.vibrationLaws.filter(
    (l) => !(l.fit?.zone === zone.zone && (l.context ?? 'surface') === context),
  );
  document.dispatch(
    commands.setSiteModels({ ...site, vibrationLaws: [...others, law] }),
    `IA: ley de vibración ${law.name}`,
  );
  useAnalysisStore.getState().set({ vibLawId: law.id, vibEnabled: true });
  return { ...result, applied: true, law: law.name };
}

export const VIBRATION_TOOLS: Record<string, ToolDef> = {
  add_working_point: {
    description:
      'Add a 3D vibration monitoring point with free elevation: in an underground working (by its name, from this project or from another project of the mine shown as context) or at x, y, z; with its type (community, slope/pit wall, surface structure, underground working). Optionally share it with the mine so every project uses it. Use it for "mide la vibración en la galería…", "pon un punto en la labor…", "un punto en el talud a cota…".',
    schema: pointSchema,
    run: addWorkingPoint,
  },
  vibration_report: {
    description:
      'Vibration at every monitoring point of the project AND of the mine (shared points): 3D distance, governing charge per delay (8 ms window), PPV, limit, status and admissible charge; warns when an underground blast exceeds the limit at a surface slope/community or a surface blast exceeds it in a working, and when the law is not calibrated.',
    schema: z.object({}),
    run: vibrationReport,
  },
  calibrate_vibration_law: {
    description:
      'Fit the site vibration law (site factor K, β) to the seismograph records of the mine by zone and blast type (log-log regression, square or cube root), report K50, K95, β, R², n and, unless apply is false, use it in the project (95 % envelope by default).',
    schema: calibrateSchema,
    run: calibrateLaw,
  },
};

export const VIBRATION_READ_ONLY = ['vibration_report'];
