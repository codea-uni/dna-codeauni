import {
  detectMapping,
  farFromLayers,
  type GeotechField,
  type TopographySurvey,
} from '@cronos/core';
import { formatNumber, t } from '../i18n';
import { getCompute, getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { createSurveyOps } from './session';

/** Extensiones de nubes de puntos y modelos de bloques (se ven en 3D, no se triangulan). */
export const MODEL3D_ACCEPT = '.ibpc,.xyz,.txt,.csv,.pts';

/**
 * Avisa si la capa recién cargada cae lejos de las demás de la mina (p. ej. un modelo de bloques
 * en otra zona UTM que la topografía): casi siempre es el sistema de coordenadas.
 */
export function warnIfFarFromLayers(survey: TopographySurvey): void {
  const others = session.document.project.topography
    .filter((s) => s.id !== survey.id)
    .map((s) => s.bounds);
  const gap = farFromLayers(survey.bounds, others);
  if (gap !== null)
    useUiStore
      .getState()
      .notify(
        t('import.farFromLayers', { name: survey.name, km: formatNumber(gap / 1000) }),
        'error',
      );
}

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
      // Modelo de bloques: qué columnas son de roca (UCS, RMR, litología…) y si es geotécnico.
      const mapping = r.parts.blocks ? detectMapping(r.parts.blocks) : null;
      const { ops, survey } = await createSurveyOps(
        {
          name,
          surveyDate: today(),
          format: r.kind === 'cloud' ? 'cloud' : 'blockmodel',
          files: [file.name],
          ...(epsg !== undefined ? { epsg } : {}),
          ...(mapping ? { blockModel: mapping } : {}),
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
      if (mapping?.geotechnical)
        ui.notify(
          t('topo.geotech.detected', {
            name,
            columns: Object.entries(mapping.columns)
              .map(([k, v]) => `${t(`topo.geotech.field.${k as GeotechField}`)} = ${v}`)
              .join(', '),
          }),
        );
      for (const w of r.warnings) ui.notify(w);
      warnIfFarFromLayers(survey);
      if (useUiStore.getState().viewMode !== '3d') useUiStore.getState().setViewMode('3d');
      // Las nubes y bloques vienen en UTM, lejos del diseño: ir a verlos.
      requestAnimationFrame(() => getEngine()?.frameModels3d(survey.id));
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
