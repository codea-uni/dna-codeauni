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
    format: 'blastlab-project',
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

/**
 * Migraciones de esquema: cada entrada lleva un JSON de la versión `n` a la `n + 1`.
 * Vacío mientras exista solo la versión 1.
 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

function migrate(data: Record<string, unknown>): Record<string, unknown> {
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
  const migrated = migrate(data as Record<string, unknown>);
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
