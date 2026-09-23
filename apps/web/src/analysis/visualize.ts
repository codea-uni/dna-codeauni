import type { BlastAnalysis, HoleId } from '@blastlab/core';
import type { Engine } from '@blastlab/engine';
import { useAnalysisStore, type ColorBy, type LabelBy } from '../stores/analysisStore';

/** Valores por taladro según el modo de color. */
export function scalarValues(
  analysis: BlastAnalysis,
  mode: Exclude<ColorBy, 'none'>,
): Map<HoleId, number> {
  const values = new Map<HoleId, number>();
  const ids = analysis.charge.holeIds;
  const source =
    mode === 'time'
      ? analysis.timing.fireTime
      : mode === 'kg'
        ? analysis.charge.perHole
        : analysis.charge.powderFactorPerHole;
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
      const t = analysis.timing.fireTime[i] ?? NaN;
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
  if (mode === 'none') return null;
  return range(scalarValues(analysis, mode), mode !== 'time');
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
      else {
        const values = scalarValues(analysis, s.colorBy);
        const [min, max] = range(values, s.colorBy !== 'time');
        engine.setHoleScalars({ values, min, max });
      }
    }
    if (changed('analysis') || changed('labelBy'))
      engine.setHoleLabels(analysis ? labels(analysis, s.labelBy) : null);
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
