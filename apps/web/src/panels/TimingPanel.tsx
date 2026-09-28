import type { Blast, CalcParams, DetonatorId, PatternId, SurfaceConnectorId } from '@cronos/core';
import { connectorColorCss } from '@cronos/engine';
import { Cable, Zap } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '../components/IconButton';
import * as actions from '../actions';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject, useSelectionIds } from '../hooks/useDocument';
import { useT } from '../i18n';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { commands } from '@cronos/core';

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; name: string; color?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value as T);
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

export function TimingPanel() {
  const t = useT();
  const [tieMode, setTieMode] = useState<'rows' | 'echelon'>('rows');
  const project = useProject();
  const blast = useActiveBlast();
  const selection = useSelectionIds();
  const lib = project.library;
  const setTool = useUiStore((s) => s.setTool);
  const tieConnectorId = useUiStore((s) => s.tieConnectorId) ?? lib.surfaceConnectors[0]?.id;
  const setTieConnector = useUiStore((s) => s.setTieConnector);

  const nonelDetonators = lib.detonators.filter((d) => d.type !== 'electronic');
  const electronicDetonators = lib.detonators.filter((d) => d.type === 'electronic');
  const [downhole, setDownhole] = useState({
    detonatorId: lib.detonators[0]?.id ?? '',
    delayMs: (lib.detonators[0]?.nominalDelay ?? 0.5) * 1000,
  });
  const patterns = blast?.patterns ?? [];
  const [start, setStart] = useState({
    patternId: patterns[0]?.id ?? '',
    startRow: 0,
    startCol: 0,
  });
  const patternId = patterns.some((p) => p.id === start.patternId)
    ? start.patternId
    : (patterns[0]?.id ?? '');
  const connectors = lib.surfaceConnectors.map((c) => ({ id: c.id, name: c.name }));
  const [tie, setTie] = useState({
    interHole: lib.surfaceConnectors[0]?.id ?? '',
    interRow: lib.surfaceConnectors[2]?.id ?? lib.surfaceConnectors[0]?.id ?? '',
  });
  const [elec, setElec] = useState({
    interHoleMs: 9,
    interRowMs: 100,
    offsetMs: 0,
    detonatorId: electronicDetonators[0]?.id ?? '',
  });

  const single =
    selection.size === 1 ? session.document.findHole([...selection][0] as never)?.hole : undefined;
  const takeFromSelection = () => {
    if (single?.row === undefined || single.col === undefined || !single.patternId) {
      useUiStore.getState().notify(t('timing.needPatternHole'), 'error');
      return;
    }
    setStart({ patternId: single.patternId, startRow: single.row, startCol: single.col });
  };

  const assignDownhole = (all: boolean) => {
    if (!blast || !downhole.detonatorId) return;
    const ids = all ? blast.holes.map((h) => h.id) : [...selection];
    if (ids.length === 0) return;
    session.document.dispatch(
      commands.setDownholeDetonator(
        session.document,
        ids,
        downhole.detonatorId as DetonatorId,
        downhole.delayMs / 1000,
      ),
      t('timing.downholeUndo', { n: ids.length }),
    );
  };

  return (
    <>
      <section className="panel">
        <h2>{t('timing.downhole')}</h2>
        <Select
          label={t('timing.detonator')}
          value={downhole.detonatorId}
          options={nonelDetonators.map((d) => ({ id: d.id, name: d.name }))}
          onChange={(v) => {
            setDownhole({
              detonatorId: v,
              delayMs: (lib.detonators.find((d) => d.id === v)?.nominalDelay ?? 0) * 1000,
            });
          }}
        />
        <NumberField
          label={t('timing.delay')}
          unit="ms"
          decimals={1}
          min={0}
          value={downhole.delayMs}
          onCommit={(v) => {
            setDownhole((d) => ({ ...d, delayMs: v }));
          }}
        />
        <div className="row">
          <button
            disabled={selection.size === 0}
            onClick={() => {
              assignDownhole(false);
            }}
          >
            {t('timing.toSelection', { n: selection.size })}
          </button>
          <button
            onClick={() => {
              assignDownhole(true);
            }}
          >
            {t('timing.toAll')}
          </button>
        </div>
      </section>

      {blast && <SequenceParams blast={blast} />}

      <section className="panel">
        <h2>{t('timing.autoTie')}</h2>
        {patterns.length === 0 ? (
          <p className="hint">{t('timing.needPattern')}</p>
        ) : (
          <>
            <Select
              label={t('timing.pattern')}
              value={patternId}
              options={patterns.map((p) => ({ id: p.id, name: p.name }))}
              onChange={(v) => {
                setStart((s) => ({ ...s, patternId: v }));
              }}
            />
            <NumberField
              label={t('timing.startRow')}
              integer
              min={1}
              decimals={0}
              value={start.startRow + 1}
              onCommit={(v) => {
                setStart((s) => ({ ...s, startRow: v - 1 }));
              }}
            />
            <NumberField
              label={t('timing.startCol')}
              integer
              min={1}
              decimals={0}
              value={start.startCol + 1}
              onCommit={(v) => {
                setStart((s) => ({ ...s, startCol: v - 1 }));
              }}
            />
            <button disabled={!single} onClick={takeFromSelection}>
              {t('timing.useSelected')}
            </button>
            <label className="field">
              <span className="field-label">{t('timing.type')}</span>
              <select
                value={tieMode}
                onChange={(e) => {
                  setTieMode(e.target.value as 'rows' | 'echelon');
                }}
              >
                <option value="rows">{t('timing.mode.rows')}</option>
                <option value="echelon">{t('timing.mode.echelon')}</option>
              </select>
            </label>
            <p className="hint">{t('timing.modeHint')}</p>
            <h3>{t('timing.nonel')}</h3>
            <Select
              label={t('timing.interHole')}
              value={tie.interHole}
              options={connectors}
              onChange={(v) => {
                setTie((x) => ({ ...x, interHole: v }));
              }}
            />
            <Select
              label={t('timing.interRow')}
              value={tie.interRow}
              options={connectors}
              onChange={(v) => {
                setTie((x) => ({ ...x, interRow: v }));
              }}
            />
            <button
              className="primary"
              onClick={() => {
                actions.generateRowTieUp(
                  {
                    patternId: patternId as PatternId,
                    startRow: start.startRow,
                    startCol: start.startCol,
                    mode: tieMode,
                  },
                  tie.interHole as SurfaceConnectorId,
                  tie.interRow as SurfaceConnectorId,
                );
              }}
            >
              {t('timing.generate')}
            </button>
            <h3>{t('timing.electronic')}</h3>
            {electronicDetonators.length === 0 ? (
              <p className="hint">{t('timing.needElectronic')}</p>
            ) : (
              <>
                <NumberField
                  label={t('timing.interHole')}
                  unit="ms"
                  decimals={1}
                  min={0}
                  value={elec.interHoleMs}
                  onCommit={(v) => {
                    setElec((e) => ({ ...e, interHoleMs: v }));
                  }}
                />
                <NumberField
                  label={t('timing.interRow')}
                  unit="ms"
                  decimals={1}
                  min={0}
                  value={elec.interRowMs}
                  onCommit={(v) => {
                    setElec((e) => ({ ...e, interRowMs: v }));
                  }}
                />
                <NumberField
                  label={t('timing.offset')}
                  unit="ms"
                  decimals={1}
                  min={0}
                  value={elec.offsetMs}
                  onCommit={(v) => {
                    setElec((e) => ({ ...e, offsetMs: v }));
                  }}
                />
                <button
                  className="primary"
                  onClick={() => {
                    actions.assignElectronicTimes(
                      {
                        patternId: patternId as PatternId,
                        startRow: start.startRow,
                        startCol: start.startCol,
                      },
                      (elec.detonatorId || electronicDetonators[0]?.id) as DetonatorId,
                      elec.interHoleMs / 1000,
                      elec.interRowMs / 1000,
                      elec.offsetMs / 1000,
                    );
                  }}
                >
                  {t('timing.assignElectronic')}
                </button>
              </>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h2>{t('timing.manualTie')}</h2>
        <Select
          label={t('timing.connector')}
          value={tieConnectorId ?? ''}
          options={connectors}
          onChange={(v) => {
            setTieConnector(v as SurfaceConnectorId);
          }}
        />
        <div className="legend-row">
          {lib.surfaceConnectors.map((c) => (
            <span key={c.id} className="legend-chip">
              <i style={{ background: connectorColorCss(c.delay) }} />
              {(c.delay * 1000).toFixed(0)} ms
            </span>
          ))}
        </div>
        <div className="row">
          <IconButton
            icon={Cable}
            label={t('timing.tie')}
            shortcut="T"
            showLabel
            hint={t('timing.tieHint')}
            onClick={() => {
              setTool('tie');
            }}
          />
          <IconButton
            icon={Zap}
            label={t('timing.initiation')}
            shortcut="I"
            showLabel
            onClick={() => {
              setTool('initiate');
            }}
          />
        </div>
        <div className="row">
          <button
            disabled={selection.size === 0}
            onClick={() => {
              actions.clearConnections(true);
            }}
          >
            {t('timing.clearSelection')}
          </button>
          <button
            className="danger"
            onClick={() => {
              actions.clearConnections(false);
            }}
          >
            {t('timing.clearAll')}
          </button>
        </div>
      </section>
    </>
  );
}

/**
 * Parámetros de la secuencia guardados en la voladura: alivio del burden efectivo (P-02) y guía de
 * retardos por metro (H-505, P-11). Se editan como comando (con deshacer).
 */
function SequenceParams({ blast }: { blast: Blast }) {
  const t = useT();
  const cp = blast.calcParams;
  const set = (patch: Partial<CalcParams>, label: string) => {
    session.document.dispatch(
      { type: 'blast/patch', blastId: blast.id, patch: { calcParams: { ...cp, ...patch } } },
      label,
    );
  };
  const guide = cp.delayGuide;
  const setGuide = (
    which: keyof CalcParams['delayGuide'],
    bound: 'min' | 'max',
    msPerM: number,
  ) => {
    set(
      { delayGuide: { ...guide, [which]: { ...guide[which], [bound]: msPerM / 1000 } } },
      t('timing.delayGuide'),
    );
  };
  return (
    <section className="panel">
      <h2>{t('timing.sequenceParams')}</h2>
      <NumberField
        label={t('timing.relief')}
        unit="ms/m"
        decimals={1}
        min={0}
        value={cp.reliefRate * 1000}
        onCommit={(v) => {
          set({ reliefRate: v / 1000 }, t('timing.relief'));
        }}
      />
      <p className="hint">{t('timing.reliefHint')}</p>
      <div className="row">
        <NumberField
          label={t('timing.interHoleMin')}
          unit="ms/m"
          decimals={1}
          min={0}
          value={guide.interHole.min * 1000}
          onCommit={(v) => {
            setGuide('interHole', 'min', v);
          }}
        />
        <NumberField
          label={t('timing.max')}
          unit="ms/m"
          decimals={1}
          min={0}
          value={guide.interHole.max * 1000}
          onCommit={(v) => {
            setGuide('interHole', 'max', v);
          }}
        />
      </div>
      <div className="row">
        <NumberField
          label={t('timing.interRowMin')}
          unit="ms/m"
          decimals={1}
          min={0}
          value={guide.interRow.min * 1000}
          onCommit={(v) => {
            setGuide('interRow', 'min', v);
          }}
        />
        <NumberField
          label={t('timing.max')}
          unit="ms/m"
          decimals={1}
          min={0}
          value={guide.interRow.max * 1000}
          onCommit={(v) => {
            setGuide('interRow', 'max', v);
          }}
        />
      </div>
      <p className="hint">{t('timing.guideHint')}</p>
    </section>
  );
}
