import {
  WORKINGS_ACCEPT,
  workingKinds,
  type BuildWorkingsOptions,
  type WorkingsReadOptions,
} from '@cronos/core';
import { topoWarningText } from '../dialogs/TopographyImportDialog';
import { formatNumber, t } from '../i18n';
import { getCompute, getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { warnIfFarFromLayers } from './models3d';
import { createSurveyOps, isTopographyLoaded, onTopographyChange } from './session';

/** Extensiones del importador de labores subterráneas. */
export { WORKINGS_ACCEPT };

const today = () => new Date().toISOString().slice(0, 10);

/** Levantamiento de labores recién importado: su lista de tipos se abre sola para revisarla. */
let reviewKindsOf: string | null = null;

/** ¿Hay que abrir la lista de tipos de este levantamiento? (recién importado). */
export function needsKindsReview(surveyId: string): boolean {
  return reviewKindsOf === surveyId;
}

/** La lista ya se revisó (se cerró): no se vuelve a abrir sola. */
export function clearKindsReview(): void {
  reviewKindsOf = null;
}

/**
 * Importa labores subterráneas (sólidos y ejes de túneles de DXF o Surpac) como UN levantamiento
 * del proyecto: el worker las lee, convierte los ejes en túnel con el perfil elegido y estima el eje
 * de cada sólido. Quedan guardadas y sincronizadas por mina como la topografía; al terminar se pasa
 * a la vista 3D y se encuadran.
 */
export async function importWorkingsFiles(
  files: readonly File[],
  options: BuildWorkingsOptions & WorkingsReadOptions,
): Promise<void> {
  const ui = useUiStore.getState();
  const main = files.find((f) => !/\.dtm$/i.test(f.name)) ?? files[0];
  if (!main) return;
  const name = main.name.replace(/\.[^.]+$/, '');
  ui.notify(t('topo.workings.reading', { name }));
  try {
    const r = await getCompute().api.importWorkings(
      [...files],
      files.map((f) => f.name),
      options,
    );
    const w = r.workings;
    for (const warning of r.warnings) ui.notify(topoWarningText(warning, t), 'error');
    if (w.axes.length === 0 && w.triangles.length === 0) return;
    const epsg = session.document.project.coordinateSystem.epsg;
    const { ops, survey } = await createSurveyOps(
      {
        name,
        surveyDate: today(),
        format: 'workings',
        files: files.map((f) => f.name),
        ...(epsg !== undefined ? { epsg } : {}),
        // Tipo de cada labor por su nombre o pendiente; el usuario lo revisa en la lista.
        workingKinds: workingKinds(w),
      },
      { workings: w },
    );
    session.document.dispatch(ops, t('topo.workings.undo', { name }));
    const solids = w.axes.filter((a) => a.source === 'solid').length;
    ui.notify(
      t('topo.workings.done', {
        name,
        n: formatNumber(w.axes.length),
        solids: formatNumber(solids),
        axes: formatNumber(w.axes.length - solids),
      }),
    );
    ui.notify(t('topo.kind.review', { name }));
    warnIfFarFromLayers(survey);
    reviewKindsOf = survey.id;
    if (useUiStore.getState().viewMode !== '3d') useUiStore.getState().setViewMode('3d');
    // Las labores vienen en coordenadas de la mina, lejos del diseño: ir a verlas cuando se carguen.
    const frame = () => {
      if (!isTopographyLoaded(survey.id)) return false;
      requestAnimationFrame(() => getEngine()?.frameModels3d(survey.id));
      return true;
    };
    if (!frame()) {
      const off = onTopographyChange(() => {
        if (frame()) off();
      });
    }
  } catch (err) {
    ui.notify(
      t('topo.workings.failed', {
        name,
        error: err instanceof Error ? err.message : String(err),
      }),
      'error',
    );
  }
}
