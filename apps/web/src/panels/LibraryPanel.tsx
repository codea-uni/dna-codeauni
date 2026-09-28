import { commands, newId, type ProductLibrary } from '@cronos/core';
import { useRef } from 'react';
import * as actions from '../actions';
import { NumberCell, TextCell } from '../components/CellInput';
import { useProject } from '../hooks/useDocument';
import { session } from '../session';

type Key = keyof ProductLibrary;
type Item<K extends Key> = ProductLibrary[K][number];

/** Cuántos taladros (o conexiones, para conectores) usan un producto: se advierte antes de borrarlo. */
function usage(key: Key, id: string): number {
  let n = 0;
  for (const blast of session.document.project.blasts) {
    if (key === 'surfaceConnectors') {
      n += blast.initiation.connections.filter((c) => c.connectorId === id).length;
      continue;
    }
    for (const h of blast.holes) {
      const used =
        key === 'explosives'
          ? h.decks.some((d) => d.kind === 'explosive' && d.explosiveId === id)
          : key === 'stemmingMaterials'
            ? h.decks.some((d) => d.kind === 'stemming' && d.materialId === id)
            : key === 'detonators'
              ? h.initiators.some((i) => i.detonatorId === id)
              : h.initiators.some((i) => i.primerId === id);
      if (used) n++;
    }
  }
  return n;
}

function useLibraryEditor() {
  const library = useProject().library;
  /** `undefined` en el parche borra el campo opcional. */
  const update = <K extends Key>(
    key: K,
    id: string,
    patch: { [P in keyof Item<K>]?: Item<K>[P] | undefined },
    label = 'Editar producto',
  ) => {
    const list = library[key].map((item) => {
      if (item.id !== id) return item;
      // Sin claves con undefined (exactOptionalPropertyTypes): se filtran al combinar.
      return Object.fromEntries(
        Object.entries({ ...item, ...patch }).filter((e: [string, unknown]) => e[1] !== undefined),
      ) as unknown as Item<K>;
    });
    session.document.dispatch(commands.setLibrary({ ...library, [key]: list }), label);
  };
  const add = <K extends Key>(key: K, item: Item<K>) => {
    session.document.dispatch(
      commands.setLibrary({ ...library, [key]: [...library[key], item] }),
      'Agregar producto',
    );
  };
  const remove = (key: Key, id: string, name: string) => {
    const n = usage(key, id);
    if (
      n > 0 &&
      !window.confirm(
        `"${name}" se usa en ${n} taladro(s)/conexión(es). ¿Borrarlo igual? (quedarán sin producto)`,
      )
    )
      return;
    const list = (library[key] as { id: string }[]).filter((item) => item.id !== id);
    session.document.dispatch(commands.setLibrary({ ...library, [key]: list }), 'Borrar producto');
  };
  return { library, update, add, remove };
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon danger" title="Borrar" onClick={onClick}>
      ×
    </button>
  );
}

export function LibraryPanel() {
  const { library, update, add, remove } = useLibraryEditor();
  const catalogInput = useRef<HTMLInputElement>(null);
  return (
    <>
      <section className="panel">
        <h2>Explosivos</h2>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th title="Densidad [g/cm³]">ρ</th>
              <th title="Velocidad de detonación [m/s]">VOD</th>
              <th title="Energía (AWS) [MJ/kg]">MJ/kg</th>
              <th title="Potencia relativa en peso vs ANFO [%]">RWS</th>
              <th title="Costo por kg">$/kg</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {library.explosives.map((e) => (
              <tr key={e.id}>
                <td>
                  <TextCell
                    value={e.name}
                    title={e.form === 'packaged' ? 'Encartuchado' : 'A granel'}
                    onCommit={(name) => {
                      update('explosives', e.id, { name });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={e.density / 1000}
                    decimals={3}
                    min={0.01}
                    onCommit={(v) => {
                      update('explosives', e.id, { density: v * 1000 });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={e.vod}
                    decimals={0}
                    min={1}
                    onCommit={(v) => {
                      update('explosives', e.id, { vod: v });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={e.energy / 1e6}
                    decimals={2}
                    min={0.01}
                    onCommit={(v) => {
                      update('explosives', e.id, { energy: v * 1e6 });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={e.rws * 100}
                    decimals={0}
                    min={1}
                    onCommit={(v) => {
                      update('explosives', e.id, { rws: v / 100 });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={e.costPerKg ?? 0}
                    decimals={2}
                    min={0}
                    onCommit={(v) => {
                      update('explosives', e.id, { costPerKg: v });
                    }}
                  />
                </td>
                <td>
                  <RemoveButton
                    onClick={() => {
                      remove('explosives', e.id, e.name);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Agua, iniciación y origen</h3>
        <p className="hint">
          Resistencia al agua para filtrar por el estado del taladro (P-09), diámetro crítico,
          necesidad de cebo (RM-05) y la ficha técnica de origen con su versión (DF-22).
        </p>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Agua</th>
              <th title="Diámetro crítico [mm]">Ø crít.</th>
              <th title="Necesita booster (agente de voladura)">Cebo</th>
              <th>Fuente</th>
              <th>Versión</th>
            </tr>
          </thead>
          <tbody>
            {library.explosives.map((e) => (
              <tr key={e.id}>
                <td className="muted">{e.name}</td>
                <td>
                  <select
                    className="cell"
                    value={e.waterResistance}
                    onChange={(ev) => {
                      update('explosives', e.id, {
                        waterResistance: ev.target.value as typeof e.waterResistance,
                      });
                    }}
                  >
                    <option value="none">Nula</option>
                    <option value="limited">Limitada</option>
                    <option value="high">Alta</option>
                  </select>
                </td>
                <td>
                  <NumberCell
                    value={(e.criticalDiameter ?? 0) * 1000}
                    decimals={0}
                    min={0}
                    onCommit={(v) => {
                      update('explosives', e.id, {
                        criticalDiameter: v > 0 ? v / 1000 : undefined,
                      });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={e.needsBooster === true}
                    onChange={(ev) => {
                      update('explosives', e.id, { needsBooster: ev.target.checked });
                    }}
                  />
                </td>
                <td>
                  <TextCell
                    value={e.source ?? ''}
                    title={e.source ?? 'Sin fuente'}
                    onCommit={(source) => {
                      update('explosives', e.id, { source: source.trim() || undefined });
                    }}
                  />
                </td>
                <td>
                  <TextCell
                    value={e.version ?? ''}
                    onCommit={(version) => {
                      update('explosives', e.id, { version: version.trim() || undefined });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button onClick={() => void actions.exportCatalog()}>Exportar catálogo CSV</button>
          <button onClick={() => catalogInput.current?.click()}>Importar catálogo CSV…</button>
          <input
            ref={catalogInput}
            type="file"
            accept=".csv,.txt,text/csv"
            hidden
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              if (file) void actions.importCatalog(file);
              ev.target.value = '';
            }}
          />
        </div>
        <button
          onClick={() => {
            add('explosives', {
              id: newId<'Explosive'>(),
              name: 'Nuevo explosivo',
              family: 'other',
              form: 'bulk',
              density: 1000,
              vod: 4500,
              energy: 3.2e6,
              rws: 0.85,
              waterResistance: 'none',
            });
          }}
        >
          + Explosivo
        </button>
      </section>

      <section className="panel">
        <h2>Detonadores (en taladro)</h2>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th title="Retardo nominal [ms]">ms</th>
              <th title="Dispersión (1σ) [ms]">σ ms</th>
              <th>$</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {library.detonators.map((d) => (
              <tr key={d.id}>
                <td>
                  <TextCell
                    value={d.name}
                    onCommit={(name) => {
                      update('detonators', d.id, { name });
                    }}
                  />
                </td>
                <td>
                  <select
                    className="cell"
                    value={d.type}
                    onChange={(e) => {
                      update('detonators', d.id, { type: e.target.value as typeof d.type });
                    }}
                  >
                    <option value="nonel">Nonel</option>
                    <option value="electronic">Electrónico</option>
                    <option value="electric">Eléctrico</option>
                  </select>
                </td>
                <td>
                  <NumberCell
                    value={d.nominalDelay * 1000}
                    decimals={1}
                    min={0}
                    onCommit={(v) => {
                      update('detonators', d.id, { nominalDelay: v / 1000 });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={d.delayScatter * 1000}
                    decimals={2}
                    min={0}
                    onCommit={(v) => {
                      update('detonators', d.id, { delayScatter: v / 1000 });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={d.costPerUnit ?? 0}
                    decimals={2}
                    min={0}
                    onCommit={(v) => {
                      update('detonators', d.id, { costPerUnit: v });
                    }}
                  />
                </td>
                <td>
                  <RemoveButton
                    onClick={() => {
                      remove('detonators', d.id, d.name);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => {
            add('detonators', {
              id: newId<'Detonator'>(),
              name: 'Nonel fondo',
              type: 'nonel',
              nominalDelay: 0.5,
              delayScatter: 0.0075,
            });
          }}
        >
          + Detonador
        </button>
      </section>

      <section className="panel">
        <h2>Conectores de superficie</h2>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th title="Retardo [ms]">ms</th>
              <th title="Dispersión (1σ) [ms]">σ ms</th>
              <th>$</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {library.surfaceConnectors.map((c) => (
              <tr key={c.id}>
                <td>
                  <TextCell
                    value={c.name}
                    onCommit={(name) => {
                      update('surfaceConnectors', c.id, { name });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={c.delay * 1000}
                    decimals={1}
                    min={0}
                    onCommit={(v) => {
                      update('surfaceConnectors', c.id, { delay: v / 1000 });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={c.delayScatter * 1000}
                    decimals={2}
                    min={0}
                    onCommit={(v) => {
                      update('surfaceConnectors', c.id, { delayScatter: v / 1000 });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={c.costPerUnit ?? 0}
                    decimals={2}
                    min={0}
                    onCommit={(v) => {
                      update('surfaceConnectors', c.id, { costPerUnit: v });
                    }}
                  />
                </td>
                <td>
                  <RemoveButton
                    onClick={() => {
                      remove('surfaceConnectors', c.id, c.name);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => {
            add('surfaceConnectors', {
              id: newId<'SurfaceConnector'>(),
              name: 'Nonel superficie',
              type: 'nonel-surface',
              delay: 0.042,
              delayScatter: 0.0015,
            });
          }}
        >
          + Conector
        </button>
      </section>

      <section className="panel">
        <h2>Primas y tacos</h2>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Prima</th>
              <th title="Masa [g]">g</th>
              <th>$</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {library.primers.map((p) => (
              <tr key={p.id}>
                <td>
                  <TextCell
                    value={p.name}
                    onCommit={(name) => {
                      update('primers', p.id, { name });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={p.mass * 1000}
                    decimals={0}
                    min={1}
                    onCommit={(v) => {
                      update('primers', p.id, { mass: v / 1000 });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={p.costPerUnit ?? 0}
                    decimals={2}
                    min={0}
                    onCommit={(v) => {
                      update('primers', p.id, { costPerUnit: v });
                    }}
                  />
                </td>
                <td>
                  <RemoveButton
                    onClick={() => {
                      remove('primers', p.id, p.name);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => {
            add('primers', { id: newId<'Primer'>(), name: 'Booster', mass: 0.45 });
          }}
        >
          + Prima
        </button>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Material de taco</th>
              <th title="Densidad [g/cm³]">ρ</th>
              <th title="Costo por m³">$/m³</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {library.stemmingMaterials.map((m) => (
              <tr key={m.id}>
                <td>
                  <TextCell
                    value={m.name}
                    onCommit={(name) => {
                      update('stemmingMaterials', m.id, { name });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={m.density / 1000}
                    decimals={3}
                    min={0.01}
                    onCommit={(v) => {
                      update('stemmingMaterials', m.id, { density: v * 1000 });
                    }}
                  />
                </td>
                <td>
                  <NumberCell
                    value={m.costPerM3 ?? 0}
                    decimals={2}
                    min={0}
                    onCommit={(v) => {
                      update('stemmingMaterials', m.id, { costPerM3: v });
                    }}
                  />
                </td>
                <td>
                  <RemoveButton
                    onClick={() => {
                      remove('stemmingMaterials', m.id, m.name);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => {
            add('stemmingMaterials', {
              id: newId<'StemmingMaterial'>(),
              name: 'Taco',
              density: 1700,
            });
          }}
        >
          + Taco
        </button>
        <p className="hint">
          Valores por defecto: referencias genéricas. Reemplázalos por los de tus productos.
        </p>
      </section>
    </>
  );
}
