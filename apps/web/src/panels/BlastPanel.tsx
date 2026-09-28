import { commands, type BoundaryId, type SubdrillConvention } from '@cronos/core';
import { boundaryColorCss } from '@cronos/engine';
import { Mountain, Pentagon } from 'lucide-react';
import { TextCell } from '../components/CellInput';
import { IconButton } from '../components/IconButton';
import { NumberField } from '../components/NumberField';
import { useActiveBlast } from '../hooks/useDocument';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { useUnits } from '../hooks/useUnits';
import { useT } from '../i18n';

export function BlastPanel() {
  const t = useT();
  const { len } = useUnits();
  const blast = useActiveBlast();
  const setTool = useUiStore((s) => s.setTool);
  const activeBoundaryId = useUiStore((s) => s.activeBoundaryId);
  const setActiveBoundary = useUiStore((s) => s.setActiveBoundary);
  if (!blast) return null;

  const setBench = (patch: Partial<typeof blast.bench>, label: string) => {
    session.document.dispatch(
      { type: 'blast/patch', blastId: blast.id, patch: { bench: { ...blast.bench, ...patch } } },
      label,
    );
  };
  const remove = (id: BoundaryId, name: string) => {
    session.document.dispatch(
      commands.removeBoundary(session.document, blast.id, id),
      t('blast.removeNamed', { name }),
    );
    if (activeBoundaryId === id) setActiveBoundary(null);
  };

  return (
    <>
      <section className="panel">
        <h2>{t('blast.title')}</h2>
        <p className="muted">
          {t('blast.summary', {
            name: blast.name,
            holes: blast.holes.length,
            patterns: blast.patterns.length,
          })}
        </p>
        <NumberField
          label={t('blast.floor')}
          unit={len.unit}
          value={len.show(blast.bench.floorElevation)}
          onCommit={(raw) => {
            const v = len.parse(raw);
            setBench({ floorElevation: v }, t('blast.floor'));
          }}
        />
        <NumberField
          label={t('blast.benchHeight')}
          unit={len.unit}
          min={0.1}
          value={len.show(blast.bench.height)}
          onCommit={(raw) => {
            const v = len.parse(raw);
            setBench({ height: v }, t('blast.benchHeight'));
          }}
        />
        <label className="field">
          <span className="field-label">{t('blast.subdrillConvention')}</span>
          <select
            value={blast.calcParams.subdrillConvention}
            onChange={(e) => {
              session.document.dispatch(
                {
                  type: 'blast/patch',
                  blastId: blast.id,
                  patch: {
                    calcParams: {
                      ...blast.calcParams,
                      subdrillConvention: e.target.value as SubdrillConvention,
                    },
                  },
                },
                t('blast.subdrillConventionUndo'),
              );
            }}
          >
            <option value="vertical">{t('blast.convention.vertical')}</option>
            <option value="lopezJimeno">{t('blast.convention.lopezJimeno')}</option>
          </select>
        </label>
        <p className="hint">{t('blast.benchHint')}</p>
      </section>

      <section className="panel">
        <h2>{t('blast.boundaries')}</h2>
        {blast.boundaries.length === 0 ? (
          <p className="hint">{t('blast.noBoundaries')}</p>
        ) : (
          <ul className="boundary-list">
            {blast.boundaries.map((b, i) => (
              <li key={b.id} className={b.id === activeBoundaryId ? 'active' : ''}>
                <button
                  className="swatch"
                  title={t('blast.activate')}
                  style={{ background: boundaryColorCss(i) }}
                  onClick={() => {
                    setActiveBoundary(b.id === activeBoundaryId ? null : b.id);
                  }}
                />
                <TextCell
                  value={b.name}
                  onCommit={(name) => {
                    session.document.dispatch(
                      commands.renameBoundary(session.document, blast.id, b.id, name),
                      t('blast.renameBoundary'),
                    );
                  }}
                />
                <span className="muted small" title={t('blast.verticesFaces')}>
                  {b.polygon.length} v ·{' '}
                  {b.freeFaceEdges.length === 0 ? (
                    <span className="warn">{t('blast.noFreeFace')}</span>
                  ) : (
                    t(
                      b.freeFaceEdges.length > 1 ? 'blast.freeFaces.other' : 'blast.freeFaces.one',
                      {
                        n: b.freeFaceEdges.length,
                      },
                    )
                  )}
                </span>
                <button
                  className="icon danger"
                  title={t('blast.removeBoundary')}
                  onClick={() => {
                    remove(b.id, b.name);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <IconButton
            icon={Pentagon}
            label={t('blast.drawBoundary')}
            shortcut="B"
            showLabel
            onClick={() => {
              setTool('boundary');
            }}
          />
          <IconButton
            icon={Mountain}
            label={t('blast.freeFace')}
            shortcut="C"
            showLabel
            disabled={blast.boundaries.length === 0}
            onClick={() => {
              setTool('freeFace');
            }}
          />
        </div>
        <p className="hint">{t('blast.freeFaceHint')}</p>
      </section>
    </>
  );
}
