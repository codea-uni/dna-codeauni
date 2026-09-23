import { degToRad, mmToM, mToMm, radToDeg, type PatternKind } from '@blastlab/core';
import { useState } from 'react';
import * as actions from '../actions';
import { NumberField } from '../components/NumberField';
import { useActiveBlast } from '../hooks/useDocument';
import { useUiStore } from '../stores/uiStore';

const KINDS: { value: PatternKind; label: string }[] = [
  { value: 'square', label: 'Cuadrada' },
  { value: 'rectangular', label: 'Rectangular' },
  { value: 'staggered', label: 'Tresbolillo' },
];

export function PatternPanel() {
  const blast = useActiveBlast();
  const busy = useUiStore((s) => s.busy);
  const template = useUiStore((s) => s.holeTemplate);
  const setTemplate = useUiStore((s) => s.setHoleTemplate);
  const [form, setForm] = useState<actions.PatternForm>({
    kind: 'staggered',
    burden: 6,
    spacing: 7,
    rows: 8,
    holesPerRow: 12,
    rowAzimuth: Math.PI / 2,
    rowAdvance: 'right',
    clipToBoundary: false,
  });
  const update = (patch: Partial<actions.PatternForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  };
  const hasBoundary = Boolean(blast?.boundary);
  const clip = form.clipToBoundary && hasBoundary;

  return (
    <>
      <section className="panel">
        <h2>Plantilla de taladro</h2>
        <p className="hint">Se usa al generar mallas y con la herramienta Agregar.</p>
        <NumberField
          label="Diámetro"
          unit="mm"
          decimals={1}
          min={1}
          value={mToMm(template.diameter)}
          onCommit={(v) => {
            setTemplate({ diameter: mmToM(v) });
          }}
        />
        <NumberField
          label="Inclinación"
          unit="°"
          decimals={2}
          min={0}
          max={89}
          value={radToDeg(template.inclination)}
          onCommit={(v) => {
            setTemplate({ inclination: degToRad(v) });
          }}
        />
        <NumberField
          label="Azimut"
          unit="°"
          decimals={2}
          min={0}
          max={360}
          value={radToDeg(template.azimuth)}
          onCommit={(v) => {
            setTemplate({ azimuth: degToRad(v) });
          }}
        />
        <NumberField
          label="Sobreperforación"
          unit="m"
          decimals={2}
          value={template.subdrill}
          onCommit={(v) => {
            setTemplate({ subdrill: v });
          }}
        />
      </section>

      <section className="panel">
        <h2>Generar malla</h2>
        <label className="field">
          <span className="field-label">Tipo</span>
          <select
            value={form.kind}
            onChange={(e) => {
              update({ kind: e.target.value as PatternKind });
            }}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Burden"
          unit="m"
          decimals={2}
          min={0.1}
          value={form.burden}
          onCommit={(v) => {
            update({ burden: v });
          }}
        />
        <NumberField
          label="Espaciamiento"
          unit="m"
          decimals={2}
          min={0.1}
          value={form.kind === 'square' ? form.burden : form.spacing}
          disabled={form.kind === 'square'}
          onCommit={(v) => {
            update({ spacing: v });
          }}
        />
        <NumberField
          label="Azimut de filas"
          unit="°"
          decimals={2}
          min={0}
          max={360}
          value={radToDeg(form.rowAzimuth)}
          onCommit={(v) => {
            update({ rowAzimuth: degToRad(v) });
          }}
        />
        <label className="field">
          <span className="field-label">Avance de filas</span>
          <select
            value={form.rowAdvance}
            onChange={(e) => {
              update({ rowAdvance: e.target.value as 'left' | 'right' });
            }}
          >
            <option value="right">A la derecha</option>
            <option value="left">A la izquierda</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={clip}
            disabled={!hasBoundary}
            onChange={(e) => {
              update({ clipToBoundary: e.target.checked });
            }}
          />
          Rellenar y recortar al perímetro
        </label>
        {!hasBoundary && <p className="hint">Dibuja un perímetro para habilitar el recorte.</p>}
        <NumberField
          label="Filas"
          integer
          min={1}
          max={1000}
          decimals={0}
          value={form.rows}
          disabled={clip}
          onCommit={(v) => {
            update({ rows: v });
          }}
        />
        <NumberField
          label="Taladros por fila"
          integer
          min={1}
          max={1000}
          decimals={0}
          value={form.holesPerRow}
          disabled={clip}
          onCommit={(v) => {
            update({ holesPerRow: v });
          }}
        />
        {!clip && <p className="hint">La malla se centra en la vista actual.</p>}
        <button
          className="primary"
          disabled={busy !== null}
          onClick={() => void actions.generatePattern({ ...form, clipToBoundary: clip })}
        >
          Generar malla
        </button>
      </section>
    </>
  );
}
