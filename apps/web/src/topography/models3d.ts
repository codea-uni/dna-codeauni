import { formatNumber, t } from '../i18n';
import { getCompute, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { createSurveyOps } from './session';

/** Extensiones de nubes de puntos y modelos de bloques (se ven en 3D, no se triangulan). */
export const MODEL3D_ACCEPT = '.ibpc,.xyz,.txt,.csv,.pts';

const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Importa nubes de puntos o modelos de bloques como levantamientos del proyecto: el worker los
 * lee (el `.ibpc` por partes) y reduce, y quedan guardados y sincronizados como la topografía.
 * Al terminar se pasa a la vista 3D, donde se ven.
 */
export async function importModel3dFiles(files: readonly File[]): Promise<void> {
  const ui = useUiStore.getState();
  for (const file of files) {
    const name = baseName(file.name);
    ui.notify(t('topo.model3d.reading', { name }));
    try {
      const r = await getCompute().api.importModel3d(file, file.name);
      const epsg = session.document.project.coordinateSystem.epsg;
      const { ops } = await createSurveyOps(
        {
          name,
          surveyDate: today(),
          format: r.kind === 'cloud' ? 'cloud' : 'blockmodel',
          files: [file.name],
          ...(epsg !== undefined ? { epsg } : {}),
        },
        r.parts,
      );
      session.document.dispatch(ops, t('topo.model3d.undo', { name }));
      const { cloud, blocks } = r.parts;
      if (cloud)
        ui.notify(
          t('topo.model3d.cloudDone', {
            name,
            kept: formatNumber(cloud.positions.length / 3),
            source: formatNumber(cloud.sourcePoints),
          }),
        );
      if (blocks)
        ui.notify(
          t('topo.model3d.blocksDone', {
            name,
            n: formatNumber(blocks.centers.length / 3),
            deg: formatNumber((blocks.rotation * 180) / Math.PI, 1),
          }),
        );
      for (const w of r.warnings) ui.notify(w);
      if (useUiStore.getState().viewMode !== '3d') useUiStore.getState().setViewMode('3d');
    } catch (err) {
      ui.notify(
        t('topo.model3d.failed', {
          name,
          error: err instanceof Error ? err.message : String(err),
        }),
        'error',
      );
    }
  }
}
