import type { CalibrationRange, TopographySurveyId } from '@cronos/core';
import { proxy } from '@cronos/workers';
import { downloadFile } from '../actions';
import { t } from '../i18n';
import { getCompute, getPhysics, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { topographyTin } from '../topography/session';

/** Acciones de la pila de material (A7). Todo el cómputo va a los workers. */

const notify = (text: string, kind: 'info' | 'error' = 'info') => {
  useUiStore.getState().notify(text, kind);
};

const fileBase = () =>
  (session.document.project.blasts[0]?.name ?? session.document.project.name).replace(
    /[^\p{L}\p{N}_-]+/gu,
    '_',
  ) || 'pila';

/** Pide el cálculo de la pila al runner. */
export function requestMuckpile(): void {
  const s = useAnalysisStore.getState();
  s.set({ muckpileRequest: s.muckpileRequest + 1 });
}

/** Exporta la superficie de la pila (XYZ, OBJ, STL) o los vectores por bloque (CSV). */
export async function exportMuckpile(kind: 'xyz' | 'obj' | 'stl' | 'vectors'): Promise<void> {
  const r = useAnalysisStore.getState().muckpile;
  const blast = session.document.project.blasts[0];
  if (!r || !blast) return;
  try {
    const data = await getCompute().api.muckpileExport(kind, {
      after: r.grids.after,
      ...(kind === 'vectors' ? { blocks: r.blocks, blast } : {}),
      origin: session.document.project.coordinateSystem.origin,
      name: blast.name,
    });
    const base = fileBase();
    if (kind === 'stl') downloadFile(data, `${base}_pila.stl`, 'model/stl');
    else if (kind === 'obj') downloadFile(data, `${base}_pila.obj`, 'model/obj');
    else if (kind === 'xyz') downloadFile(data, `${base}_pila.xyz.csv`, 'text/csv');
    else downloadFile(data, `${base}_vectores.csv`, 'text/csv');
    notify(t('muckpile.exported'));
  } catch (err) {
    notify(err instanceof Error ? err.message : String(err), 'error');
  }
}

/** Simula la animación física (Rapier) de la pila calculada, con avance en el panel. */
export async function simulateMuckpilePhysics(maxBodies: number): Promise<void> {
  const s = useAnalysisStore.getState();
  const r = s.muckpile;
  const blast = session.document.project.blasts[0];
  if (!r || !blast || r.blocks.count === 0) return;
  s.set({ muckpilePhysicsProgress: 0 });
  try {
    const frames = await getPhysics().api.simulate(
      {
        origin: session.document.project.coordinateSystem.origin,
        ground: r.grids.base,
        blocks: {
          count: r.blocks.count,
          origin: r.blocks.origin,
          velocity: r.blocks.velocity,
          launchTime: r.blocks.launchTime,
          height: r.blocks.height,
        },
        blockSize: blast.calcParams.muckpile.blockSize,
        maxBodies,
      },
      proxy((fraction: number) => {
        useAnalysisStore.getState().set({ muckpilePhysicsProgress: fraction });
      }),
    );
    useAnalysisStore
      .getState()
      .set({ muckpileFrames: frames, muckpileMode: 'physics', muckpilePhysicsProgress: null });
    notify(t('muckpile.physics.done', { n: frames.bodies, ms: Math.round(frames.elapsedMs) }));
  } catch (err) {
    useAnalysisStore.getState().set({ muckpilePhysicsProgress: null });
    notify(err instanceof Error ? err.message : String(err), 'error');
  }
}

/** Compara la pila con un levantamiento post-voladura de la mina (mapa de error y RMSE). */
export async function compareMuckpile(surveyId: TopographySurveyId): Promise<void> {
  const r = useAnalysisStore.getState().muckpile;
  const tin = topographyTin(surveyId);
  if (!r) return;
  if (!tin) {
    notify(t('muckpile.cal.notLoaded'), 'error');
    return;
  }
  const { base, before, after } = r.grids;
  const cmp = await getCompute().api.muckpileCompare({ base, before, after }, tin);
  useAnalysisStore.getState().set({ muckpileCompare: cmp });
}

/** Búsqueda por grilla de k y n contra el levantamiento post-voladura. */
export async function calibrateMuckpileParams(
  surveyId: TopographySurveyId,
  ranges: { k: CalibrationRange; n: CalibrationRange },
): Promise<void> {
  const blast = session.document.project.blasts[0];
  const measured = topographyTin(surveyId);
  if (!blast) return;
  if (!measured) {
    notify(t('muckpile.cal.notLoaded'), 'error');
    return;
  }
  const tin = blast.bench.topographyId ? (topographyTin(blast.bench.topographyId) ?? null) : null;
  useAnalysisStore.getState().set({ muckpileCalibrating: 0, muckpileCalibration: null });
  try {
    const result = await getCompute().api.muckpileCalibrate(
      session.document.project,
      blast.id,
      tin,
      measured,
      ranges,
      proxy((done: number, total: number) => {
        useAnalysisStore.getState().set({ muckpileCalibrating: done / total });
      }),
    );
    useAnalysisStore.getState().set({ muckpileCalibration: result, muckpileCalibrating: null });
  } catch (err) {
    useAnalysisStore.getState().set({ muckpileCalibrating: null });
    notify(err instanceof Error ? err.message : String(err), 'error');
  }
}
