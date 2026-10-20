import type { Project, ProjectKind } from './types';

/** Tipos de proyecto en el orden en que se muestran (Open Pit primero: es lo que ya se usa). */
export const PROJECT_KINDS: readonly ProjectKind[] = ['surface', 'underground'];

/** Tipo del proyecto; los guardados antes de existir el campo son superficiales. */
export function projectKind(project: Pick<Project, 'kind'> | null | undefined): ProjectKind {
  return project?.kind === 'underground' ? 'underground' : 'surface';
}

/** Interpreta un texto libre (parámetro de URL, argumento del asistente) como tipo de proyecto. */
export function parseProjectKind(value: unknown): ProjectKind | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!v) return null;
  if (/^(underground|subterrane[oa]|sub|ug|mina subterranea|interior)$/.test(v))
    return 'underground';
  if (/^(surface|superficial|open ?pit|openpit|tajo( abierto)?|rajo|cielo abierto|op)$/.test(v))
    return 'surface';
  return null;
}
