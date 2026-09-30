import { sdobBand, type BlastAnalysis, type HoleId } from '@cronos/core';
import type { Engine, HoleScalars, IsochroneData } from '@cronos/engine';
import { session } from '../session';
import { useAnalysisStore, type ColorBy, type LabelBy } from '../stores/analysisStore';

/** Valores por taladro según el modo de color. */
export function scalarValues(
  analysis: BlastAnalysis,
  mode: Exclude<ColorBy, 'none' | 'group' | 'sdob'>,
): Map<HoleId, number> {
  const values = new Map<HoleId, number>();
  const ids = analysis.charge.holeIds;
  const source =
    mode === 'time'
      ? analysis.timing.fireTime
      : mode === 'kg'
        ? analysis.charge.perHole
        : mode === 'effectiveBurden'
          ? analysis.effectiveBurden.effective
          : analysis.charge.loadingFactorPerHole;
  ids.forEach((id, i) => {
    const v = source[i] ?? NaN;
    if (Number.isFinite(v) && (mode === 'time' || v > 0)) values.set(id, v);
  });
  return values;
}

export function sequenceTimes(analysis: BlastAnalysis): Map<HoleId, number> {
  return scalarValues(analysis, 'time');
}

function labels(analysis: BlastAnalysis, mode: LabelBy): Map<HoleId, string> | null {
  if (mode === 'label') return null;
  const out = new Map<HoleId, string>();
  const ids = analysis.charge.holeIds;
  ids.forEach((id, i) => {
    if (mode === 'time') {
      // Tiempo relativo al primer taladro (H-502; el absoluto incluye el retardo de fondo).
      const t = (analysis.timing.fireTime[i] ?? NaN) - analysis.timing.firstTime;
      out.set(id, Number.isFinite(t) ? String(Math.round(t * 1000)) : '—');
    } else {
      out.set(id, (analysis.charge.perHole[i] ?? 0).toFixed(0));
    }
  });
  return out;
}

/** Rango de valores (percentiles 2–98 para kg y factor de carga, robusto ante extremos). */
function range(values: Map<HoleId, number>, robust: boolean): [number, number] {
  const arr = [...values.values()].sort((a, b) => a - b);
  if (arr.length === 0) return [0, 1];
  if (!robust) return [arr[0] ?? 0, arr.at(-1) ?? 1];
  return [arr[Math.floor(arr.length * 0.02)] ?? 0, arr[Math.floor(arr.length * 0.98)] ?? 1];
}

/** Rango del modo de color actual (para la leyenda). */
export function colorRange(analysis: BlastAnalysis, mode: ColorBy): [number, number] | null {
  if (mode === 'none' || mode === 'group' || mode === 'sdob') return null;
  return range(scalarValues(analysis, mode), mode !== 'time');
}

/** Colores del semáforo de SDOB (`R1` F12): cráter, incontrolada, controlada, muy controlada, mínima. */
export const SDOB_COLORS = ['#d7263d', '#f46036', '#2e933c', '#1b98e0', '#8a8a8a'] as const;

/** Color de cada taladro según su banda de SDOB (A4). */
function sdobColors(analysis: BlastAnalysis): HoleScalars {
  const cuts = session.document.project.blasts[0]?.calcParams.sdobBands ?? [];
  const colors = new Map<HoleId, string>();
  analysis.charge.holeIds.forEach((id, i) => {
    const v = analysis.sdob[i] ?? NaN;
    if (Number.isFinite(v))
      colors.set(id, SDOB_COLORS[Math.min(sdobBand(v, cuts), 4)] ?? '#8a8a8a');
  });
  return { values: new Map(), min: 0, max: 1, colors };
}

/**
 * Flechas de desplazamiento (A5): desde la boca en la dirección de salida y con el largo del
 * alcance balístico; color por velocidad de burden.
 */
export function displacementArrows(analysis: BlastAnalysis): IsochroneData | null {
  const blast = session.document.project.blasts[0];
  if (!blast) return null;
  const { range, velocity } = analysis.displacement;
  const toward = analysis.effectiveBurden.toward;
  const segs: number[] = [];
  const levels: number[] = [];
  let min = Infinity;
  let max = -Infinity;
  blast.holes.forEach((h, i) => {
    const r = range[i] ?? NaN;
    const v = velocity[i] ?? NaN;
    const ux = toward[2 * i] ?? 0;
    const uy = toward[2 * i + 1] ?? 0;
    if (!Number.isFinite(r) || r <= 0 || (ux === 0 && uy === 0)) return;
    const x1 = h.collar.x + ux * r;
    const y1 = h.collar.y + uy * r;
    const head = Math.min(0.2 * r, 3);
    const c = Math.cos(0.45);
    const sn = Math.sin(0.45);
    segs.push(h.collar.x, h.collar.y, x1, y1);
    segs.push(x1, y1, x1 - head * (ux * c - uy * sn), y1 - head * (uy * c + ux * sn));
    segs.push(x1, y1, x1 - head * (ux * c + uy * sn), y1 - head * (uy * c - ux * sn));
    levels.push(v, v, v);
    min = Math.min(min, v);
    max = Math.max(max, v);
  });
  if (levels.length === 0) return null;
  return { segments: Float64Array.from(segs), levels: Float32Array.from(levels), min, max };
}

/** Color de cada taladro según su grupo (RM-18); sin grupo, el color por defecto. */
function groupColors(): HoleScalars {
  const blast = session.document.project.blasts[0];
  const colorOf = new Map(blast?.groups.map((g) => [g.id, g.color]));
  const colors = new Map<HoleId, string>();
  for (const h of blast?.holes ?? []) {
    const c = h.groupId ? colorOf.get(h.groupId) : undefined;
    if (c) colors.set(h.id, c);
  }
  return { values: new Map(), min: 0, max: 1, colors };
}

/** Sincroniza el engine con el análisis y las opciones de visualización. */
export function bindVisualization(engine: Engine): () => void {
  const apply = (
    s = useAnalysisStore.getState(),
    prev?: ReturnType<typeof useAnalysisStore.getState>,
  ) => {
    const { analysis } = s;
    const changed = (k: keyof typeof s) => prev?.[k] !== s[k];
    if (changed('layers')) {
      for (const [layer, visible] of Object.entries(s.layers))
        engine.setLayerVisible(layer as keyof typeof s.layers, visible);
    }
    if (changed('analysis') || changed('colorBy')) {
      if (!analysis || s.colorBy === 'none') engine.setHoleScalars(null);
      else if (s.colorBy === 'group') engine.setHoleScalars(groupColors());
      else if (s.colorBy === 'sdob') engine.setHoleScalars(sdobColors(analysis));
      else {
        const values = scalarValues(analysis, s.colorBy);
        const [min, max] = range(values, s.colorBy !== 'time');
        engine.setHoleScalars({ values, min, max });
      }
    }
    if (changed('analysis') || changed('labelBy'))
      engine.setHoleLabels(analysis ? labels(analysis, s.labelBy) : null);
    if (changed('energy') || changed('energyOpacity')) engine.setEnergy(s.energy, s.energyOpacity);
    if (changed('topoShadeOpacity')) engine.setTopographyShadeOpacity(s.topoShadeOpacity);
    if (changed('topoOpacity3d')) engine.set3DOptions({ surfaceOpacity: s.topoOpacity3d });
    if (changed('vibration') || changed('vibOpacity')) {
      const v = s.vibration;
      engine.setVibration(v && v.nx > 0 ? { ...v, colorLog: true } : null, s.vibOpacity);
      engine.setFlyrockZone(v ? v.flyrock.zone : null);
    }
    if (changed('analysis')) engine.setDisplacement(analysis ? displacementArrows(analysis) : null);
    if (changed('analysis')) {
      const iso = analysis?.isochrones;
      const t = analysis?.timing;
      engine.setIsochrones(
        iso && t && Number.isFinite(t.firstTime)
          ? { segments: iso.segments, levels: iso.levels, min: t.firstTime, max: t.lastTime }
          : null,
      );
    }
  };
  apply();
  const unsubscribe = useAnalysisStore.subscribe((s, prev) => {
    apply(s, prev);
  });
  const offSeq = engine.on('sequenceTime', (t) => {
    useAnalysisStore
      .getState()
      .set({ sequenceTime: t, ...(t === null ? { sequencePlaying: false } : {}) });
  });
  const offEnd = engine.on('sequenceEnded', () => {
    useAnalysisStore.getState().set({ sequencePlaying: false });
  });
  return () => {
    unsubscribe();
    offSeq();
    offEnd();
  };
}
