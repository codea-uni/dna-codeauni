import { DEFAULT_CALC_PARAMS } from '../model/factories';
import { uuidv7 } from '../model/ids';
import { SCHEMA_VERSION } from '../model/schema';
import type { Project, ProjectFile } from '../model/types';
import { projectFileSchema } from './projectSchema';
import { assetHash, bytesToBase64, encodeAsset } from '../topography/asset';

export interface SerializeOptions {
  appVersion: string;
  now?: Date;
  /** Assets de topografía a embeber (hash → base64), para un archivo autocontenido (D-16). */
  embeddedAssets?: Record<string, string>;
}

export function toProjectFile(project: Project, options: SerializeOptions): ProjectFile {
  const savedAt = (options.now ?? new Date()).toISOString();
  return {
    format: 'cronos-project',
    schemaVersion: SCHEMA_VERSION,
    savedAt,
    appVersion: options.appVersion,
    project: { ...project, updatedAt: savedAt },
    ...(options.embeddedAssets && Object.keys(options.embeddedAssets).length
      ? { embeddedAssets: options.embeddedAssets }
      : {}),
  };
}

export function serializeProject(project: Project, options: SerializeOptions): string {
  return JSON.stringify(toProjectFile(project, options));
}

export type ParseResult = { ok: true; file: ProjectFile } | { ok: false; error: string };

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Migraciones de esquema: cada entrada lleva un JSON de la versión `n` a la `n + 1`. */
export const MIGRATIONS: Record<number, (data: Json) => Json> = {
  /** v1 → v2: `blast.boundary` (un polígono) pasa a `blast.boundaries[]` con caras libres. */
  1: (data) => {
    const project = data.project;
    if (!isObject(project) || !Array.isArray(project.blasts)) return data;
    const blasts = (project.blasts as unknown[]).map((b) => {
      if (!isObject(b)) return b;
      const { boundary, ...rest } = b;
      const boundaries =
        Array.isArray(boundary) && boundary.length >= 3
          ? [{ id: uuidv7(), name: 'Perímetro 1', polygon: boundary, freeFaceEdges: [] }]
          : [];
      return { ...rest, boundaries };
    });
    return { ...data, project: { ...project, blasts } };
  },
  /**
   * v2 → v3 (G1, `docs/theory/03 §2–3`): grupos y parámetros de cálculo en cada voladura;
   * `waterResistant` (booleano) pasa a `waterResistance` y `minDiameter` a `criticalDiameter`.
   */
  2: (data) => {
    const project = data.project;
    if (!isObject(project)) return data;
    const blasts = Array.isArray(project.blasts)
      ? (project.blasts as unknown[]).map((b) =>
          isObject(b) ? { groups: [], calcParams: structuredClone(DEFAULT_CALC_PARAMS), ...b } : b,
        )
      : project.blasts;
    const library = project.library;
    const explosives =
      isObject(library) && Array.isArray(library.explosives)
        ? (library.explosives as unknown[]).map((e) => {
            if (!isObject(e)) return e;
            const { waterResistant, minDiameter, ...rest } = e;
            return {
              ...rest,
              waterResistance: waterResistant === true ? 'high' : 'none',
              ...(minDiameter === undefined ? {} : { criticalDiameter: minDiameter }),
            };
          })
        : undefined;
    return {
      ...data,
      project: {
        ...project,
        blasts,
        ...(explosives && isObject(library) ? { library: { ...library, explosives } } : {}),
      },
    };
  },
  /**
   * v3 → v4 (respuestas del ingeniero, `docs/QUESTIONS.md`): `reliefTime` pasa a `reliefRate`
   * (P-02) y se agregan la convención de sobreperforación (P-05) y los umbrales nuevos.
   */
  3: fillCalcParams,
  /** v4 → v5 (G5): guía de retardos por metro y umbrales de burden efectivo. */
  4: fillCalcParams,
  /** v5 → v6 (F2, A1): adelanto mínimo del precorte. */
  5: fillCalcParams,
  /** v6 → v7 (F2, A1b): aviso intermedio de burden efectivo (P-16). */
  6: fillCalcParams,
  /** v7 → v8 (F2, A3): desviación de perforación de Kuz-Ram y rango de n. */
  7: fillCalcParams,
  /** v8 → v9 (F2, A4): bandas de SDOB e intervalo mínimo entre filas. */
  8: fillCalcParams,
  /** v9 → v10 (F2, A5): parámetros de desplazamiento y costo de perforación. */
  9: fillCalcParams,
  /**
   * v10 → v11 (D-16): las superficies en línea (`project.surfaces`, TIN como JSON) pasan a ser
   * levantamientos topográficos con su TIN como asset `CRTS` embebido; `bench.topSurfaceId` pasa
   * a `bench.topographyId` y se descarta `floorSurfaceId` (no se usaba).
   */
  10: (data) => {
    const project = data.project;
    if (!isObject(project)) return data;
    const embedded: Json = isObject(data.embeddedAssets) ? { ...data.embeddedAssets } : {};
    const date = (typeof project.updatedAt === 'string' ? project.updatedAt : '').slice(0, 10);
    const surveys: Json[] = [];
    for (const raw of Array.isArray(project.surfaces) ? (project.surfaces as unknown[]) : []) {
      if (!isObject(raw) || !Array.isArray(raw.vertices) || !Array.isArray(raw.triangles)) continue;
      const vertices = Float64Array.from(raw.vertices as number[]);
      const triangles = Uint32Array.from(raw.triangles as number[]);
      const bytes = encodeAsset({ kind: 'tin', tin: { vertices, triangles } });
      const hash = assetHash(bytes);
      embedded[hash] = bytesToBase64(bytes);
      surveys.push({
        id: raw.id,
        name: typeof raw.name === 'string' ? raw.name : 'Topografía',
        surveyDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '2026-01-01',
        source: { format: 'legacy', files: [] },
        bounds: tinBounds(vertices),
        stats: { points: vertices.length / 3, triangles: triangles.length / 3, lines: 0 },
        assets: { tin: hash },
      });
    }
    const bench = (b: unknown) => {
      if (!isObject(b) || !isObject(b.bench)) return b;
      const { topSurfaceId, ...rest } = b.bench;
      delete rest.floorSurfaceId;
      return { ...b, bench: { ...rest, ...(topSurfaceId ? { topographyId: topSurfaceId } : {}) } };
    };
    const blasts = Array.isArray(project.blasts) ? (project.blasts as unknown[]).map(bench) : [];
    const scenarios = Array.isArray(project.scenarios)
      ? (project.scenarios as unknown[]).map((sc) =>
          isObject(sc) ? { ...sc, blast: bench(sc.blast) } : sc,
        )
      : undefined;
    const projectRest: Json = { ...project };
    delete projectRest.surfaces;
    return {
      ...data,
      ...(Object.keys(embedded).length ? { embeddedAssets: embedded } : {}),
      project: {
        ...projectRest,
        topography: [
          ...(Array.isArray(project.topography) ? (project.topography as unknown[]) : []),
          ...surveys,
        ],
        blasts,
        ...(scenarios ? { scenarios } : {}),
      },
    };
  },
  /**
   * v11 → v12: piso propio por perímetro (`BlastBoundary.floorElevation`, opcional). Sin él, el
   * perímetro usa el piso del banco, como hasta ahora: no hay nada que convertir.
   */
  11: (data) => data,
  /**
   * v12 → v13 (A7, pila de material): parámetros de la pila con sus valores por defecto. Los
   * dominios de material (`blast.domains`) son opcionales: sin ellos no hay nada que convertir.
   */
  12: fillCalcParams,
  /**
   * v13 → v14 (A7b, cara libre configurable): ángulo y alto propios por perímetro (opcionales: sin
   * ellos rige el banco) y lanzamiento de la pila según la cara (defecto activado).
   */
  13: fillCalcParams,
};

/** Caja envolvente de vértices x, y, z intercalados. */
function tinBounds(v: Float64Array) {
  const b = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
  for (let i = 0; i + 2 < v.length; i += 3) {
    const x = v[i] ?? 0;
    const y = v[i + 1] ?? 0;
    const z = v[i + 2] ?? 0;
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.minZ = Math.min(b.minZ, z);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
    b.maxZ = Math.max(b.maxZ, z);
  }
  return v.length ? b : { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
}

/** Completa `calcParams` de cada voladura con los valores por defecto de los campos que falten. */
function fillCalcParams(data: Json): Json {
  const project = data.project;
  if (!isObject(project) || !Array.isArray(project.blasts)) return data;
  const d = DEFAULT_CALC_PARAMS;
  const blasts = (project.blasts as unknown[]).map((b) => {
    if (!isObject(b)) return b;
    const cp = isObject(b.calcParams) ? b.calcParams : {};
    const checks = isObject(cp.checks) ? cp.checks : {};
    const muckpile = isObject(cp.muckpile) ? cp.muckpile : {};
    const calcParams: Json = {
      ...d,
      ...cp,
      checks: { ...d.checks, ...checks },
      muckpile: { ...d.muckpile, ...muckpile },
    };
    delete calcParams.reliefTime;
    return { ...b, calcParams };
  });
  return { ...data, project: { ...project, blasts } };
}

function migrate(data: Json): Json {
  let current = data;
  let version = typeof current.schemaVersion === 'number' ? current.schemaVersion : NaN;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    current = step(current);
    version++;
    current = { ...current, schemaVersion: version };
  }
  return current;
}

/** Parsea y valida un archivo de proyecto (aplicando migraciones si hace falta). */
export function parseProjectFile(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido.' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: 'El archivo no contiene un proyecto.' };
  }
  const raw = data as Json;
  // Archivos guardados antes del cambio de nombre a Cronos (D-09).
  const named = raw.format === 'blastlab-project' ? { ...raw, format: 'cronos-project' } : raw;
  const migrated = migrate(named);
  const version = migrated.schemaVersion;
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `El archivo usa el esquema v${version}, más nuevo que el soportado (v${SCHEMA_VERSION}).`,
    };
  }
  const result = projectFileSchema.safeParse(migrated);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    return { ok: false, error: `Proyecto inválido en "${path}": ${issue?.message ?? 'error'}` };
  }
  return { ok: true, file: result.data };
}
