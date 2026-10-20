import { chargeCenter } from '@cronos/core';
import { z } from 'zod';
import { getCompute, session } from '../session';
import { resolveHole } from './holeResolution';
import { blastOrFail, r, ToolError, type ToolDef } from './tools';

/**
 * Herramientas del asistente para el modelo geotécnico de bloques: qué roca hay en un taladro o en
 * un punto, y el resumen de roca de la voladura (litologías, competencia, caminos a los puntos de
 * control). Solo leen.
 */

async function rockAt(args: { hole?: string | undefined; x?: number; y?: number; z?: number }) {
  const blast = blastOrFail();
  const project = session.document.project;
  let point: { x: number; y: number; z: number };
  let hole: string | null = null;
  if (args.hole) {
    const h = resolveHole(blast.holes, args.hole).hole;
    point = chargeCenter(h);
    hole = h.label;
  } else if (args.x !== undefined && args.y !== undefined) {
    point = {
      x: args.x,
      y: args.y,
      z: args.z ?? blast.bench.floorElevation + blast.bench.height / 2,
    };
  } else throw new ToolError('Give a hole label or x and y.');
  const rock = await getCompute().api.rockAt(project, blast.id, point);
  if (!rock) throw new ToolError('The project has no blast.');
  const geotech = project.topography.some((s) => s.blockModel?.geotechnical);
  return {
    ...(hole ? { hole } : {}),
    point: { x: r(point.x), y: r(point.y), z: r(point.z) },
    source: rock.inModel ? 'geotechnical block model' : 'project rock mass',
    ...(geotech ? {} : { note: 'No geotechnical block model in the project.' }),
    lithology: rock.lithology,
    density_t_m3: r(rock.density / 1000, 3),
    ucs_mpa: r(rock.ucs / 1e6, 1),
    young_gpa: r(rock.youngModulus / 1e9, 1),
    ...(rock.vp !== undefined ? { vp_m_s: Math.round(rock.vp) } : {}),
    ...(rock.tensileStrength !== undefined
      ? { tensile_mpa: r(rock.tensileStrength / 1e6, 1) }
      : {}),
    ...(rock.rmr !== null ? { rmr: r(rock.rmr, 0) } : {}),
    ...(rock.gsi !== null ? { gsi: r(rock.gsi, 0) } : {}),
    ...(rock.rockFactor !== undefined ? { rock_factor_A: r(rock.rockFactor, 2) } : {}),
    ...(rock.vppc !== undefined ? { critical_ppv_mm_s: Math.round(rock.vppc * 1000) } : {}),
  };
}

async function blastRock() {
  const blast = blastOrFail();
  const res = await getCompute().api.holeRocks(session.document.project, blast.id);
  if (!res)
    return {
      enabled: false,
      note: 'Rock from geotechnical model is off or there is no geotechnical block model: the project rock mass applies to every hole.',
    };
  return {
    enabled: true,
    holes_in_model: res.summary.inModel,
    holes: res.summary.holes,
    by_lithology: res.summary.byLithology.map((l) => ({
      lithology: l.name ?? 'outside model',
      holes: l.holes,
      kg: Math.round(l.kg),
    })),
    by_competence_class: res.summary.byClass,
    rock_factor_A_weighted: res.summary.rockFactor === null ? null : r(res.summary.rockFactor, 2),
    wave_paths: res.paths.map((p) => ({
      point: p.name,
      length_m: Math.round(p.path.length),
      dominant_lithology: p.path.dominantLithology,
      in_model_pct: Math.round(p.path.inModel * 100),
      rmr: p.path.rmr === null ? null : Math.round(p.path.rmr),
      vp_m_s: p.path.vp === null ? null : Math.round(p.path.vp),
    })),
    note: 'Wave paths are informative: the calibrated vibration law (K, beta) is unchanged.',
  };
}

export const GEOTECH_TOOLS: Record<string, ToolDef> = {
  rock_at: {
    description:
      'Which rock is at a hole (block of its charge center) or at a point: lithology, density, UCS, Young modulus, Vp, tensile strength, RMR/GSI, Kuz-Ram rock factor A and critical PPV, from the geotechnical block model (or the project rock mass outside it). For «¿qué roca hay en el taladro N / en este punto?».',
    schema: z.object({
      hole: z.string().optional().describe('Hole label (or position 1–N).'),
      x: z.number().optional().describe('East [m] (if no hole).'),
      y: z.number().optional().describe('North [m].'),
      z: z.number().optional().describe('Elevation [m]; default mid-bench.'),
    }),
    run: rockAt,
  },
  blast_rock: {
    description:
      'Rock of the whole blast from the geotechnical block model: holes per lithology and competence class, charge-weighted rock factor, and what the vibration wave crosses to each monitoring point (dominant lithology, mean RMR, Vp; informative only).',
    schema: z.object({}),
    run: blastRock,
  },
};

export const GEOTECH_READ_ONLY = ['rock_at', 'blast_rock'];
