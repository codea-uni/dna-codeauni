import {
  hasUndergroundCharges,
  isUndergroundHole,
  type MuckpileResult,
  type UgMuckpileParams,
  type UndergroundMuckpileResult,
} from '@cronos/core';
import { isUndergroundPile, muckpileEnd, sequenceTimes } from '../analysis/visualize';
import { getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { useUgAnalysisStore } from './analysisStore';

/**
 * Pila subterránea en la vista: qué pila corresponde a la voladura (banco o subterránea), cámara
 * de costado al túnel para ver la roca saliendo del frente y amontonándose, y la reproducción de la
 * secuencia con el vuelo de los bloques (pestaña Análisis y asistente).
 */

/** Duración de la animación con la pila [s reales]. */
const PILE_SECONDS = 14;

/**
 * La pila que corresponde a la voladura activa: la subterránea si el proyecto es subterráneo o si
 * sus taladros cargados son todos `ug-*`; si no, la de banco (Open Pit no cambia).
 */
export function autoPileTarget(): 'bench' | 'underground' {
  const project = session.document.project;
  const blast = project.blasts[0];
  if (!blast || !hasUndergroundCharges(blast)) return 'bench';
  if (project.kind === 'underground') return 'underground';
  const surfaceCharged = blast.holes.some(
    (h) => !isUndergroundHole(h) && h.decks.some((d) => d.kind === 'explosive'),
  );
  return surfaceCharged ? 'bench' : 'underground';
}

/** La pila guardada es del tipo pedido. */
export function pileMatches(r: MuckpileResult | null, target: 'bench' | 'underground'): boolean {
  return r !== null && isUndergroundPile(r) === (target === 'underground');
}

/** Parámetros de la pila subterránea de la pestaña Análisis. */
export function ugPileParams(): Partial<UgMuckpileParams> {
  const s = useUgAnalysisStore.getState();
  return {
    swell: s.pileSwell,
    reposeAngle: (s.pileRepose * Math.PI) / 180,
    throwFactor: s.pileThrowFactor,
  };
}

/** La pila subterránea vigente (de esta versión del documento) o null. */
export function currentUgPile(): UndergroundMuckpileResult | null {
  const a = useAnalysisStore.getState();
  const r = a.muckpile;
  return r && isUndergroundPile(r) && a.muckpileVersion === session.document.version ? r : null;
}

/**
 * Cámara de costado al túnel: mira el frente desde la galería, a un lado y desde arriba, para ver
 * el vuelo y la pila. En tajeos y chimeneas, de costado a la caja de origen y destino.
 */
export function flyToPile(r: UndergroundMuckpileResult): boolean {
  const engine = getEngine();
  const b = r.blocks;
  if (!engine || b.count === 0) return false;
  let ox = 0;
  let oy = 0;
  let oz = 0;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let k = 0; k < b.count; k++) {
    const x0 = b.origin[3 * k] ?? 0;
    const y0 = b.origin[3 * k + 1] ?? 0;
    const z0 = b.origin[3 * k + 2] ?? 0;
    const x1 = b.destination[3 * k] ?? 0;
    const y1 = b.destination[3 * k + 1] ?? 0;
    const z1 = b.destination[3 * k + 2] ?? 0;
    ox += x0;
    oy += y0;
    oz += z0;
    dx += x1;
    dy += y1;
    dz += z1;
    minX = Math.min(minX, x0, x1);
    minY = Math.min(minY, y0, y1);
    minZ = Math.min(minZ, z0, z1);
    maxX = Math.max(maxX, x0, x1);
    maxY = Math.max(maxY, y0, y1);
    maxZ = Math.max(maxZ, z0, z1);
  }
  const n = b.count;
  ox /= n;
  oy /= n;
  oz /= n;
  dx /= n;
  dy /= n;
  dz /= n;
  const face = r.underground.designs.some((d) => d.mode === 'face');
  // Hacia dónde se movió la roca (en planta): la cámara se pone de ese lado, 35° de costado.
  const mx = dx - ox;
  const my = dy - oy;
  const moved = Math.hypot(mx, my) > 0.5;
  const heading = moved ? (Math.atan2(mx, my) * 180) / Math.PI : 0;
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  useUiStore.getState().setViewMode('3d');
  engine.flyCamera({
    at: face
      ? { x: ox + 0.45 * mx, y: oy + 0.45 * my, z: Math.min(oz, dz) }
      : { x: (ox + dx) / 2, y: (oy + dy) / 2, z: (oz + dz) / 2 },
    size: face ? Math.max(14, extent * 0.9) : Math.max(12, extent * 1.3),
    yawDeg: ((((moved ? heading : 0) + 35) % 360) + 360) % 360,
    pitchDeg: face ? 24 : 15,
    mode: '3d',
  });
  return true;
}

/**
 * Reproduce la secuencia con el vuelo de la pila subterránea (cámara de costado al túnel). Devuelve
 * false si falta el análisis o la pila.
 */
export function playUndergroundPile(camera = true): boolean {
  const engine = getEngine();
  const a = useAnalysisStore.getState();
  const r = currentUgPile();
  if (!engine || !a.analysis || !r) return false;
  const times = sequenceTimes(a.analysis);
  if (times.size === 0) return false;
  if (camera) flyToPile(r);
  const first = a.analysis.timing.firstTime;
  const end = Math.max(muckpileEnd(r, null), a.analysis.timing.lastTime + 0.3);
  const from = first - 0.05;
  const speed = Math.max(0.001, (end - from) / PILE_SECONDS);
  a.set({ sequenceSpeed: speed, sequencePlaying: true });
  a.setLayer('muckpileBlocks', true);
  engine.playSequence(times, speed, from, end);
  return true;
}

const r1 = (v: number, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/** Indicadores de la pila subterránea para el asistente (unidades en el nombre). */
export function ugPileSummary(r: UndergroundMuckpileResult) {
  return {
    block_size_m: r1(r.underground.blockSize, 2),
    designs: r.underground.designs.map((d) => ({
      tag: d.tag,
      mode: d.mode,
      in_situ_m3: r1(d.inSituVolume),
      muckpile_m3: r1(d.pileVolume),
      throw_m: r1(d.throw),
      max_height_m: r1(d.maxHeight, 2),
      ...(d.mode === 'face'
        ? {
            height_at_face_m: r1(d.heightAtFace, 2),
            max_blocked_section_pct: d.maxBlockage ? r1(d.maxBlockage.fraction * 100, 0) : null,
            max_blocked_at_m_from_face: d.maxBlockage ? r1(d.maxBlockage.distance, 0) : null,
            blocked_section_pct_by_distance_m: Object.fromEntries(
              d.blockage.map((b) => [String(b.distance), r1(b.fraction * 100, 0)]),
            ),
          }
        : {}),
      mean_displacement_m: r1(d.meanDisplacement),
      blocks: d.blocks,
    })),
    warnings: r.underground.warnings.map((w) => ({ id: w.id, ...w.params })),
    note: 'Empirical kinematic model (calibratable: swell, repose angle, throw factor in the Análisis tab). Throw = distance from the new face to the toe of the pile along the drive.',
  };
}
