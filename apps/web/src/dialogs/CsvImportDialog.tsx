import {
  commands,
  DEFAULT_CSV_UNITS,
  HOLE_CSV_FIELDS,
  nextHoleNumber,
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

export interface CsvPreview extends CsvPreviewData {
  fileName: string;
  /** Bytes originales: se vuelven a decodificar si el usuario cambia la codificación. */
  bytes: Uint8Array;
}

const DELIMITER_NAME: Record<string, string> = {
  ',': 'coma',
  ';': 'punto y coma',
  '\t': 'tabulador',
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
        useUiStore.getState().notify('No se importó ningún taladro', 'error');
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
        `Importar CSV (${String(r.holes.length)} taladros)`,
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Importar CSV">
      <div className="modal">
        <header>
          <h2>Importar taladros · {preview.fileName}</h2>
          <button className="icon" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <p className="muted">
          {preview.rowCount} filas · {preview.headers.length} columnas
        </p>
        <div className="row">
          <label className="field">
            <span className="field-label">Codificación</span>
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
            <span className="field-label">Separador</span>
            <select
              value={preview.delimiter}
              disabled={busy || result !== null}
              onChange={(e) => {
                void reread({ delimiter: e.target.value });
              }}
            >
              {Object.entries(DELIMITER_NAME).map(([d, name]) => (
                <option key={d} value={d}>
                  {name}
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
            Primera fila = encabezado
          </label>
        </div>
        <div className="modal-cols">
          <section>
            <h3>Columnas</h3>
            {HOLE_CSV_FIELDS.map(({ field, label, required }) => (
              <label key={field} className="field">
                <span className="field-label">
                  {label}
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
                      {h || `Columna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </section>
          <section>
            <h3>Unidades del archivo</h3>
            <label className="field">
              <span className="field-label">Coordenadas y largos</span>
              <select
                value={units.length}
                onChange={(e) => {
                  setUnit('length', e.target.value as HoleCsvUnits['length']);
                }}
              >
                <option value="m">metros</option>
                <option value="ft">pies</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Diámetro</span>
              <select
                value={units.diameter}
                onChange={(e) => {
                  setUnit('diameter', e.target.value as HoleCsvUnits['diameter']);
                }}
              >
                <option value="mm">mm</option>
                <option value="in">pulgadas</option>
                <option value="m">metros</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Ángulos</span>
              <select
                value={units.angle}
                onChange={(e) => {
                  setUnit('angle', e.target.value as HoleCsvUnits['angle']);
                }}
              >
                <option value="deg">grados</option>
                <option value="rad">radianes</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Inclinación medida desde</span>
              <select
                value={units.inclination}
                onChange={(e) => {
                  setUnit('inclination', e.target.value as HoleCsvUnits['inclination']);
                }}
              >
                <option value="fromVertical">la vertical (0 = vertical)</option>
                <option value="fromHorizontal">la horizontal (dip, 90 = vertical)</option>
              </select>
            </label>
            <h3>Valores por defecto</h3>
            <p className="hint">
              Sin diámetro: {dia.show(template.diameter).toFixed(dia.unit === 'in' ? 2 : 0)}{' '}
              {dia.unit} · sin sobreperforación: {len.show(template.subdrill).toFixed(2)} {len.unit}{' '}
              (plantilla). Sin cota: superficie del banco. Sin longitud ni fondo: hasta piso +
              sobreperforación.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => {
                  setReplace(e.target.checked);
                }}
              />
              Reemplazar los taladros existentes
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
              Sin columna Grupo: agrupar por el prefijo del ID (A, B, BF…)
            </label>
          </section>
        </div>
        <h3>Vista previa</h3>
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
            <strong>
              {result.imported} taladros en el mapa. Revisa su posición y acepta o deshaz.
            </strong>
            {result.warnings.length > 0 && (
              <ul>
                {result.warnings.map((w) => (
                  <li key={w.kind}>{w.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {errors.length > 0 && (
          <div className="errors">
            <strong>{errors.length} filas no se importaron:</strong>
            <ul>
              {errors.slice(0, 8).map((e) => (
                <li key={e.line}>
                  Línea {e.line}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <footer>
          {missing.length > 0 && (
            <span className="warn">Falta mapear: {missing.map((m) => m.label).join(', ')}</span>
          )}
          {result === null ? (
            <>
              <button onClick={onClose}>Cancelar</button>
              <button
                className="primary-inline"
                disabled={busy || missing.length > 0}
                onClick={() => void run()}
              >
                {busy ? 'Importando…' : 'Importar y ver en el mapa'}
              </button>
            </>
          ) : (
            <>
              <button onClick={undoImport}>Deshacer importación</button>
              {result.warnings.some((w) => w.kind === 'swapXY') && (
                <button onClick={swapAndRetry}>Intercambiar Este/Norte</button>
              )}
              <button className="primary-inline" onClick={onClose}>
                Aceptar
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
