import {
  commands,
  waterCompatible,
  type ChargeRule,
  type HoleGroupId,
  type HoleId,
  type Op,
} from '@cronos/core';
import { useState } from 'react';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject, useSelectionIds } from '../hooks/useDocument';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { useUnits } from '../hooks/useUnits';

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
  const { len } = useUnits();
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
  const selectedHoles = blast?.holes.filter((h) => selection.has(h.id)) ?? [];

  const [groupId, setGroupId] = useState<string>('');
  const group = blast?.groups.find((g) => g.id === groupId);

  /** Aplica la regla a los taladros; con `toGroup`, además la guarda en el grupo (H-303). */
  const apply = (ids: HoleId[], toGroup?: HoleGroupId) => {
    if (!blast) return;
    if (ids.length === 0) {
      useUiStore.getState().notify('No hay taladros a los que aplicar la regla', 'error');
      return;
    }
    const rule: ChargeRule = {
      stemmingLength: form.stemmingLength,
      stemmingMaterialId: form.stemmingMaterialId,
      explosiveId: form.explosiveId,
      primerOffsetFromToe: form.primerOffsetFromToe,
    };
    // P-04: sin taco es un diseño muy riesgoso (proyecciones, sobrepresión), pero existen casos
    // especiales (alivios, pruebas): se pide confirmación explícita.
    if (
      form.stemmingLength <= 0 &&
      !window.confirm(
        'Sin taco: alto riesgo de proyección de rocas y sobrepresión, y pérdida de energía. ¿Aplicar igual?',
      )
    )
      return;
    if (form.airDeckLength > 0) rule.airDeckLength = form.airDeckLength;
    if (form.primerId) rule.primerId = form.primerId as NonNullable<ChargeRule['primerId']>;
    if (form.detonatorId)
      rule.detonatorId = form.detonatorId as NonNullable<ChargeRule['detonatorId']>;
    const saveInGroup: Op[] = toGroup
      ? [
          {
            type: 'blast/patch',
            blastId: blast.id,
            patch: {
              groups: blast.groups.map((g) =>
                g.id === toGroup
                  ? {
                      ...g,
                      template: {
                        ...(g.template ?? useUiStore.getState().holeTemplate),
                        chargeRule: rule,
                      },
                    }
                  : g,
              ),
            },
          },
        ]
      : [];
    session.document.dispatch(
      [...saveInGroup, ...commands.applyChargeRule(session.document, ids, rule)],
      `Cargar ${String(ids.length)} taladro(s)`,
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
          options={lib.explosives.map((e) => ({
            id: e.id,
            name: selectedHoles.some((h) => !waterCompatible(e, h.water))
              ? `${e.name} ⚠ no apto para el agua de la selección`
              : e.name,
          }))}
          onChange={(v) => {
            update({ explosiveId: v as ChargeRule['explosiveId'] });
          }}
        />
        <NumberField
          label="Taco"
          unit={len.unit}
          decimals={2}
          min={0}
          value={len.show(form.stemmingLength)}
          onCommit={(raw) => {
            const v = len.parse(raw);
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
          unit={len.unit}
          decimals={2}
          min={0}
          value={len.show(form.airDeckLength)}
          onCommit={(raw) => {
            const v = len.parse(raw);
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
          unit={len.unit}
          decimals={2}
          min={0}
          value={len.show(form.primerOffsetFromToe)}
          onCommit={(raw) => {
            const v = len.parse(raw);
            update({ primerOffsetFromToe: v });
          }}
        />
        <div className="row">
          <button
            className="primary-inline"
            disabled={selection.size === 0}
            onClick={() => {
              apply([...selection]);
            }}
          >
            Aplicar a selección ({selection.size})
          </button>
          <button
            onClick={() => {
              apply(blast?.holes.map((h) => h.id) ?? []);
            }}
          >
            Aplicar a todos
          </button>
        </div>
        {blast && blast.groups.length > 0 && (
          <div className="row">
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
              }}
            >
              <option value="">Grupo…</option>
              {blast.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.template?.chargeRule ? ' (con regla)' : ''}
                </option>
              ))}
            </select>
            <button
              disabled={!group}
              title="Aplica la regla a los taladros del grupo y la guarda en el grupo"
              onClick={() => {
                if (group)
                  apply(
                    blast.holes.filter((h) => h.groupId === group.id).map((h) => h.id),
                    group.id,
                  );
              }}
            >
              Aplicar al grupo
            </button>
            <button
              disabled={!group?.template?.chargeRule}
              title="Carga en el formulario la regla guardada en el grupo"
              onClick={() => {
                const r = group?.template?.chargeRule;
                if (!r) return;
                update({
                  stemmingLength: r.stemmingLength,
                  stemmingMaterialId: r.stemmingMaterialId,
                  explosiveId: r.explosiveId,
                  airDeckLength: r.airDeckLength ?? 0,
                  primerId: r.primerId ?? '',
                  detonatorId: r.detonatorId ?? '',
                  primerOffsetFromToe: r.primerOffsetFromToe,
                });
              }}
            >
              Usar su regla
            </button>
          </div>
        )}
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
