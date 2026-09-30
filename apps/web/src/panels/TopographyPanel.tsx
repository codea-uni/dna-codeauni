import type { Op, TopographyFormat, TopographySurvey } from '@cronos/core';
import { Mountain, Trash2 } from 'lucide-react';
import { useEffect, useReducer, useRef } from 'react';
import * as actions from '../actions';
import { IconButton } from '../components/IconButton';
import { useProject } from '../hooks/useDocument';
import { useFormat, useT } from '../i18n';
import { session } from '../session';
import { isTopographyLoaded, onTopographyChange } from '../topography/session';
import { TopographyDesignTools } from './TopographyDesignTools';

const FORMAT_KEY = {
  dxf: 'topo.format.dxf',
  surpac: 'topo.format.surpac',
  points: 'topo.format.points',
  landxml: 'topo.format.landxml',
  geotiff: 'topo.format.geotiff',
  image: 'topo.format.image',
  las: 'topo.format.las',
  legacy: 'topo.format.legacy',
} as const satisfies Record<TopographyFormat, string>;

/**
 * Levantamientos topográficos del proyecto (D-16), del más nuevo al más viejo: cuál usa el banco,
 * de dónde vienen y cómo quitarlos. Importar abre el asistente.
 */
export function TopographyPanel() {
  const t = useT();
  const fmt = useFormat();
  const project = useProject();
  const blast = project.blasts[0];
  const input = useRef<HTMLInputElement>(null);
  // Se vuelve a dibujar cuando termina de cargarse un levantamiento en el navegador.
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  useEffect(() => onTopographyChange(refresh), []);
  const surveys = [...project.topography].sort((a, b) => b.surveyDate.localeCompare(a.surveyDate));

  const use = (s: TopographySurvey) => {
    if (!blast) return;
    session.document.dispatch(
      {
        type: 'blast/patch',
        blastId: blast.id,
        patch: { bench: { ...blast.bench, topographyId: s.id } },
      },
      t('topo.panel.useUndo', { name: s.name }),
    );
  };
  const remove = (s: TopographySurvey) => {
    const ops: Op[] = [
      {
        type: 'project/patch',
        patch: { topography: project.topography.filter((x) => x.id !== s.id) },
      },
    ];
    for (const b of project.blasts)
      if (b.bench.topographyId === s.id) {
        const bench = { ...b.bench };
        delete bench.topographyId;
        ops.push({ type: 'blast/patch', blastId: b.id, patch: { bench } });
      }
    session.document.dispatch(ops, t('topo.panel.removeUndo', { name: s.name }));
  };

  return (
    <section className="panel">
      <h2>{t('topo.section')}</h2>
      {surveys.length === 0 && <p className="hint">{t('topo.panel.empty')}</p>}
      {surveys.length > 0 && (
        <ul className="survey-list">
          {surveys.map((s) => {
            const inUse = blast?.bench.topographyId === s.id;
            return (
              <li key={s.id} className={inUse ? 'in-use' : undefined}>
                <div className="survey-head">
                  <strong>{s.name}</strong>
                  <span className="muted">{s.surveyDate}</span>
                  <IconButton
                    icon={Trash2}
                    label={t('topo.panel.remove')}
                    onClick={() => {
                      remove(s);
                    }}
                  />
                </div>
                <div className="muted small">
                  {t(FORMAT_KEY[s.source.format])} ·{' '}
                  {t('topo.panel.stats', {
                    points: fmt(s.stats.points),
                    triangles: fmt(s.stats.triangles),
                    lines: fmt(s.stats.lines),
                  })}
                </div>
                <div className="muted small">
                  {t('topo.panel.relief', {
                    min: fmt(s.bounds.minZ, 1),
                    max: fmt(s.bounds.maxZ, 1),
                  })}
                  {s.epsg !== undefined && <> · {t('topo.panel.crs', { epsg: s.epsg })}</>}
                </div>
                {s.source.transform && (
                  <div className="muted small">
                    {t('topo.panel.reprojected', { transform: s.source.transform })}
                  </div>
                )}
                {!isTopographyLoaded(s.id) && s.assets.tin && (
                  <div className="warn small">{t('topo.panel.missing')}</div>
                )}
                {blast &&
                  (inUse ? (
                    <span className="survey-badge">{t('topo.panel.inUse')}</span>
                  ) : (
                    <button
                      className="small"
                      onClick={() => {
                        use(s);
                      }}
                    >
                      {t('topo.panel.useInBench')}
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {blast && surveys.length > 0 && <TopographyDesignTools blast={blast} />}
      <button
        onClick={() => {
          if (actions.requireCrs()) input.current?.click();
        }}
      >
        <Mountain size={14} aria-hidden /> {t('topo.panel.import')}
      </button>
      <input
        ref={input}
        type="file"
        accept={actions.TOPOGRAPHY_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length > 0) void actions.openTopography(files);
          e.target.value = '';
        }}
      />
    </section>
  );
}
