import {
  commands,
  waterCompatible,
  type ChargeRule,
  type HoleGroupId,
  type HoleId,
  type Op,
  type RockMass,
} from '@cronos/core';
import { useState } from 'react';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject, useSelectionIds } from '../hooks/useDocument';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { useUnits } from '../hooks/useUnits';
import { useT } from '../i18n';

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
  const t = useT();
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
  /** Reemplaza la roca de la voladura (comando con deshacer). */
  const setRock = (next: RockMass, label: string) => {
    session.document.dispatch(
      commands.setRockMasses(project.rockMasses.map((r) => (r.id === next.id ? next : r))),
      label,
    );
  };
  const selectedHoles = blast?.holes.filter((h) => selection.has(h.id)) ?? [];

  const [groupId, setGroupId] = useState<string>('');
  const group = blast?.groups.find((g) => g.id === groupId);

  /** Aplica la regla a los taladros; con `toGroup`, además la guarda en el grupo (H-303). */
  const apply = (ids: HoleId[], toGroup?: HoleGroupId) => {
    if (!blast) return;
    if (ids.length === 0) {
      useUiStore.getState().notify(t('charge.noHoles'), 'error');
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
    if (form.stemmingLength <= 0 && !window.confirm(t('charge.noStemmingConfirm'))) return;
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
      t('charge.load', { n: ids.length }),
    );
    useUiStore.getState().notify(t('charge.applied', { n: ids.length }));
  };

  return (
    <>
      <section className="panel">
        <h2>{t('charge.title')}</h2>
        <p className="hint">{t('charge.hint')}</p>
        <Select
          label={t('charge.explosive')}
          value={form.explosiveId}
          options={lib.explosives.map((e) => ({
            id: e.id,
            name: selectedHoles.some((h) => !waterCompatible(e, h.water))
              ? t('charge.notWaterSafe', { name: e.name })
              : e.name,
          }))}
          onChange={(v) => {
            update({ explosiveId: v as ChargeRule['explosiveId'] });
          }}
        />
        <NumberField
          label={t('charge.stemming')}
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
          label={t('charge.stemmingMaterial')}
          value={form.stemmingMaterialId}
          options={lib.stemmingMaterials}
          onChange={(v) => {
            update({ stemmingMaterialId: v as ChargeRule['stemmingMaterialId'] });
          }}
        />
        <NumberField
          label={t('charge.airDeck')}
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
          label={t('charge.primer')}
          value={form.primerId}
          options={[{ id: '', name: t('charge.noPrimer') }, ...lib.primers]}
          onChange={(v) => {
            update({ primerId: v });
          }}
        />
        <Select
          label={t('charge.detonator')}
          value={form.detonatorId}
          options={[{ id: '', name: t('charge.noDetonator') }, ...lib.detonators]}
          onChange={(v) => {
            update({ detonatorId: v });
          }}
        />
        <NumberField
          label={t('charge.primerOffset')}
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
            {t('charge.applySelection', { n: selection.size })}
          </button>
          <button
            onClick={() => {
              apply(blast?.holes.map((h) => h.id) ?? []);
            }}
          >
            {t('charge.applyAll')}
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
              <option value="">{t('charge.group')}</option>
              {blast.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.template?.chargeRule ? ` ${t('charge.withRule')}` : ''}
                </option>
              ))}
            </select>
            <button
              disabled={!group}
              title={t('charge.applyGroupTitle')}
              onClick={() => {
                if (group)
                  apply(
                    blast.holes.filter((h) => h.groupId === group.id).map((h) => h.id),
                    group.id,
                  );
              }}
            >
              {t('charge.applyGroup')}
            </button>
            <button
              disabled={!group?.template?.chargeRule}
              title={t('charge.useGroupRuleTitle')}
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
              {t('charge.useGroupRule')}
            </button>
          </div>
        )}
        <div className="row">
          <button
            disabled={selection.size === 0}
            onClick={() => {
              session.document.dispatch(
                commands.clearCharge(session.document, selection),
                t('charge.unload'),
              );
            }}
          >
            {t('charge.clear')}
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>{t('charge.rockMass')}</h2>
        {rock && (
          <>
            <NumberField
              label={t('charge.rockDensity')}
              unit="t/m³"
              decimals={3}
              min={0.5}
              value={rock.density / 1000}
              onCommit={(v) => {
                setRock({ ...rock, density: v * 1000 }, t('charge.rockDensity'));
              }}
            />
            <NumberField
              label={t('charge.rockUcs')}
              unit="MPa"
              decimals={1}
              min={0}
              value={rock.ucs / 1e6}
              onCommit={(v) => {
                setRock({ ...rock, ucs: v * 1e6 }, t('charge.rockUcs'));
              }}
            />
            <NumberField
              label={t('charge.rockTensile')}
              unit="MPa"
              decimals={1}
              min={0}
              value={(rock.tensileStrength ?? 0) / 1e6}
              onCommit={(v) => {
                const next: RockMass = { ...rock, tensileStrength: v * 1e6 };
                if (v <= 0) delete next.tensileStrength;
                setRock(next, t('charge.rockTensile'));
              }}
            />
            <NumberField
              label={t('charge.rockYoung')}
              unit="GPa"
              decimals={1}
              min={0}
              value={rock.youngModulus / 1e9}
              onCommit={(v) => {
                setRock({ ...rock, youngModulus: v * 1e9 }, t('charge.rockYoung'));
              }}
            />
            <p className="hint">{t('charge.rockStrengthHint')}</p>
            {blast && (
              <NumberField
                label={t('charge.drillingCost')}
                unit={`${project.currency}/m`}
                decimals={2}
                min={0}
                value={blast.calcParams.drillingCostPerMeter}
                onCommit={(v) => {
                  session.document.dispatch(
                    {
                      type: 'blast/patch',
                      blastId: blast.id,
                      patch: { calcParams: { ...blast.calcParams, drillingCostPerMeter: v } },
                    },
                    t('charge.drillingCost'),
                  );
                }}
              />
            )}
          </>
        )}
        <p className="hint">{t('charge.rockHint')}</p>
      </section>
    </>
  );
}
