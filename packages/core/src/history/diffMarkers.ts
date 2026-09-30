import type { Project, Vec3 } from '../model/types';
import type { ProjectDiff } from './diffProjects';

/**
 * Marcadores para dibujar una comparación de versiones sobre el plano (D-14): dónde está cada
 * taladro agregado, quitado (su posición anterior), movido (antes y después) o cambiado en su
 * lugar. Coordenadas del proyecto [m]; el engine las pasa al origen local.
 */
export interface DiffMarker {
  kind: 'added' | 'removed' | 'moved' | 'changed';
  holeId: string;
  label: string;
  /** Posición del collar en la versión nueva (en la anterior, para los quitados). */
  position: Vec3;
  /** Posición anterior del collar (solo movidos). */
  from?: Vec3;
}

/** O(n) sobre taladros: en el navegador va en el worker, junto con `diffProjects`. */
export function diffMarkers(before: Project, after: Project, diff: ProjectDiff): DiffMarker[] {
  const collars = (p: Project) =>
    new Map(p.blasts.flatMap((b) => b.holes.map((h) => [h.id as string, h.collar] as const)));
  const oldCollars = collars(before);
  const newCollars = collars(after);
  const markers: DiffMarker[] = [];
  for (const blast of diff.blasts)
    for (const h of blast.holes) {
      const now = newCollars.get(h.id);
      const then = oldCollars.get(h.id);
      if (h.kind === 'added' && now)
        markers.push({ kind: 'added', holeId: h.id, label: h.label, position: now });
      else if (h.kind === 'removed' && then)
        markers.push({ kind: 'removed', holeId: h.id, label: h.label, position: then });
      else if (h.kind === 'changed' && now) {
        if (h.moved > 0 && then)
          markers.push({ kind: 'moved', holeId: h.id, label: h.label, position: now, from: then });
        else markers.push({ kind: 'changed', holeId: h.id, label: h.label, position: now });
      }
    }
  return markers;
}
