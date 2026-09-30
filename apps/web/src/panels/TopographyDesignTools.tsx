import {
  commands,
  DEFAULT_FREE_FACE_TOLERANCE,
  linePolygon,
  type Blast,
  type LineSummary,
} from '@cronos/core';
import { useState } from 'react';
import { NumberField } from '../components/NumberField';
import { useSelectionIds } from '../hooks/useDocument';
import { useFormat, useT } from '../i18n';
import { getCompute, getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { designSurvey, loadedSurveys } from '../topography/session';

/** Líneas cerradas candidatas a perímetro, las más cercanas al centro de la vista primero. */
const MAX_CANDIDATES = 30;

/**
 * Diseño sobre la topografía (D-16): collares sobre el terreno, cota del banco, cara libre desde la
 * cresta y perímetro desde una línea. El trabajo sobre muchos datos corre en el worker; cada
 * acción es un comando que se deshace.
 */
export function TopographyDesignTools({ blast }: { blast: Blast }) {
  const t = useT();
  const fmt = useFormat();
  const selected = useSelectionIds();
  const activeBoundaryId = useUiStore((s) => s.activeBoundaryId);
  const [tolerance, setTolerance] = useState(DEFAULT_FREE_FACE_TOLERANCE);
  const [lineKey, setLineKey] = useState('');
  const [busy, setBusy] = useState(false);
  const notify = useUiStore.getState().notify;
  const survey = designSurvey();
  const boundary =
    blast.boundaries.find((b) => b.id === activeBoundaryId) ?? blast.boundaries[0] ?? null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const drape = () =>
    run(async () => {
      if (!survey) return;
      const holes = selected.size > 0 ? blast.holes.filter((h) => selected.has(h.id)) : blast.holes;
      if (holes.length === 0) {
        notify(t('topo.design.noHoles'), 'error');
        return;
      }
      const r = await getCompute().api.topographyDrape(survey.tin, holes, {
        bench: blast.bench,
        calcParams: blast.calcParams,
      });
      const outside = new Set(r.outside);
      const changed = r.holes.filter((h) => !outside.has(h.id));
      if (changed.length > 0)
        session.document.dispatch(
          { type: 'holes/replace', blastId: blast.id, holes: changed },
          t('topo.design.drapeUndo', { n: changed.length }),
        );
      notify(
        outside.size > 0
          ? t('topo.design.drapeOutside', { n: changed.length, out: outside.size })
          : t('topo.design.drapeDone', { n: changed.length }),
        outside.size > 0 ? 'error' : 'info',
      );
    });

  const benchFromTopography = () =>
    run(async () => {
      if (!survey) return;
      if (!boundary) {
        notify(t('topo.design.needBoundary'), 'error');
        return;
      }
      const top = await getCompute().api.topographyBenchElevation(survey.tin, [
        ...boundary.polygon,
      ]);
      if (top === null) {
        notify(t('topo.design.outsideBoundary'), 'error');
        return;
      }
      const floor = top - blast.bench.height;
      const ok = window.confirm(
        t('topo.design.benchConfirm', {
          top: fmt(top, 2),
          floor: fmt(floor, 2),
          height: fmt(blast.bench.height, 1),
        }),
      );
      if (!ok) return;
      session.document.dispatch(
        {
          type: 'blast/patch',
          blastId: blast.id,
          patch: { bench: { ...blast.bench, floorElevation: floor } },
        },
        t('topo.design.benchUndo'),
      );
    });

  const freeFaceFromCrest = () =>
    run(async () => {
      if (!boundary) {
        notify(t('topo.design.needBoundary'), 'error');
        return;
      }
      const lineSets = loadedSurveys().flatMap((s) => (s.lines ? [s.lines] : []));
      const edges = await getCompute().api.topographyFreeFaces(
        lineSets,
        [...boundary.polygon],
        tolerance,
      );
      if (edges.length === 0) {
        notify(t('topo.design.noCrestEdges', { m: fmt(tolerance, 1) }), 'error');
        return;
      }
      session.document.dispatch(
        commands.setFreeFaceEdges(session.document, blast.id, boundary.id, [
          ...boundary.freeFaceEdges,
          ...edges,
        ]),
        t('topo.design.freeFaceUndo'),
      );
      notify(t('topo.design.freeFaceDone', { n: edges.length, name: boundary.name }));
    });

  // Líneas cerradas de todos los levantamientos, las más cercanas a lo que se está mirando.
  const center = getEngine()?.getViewCenter() ?? { x: 0, y: 0 };
  const candidates = loadedSurveys()
    .flatMap((s) =>
      (s.lineSummaries ?? [])
        .filter((l) => l.closed)
        .map((l) => ({ key: `${s.survey.id}:${String(l.index)}`, survey: s, line: l })),
    )
    .sort(
      (a, b) =>
        Math.hypot(a.line.center.x - center.x, a.line.center.y - center.y) -
        Math.hypot(b.line.center.x - center.x, b.line.center.y - center.y),
    )
    .slice(0, MAX_CANDIDATES);
  const chosen = candidates.find((c) => c.key === lineKey) ?? candidates[0];

  const boundaryFromLine = () => {
    const lines = chosen?.survey.lines;
    if (!chosen || !lines) return;
    const polygon = linePolygon(lines, chosen.line.index);
    if (!polygon) return;
    const b = commands.makeBoundary(blast, polygon);
    session.document.dispatch(
      commands.addBoundary(session.document, blast.id, b),
      t('topo.design.boundaryUndo', { name: b.name }),
    );
    useUiStore.getState().setActiveBoundary(b.id);
    notify(t('topo.design.boundaryDone', { name: b.name }));
  };

  const lineLabel = (l: LineSummary) =>
    t('topo.design.lineOption', {
      role: t(`topo.role.${l.role}`),
      z: fmt(l.elevation, 1),
      length: fmt(l.length, 0),
    });

  if (!survey && candidates.length === 0) return null;

  return (
    <div className="topo-tools">
      <h3>{t('topo.design.title')}</h3>
      {survey && <p className="hint">{t('topo.design.using', { name: survey.survey.name })}</p>}
      {survey && (
        <div className="row wrap">
          <button disabled={busy} onClick={() => void drape()}>
            {selected.size > 0
              ? t('topo.design.drapeSelected', { n: selected.size })
              : t('topo.design.drapeAll')}
          </button>
          <button disabled={busy || !boundary} onClick={() => void benchFromTopography()}>
            {t('topo.design.bench')}
          </button>
        </div>
      )}
      <NumberField
        label={t('topo.design.tolerance')}
        unit="m"
        decimals={2}
        min={0.01}
        value={tolerance}
        onCommit={setTolerance}
      />
      <button disabled={busy || !boundary} onClick={() => void freeFaceFromCrest()}>
        {boundary
          ? t('topo.design.freeFace', { name: boundary.name })
          : t('topo.design.needBoundary')}
      </button>
      {candidates.length > 0 && (
        <>
          <label className="field wide-select">
            <span className="field-label">{t('topo.design.fromLine')}</span>
            <select
              value={chosen?.key ?? ''}
              onChange={(e) => {
                setLineKey(e.target.value);
              }}
            >
              {candidates.map((c) => (
                <option key={c.key} value={c.key}>
                  {lineLabel(c.line)}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} onClick={boundaryFromLine}>
            {t('topo.design.createBoundary')}
          </button>
        </>
      )}
    </div>
  );
}
