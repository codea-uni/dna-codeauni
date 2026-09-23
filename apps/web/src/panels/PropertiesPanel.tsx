import {
  commands,
  degToRad,
  holeToe,
  mmToM,
  mToMm,
  radToDeg,
  type Hole,
  type HoleEdit,
} from '@blastlab/core';
import * as actions from '../actions';
import { NumberField } from '../components/NumberField';
import { useProject, useSelectionIds } from '../hooks/useDocument';
import { session } from '../session';
import { DeckEditor } from './DeckEditor';

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
          Atajos: V seleccionar · L lazo · A agregar · B perímetro · H desplazar · F encuadrar ·
          Supr borrar · Ctrl+A todo · Ctrl+Z / Ctrl+Shift+Z · Espacio + arrastre o botón
          medio/derecho para desplazar.
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
          unit="m"
          value={common(holes, (h) => h.collar.x)}
          onCommit={(v) => {
            edit({ x: v }, 'Editar X');
          }}
        />
        <NumberField
          label="Norte (Y)"
          unit="m"
          value={common(holes, (h) => h.collar.y)}
          onCommit={(v) => {
            edit({ y: v }, 'Editar Y');
          }}
        />
        <NumberField
          label="Cota boca (Z)"
          unit="m"
          value={common(holes, (h) => h.collar.z)}
          onCommit={(v) => {
            edit({ z: v }, 'Editar cota');
          }}
        />
        <NumberField
          label="Diámetro"
          unit="mm"
          decimals={1}
          min={1}
          value={map(
            common(holes, (h) => h.diameter),
            mToMm,
          )}
          onCommit={(v) => {
            edit({ diameter: mmToM(v) }, 'Editar diámetro');
          }}
        />
        <NumberField
          label="Longitud"
          unit="m"
          decimals={2}
          min={0}
          value={common(holes, (h) => h.length)}
          onCommit={(v) => {
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
          unit="m"
          decimals={2}
          value={common(holes, (h) => h.subdrill)}
          onCommit={(v) => {
            edit({ subdrill: v }, 'Editar sobreperforación');
          }}
        />
        <p className="hint">
          Cambiar cota, inclinación o sobreperforación recalcula la longitud hasta piso +
          sobreperforación.
        </p>
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
