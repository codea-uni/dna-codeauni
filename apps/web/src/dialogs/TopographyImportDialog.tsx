import {
  CRS_DEFS,
  crsName,
  DEFAULT_TIN_OPTIONS,
  fitLocalGrid,
  isKnownCrs,
  parseNumber,
  type AssembleOptions,
  type AssembleResult,
  type Bounds3,
  type ControlPoint,
  type LocalGridTransform,
  type PointColumns,
  type TopoFile,
  type TopoInspection,
  type TopoLayerRole,
  type TopoWarning,
} from '@cronos/core';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useT, type MessageKey } from '../i18n';
import { es } from '../i18n/es';
import { getCompute, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import {
  clearTopographyPreview,
  createSurveyOps,
  showTopographyPreview,
} from '../topography/session';

/** Archivos elegidos y lo que el worker vio en ellos. */
export interface TopoImportRequest {
  files: TopoFile[];
  inspection: TopoInspection;
}

type Translate = ReturnType<typeof useT>;

const LAYER_ROLES: TopoLayerRole[] = [
  'tin',
  'points',
  'contour',
  'crest',
  'toe',
  'breakline',
  'other',
  'ignore',
];

/** Texto de un aviso del núcleo (`TopoWarning.code`); si no hay traducción, el código. */
export function topoWarningText(w: TopoWarning, tr: Translate): string {
  const key = `topo.warn.${w.code}`;
  return key in es ? tr(key as MessageKey, w.params) : w.code;
}

const describe = (counts: Record<string, number>) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${String(n)} ${type}`)
    .join(' · ');

/** Sistema del archivo: el del proyecto, uno de los cargados (EPSG) o una grilla local. */
type Source = 'project' | 'local' | number;

/** Fila editable de un punto de control: local E, N, Z y proyecto E, N, Z (texto). */
type ControlRow = [string, string, string, string, string, string];
const emptyRow = (): ControlRow => ['', '', '', '', '', ''];

function controlPoints(rows: readonly ControlRow[]): ControlPoint[] {
  const out: ControlPoint[] = [];
  for (const r of rows) {
    const v = r.map((c) => parseNumber(c));
    const [le, ln, lz, pe, pn, pz] = v;
    if (
      le === undefined ||
      ln === undefined ||
      pe === undefined ||
      pn === undefined ||
      ![le, ln, pe, pn].every(Number.isFinite)
    )
      continue;
    out.push({
      local: [le, ln, Number.isFinite(lz) ? (lz ?? 0) : 0],
      target: [pe, pn, Number.isFinite(pz) ? (pz ?? 0) : 0],
    });
  }
  return out;
}

/** Caja envolvente del diseño (taladros, perímetros y levantamientos), para avisar si el archivo cae lejos. */
function projectBounds(): Bounds3 | undefined {
  const b: Bounds3 = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
  const add = (x: number, y: number) => {
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  };
  const project = session.document.project;
  for (const blast of project.blasts) {
    for (const h of blast.holes) add(h.collar.x, h.collar.y);
    for (const p of blast.boundaries.flatMap((x) => x.polygon)) add(p.x, p.y);
  }
  for (const s of project.topography) {
    add(s.bounds.minX, s.bounds.minY);
    add(s.bounds.maxX, s.bounds.maxY);
  }
  return Number.isFinite(b.minX) ? { ...b, minZ: 0, maxZ: 0 } : undefined;
}

const baseName = (files: readonly TopoFile[]) =>
  (files[0]?.name ?? '').replace(/\.[^.]+$/, '') || 'Topografía';

/**
 * Asistente de importación de topografía: archivos y formato, coordenadas (reproyección o grilla
 * local), roles de capa o columnas, opciones de triangulación, y vista previa en el mapa antes de
 * agregarla (`docs/theory/03 §5`). Todo el proceso corre en el worker.
 */
export function TopographyImportDialog({
  request,
  onClose,
}: {
  request: TopoImportRequest;
  onClose: () => void;
}) {
  const tr = useT();
  const { files, inspection } = request;
  const format = inspection.format ?? 'points';
  const project = session.document.project;
  const projectEpsg = project.coordinateSystem.epsg;
  const blast = project.blasts[0];
  const canReproject = projectEpsg !== undefined && isKnownCrs(projectEpsg);

  const [source, setSource] = useState<Source>(() =>
    inspection.epsg !== undefined && canReproject && isKnownCrs(inspection.epsg)
      ? inspection.epsg
      : 'project',
  );
  const [swapNE, setSwapNE] = useState(false);
  const [control, setControl] = useState<ControlRow[]>([emptyRow(), emptyRow()]);
  const [roles, setRoles] = useState<Record<string, TopoLayerRole>>(() =>
    Object.fromEntries((inspection.layers ?? []).map((l) => [l.name, l.suggested])),
  );
  const [columns, setColumns] = useState<PointColumns>(
    inspection.points?.columns ?? { east: 0, north: 1, elevation: 2 },
  );
  const [maxEdgeFactor, setMaxEdgeFactor] = useState<number>(DEFAULT_TIN_OPTIONS.maxEdgeFactor);
  const [cell, setCell] = useState(0);
  const [name, setName] = useState(() => baseName(files));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [useInBench, setUseInBench] = useState(blast !== undefined);
  const [result, setResult] = useState<{ r: AssembleResult; ms: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);

  // La vista previa se quita del mapa al cerrar el asistente.
  useEffect(() => clearTopographyPreview, []);

  const grid = useMemo((): { t: LocalGridTransform } | { error: true } | null => {
    if (source !== 'local') return null;
    try {
      return { t: fitLocalGrid(controlPoints(control)) };
    } catch {
      return { error: true };
    }
  }, [source, control]);

  /** Cualquier cambio de opciones invalida el resultado procesado. */
  const invalidate = () => {
    if (result) {
      setResult(null);
      clearTopographyPreview();
    }
  };

  const columnCount = Math.max(
    3,
    ...(inspection.points?.sample ?? []).map(
      (l) => l.split(/[\t;,]|\s+/).filter((c) => c.trim() !== '').length,
    ),
  );

  const transformText = (): string | undefined => {
    if (source === 'local' && grid && 't' in grid)
      return `${tr('topo.import.localGrid')} → ${crsName(projectEpsg ?? 0)}`;
    if (typeof source === 'number' && projectEpsg !== undefined && source !== projectEpsg)
      return `${crsName(source)} → ${crsName(projectEpsg)}`;
    return undefined;
  };

  const options = (): AssembleOptions => {
    const bounds = projectBounds();
    const reproject = typeof source === 'number' && projectEpsg !== undefined;
    return {
      ...(swapNE ? { swapNE: true } : {}),
      ...(grid && 't' in grid ? { localGrid: grid.t } : {}),
      ...(reproject ? { fromEpsg: source, toEpsg: projectEpsg } : {}),
      ...(!reproject && projectEpsg !== undefined ? { fromEpsg: projectEpsg } : {}),
      tin: { maxEdgeFactor },
      ...(format === 'points' && cell > 0 ? { decimate: { cell, keep: 'min' } } : {}),
      ...(projectEpsg !== undefined ? { projectEpsg } : {}),
      ...(bounds ? { projectBounds: bounds } : {}),
    };
  };

  const process = async () => {
    setBusy(true);
    setError(null);
    try {
      const t0 = performance.now();
      const r = await getCompute().api.topographyImport(
        files,
        format,
        format === 'dxf'
          ? { layerRoles: roles }
          : format === 'points'
            ? { pointColumns: columns }
            : {},
        options(),
      );
      const ms = Math.round(performance.now() - t0);
      setResult({ r, ms });
      if (r.parts.tin || r.parts.lines) await showTopographyPreview(r.parts, r.bounds);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!result) return;
    const { parts } = result.r;
    if (!parts.tin && !parts.lines) {
      setError(tr('topo.import.nothing'));
      return;
    }
    setBusy(true);
    try {
      const transform = transformText();
      const { ops } = await createSurveyOps(
        {
          name: name.trim() || baseName(files),
          surveyDate: date,
          format,
          files: files.map((f) => f.name),
          ...(projectEpsg !== undefined ? { epsg: projectEpsg } : {}),
          ...(typeof source === 'number' && source !== projectEpsg ? { sourceEpsg: source } : {}),
          ...(transform ? { transform } : {}),
        },
        parts,
        useInBench ? blast?.id : undefined,
      );
      session.document.dispatch(ops, tr('topo.import.undo', { name }));
      clearTopographyPreview();
      useUiStore.getState().notify(tr('topo.import.done', { name }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const stats = result ? (
    <span>
      {tr('topo.import.result', {
        points: result.r.stats.points,
        triangles: result.r.stats.triangles,
        lines: result.r.stats.lines,
      })}{' '}
      <span className="muted">{tr('topo.import.timing', { ms: result.ms })}</span>
    </span>
  ) : null;
  const canAccept =
    result !== null &&
    !busy &&
    (result.r.parts.tin !== undefined || result.r.parts.lines !== undefined);
  const acceptButton = (
    <button className="primary-inline" disabled={!canAccept} onClick={() => void accept()}>
      {tr('topo.import.accept')}
    </button>
  );

  if (peek)
    return (
      <div className="topo-peek" role="dialog" aria-label={tr('topo.import.aria')}>
        <strong>{tr('topo.import.peek', { name })}</strong>
        {stats}
        <button
          onClick={() => {
            setPeek(false);
          }}
        >
          {tr('topo.import.backToDialog')}
        </button>
        {acceptButton}
      </div>
    );

  const rejected = inspection.rejected.map((f) =>
    /\.dwg$/i.test(f)
      ? tr('topo.import.dwg', { file: f })
      : tr('topo.import.rejected', { file: f }),
  );

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr('topo.import.aria')}
    >
      <div className="modal topo-import">
        <header>
          <h2>{tr('topo.import.title')}</h2>
          <button className="icon" onClick={onClose} aria-label={tr('settings.close')}>
            <X size={16} />
          </button>
        </header>
        <p className="muted">
          {tr(`topo.import.format.${format}`)} · {files.map((f) => f.name).join(', ')}
        </p>
        {rejected.length > 0 && (
          <div className="errors">
            <ul>
              {rejected.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="modal-cols">
          <section>
            <h3>{tr('topo.import.crs')}</h3>
            <label className="field wide">
              <span className="field-label">{tr('topo.import.sourceCrs')}</span>
              <select
                value={String(source)}
                onChange={(e) => {
                  const v = e.target.value;
                  setSource(v === 'project' || v === 'local' ? v : Number(v));
                  invalidate();
                }}
              >
                <option value="project">
                  {tr('topo.import.sameAsProject', { epsg: projectEpsg ?? '—' })}
                </option>
                {canReproject &&
                  Object.entries(CRS_DEFS)
                    .filter(([epsg]) => Number(epsg) !== projectEpsg)
                    .map(([epsg, def]) => (
                      <option key={epsg} value={epsg}>
                        {def.name} (EPSG {epsg})
                        {Number(epsg) === inspection.epsg ? ` · ${tr('topo.import.declared')}` : ''}
                      </option>
                    ))}
                <option value="local">{tr('topo.import.localGrid')}</option>
              </select>
            </label>
            {projectEpsg !== undefined && (
              <p className="hint">{tr('topo.import.target', { name: crsName(projectEpsg) })}</p>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={swapNE}
                onChange={(e) => {
                  setSwapNE(e.target.checked);
                  invalidate();
                }}
              />
              {tr('topo.import.swapNE')}
            </label>
            {source === 'local' && (
              <ControlPoints
                rows={control}
                onChange={(rows) => {
                  setControl(rows);
                  invalidate();
                }}
                grid={grid}
              />
            )}

            <h3>{tr('topo.import.options')}</h3>
            <label className="field" title={tr('topo.import.maxEdgeHint')}>
              <span className="field-label">{tr('topo.import.maxEdge')}</span>
              <span className="field-input">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={maxEdgeFactor}
                  onChange={(e) => {
                    setMaxEdgeFactor(Math.max(1, Number(e.target.value) || 1));
                    invalidate();
                  }}
                />
                <span className="field-unit">×</span>
              </span>
            </label>
            {format === 'points' && (
              <label className="field" title={tr('topo.import.cellHint')}>
                <span className="field-label">{tr('topo.import.cell')}</span>
                <span className="field-input">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={cell}
                    onChange={(e) => {
                      setCell(Math.max(0, Number(e.target.value) || 0));
                      invalidate();
                    }}
                  />
                  <span className="field-unit">m</span>
                </span>
              </label>
            )}
          </section>

          <section>
            <h3>{tr('topo.import.content')}</h3>
            {format === 'dxf' && (
              <table className="grid-table layers">
                <thead>
                  <tr>
                    <th>{tr('topo.import.layer')}</th>
                    <th>{tr('topo.import.entities')}</th>
                    <th>{tr('topo.import.useAs')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(inspection.layers ?? []).map((l) => (
                    <tr key={l.name}>
                      <td className="mono">{l.name}</td>
                      <td className="muted small">{describe(l.counts)}</td>
                      <td>
                        <select
                          className="cell"
                          value={roles[l.name] ?? 'ignore'}
                          onChange={(e) => {
                            setRoles((r) => ({ ...r, [l.name]: e.target.value as TopoLayerRole }));
                            invalidate();
                          }}
                        >
                          {LAYER_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {tr(`topo.role.${role}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {format === 'points' && (
              <>
                {(['east', 'north', 'elevation'] as const).map((k) => (
                  <label key={k} className="field">
                    <span className="field-label">{tr(`topo.import.${k}`)}</span>
                    <select
                      value={columns[k]}
                      onChange={(e) => {
                        setColumns((c) => ({ ...c, [k]: Number(e.target.value) }));
                        invalidate();
                      }}
                    >
                      {Array.from({ length: columnCount }, (_, i) => (
                        <option key={i} value={i}>
                          {tr('topo.import.column', { n: i + 1 })}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <pre className="topo-sample">{(inspection.points?.sample ?? []).join('\n')}</pre>
              </>
            )}
            {(format === 'surpac' || format === 'landxml') && (
              <p className="hint">{tr(`topo.import.format.${format}`)}</p>
            )}

            <label className="field">
              <span className="field-label">{tr('topo.import.name')}</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">{tr('topo.import.date')}</span>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                }}
              />
            </label>
            {blast && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={useInBench}
                  onChange={(e) => {
                    setUseInBench(e.target.checked);
                  }}
                />
                {tr('topo.import.useInBench')}
              </label>
            )}
          </section>
        </div>

        {result && <p className="topo-result">{stats}</p>}
        {(result?.r.warnings.length ?? 0) > 0 && (
          <div className="errors">
            <ul>
              {result?.r.warnings.map((w, i) => (
                <li key={`${w.code}-${String(i)}`}>{topoWarningText(w, tr)}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button onClick={onClose}>{tr('common.cancel')}</button>
          <button
            disabled={busy || (grid !== null && 'error' in grid)}
            onClick={() => void process()}
          >
            {busy ? tr('topo.import.processing') : tr('topo.import.preview')}
          </button>
          <button
            disabled={!result}
            onClick={() => {
              setPeek(true);
            }}
          >
            {tr('topo.import.showOnMap')}
          </button>
          {acceptButton}
        </footer>
      </div>
    </div>
  );
}

/** Tabla de puntos de control de la grilla local, con el residuo del ajuste. */
function ControlPoints({
  rows,
  onChange,
  grid,
}: {
  rows: ControlRow[];
  onChange: (rows: ControlRow[]) => void;
  grid: { t: LocalGridTransform } | { error: true } | null;
}) {
  const tr = useT();
  const heads: MessageKey[] = [
    'topo.import.localE',
    'topo.import.localN',
    'topo.import.localZ',
    'topo.import.east',
    'topo.import.north',
    'topo.import.elevation',
  ];
  return (
    <>
      <h4>{tr('topo.import.control')}</h4>
      <p className="hint">{tr('topo.import.controlHint')}</p>
      <table className="grid-table control-points">
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{tr(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cellText, j) => (
                <td key={j}>
                  <input
                    className="cell mono"
                    inputMode="decimal"
                    value={cellText}
                    aria-label={`${tr(heads[j] ?? 'topo.import.east')} ${String(i + 1)}`}
                    onChange={(e) => {
                      const next = rows.map((r) => [...r] as ControlRow);
                      const target = next[i];
                      if (target) target[j] = e.target.value;
                      onChange(next);
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button
          onClick={() => {
            onChange([...rows, emptyRow()]);
          }}
        >
          {tr('topo.import.addControl')}
        </button>
        {grid && 't' in grid && (
          <span className="muted">
            {tr('topo.import.residual', { m: grid.t.maxResidual.toFixed(3) })}
          </span>
        )}
        {grid && 'error' in grid && <span className="warn">{tr('topo.import.controlBad')}</span>}
      </div>
    </>
  );
}
