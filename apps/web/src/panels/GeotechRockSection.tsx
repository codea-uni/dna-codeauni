import { geotechSummary } from '@cronos/core';
import type { HoleRocks } from '@cronos/workers';
import { useEffect, useState } from 'react';
import { useActiveBlast, useProject } from '../hooks/useDocument';
import { useFormat, useT } from '../i18n';
import { getCompute, session } from '../session';
import { geotechModelOf, onRockModelsChange, onTopographyChange } from '../topography/session';

/**
 * «Roca desde modelo geotécnico» (panel de la roca): activa la roca por bloque de los modelos
 * geotécnicos del proyecto y resume lo que hay (litologías, UCS, RMR), en qué roca cae cada taladro
 * y qué atraviesa la onda hasta cada punto de control (solo informa: la ley K, β no cambia).
 */
export function GeotechRockSection() {
  const t = useT();
  const fmt = useFormat();
  const project = useProject();
  const blast = useActiveBlast();
  const [, setTick] = useState(0);
  const [rocks, setRocks] = useState<HoleRocks | null>(null);
  useEffect(
    () =>
      onTopographyChange(() => {
        setTick((x) => x + 1);
      }),
    [],
  );
  const geo = project.topography.filter((s) => s.assets.blocks && s.blockModel?.geotechnical);
  const enabled = geo.some((s) => s.blockModel?.useForRock);
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (!blast || !enabled) {
        setRocks(null);
        return;
      }
      void getCompute()
        .api.holeRocks(session.document.project, blast.id)
        .then((r) => {
          if (alive) setRocks(r);
        });
    };
    run();
    const off = onRockModelsChange(run);
    return () => {
      alive = false;
      off();
    };
  }, [project, blast, enabled]);

  if (geo.length === 0) return <p className="hint">{t('topo.geotech.rock.none')}</p>;
  const toggle = (on: boolean) => {
    const topography = project.topography.map((s) =>
      s.blockModel?.geotechnical && s.assets.blocks
        ? { ...s, blockModel: { ...s.blockModel, useForRock: on } }
        : s,
    );
    session.document.dispatch(
      { type: 'project/patch', patch: { topography } },
      t('topo.geotech.rock.title'),
    );
  };
  const range = (r: { min: number; max: number } | null, d = 0) =>
    r ? (r.min === r.max ? fmt(r.min, d) : `${fmt(r.min, d)}–${fmt(r.max, d)}`) : '—';
  return (
    <div className="geotech-rock">
      <h3>{t('topo.geotech.rock.title')}</h3>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            toggle(e.target.checked);
          }}
        />{' '}
        {enabled ? t('topo.geotech.rock.on') : t('topo.geotech.rock.off')}
      </label>
      {geo.map((s) => {
        const m = geotechModelOf(s.id);
        const sum = m ? geotechSummary(m) : null;
        return (
          <div key={s.id} className="small">
            <strong>{s.name}</strong>
            {sum ? (
              <>
                {sum.lithologies.length > 0 && (
                  <div>
                    {t('topo.geotech.rock.lithologies')}:{' '}
                    {sum.lithologies.map((l) => `${l.name} (${fmt(l.blocks)})`).join(', ')}
                  </div>
                )}
                <div className="muted">
                  UCS {range(sum.ucs)} MPa · RMR {range(sum.rmr)}
                </div>
              </>
            ) : (
              <div className="muted">{t('topo.panel.missing')}</div>
            )}
          </div>
        );
      })}
      {enabled && rocks && (
        <div className="small">
          <div>
            {t('topo.geotech.rock.holes', {
              n: fmt(rocks.summary.inModel),
              total: fmt(rocks.summary.holes),
            })}
          </div>
          <ul>
            {rocks.summary.byLithology.map((l) => (
              <li key={l.name ?? ''}>
                {l.name ?? t('topo.geotech.rock.outside')}: {fmt(l.holes)}{' '}
                {t('topo.geotech.rock.holesUnit')} · {fmt(l.kg)} kg
              </li>
            ))}
          </ul>
          {rocks.summary.byClass.length > 0 && (
            <div className="muted">
              {t('topo.geotech.competence')}:{' '}
              {rocks.summary.byClass.map((c) => `${c.id} ${fmt(c.holes)}`).join(' · ')}
            </div>
          )}
          <div className="muted">
            {t('topo.geotech.rock.factor', {
              a: rocks.summary.rockFactor === null ? '—' : fmt(rocks.summary.rockFactor, 2),
              ppvc: rocks.summary.vppc
                ? `${fmt(rocks.summary.vppc.min * 1000)}–${fmt(rocks.summary.vppc.max * 1000)}`
                : '—',
            })}
          </div>
          {rocks.paths.length > 0 && (
            <>
              <div>{t('topo.geotech.rock.paths')}</div>
              <ul>
                {rocks.paths.map((p) => (
                  <li key={p.pointId}>
                    {p.name}: {p.path.dominantLithology ?? t('topo.geotech.rock.outside')} ·{' '}
                    {fmt(p.path.inModel * 100)}% {t('topo.geotech.rock.inModel')}
                    {p.path.rmr !== null && <> · RMR {fmt(p.path.rmr)}</>}
                    {p.path.vp !== null && <> · Vp {fmt(p.path.vp)} m/s</>}
                  </li>
                ))}
              </ul>
              <p className="hint">{t('topo.geotech.rock.pathsHint')}</p>
            </>
          )}
        </div>
      )}
      <p className="hint">{t('topo.geotech.rock.hint')}</p>
    </div>
  );
}
