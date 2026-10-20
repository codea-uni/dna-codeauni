import { WORKINGS_ACCEPT, type BuildWorkingsOptions } from '@cronos/core';
import { topoWarningText } from '../dialogs/TopographyImportDialog';
import { formatNumber, t } from '../i18n';
import { getCompute, getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { createSurveyOps, isTopographyLoaded, onTopographyChange } from './session';

/** Extensiones del importador de labores subterráneas. */
export { WORKINGS_ACCEPT };

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Importa labores subterráneas (sólidos y ejes de túneles de DXF o Surpac) como UN levantamiento
 * del proyecto: el worker las lee, convierte los ejes en túnel con el perfil elegido y estima el eje
 * de cada sólido. Quedan guardadas y sincronizadas por mina como la topografía; al terminar se pasa
 * a la vista 3D y se encuadran.
 */
export async function importWorkingsFiles(
  files: readonly File[],
  options: BuildWorkingsOptions,
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
    if (useUiStore.getState().viewMode !== '3d') useUiStore.getState().setViewMode('3d');
    // Las labores vienen en coordenadas de la mina, lejos del diseño: ir a verlas cuando se carguen.
    const frame = () => {
      if (!isTopographyLoaded(survey.id)) return false;
      requestAnimationFrame(() => getEngine()?.frameModels3d());
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
