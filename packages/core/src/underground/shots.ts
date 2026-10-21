import type { Blast, BlastId, Hole, HoleId, Project } from '../model/types';
import { CUT_TAG, GUIDE_TAG, RELIEF_TAG, UNDERGROUND_TAG_PREFIX } from './toHoles';

/**
 * Disparos subterráneos: cada diseño llevado al 3D (el frente `ug-face`, el set de abanicos
 * `ug-ring` y cada plantilla por método `ug-…`) es una voladura propia aunque comparta la voladura
 * del documento. Se dispara en otro momento y con su propia secuencia, así que sus tiempos no se
 * acoplan con los de otro disparo y la fragmentación, la vibración y la cubicación se calculan por
 * disparo. Los taladros de superficie (sin marca `ug-`) forman un solo disparo (clave '').
 */

/** Marcas auxiliares que no identifican un diseño (alivios, arranque, guías del contorno). */
const AUX_TAGS = new Set<string>([RELIEF_TAG, CUT_TAG, GUIDE_TAG]);

/** Clave del disparo al que pertenece el taladro: la marca de su diseño subterráneo o ''. */
export function shotTag(hole: Pick<Hole, 'tags'>): string {
  for (const t of hole.tags ?? [])
    if (t.startsWith(UNDERGROUND_TAG_PREFIX) && !AUX_TAGS.has(t)) return t;
  return '';
}

export interface UndergroundShot {
  /** Marca del diseño (`ug-face`, `ug-ring`, `ug-…`). */
  tag: string;
  holeIds: HoleId[];
}

/** Disparos subterráneos de la voladura, en orden de aparición de sus taladros. */
export function undergroundShots(blast: Pick<Blast, 'holes'>): UndergroundShot[] {
  const byTag = new Map<string, HoleId[]>();
  for (const h of blast.holes) {
    const tag = shotTag(h);
    if (!tag) continue;
    let ids = byTag.get(tag);
    if (!ids) byTag.set(tag, (ids = []));
    ids.push(h.id);
  }
  return [...byTag].map(([tag, holeIds]) => ({ tag, holeIds }));
}

/**
 * La voladura reducida a un disparo: solo sus taladros, la red de inicio sin los puntos ni las
 * conexiones de otros taladros y solo sus excavaciones de contexto. Con `tag` '' quedan los
 * taladros de superficie. El resto de la voladura (banco, roca, parámetros) no cambia.
 */
export function blastForShot(blast: Blast, tag: string): Blast {
  const holes = blast.holes.filter((h) => shotTag(h) === tag);
  const keep = new Set<string>(holes.map((h) => h.id));
  const ok = (ref: { kind: string; holeId?: HoleId }) =>
    ref.kind !== 'hole' || (ref.holeId !== undefined && keep.has(ref.holeId));
  const plan = blast.initiation;
  const out: Blast = {
    ...blast,
    holes,
    initiation: {
      ...plan,
      connections: plan.connections.filter((c) => ok(c.from) && ok(c.to)),
      initiationPoints: plan.initiationPoints.filter((p) => ok(p.at)),
    },
  };
  if (blast.excavations) out.excavations = blast.excavations.filter((e) => e.tag === tag);
  return out;
}

/**
 * Proyecto con la voladura `blastId` reducida al disparo `tag` (para pasar a los cálculos que
 * reciben proyecto + voladura: análisis, fragmentación, vibración, informe). Sin `tag` (null) o
 * con un solo disparo en la voladura devuelve el mismo proyecto.
 */
export function projectForShot(project: Project, blastId: BlastId, tag: string | null): Project {
  if (tag === null) return project;
  const blast = project.blasts.find((b) => b.id === blastId);
  if (!blast) return project;
  if (!blast.holes.some((h) => shotTag(h) !== tag)) return project;
  return {
    ...project,
    blasts: project.blasts.map((b) => (b.id === blastId ? blastForShot(b, tag) : b)),
  };
}

/**
 * Disparo que se analiza: el elegido si sigue en la voladura; si no, el primero. `null` cuando la
 * voladura tiene a lo sumo un disparo (no hace falta separar nada).
 */
export function resolveShot(blast: Pick<Blast, 'holes'>, wanted: string | null): string | null {
  const shots = undergroundShots(blast);
  const hasSurface = blast.holes.some((h) => shotTag(h) === '');
  if (shots.length + (hasSurface ? 1 : 0) <= 1) return null;
  if (wanted !== null && (shots.some((s) => s.tag === wanted) || (wanted === '' && hasSurface)))
    return wanted;
  return shots[0]?.tag ?? null;
}

/** Índices de `items` agrupados por disparo (clave de `shotTag`), en orden de aparición. */
export function indicesByShot(items: readonly Pick<Hole, 'tags'>[]): number[][] {
  const groups = new Map<string, number[]>();
  items.forEach((h, i) => {
    const k = shotTag(h);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(i);
  });
  return [...groups.values()];
}
