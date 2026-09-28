import {
  commands,
  degToRad,
  holeToe,
  radToDeg,
  type Hole,
  type HoleEdit,
  type HoleWater,
} from '@cronos/core';
import * as actions from '../actions';
import { NumberField } from '../components/NumberField';
import { useProject, useSelectionIds } from '../hooks/useDocument';
import { session } from '../session';
import { DeckEditor } from './DeckEditor';
import { useUnits } from '../hooks/useUnits';
import { useAnalysisStore } from '../stores/analysisStore';

/** Valor común de una propiedad en la selección, o null si difiere. */
function common(holes: readonly Hole[], get: (h: Hole) => number): number | null {
  const first = holes[0];
  if (!first) return null;
  const v = get(first);
  for (let i = 1; i < holes.length; i++) {
    const h = holes[i];
    if (h && Math.abs(get(h) - v) > 1e-9) return null;
  }
  return v;
}

function map(v: number | null, f: (x: number) => number): number | null {
  return v === null ? null : f(v);
}

export function PropertiesPanel() {
  const analysis = useAnalysisStore((st) => st.analysis);
  const { len, dia } = useUnits();
  // Suscripciones: re-render cuando cambian el documento o la selección.
  useProject();
  const ids = useSelectionIds();
  const holes: Hole[] = [];
  for (const id of ids) {
    const h = session.document.findHole(id)?.hole;
    if (h) holes.push(h);
  }

  if (holes.length === 0) {
    return (
      <section className="panel">
        <h2>Propiedades</h2>
        <p className="muted">Sin selección.</p>
        <p className="hint">
          Haz clic en un taladro (<kbd>V</kbd>) o arrastra una caja para editarlo. Los ajustes
          generales están en la pestaña Vista.
        </p>
      </section>
    );
  }

  const single = holes.length === 1 ? holes[0] : undefined;
  const edit = (change: HoleEdit, label: string) => {
    const n = holes.length;
    session.document.dispatch(
      commands.editHoles(
        session.document,
        holes.map((h) => h.id),
        change,
      ),
      n === 1 ? label : `${label} (${n} taladros)`,
    );
  };
  const toe = single ? holeToe(single) : undefined;
  // Resultado del worker para el taladro seleccionado (tiempo relativo y burden efectivo, G5).
  const k = single && analysis ? analysis.charge.holeIds.indexOf(single.id) : -1;
  const seq =
    analysis && k >= 0
      ? {
          t: (analysis.timing.fireTime[k] ?? NaN) - analysis.timing.firstTime,
          eff: analysis.effectiveBurden.effective[k] ?? NaN,
          nom: analysis.effectiveBurden.nominal[k] ?? NaN,
        }
      : null;

  return (
    <>
      <section className="panel">
        <h2>Propiedades</h2>
        <p className="muted">
          {single ? `Taladro ${single.label}` : `${holes.length} taladros seleccionados`}
          {single?.row !== undefined &&
            single.col !== undefined &&
            ` · fila ${single.row + 1}, col. ${single.col + 1}`}
        </p>
        {single && (
          <label className="field">
            <span className="field-label">Etiqueta</span>
            <input
              key={single.id + single.label}
              defaultValue={single.label}
              onBlur={(e) => {
                const label = e.target.value.trim();
                if (label && label !== single.label) edit({ label }, 'Renombrar taladro');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </label>
        )}
        <NumberField
          label="Este (X)"
          unit={len.unit}
          value={map(
            common(holes, (h) => h.collar.x),
            len.show,
          )}
          onCommit={(raw) => {
            const v = len.parse(raw);
            edit({ x: v }, 'Editar X');
          }}
        />
        <NumberField
          label="Norte (Y)"
          unit={len.unit}
          value={map(
            common(holes, (h) => h.collar.y),
            len.show,
          )}
          onCommit={(raw) => {
            const v = len.parse(raw);
            edit({ y: v }, 'Editar Y');
          }}
        />
        <NumberField
          label="Cota boca (Z)"
          unit={len.unit}
          value={map(
            common(holes, (h) => h.collar.z),
            len.show,
          )}
          onCommit={(raw) => {
            const v = len.parse(raw);
            edit({ z: v }, 'Editar cota');
          }}
        />
        <NumberField
          label="Diámetro"
          unit={dia.unit}
          decimals={dia.unit === 'in' ? 3 : 1}
          min={0.001}
          value={map(
            common(holes, (h) => h.diameter),
            dia.show,
          )}
          onCommit={(v) => {
            edit({ diameter: dia.parse(v) }, 'Editar diámetro');
          }}
        />
        <NumberField
          label="Longitud"
          unit={len.unit}
          decimals={2}
          min={0}
          value={map(
            common(holes, (h) => h.length),
            len.show,
          )}
          onCommit={(raw) => {
            const v = len.parse(raw);
            edit({ length: v }, 'Editar longitud');
          }}
        />
        <NumberField
          label="Inclinación"
          unit="°"
          decimals={2}
          min={0}
          max={89}
          value={map(
            common(holes, (h) => h.inclination),
            radToDeg,
          )}
          onCommit={(v) => {
            edit({ inclination: degToRad(v) }, 'Editar inclinación');
          }}
        />
        <NumberField
          label="Azimut"
          unit="°"
          decimals={2}
          min={0}
          max={360}
          value={map(
            common(holes, (h) => h.azimuth),
            radToDeg,
          )}
          onCommit={(v) => {
            edit({ azimuth: degToRad(v) }, 'Editar azimut');
          }}
        />
        <NumberField
          label="Sobreperforación"
          unit={len.unit}
          decimals={2}
          value={map(
            common(holes, (h) => h.subdrill),
            len.show,
          )}
          onCommit={(raw) => {
            const v = len.parse(raw);
            edit({ subdrill: v }, 'Editar sobreperforación');
          }}
        />
        <p className="hint">
          Cambiar cota, inclinación o sobreperforación recalcula la longitud hasta piso +
          sobreperforación.
        </p>
        <label className="field">
          <span className="field-label">Agua en el taladro</span>
          <select
            value={
              new Set(holes.map((h) => h.water ?? 'unknown')).size === 1
                ? (holes[0]?.water ?? 'unknown')
                : 'mixed'
            }
            onChange={(e) => {
              const value = e.target.value as HoleWater | 'unknown';
              const blast = session.document.project.blasts[0];
              if (!blast) return;
              const next = holes.map((h) => {
                const copy = { ...h };
                if (value === 'unknown') delete copy.water;
                else copy.water = value;
                return copy;
              });
              session.document.dispatch(
                { type: 'holes/replace', blastId: blast.id, holes: next },
                holes.length === 1
                  ? 'Estado de agua'
                  : `Estado de agua (${String(holes.length)} taladros)`,
              );
            }}
          >
            <option value="mixed" disabled>
              (varios)
            </option>
            <option value="unknown">Sin dato</option>
            <option value="dry">Seco</option>
            <option value="static">Agua estática</option>
            <option value="dynamic">Agua dinámica</option>
          </select>
        </label>
        <p className="hint">
          P-09: con agua estática no ANFO; con agua dinámica solo emulsión. Se avisa en la revisión.
        </p>
        {seq && Number.isFinite(seq.t) && (
          <p className="muted">
            Sale a {(seq.t * 1000).toFixed(0)} ms del primero
            {Number.isFinite(seq.eff)
              ? ` · burden efectivo ${len.show(seq.eff).toFixed(2)} ${len.unit}`
              : seq.eff === Infinity
                ? ' · sin cara libre al detonar'
                : ''}
            {Number.isFinite(seq.nom) && ` (nominal ${len.show(seq.nom).toFixed(2)} ${len.unit})`}
          </p>
        )}
        {toe && (
          <p className="muted mono">
            Fondo: E {toe.x.toFixed(2)} N {toe.y.toFixed(2)} Z {toe.z.toFixed(2)}
          </p>
        )}
        <div className="row">
          <button
            onClick={() => {
              actions.zoomToFit(true);
            }}
          >
            Encuadrar
          </button>
          <button className="danger" onClick={actions.deleteSelection}>
            Borrar
          </button>
        </div>
      </section>
      {single && <DeckEditor hole={single} />}
    </>
  );
}
