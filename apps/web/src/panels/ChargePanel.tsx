import { commands, type ChargeRule } from '@blastlab/core';
import { useState } from 'react';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject, useSelectionIds } from '../hooks/useDocument';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';

type RuleForm = Omit<ChargeRule, 'airDeckLength' | 'primerId' | 'detonatorId'> & {
  airDeckLength: number;
  primerId: string;
  detonatorId: string;
};

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ChargePanel() {
  const project = useProject();
  const blast = useActiveBlast();
  const selection = useSelectionIds();
  const lib = project.library;
  const [form, setForm] = useState<RuleForm>(() => ({
    stemmingLength: 4,
    stemmingMaterialId: lib.stemmingMaterials[0]?.id ?? ('' as ChargeRule['stemmingMaterialId']),
    explosiveId: lib.explosives[0]?.id ?? ('' as ChargeRule['explosiveId']),
    airDeckLength: 0,
    primerId: lib.primers[0]?.id ?? '',
    detonatorId: lib.detonators[0]?.id ?? '',
    primerOffsetFromToe: 0.5,
  }));
  const update = (patch: Partial<RuleForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  };
  const rock = project.rockMasses.find((r) => r.id === blast?.rockMassId);

  const apply = (all: boolean) => {
    if (!blast) return;
    const ids = all ? blast.holes.map((h) => h.id) : [...selection];
    if (ids.length === 0) {
      useUiStore.getState().notify('Selecciona taladros o usa "Aplicar a todos"', 'error');
      return;
    }
    const rule: ChargeRule = {
      stemmingLength: form.stemmingLength,
      stemmingMaterialId: form.stemmingMaterialId,
      explosiveId: form.explosiveId,
      primerOffsetFromToe: form.primerOffsetFromToe,
    };
    if (form.airDeckLength > 0) rule.airDeckLength = form.airDeckLength;
    if (form.primerId) rule.primerId = form.primerId as NonNullable<ChargeRule['primerId']>;
    if (form.detonatorId)
      rule.detonatorId = form.detonatorId as NonNullable<ChargeRule['detonatorId']>;
    session.document.dispatch(
      commands.applyChargeRule(session.document, ids, rule),
      `Cargar ${ids.length} taladro(s)`,
    );
    useUiStore.getState().notify(`Regla de carga aplicada a ${ids.length} taladro(s)`);
  };

  return (
    <>
      <section className="panel">
        <h2>Regla de carga</h2>
        <p className="hint">
          De fondo a boca: explosivo · aire (opcional) · taco. El detonador y la prima van cerca del
          fondo.
        </p>
        <Select
          label="Explosivo"
          value={form.explosiveId}
          options={lib.explosives}
          onChange={(v) => {
            update({ explosiveId: v as ChargeRule['explosiveId'] });
          }}
        />
        <NumberField
          label="Taco"
          unit="m"
          decimals={2}
          min={0}
          value={form.stemmingLength}
          onCommit={(v) => {
            update({ stemmingLength: v });
          }}
        />
        <Select
          label="Material de taco"
          value={form.stemmingMaterialId}
          options={lib.stemmingMaterials}
          onChange={(v) => {
            update({ stemmingMaterialId: v as ChargeRule['stemmingMaterialId'] });
          }}
        />
        <NumberField
          label="Cámara de aire"
          unit="m"
          decimals={2}
          min={0}
          value={form.airDeckLength}
          onCommit={(v) => {
            update({ airDeckLength: v });
          }}
        />
        <Select
          label="Prima"
          value={form.primerId}
          options={[{ id: '', name: '(ninguna)' }, ...lib.primers]}
          onChange={(v) => {
            update({ primerId: v });
          }}
        />
        <Select
          label="Detonador"
          value={form.detonatorId}
          options={[{ id: '', name: '(ninguno)' }, ...lib.detonators]}
          onChange={(v) => {
            update({ detonatorId: v });
          }}
        />
        <NumberField
          label="Prima desde el fondo"
          unit="m"
          decimals={2}
          min={0}
          value={form.primerOffsetFromToe}
          onCommit={(v) => {
            update({ primerOffsetFromToe: v });
          }}
        />
        <div className="row">
          <button
            className="primary-inline"
            disabled={selection.size === 0}
            onClick={() => {
              apply(false);
            }}
          >
            Aplicar a selección ({selection.size})
          </button>
          <button
            onClick={() => {
              apply(true);
            }}
          >
            Aplicar a todos
          </button>
        </div>
        <div className="row">
          <button
            disabled={selection.size === 0}
            onClick={() => {
              session.document.dispatch(
                commands.clearCharge(session.document, selection),
                'Descargar taladros',
              );
            }}
          >
            Quitar carga de la selección
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Macizo rocoso</h2>
        {rock && (
          <NumberField
            label="Densidad de roca"
            unit="t/m³"
            decimals={3}
            min={0.5}
            value={rock.density / 1000}
            onCommit={(v) => {
              const rockMasses = project.rockMasses.map((r) =>
                r.id === rock.id ? { ...r, density: v * 1000 } : r,
              );
              session.document.dispatch(commands.setRockMasses(rockMasses), 'Densidad de roca');
            }}
          />
        )}
        <p className="hint">Se usa para el tonelaje y el factor de carga en kg/t.</p>
      </section>
    </>
  );
}
