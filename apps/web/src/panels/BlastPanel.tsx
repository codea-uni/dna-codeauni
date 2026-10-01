import {
  boundaryFace,
  commands,
  degToRad,
  radToDeg,
  type Blast,
  type BlastBoundary,
  type BoundaryId,
  type SubdrillConvention,
} from '@cronos/core';
import { boundaryColorCss } from '@cronos/engine';
import { Mountain, Pentagon } from 'lucide-react';
import { NumberCell, TextCell } from '../components/CellInput';
import { IconButton } from '../components/IconButton';
import { NumberField } from '../components/NumberField';
import { useActiveBlast } from '../hooks/useDocument';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { useUnits } from '../hooks/useUnits';
import { useFormat, useT } from '../i18n';
import { getCompute } from '../session';
import { topographyTin } from '../topography/session';
import { useAnalysisStore } from '../stores/analysisStore';

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
        <NumberField
          label={t('blast.faceAngle')}
          unit="°"
          decimals={1}
          min={1}
          max={90}
          value={radToDeg(blast.bench.faceAngle)}
          onCommit={(deg) => {
            setBench({ faceAngle: degToRad(deg) }, t('blast.faceAngle'));
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
                <span
                  className={`boundary-floor${b.floorElevation === undefined ? ' inherited' : ''}`}
                  title={
                    b.floorElevation === undefined
                      ? t('blast.boundaryFloorInherited')
                      : t('blast.boundaryFloorOwn')
                  }
                >
                  <NumberCell
                    value={len.show(b.floorElevation ?? blast.bench.floorElevation)}
                    decimals={2}
                    onCommit={(v) => {
                      session.document.dispatch(
                        commands.setBoundaryFloor(session.document, blast.id, b.id, len.parse(v)),
                        t('blast.boundaryFloorUndo', { name: b.name }),
                      );
                    }}
                  />
                  {b.floorElevation !== undefined && (
                    <button
                      className="icon"
                      title={t('blast.boundaryFloorReset')}
                      onClick={() => {
                        session.document.dispatch(
                          commands.setBoundaryFloor(session.document, blast.id, b.id, null),
                          t('blast.boundaryFloorUndo', { name: b.name }),
                        );
                      }}
                    >
                      ↺
                    </button>
                  )}
                </span>
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
      <FacesSection blast={blast} />
    </>
  );
}

/**
 * Cara libre (talud) de cada perímetro (A7b): ángulo y alto propios o los del banco, y medición
 * en la topografía. Se usan en la vista 3D, la energía, el desplazamiento y la pila.
 */
function FacesSection({ blast }: { blast: Blast }) {
  const t = useT();
  const fmt = useFormat();
  const { len } = useUnits();
  const notify = useUiStore((s) => s.notify);
  const layers = useAnalysisStore((s) => s.layers);
  const setLayer = useAnalysisStore((s) => s.setLayer);
  const withFaces = blast.boundaries.filter((b) => b.freeFaceEdges.length > 0);
  const tinId = blast.bench.topographyId;
  const setFace = (b: BlastBoundary, face: { angle?: number | null; height?: number | null }) => {
    session.document.dispatch(
      commands.setBoundaryFace(session.document, blast.id, b.id, face),
      t('blast.face.undo', { name: b.name }),
    );
  };
  const measure = async (b: BlastBoundary) => {
    const tin = tinId ? topographyTin(tinId) : undefined;
    if (!tin) {
      notify(t('blast.face.noTopography'), 'error');
      return;
    }
    const m = await getCompute().api.topographyMeasureFace(
      tin,
      { polygon: b.polygon, freeFaceEdges: b.freeFaceEdges },
      blast.bench.height,
    );
    if (!m) {
      notify(t('blast.face.measureFailed'), 'error');
      return;
    }
    setFace(b, { angle: m.angle, height: m.height });
    notify(
      t('blast.face.measured', {
        name: b.name,
        angle: fmt(radToDeg(m.angle), 1),
        height: fmt(len.show(m.height), 1),
        unit: len.unit,
        n: m.samples,
      }),
    );
  };
  return (
    <section className="panel">
      <h2>{t('blast.face.title')}</h2>
      <p className="hint">{t('blast.face.hint')}</p>
      {withFaces.length === 0 ? (
        <p className="hint">{t('blast.face.none')}</p>
      ) : (
        <table className="grid-table compact">
          <thead>
            <tr>
              <th>{t('blast.face.boundary')}</th>
              <th>{t('blast.face.angle')}</th>
              <th>{t('blast.face.height', { unit: len.unit })}</th>
              <th>{t('blast.face.run', { unit: len.unit })}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {withFaces.map((b) => {
              const f = boundaryFace(blast.bench, b);
              const own = b.faceAngle !== undefined || b.faceHeight !== undefined;
              return (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td className={b.faceAngle === undefined ? 'inherited' : ''}>
                    <NumberCell
                      value={radToDeg(f.angle)}
                      decimals={1}
                      onCommit={(v) => {
                        if (v > 0 && v <= 90) setFace(b, { angle: degToRad(v) });
                      }}
                    />
                  </td>
                  <td className={b.faceHeight === undefined ? 'inherited' : ''}>
                    <NumberCell
                      value={len.show(f.height)}
                      decimals={2}
                      onCommit={(v) => {
                        const h = len.parse(v);
                        if (h > 0) setFace(b, { height: h });
                      }}
                    />
                  </td>
                  <td className="num">{fmt(len.show(f.run), 2)}</td>
                  <td>
                    <button
                      className="icon"
                      title={t('blast.face.measure')}
                      disabled={!tinId}
                      onClick={() => void measure(b)}
                    >
                      ⛰
                    </button>
                    {own && (
                      <button
                        className="icon"
                        title={t('blast.face.reset')}
                        onClick={() => {
                          setFace(b, { angle: null, height: null });
                        }}
                      >
                        ↺
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="checks">
        <label className="check">
          <input
            type="checkbox"
            checked={layers.faces}
            onChange={(e) => {
              setLayer('faces', e.target.checked);
            }}
          />
          {t('blast.face.show3d')}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={layers.benchPlanes}
            onChange={(e) => {
              setLayer('benchPlanes', e.target.checked);
            }}
          />
          {t('blast.face.showPlanes')}
        </label>
      </div>
    </section>
  );
}
