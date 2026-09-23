import type { DetonatorId, PatternId, SurfaceConnectorId } from '@blastlab/core';
import { connectorColorCss } from '@blastlab/engine';
import { useState } from 'react';
import * as actions from '../actions';
import { NumberField } from '../components/NumberField';
import { useActiveBlast, useProject, useSelectionIds } from '../hooks/useDocument';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { commands } from '@blastlab/core';

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
      useUiStore.getState().notify('Selecciona un taladro que pertenezca a una malla', 'error');
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
      `Detonador en taladro (${ids.length})`,
    );
  };

  return (
    <>
      <section className="panel">
        <h2>Detonador en el taladro</h2>
        <Select
          label="Detonador"
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
          label="Retardo"
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
            A selección ({selection.size})
          </button>
          <button
            onClick={() => {
              assignDownhole(true);
            }}
          >
            A todos
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Amarre automático</h2>
        {patterns.length === 0 ? (
          <p className="hint">Genera una malla primero: el amarre usa sus filas y columnas.</p>
        ) : (
          <>
            <Select
              label="Malla"
              value={patternId}
              options={patterns.map((p) => ({ id: p.id, name: p.name }))}
              onChange={(v) => {
                setStart((s) => ({ ...s, patternId: v }));
              }}
            />
            <NumberField
              label="Fila de inicio"
              integer
              min={1}
              decimals={0}
              value={start.startRow + 1}
              onCommit={(v) => {
                setStart((s) => ({ ...s, startRow: v - 1 }));
              }}
            />
            <NumberField
              label="Columna de inicio"
              integer
              min={1}
              decimals={0}
              value={start.startCol + 1}
              onCommit={(v) => {
                setStart((s) => ({ ...s, startCol: v - 1 }));
              }}
            />
            <button disabled={!single} onClick={takeFromSelection}>
              Usar taladro seleccionado como inicio
            </button>
            <p className="hint">
              Columna en un extremo: línea a línea. Columna central: salida en V.
            </p>
            <h3>Nonel (superficie)</h3>
            <Select
              label="Entre taladros"
              value={tie.interHole}
              options={connectors}
              onChange={(v) => {
                setTie((t) => ({ ...t, interHole: v }));
              }}
            />
            <Select
              label="Entre filas"
              value={tie.interRow}
              options={connectors}
              onChange={(v) => {
                setTie((t) => ({ ...t, interRow: v }));
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
                  },
                  tie.interHole as SurfaceConnectorId,
                  tie.interRow as SurfaceConnectorId,
                );
              }}
            >
              Generar amarre
            </button>
            <h3>Electrónicos</h3>
            {electronicDetonators.length === 0 ? (
              <p className="hint">Agrega un detonador electrónico en la librería.</p>
            ) : (
              <>
                <NumberField
                  label="Entre taladros"
                  unit="ms"
                  decimals={1}
                  min={0}
                  value={elec.interHoleMs}
                  onCommit={(v) => {
                    setElec((e) => ({ ...e, interHoleMs: v }));
                  }}
                />
                <NumberField
                  label="Entre filas"
                  unit="ms"
                  decimals={1}
                  min={0}
                  value={elec.interRowMs}
                  onCommit={(v) => {
                    setElec((e) => ({ ...e, interRowMs: v }));
                  }}
                />
                <NumberField
                  label="Tiempo inicial"
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
                  Asignar tiempos electrónicos
                </button>
              </>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h2>Amarre manual</h2>
        <Select
          label="Conector"
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
          <button
            onClick={() => {
              setTool('tie');
            }}
            title="Clic en taladros para encadenar; Ctrl+clic en una conexión la borra"
          >
            Amarrar (T)
          </button>
          <button
            onClick={() => {
              setTool('initiate');
            }}
            title="Clic en un taladro: agrega/quita punto de inicio"
          >
            Punto de inicio (I)
          </button>
        </div>
        <div className="row">
          <button
            disabled={selection.size === 0}
            onClick={() => {
              actions.clearConnections(true);
            }}
          >
            Borrar amarres selección
          </button>
          <button
            className="danger"
            onClick={() => {
              actions.clearConnections(false);
            }}
          >
            Borrar todos
          </button>
        </div>
      </section>
    </>
  );
}
