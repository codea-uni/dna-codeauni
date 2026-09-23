import {
  commands,
  DEFAULT_CSV_UNITS,
  HOLE_CSV_FIELDS,
  mToMm,
  nextHoleNumber,
  type HoleCsvMapping,
  type HoleCsvUnits,
} from '@blastlab/core';
import { useState } from 'react';
import { getCompute, getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';

export interface CsvPreview {
  fileName: string;
  text: string;
  delimiter: string;
  headers: string[];
  sample: string[][];
  rowCount: number;
  mapping: HoleCsvMapping;
}

const DELIMITER_NAME: Record<string, string> = {
  ',': 'coma',
  ';': 'punto y coma',
  '\t': 'tabulador',
};

/** Importación de taladros desde CSV: mapeo de columnas, unidades y vista previa. */
export function CsvImportDialog({
  preview,
  onClose,
}: {
  preview: CsvPreview;
  onClose: () => void;
}) {
  const [mapping, setMapping] = useState<HoleCsvMapping>(preview.mapping);
  const [units, setUnits] = useState<HoleCsvUnits>(DEFAULT_CSV_UNITS);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const template = useUiStore((s) => s.holeTemplate);
  const missing = HOLE_CSV_FIELDS.filter((f) => f.required && (mapping[f.field] ?? -1) < 0);

  const run = async () => {
    const blast = session.document.project.blasts[0];
    if (!blast) return;
    setBusy(true);
    try {
      const result = await getCompute().api.csvImport(preview.text, mapping, units, {
        diameter: template.diameter,
        subdrill: template.subdrill,
        bench: blast.bench,
        startNumber: replace ? 1 : nextHoleNumber(blast.holes),
      });
      setErrors(result.errors);
      if (result.holes.length === 0) {
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
          ...commands.addHoles(blast.id, result.holes),
        ],
        `Importar CSV (${result.holes.length} taladros)`,
      );
      getEngine()?.zoomToFit();
      useUiStore
        .getState()
        .notify(
          `${result.holes.length} taladros importados${result.errors.length ? ` · ${result.errors.length} filas con error` : ''}`,
          result.errors.length ? 'error' : 'info',
        );
      if (result.errors.length === 0) onClose();
    } finally {
      setBusy(false);
    }
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
          {preview.rowCount} filas · separador:{' '}
          {DELIMITER_NAME[preview.delimiter] ?? preview.delimiter} · {preview.headers.length}{' '}
          columnas
        </p>
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
              Sin diámetro: {mToMm(template.diameter).toFixed(0)} mm · sin sobreperforación:{' '}
              {template.subdrill} m (plantilla). Sin cota: superficie del banco. Sin longitud ni
              fondo: hasta piso + sobreperforación.
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
          <button onClick={onClose}>Cancelar</button>
          <button
            className="primary-inline"
            disabled={busy || missing.length > 0}
            onClick={() => void run()}
          >
            {busy ? 'Importando…' : 'Importar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
