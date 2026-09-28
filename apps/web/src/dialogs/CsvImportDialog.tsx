import {
  commands,
  DEFAULT_CSV_UNITS,
  HOLE_CSV_FIELDS,
  nextHoleNumber,
  type HoleCsvField,
  type HoleCsvMapping,
  type HoleCsvUnits,
  type ImportWarning,
  type TextEncodingName,
} from '@cronos/core';
import type { CsvPreviewData, CsvReadOptions } from '@cronos/workers';
import { useState } from 'react';
import { getCompute, getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { useUnits } from '../hooks/useUnits';
import { useT, type MessageKey } from '../i18n';
import { importErrorText, importWarningText } from '../i18n/coreText';

export interface CsvPreview extends CsvPreviewData {
  fileName: string;
  /** Bytes originales: se vuelven a decodificar si el usuario cambia la codificación. */
  bytes: Uint8Array;
}

const DELIMITER_NAME: Record<string, MessageKey> = {
  ',': 'csv.delimiter.comma',
  ';': 'csv.delimiter.semicolon',
  '\t': 'csv.delimiter.tab',
};

const FIELD_LABEL: Record<HoleCsvField, MessageKey> = {
  label: 'csv.field.label',
  x: 'csv.field.x',
  y: 'csv.field.y',
  z: 'csv.field.z',
  toeX: 'csv.field.toeX',
  toeY: 'csv.field.toeY',
  toeZ: 'csv.field.toeZ',
  length: 'csv.field.length',
  diameter: 'csv.field.diameter',
  inclination: 'csv.field.inclination',
  azimuth: 'csv.field.azimuth',
  subdrill: 'csv.field.subdrill',
  row: 'csv.field.row',
  col: 'csv.field.col',
  group: 'csv.field.group',
};

/**
 * Importación de taladros desde CSV (H-201, H-203; trampas de docs/theory/03 §5): lectura
 * (codificación, separador, encabezado), mapeo de columnas, unidades y vista previa. Importar
 * aplica los taladros al mapa como un solo comando; el diálogo sigue abierto con los avisos para
 * aceptar o deshacer.
 */
export function CsvImportDialog({
  preview: initial,
  onClose,
}: {
  preview: CsvPreview;
  onClose: () => void;
}) {
  const tr = useT();
  const [preview, setPreview] = useState(initial);
  const [groupFromPrefix, setGroupFromPrefix] = useState(false);
  const [result, setResult] = useState<{ imported: number; warnings: ImportWarning[] } | null>(
    null,
  );
  const { len, dia } = useUnits();
  const [mapping, setMapping] = useState<HoleCsvMapping>(initial.mapping);
  const [units, setUnits] = useState<HoleCsvUnits>(DEFAULT_CSV_UNITS);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const template = useUiStore((s) => s.holeTemplate);
  const missing = HOLE_CSV_FIELDS.filter((f) => f.required && (mapping[f.field] ?? -1) < 0);

  const reread = async (options: CsvReadOptions) => {
    setBusy(true);
    try {
      const next = await getCompute().api.csvPreview(preview.bytes, {
        encoding: preview.encoding,
        delimiter: preview.delimiter,
        hasHeader: preview.hasHeader,
        ...options,
      });
      setPreview({ ...preview, ...next });
      // Con otro separador o encabezado cambian las columnas: se vuelve a sugerir el mapeo.
      if (options.delimiter !== undefined || options.hasHeader !== undefined)
        setMapping(next.mapping);
    } finally {
      setBusy(false);
    }
  };

  const run = async (map: HoleCsvMapping = mapping) => {
    const blast = session.document.project.blasts[0];
    if (!blast) return;
    setBusy(true);
    try {
      const { epsg } = session.document.project.coordinateSystem;
      const r = await getCompute().api.csvImport(
        preview.text,
        { delimiter: preview.delimiter, hasHeader: preview.hasHeader },
        map,
        units,
        {
          diameter: template.diameter,
          subdrill: template.subdrill,
          bench: blast.bench,
          startNumber: replace ? 1 : nextHoleNumber(blast.holes),
          existingLabels: replace ? [] : blast.holes.map((h) => h.label),
          groups: blast.groups,
          groupFromPrefix,
          subdrillConvention: blast.calcParams.subdrillConvention,
          ...(epsg === undefined ? {} : { epsg }),
        },
      );
      setErrors(r.errors);
      if (r.holes.length === 0) {
        useUiStore.getState().notify(tr('csv.noneImported'), 'error');
        return;
      }
      const { document } = session;
      document.dispatch(
        [
          ...(replace
            ? commands.deleteHoles(
                document,
                blast.holes.map((h) => h.id),
              )
            : []),
          ...(r.groups.length > 0
            ? [
                {
                  type: 'blast/patch' as const,
                  blastId: blast.id,
                  patch: { groups: [...blast.groups, ...r.groups] },
                },
              ]
            : []),
          ...commands.addHoles(blast.id, r.holes),
        ],
        tr('csv.importUndo', { n: r.holes.length }),
      );
      getEngine()?.zoomToFit();
      setResult({ imported: r.holes.length, warnings: r.warnings });
    } finally {
      setBusy(false);
    }
  };

  /** Deshace la importación aplicada y vuelve al mapeo. */
  const undoImport = () => {
    session.document.undo();
    setResult(null);
  };

  const swapAndRetry = () => {
    session.document.undo();
    const swapped: HoleCsvMapping = { ...mapping };
    if (mapping.y === undefined) delete swapped.x;
    else swapped.x = mapping.y;
    if (mapping.x === undefined) delete swapped.y;
    else swapped.y = mapping.x;
    setMapping(swapped);
    void run(swapped);
  };

  const setUnit = <K extends keyof HoleCsvUnits>(k: K, v: HoleCsvUnits[K]) => {
    setUnits((u) => ({ ...u, [k]: v }));
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={tr('csv.aria')}>
      <div className="modal">
        <header>
          <h2>{tr('csv.title', { file: preview.fileName })}</h2>
          <button className="icon" onClick={onClose} aria-label={tr('settings.close')}>
            ×
          </button>
        </header>
        <p className="muted">
          {tr('csv.summary', { rows: preview.rowCount, cols: preview.headers.length })}
        </p>
        <div className="row">
          <label className="field">
            <span className="field-label">{tr('csv.encoding')}</span>
            <select
              value={preview.encoding}
              disabled={busy || result !== null}
              onChange={(e) => {
                void reread({ encoding: e.target.value as TextEncodingName });
              }}
            >
              <option value="utf-8">UTF-8</option>
              <option value="windows-1252">ISO-8859-1 / Windows-1252</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{tr('csv.delimiter')}</span>
            <select
              value={preview.delimiter}
              disabled={busy || result !== null}
              onChange={(e) => {
                void reread({ delimiter: e.target.value });
              }}
            >
              {Object.entries(DELIMITER_NAME).map(([d, name]) => (
                <option key={d} value={d}>
                  {tr(name)}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={preview.hasHeader}
              disabled={busy || result !== null}
              onChange={(e) => {
                void reread({ hasHeader: e.target.checked });
              }}
            />
            {tr('csv.hasHeader')}
          </label>
        </div>
        <div className="modal-cols">
          <section>
            <h3>{tr('csv.columns')}</h3>
            {HOLE_CSV_FIELDS.map(({ field, required }) => (
              <label key={field} className="field">
                <span className="field-label">
                  {tr(FIELD_LABEL[field])}
                  {required && ' *'}
                </span>
                <select
                  value={mapping[field] ?? -1}
                  onChange={(e) => {
                    setMapping((m) => ({ ...m, [field]: Number(e.target.value) }));
                  }}
                >
                  <option value={-1}>—</option>
                  {preview.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || tr('csv.columnN', { n: i + 1 })}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </section>
          <section>
            <h3>{tr('csv.fileUnits')}</h3>
            <label className="field">
              <span className="field-label">{tr('csv.lengthUnits')}</span>
              <select
                value={units.length}
                onChange={(e) => {
                  setUnit('length', e.target.value as HoleCsvUnits['length']);
                }}
              >
                <option value="m">{tr('csv.meters')}</option>
                <option value="ft">{tr('csv.feet')}</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">{tr('settings.diameter')}</span>
              <select
                value={units.diameter}
                onChange={(e) => {
                  setUnit('diameter', e.target.value as HoleCsvUnits['diameter']);
                }}
              >
                <option value="mm">mm</option>
                <option value="in">{tr('csv.inches')}</option>
                <option value="m">{tr('csv.meters')}</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">{tr('csv.angles')}</span>
              <select
                value={units.angle}
                onChange={(e) => {
                  setUnit('angle', e.target.value as HoleCsvUnits['angle']);
                }}
              >
                <option value="deg">{tr('csv.degrees')}</option>
                <option value="rad">{tr('csv.radians')}</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">{tr('csv.inclinationFrom')}</span>
              <select
                value={units.inclination}
                onChange={(e) => {
                  setUnit('inclination', e.target.value as HoleCsvUnits['inclination']);
                }}
              >
                <option value="fromVertical">{tr('csv.fromVertical')}</option>
                <option value="fromHorizontal">{tr('csv.fromHorizontal')}</option>
              </select>
            </label>
            <h3>{tr('csv.defaults')}</h3>
            <p className="hint">
              {tr('csv.defaultsHint', {
                dia: `${dia.show(template.diameter).toFixed(dia.unit === 'in' ? 2 : 0)} ${dia.unit}`,
                subdrill: `${len.show(template.subdrill).toFixed(2)} ${len.unit}`,
              })}
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => {
                  setReplace(e.target.checked);
                }}
              />
              {tr('csv.replace')}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={groupFromPrefix}
                disabled={(mapping.group ?? -1) >= 0}
                onChange={(e) => {
                  setGroupFromPrefix(e.target.checked);
                }}
              />
              {tr('csv.groupFromPrefix')}
            </label>
          </section>
        </div>
        <h3>{tr('csv.preview')}</h3>
        <div className="table-scroll">
          <table className="grid-table compact preview">
            <thead>
              <tr>
                {preview.headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((row, r) => (
                <tr key={r}>
                  {preview.headers.map((_, i) => (
                    <td key={i}>{row[i] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result && (
          <div className={result.warnings.length > 0 ? 'errors' : 'hint'}>
            <strong>{tr('csv.imported', { n: result.imported })}</strong>
            {result.warnings.length > 0 && (
              <ul>
                {result.warnings.map((w) => (
                  <li key={w.kind}>{importWarningText(w)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {errors.length > 0 && (
          <div className="errors">
            <strong>{tr('csv.rowErrors', { n: errors.length })}</strong>
            <ul>
              {errors.slice(0, 8).map((e) => (
                <li key={e.line}>{importErrorText(e)}</li>
              ))}
            </ul>
          </div>
        )}
        <footer>
          {missing.length > 0 && (
            <span className="warn">
              {tr('csv.missing', {
                fields: missing.map((m) => tr(FIELD_LABEL[m.field])).join(', '),
              })}
            </span>
          )}
          {result === null ? (
            <>
              <button onClick={onClose}>{tr('common.cancel')}</button>
              <button
                className="primary-inline"
                disabled={busy || missing.length > 0}
                onClick={() => void run()}
              >
                {busy ? tr('csv.importing') : tr('csv.importAndView')}
              </button>
            </>
          ) : (
            <>
              <button onClick={undoImport}>{tr('csv.undoImport')}</button>
              {result.warnings.some((w) => w.kind === 'swapXY') && (
                <button onClick={swapAndRetry}>{tr('csv.swapXY')}</button>
              )}
              <button className="primary-inline" onClick={onClose}>
                {tr('csv.accept')}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
