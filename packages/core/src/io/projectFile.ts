import { DEFAULT_CALC_PARAMS } from '../model/factories';
import { uuidv7 } from '../model/ids';
import { SCHEMA_VERSION } from '../model/schema';
import type { Project, ProjectFile } from '../model/types';
import { projectFileSchema } from './projectSchema';

export interface SerializeOptions {
  appVersion: string;
  now?: Date;
}

export function toProjectFile(project: Project, options: SerializeOptions): ProjectFile {
  const savedAt = (options.now ?? new Date()).toISOString();
  return {
    format: 'cronos-project',
    schemaVersion: SCHEMA_VERSION,
    savedAt,
    appVersion: options.appVersion,
    project: { ...project, updatedAt: savedAt },
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
};

/** Completa `calcParams` de cada voladura con los valores por defecto de los campos que falten. */
function fillCalcParams(data: Json): Json {
  const project = data.project;
  if (!isObject(project) || !Array.isArray(project.blasts)) return data;
  const d = DEFAULT_CALC_PARAMS;
  const blasts = (project.blasts as unknown[]).map((b) => {
    if (!isObject(b)) return b;
    const cp = isObject(b.calcParams) ? b.calcParams : {};
    const checks = isObject(cp.checks) ? cp.checks : {};
    const calcParams: Json = { ...d, ...cp, checks: { ...d.checks, ...checks } };
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
