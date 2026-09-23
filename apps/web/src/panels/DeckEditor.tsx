import {
  commands,
  deckIntervals,
  holeCharge,
  indexLibrary,
  newId,
  type Deck,
  type Hole,
  type ProductLibrary,
} from '@blastlab/core';
import { NumberCell } from '../components/CellInput';
import { session } from '../session';

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
            {deckName(deck, lib)} · {deck.length.toFixed(2)} m
            {(masses[i] ?? 0) > 0 ? ` · ${(masses[i] ?? 0).toFixed(1)} kg` : ''}
          </text>
          <text x={62} y={y(Math.max(0, t)) + 4} className="col-depth" textAnchor="end">
            {Math.max(0, t).toFixed(1)}
          </text>
        </g>
      ))}
      <text x={62} y={y(hole.length) + 4} className="col-depth" textAnchor="end">
        {hole.length.toFixed(1)} m
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
  const lib = session.document.project.library;
  const charge = holeCharge(hole, indexLibrary(lib));
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
        {(charge.explosive + charge.primers).toFixed(1)} kg · carga {charge.chargeLength.toFixed(2)}{' '}
        m · taco {charge.stemmingLength.toFixed(2)} m
        {charge.emptyLength > 0.005 && (
          <span className="warn"> · {charge.emptyLength.toFixed(2)} m sin asignar</span>
        )}
      </p>
      {hole.decks.length > 0 && <ColumnDiagram hole={hole} lib={lib} masses={charge.deckMasses} />}
      <table className="grid-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Producto</th>
            <th title="Largo [m]">m</th>
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
                  {Object.entries(KIND_LABEL).map(([k, label]) => (
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
                  value={deck.length}
                  decimals={2}
                  min={0}
                  onCommit={(v) => {
                    replace(index, { ...deck, length: v });
                  }}
                />
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
    </section>
  );
}
