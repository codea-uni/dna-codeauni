import {
  commands,
  deckIntervals,
  detonationPressure,
  holeArea,
  holeCharge,
  indexLibrary,
  newId,
  scaledDepthOfBurial,
  vodAtDiameter,
  type Deck,
  type Hole,
  type InHoleInitiator,
  type ProductLibrary,
} from '@cronos/core';
import { NumberCell } from '../components/CellInput';
import { session } from '../session';
import { useUnits } from '../hooks/useUnits';

const KIND_LABEL: Record<Deck['kind'], string> = {
  explosive: 'Explosivo',
  stemming: 'Taco',
  air: 'Aire',
  water: 'Agua',
  plug: 'Tapón',
};

const KIND_COLOR: Record<Deck['kind'], string> = {
  explosive: '#ff7b39',
  stemming: '#b8a07a',
  air: '#9fd3ff',
  water: '#2f81f7',
  plug: '#8b949e',
};

function deckName(deck: Deck, lib: ProductLibrary): string {
  if (deck.kind === 'explosive')
    return lib.explosives.find((e) => e.id === deck.explosiveId)?.name ?? '¿explosivo?';
  if (deck.kind === 'stemming')
    return lib.stemmingMaterials.find((m) => m.id === deck.materialId)?.name ?? 'Taco';
  return KIND_LABEL[deck.kind];
}

/** Diagrama de columna del taladro (boca arriba, fondo abajo) con cotas y kg por deck. */
function ColumnDiagram({
  hole,
  lib,
  masses,
}: {
  hole: Hole;
  lib: ProductLibrary;
  masses: number[];
}) {
  const { len } = useUnits();
  const H = 300;
  const top = 12;
  const scale = (H - top * 2) / Math.max(hole.length, 0.1);
  const y = (depth: number) => top + depth * scale;
  const intervals = deckIntervals(hole);
  return (
    <svg className="column" viewBox={`0 0 260 ${H}`} role="img" aria-label="Columna de carga">
      <rect
        x={70}
        y={y(0)}
        width={34}
        height={hole.length * scale}
        fill="#0d1117"
        stroke="#30363d"
      />
      {intervals.map(({ deck, top: t, bottom: b }, i) => (
        <g key={deck.id}>
          <rect
            x={70}
            y={y(Math.max(0, t))}
            width={34}
            height={Math.max(0, (b - Math.max(0, t)) * scale)}
            fill={KIND_COLOR[deck.kind]}
            opacity={0.9}
          />
          <text x={112} y={y((Math.max(0, t) + b) / 2) + 4} className="col-label">
            {deckName(deck, lib)} · {len.show(deck.length).toFixed(2)} {len.unit}
            {(masses[i] ?? 0) > 0 ? ` · ${(masses[i] ?? 0).toFixed(1)} kg` : ''}
          </text>
          <text x={62} y={y(Math.max(0, t)) + 4} className="col-depth" textAnchor="end">
            {len.show(Math.max(0, t)).toFixed(1)}
          </text>
        </g>
      ))}
      <text x={62} y={y(hole.length) + 4} className="col-depth" textAnchor="end">
        {len.show(hole.length).toFixed(1)} {len.unit}
      </text>
      {hole.initiators.map((init) => (
        <g key={init.id}>
          <circle cx={87} cy={y(init.depth)} r={5} fill="#fff" stroke="#000" />
          <text x={112} y={y(init.depth) + 14} className="col-label muted">
            {lib.detonators.find((d) => d.id === init.detonatorId)?.name ?? 'Detonador'} ·{' '}
            {(init.delay * 1000).toFixed(0)} ms
            {init.primerId
              ? ` · ${lib.primers.find((p) => p.id === init.primerId)?.name ?? ''}`
              : ''}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Editor de la columna de carga de un taladro. */
export function DeckEditor({ hole }: { hole: Hole }) {
  const { len, dia } = useUnits();
  const lib = session.document.project.library;
  const index = indexLibrary(lib);
  const charge = holeCharge(hole, index);
  // Cálculos de un solo taladro (permitidos en el hilo principal, CLAUDE.md regla 2).
  const sdob = scaledDepthOfBurial(hole, index);
  const topDeck = sdob ? hole.decks[sdob.deckIndex] : undefined;
  const topProduct =
    topDeck?.kind === 'explosive' ? index.explosives.get(topDeck.explosiveId) : undefined;
  const gamma = session.document.project.blasts[0]?.calcParams.detonationGamma ?? 3;
  const pressure = (() => {
    if (topDeck?.kind !== 'explosive' || !topProduct) return null;
    const mass = charge.deckMasses[sdob?.deckIndex ?? -1] ?? 0;
    const density = mass / (holeArea(topDeck.effectiveDiameter ?? hole.diameter) * topDeck.length);
    const d = topDeck.effectiveDiameter ?? hole.diameter;
    const vod =
      topProduct.criticalDiameter === undefined
        ? topProduct.vod
        : vodAtDiameter(topProduct.vod, topProduct.criticalDiameter, d);
    return { density, vod, pd: detonationPressure(density, vod, gamma) };
  })();
  const setDecks = (decks: Deck[], label: string) => {
    session.document.dispatch(commands.setHoleDecks(session.document, hole.id, decks), label);
  };
  const replace = (index: number, deck: Deck) => {
    setDecks(
      hole.decks.map((d, i) => (i === index ? deck : d)),
      'Editar deck',
    );
  };
  const changeKind = (index: number, kind: Deck['kind']) => {
    const old = hole.decks[index];
    if (!old) return;
    const base = { id: old.id, length: old.length };
    const firstExplosive = lib.explosives[0];
    const firstStemming = lib.stemmingMaterials[0];
    let deck: Deck;
    if (kind === 'explosive' && firstExplosive)
      deck = { ...base, kind, explosiveId: firstExplosive.id };
    else if (kind === 'stemming' && firstStemming)
      deck = { ...base, kind, materialId: firstStemming.id };
    else if (kind === 'air' || kind === 'water' || kind === 'plug') deck = { ...base, kind };
    else return;
    replace(index, deck);
  };
  const addDeck = () => {
    const free = Math.max(0, hole.length - hole.decks.reduce((s, d) => s + d.length, 0));
    setDecks(
      [
        ...hole.decks,
        { id: newId<'Deck'>(), kind: 'air', length: Math.max(0.5, Number(free.toFixed(2))) },
      ],
      'Agregar deck',
    );
  };
  // Se muestra de boca (arriba) a fondo, como en el diagrama.
  const rows = hole.decks.map((deck, index) => ({ deck, index })).reverse();

  return (
    <section className="panel">
      <h2>Columna de carga</h2>
      <p className="muted">
        {(charge.explosive + charge.primers).toFixed(1)} kg · carga{' '}
        {len.show(charge.chargeLength).toFixed(2)} {len.unit} · taco{' '}
        {len.show(charge.stemmingLength).toFixed(2)} {len.unit}
        {charge.emptyLength > 0.005 && (
          <span className="warn">
            {' '}
            · {len.show(charge.emptyLength).toFixed(2)} {len.unit} sin asignar
          </span>
        )}
      </p>
      {sdob && (
        <p
          className="muted"
          title="Profundidad escalada de enterramiento (Chiappetta, P-01): carga superior, primeros 10·Ø; D solo con material confinante, sin aire (P-14)"
        >
          SDOB {sdob.sdob.toFixed(2)} m/kg^⅓ (D {len.show(sdob.depth).toFixed(2)} {len.unit}, W{' '}
          {sdob.mass.toFixed(1)} kg)
          {Math.abs(sdob.sdobFromCollar - sdob.sdob) > 0.005 &&
            ` · desde el collar ${sdob.sdobFromCollar.toFixed(2)} (informativa: el aire no confina)`}
          {pressure &&
            ` · ρ en taladro ${(pressure.density / 1000).toFixed(3)} g/cc · PD ${(pressure.pd / 1e9).toFixed(2)} GPa · PB ${(pressure.pd / 2e9).toFixed(2)} GPa`}
        </p>
      )}
      {hole.decks.length > 0 && <ColumnDiagram hole={hole} lib={lib} masses={charge.deckMasses} />}
      <table className="grid-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Producto</th>
            <th title={`Largo [${len.unit}]`}>{len.unit}</th>
            <th
              title={`Esponjamiento al gasificar [${len.unit}] (la carga se coloca en largo − esponjamiento)`}
            >
              Esp.
            </th>
            <th title={`Diámetro efectivo de la carga [${dia.unit}] (cartuchos aplastados)`}>
              Ø ef.
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ deck, index }) => (
            <tr key={deck.id}>
              <td>
                <select
                  className="cell"
                  value={deck.kind}
                  onChange={(e) => {
                    changeKind(index, e.target.value as Deck['kind']);
                  }}
                >
                  {Object.entries(KIND_LABEL)
                    // RM-01: el agua no se ofrece como taco en superficie (solo se conserva si ya estaba).
                    .filter(([k]) => k !== 'water' || deck.kind === 'water')
                    .map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                </select>
              </td>
              <td>
                {deck.kind === 'explosive' ? (
                  <select
                    className="cell"
                    value={deck.explosiveId}
                    onChange={(e) => {
                      replace(index, {
                        ...deck,
                        explosiveId: e.target.value as typeof deck.explosiveId,
                      });
                    }}
                  >
                    {lib.explosives.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                ) : deck.kind === 'stemming' ? (
                  <select
                    className="cell"
                    value={deck.materialId}
                    onChange={(e) => {
                      replace(index, {
                        ...deck,
                        materialId: e.target.value as typeof deck.materialId,
                      });
                    }}
                  >
                    {lib.stemmingMaterials.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <NumberCell
                  value={len.show(deck.length)}
                  decimals={2}
                  min={0}
                  onCommit={(v) => {
                    replace(index, { ...deck, length: len.parse(v) });
                  }}
                />
              </td>
              <td>
                {deck.kind === 'explosive' ? (
                  <NumberCell
                    value={len.show(deck.swell ?? 0)}
                    decimals={2}
                    min={0}
                    onCommit={(v) => {
                      const next: typeof deck = { ...deck };
                      if (v > 0) next.swell = len.parse(v);
                      else delete next.swell;
                      replace(index, next);
                    }}
                  />
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                {deck.kind === 'explosive' ? (
                  <NumberCell
                    value={
                      deck.effectiveDiameter === undefined ? 0 : dia.show(deck.effectiveDiameter)
                    }
                    decimals={dia.unit === 'in' ? 2 : 1}
                    min={0}
                    onCommit={(v) => {
                      const next: typeof deck = { ...deck };
                      if (v > 0) next.effectiveDiameter = dia.parse(v);
                      else delete next.effectiveDiameter;
                      replace(index, next);
                    }}
                  />
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <button
                  className="icon danger"
                  title="Quitar deck"
                  onClick={() => {
                    setDecks(
                      hole.decks.filter((_, i) => i !== index),
                      'Quitar deck',
                    );
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addDeck}>+ Deck (sobre el último)</button>
      <p className="hint">
        Los decks se apilan desde el fondo; el primero de la tabla es el más cercano a la boca.
      </p>
      <InitiatorEditor hole={hole} />
    </section>
  );
}

/**
 * Cadena de iniciación del taladro (H-403, RM-05): detonadores y boosters con su posición desde la
 * boca. Puede haber varios (decks con booster propio, doble primado).
 */
function InitiatorEditor({ hole }: { hole: Hole }) {
  const { len } = useUnits();
  const lib = session.document.project.library;
  const blast = session.document.project.blasts.find((b) => b.holes.some((h) => h.id === hole.id));
  const setInitiators = (initiators: InHoleInitiator[], label: string) => {
    if (!blast) return;
    session.document.dispatch(
      { type: 'holes/replace', blastId: blast.id, holes: [{ ...hole, initiators }] },
      label,
    );
  };
  const replace = (i: number, init: InHoleInitiator) => {
    setInitiators(
      hole.initiators.map((x, k) => (k === i ? init : x)),
      'Editar iniciador',
    );
  };
  const add = () => {
    const det = lib.detonators[0];
    if (!det) return;
    const init: InHoleInitiator = {
      id: newId<'InHoleInitiator'>(),
      detonatorId: det.id,
      depth: Math.max(0, hole.length - 0.5),
      delay: det.nominalDelay,
    };
    const primer = lib.primers[0];
    if (primer) init.primerId = primer.id;
    setInitiators([...hole.initiators, init], 'Agregar iniciador');
  };
  return (
    <>
      <h3>Iniciación (detonador → booster)</h3>
      <table className="grid-table">
        <thead>
          <tr>
            <th title={`Profundidad desde la boca [${len.unit}]`}>Prof.</th>
            <th>Detonador</th>
            <th>Booster</th>
            <th title="Retardo de fondo [ms]">ms</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {hole.initiators.map((init, i) => (
            <tr key={init.id}>
              <td>
                <NumberCell
                  value={len.show(init.depth)}
                  decimals={2}
                  min={0}
                  onCommit={(v) => {
                    replace(i, { ...init, depth: Math.min(hole.length, len.parse(v)) });
                  }}
                />
              </td>
              <td>
                <select
                  className="cell"
                  value={init.detonatorId}
                  onChange={(e) => {
                    replace(i, { ...init, detonatorId: e.target.value as typeof init.detonatorId });
                  }}
                >
                  {lib.detonators.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  className="cell"
                  value={init.primerId ?? ''}
                  onChange={(e) => {
                    const next = { ...init };
                    if (e.target.value)
                      next.primerId = e.target.value as NonNullable<InHoleInitiator['primerId']>;
                    else delete next.primerId;
                    replace(i, next);
                  }}
                >
                  <option value="">Sin booster</option>
                  {lib.primers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <NumberCell
                  value={init.delay * 1000}
                  decimals={1}
                  min={0}
                  onCommit={(v) => {
                    replace(i, { ...init, delay: v / 1000 });
                  }}
                />
              </td>
              <td>
                <button
                  className="icon danger"
                  title="Quitar iniciador"
                  onClick={() => {
                    setInitiators(
                      hole.initiators.filter((_, k) => k !== i),
                      'Quitar iniciador',
                    );
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={add}>+ Iniciador</button>
    </>
  );
}
