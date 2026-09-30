import type { DiffMarker, HoleChangeKind } from '@cronos/core';
import { diffColorCss } from '@cronos/engine';
import { X } from 'lucide-react';
import * as actions from '../actions';
import { useUnits } from '../hooks/useUnits';
import { useFormat, useT, type MessageKey } from '../i18n';
import { session } from '../session';
import { useCompare } from './compareStore';
import { summaryParts } from './summaryText';

const LEGEND: [DiffMarker['kind'], MessageKey][] = [
  ['added', 'history.legend.added'],
  ['removed', 'history.legend.removed'],
  ['moved', 'history.legend.moved'],
  ['changed', 'history.legend.changed'],
];

const KIND_KEYS: Record<Exclude<HoleChangeKind, 'moved'>, MessageKey> = {
  geometry: 'history.kind.geometry',
  charge: 'history.kind.charge',
  timing: 'history.kind.timing',
  other: 'history.kind.other',
};

const MAX_LISTED = 100;

/**
 * Comparación con otra versión (D-14): leyenda con conteos, resumen y los taladros con cambios;
 * al elegir uno se selecciona y se centra en el plano.
 */
export function ComparePanel() {
  const t = useT();
  const fmt = useFormat();
  const { len } = useUnits();
  const against = useCompare((s) => s.against);
  const diff = useCompare((s) => s.diff);
  const markers = useCompare((s) => s.markers);
  const busy = useCompare((s) => s.busy);
  const stop = useCompare((s) => s.stop);
  if (against === null) return null;

  const holes = diff?.blasts.flatMap((b) => b.holes) ?? [];
  const count = (kind: DiffMarker['kind']) => markers.filter((m) => m.kind === kind).length;
  const describe = (h: (typeof holes)[number]): string => {
    if (h.kind === 'added') return t('history.kind.added');
    if (h.kind === 'removed') return t('history.kind.removed');
    return h.changes
      .map((c) =>
        c === 'moved'
          ? t('history.kind.moved', { m: `${fmt(len.show(h.moved), 2)} ${len.unit}` })
          : t(KIND_KEYS[c]),
      )
      .join(', ');
  };

  return (
    <aside className="compare-panel" aria-label={t('history.compareTitle', { n: against })}>
      <header>
        <strong>{t('history.compareTitle', { n: against })}</strong>
        <button className="icon" onClick={stop} aria-label={t('history.compareClose')}>
          <X size={16} />
        </button>
      </header>
      <p className="muted">{t('history.compareHint', { n: against })}</p>
      {busy && !diff && <p className="muted">{t('history.compareComputing')}</p>}
      {diff && (
        <>
          <ul className="compare-legend">
            {LEGEND.map(([kind, key]) => (
              <li key={kind}>
                <span className="dot" style={{ borderColor: diffColorCss(kind) }} /> {t(key)}:{' '}
                {count(kind)}
              </li>
            ))}
          </ul>
          <p>{summaryParts(diff.summary, t).join(' · ')}</p>
          {holes.length === 0 ? (
            <p className="muted">{t('history.compareNone', { n: against })}</p>
          ) : (
            <>
              <strong>{t('history.compareHoles')}</strong>
              <ul className="compare-holes">
                {holes.slice(0, MAX_LISTED).map((h) => (
                  <li key={`${h.kind}-${h.id}`}>
                    <button
                      className="link"
                      disabled={h.kind === 'removed'}
                      onClick={() => {
                        session.selection.set([h.id]);
                        actions.zoomToFit(true);
                      }}
                    >
                      {h.label}
                    </button>{' '}
                    <span className="muted">{describe(h)}</span>
                  </li>
                ))}
              </ul>
              {holes.length > MAX_LISTED && (
                <p className="muted">
                  {t('history.compareMore', { n: holes.length - MAX_LISTED })}
                </p>
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}
