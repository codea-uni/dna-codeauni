import { X } from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../i18n';
import { chooseCardOption, closeAllCards, closeCard, useCardStore, type AgentCard } from './cards';

/**
 * Tarjetas de reporte del asistente sobre el mapa (como las de FleetView): entran con un rebote a
 * la derecha, la nueva primero; se arrastran desde la cabecera y quedan donde se dejan; × cierra.
 */
export function AgentCards() {
  const t = useT();
  const cards = useCardStore((s) => s.cards);
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  if (cards.length === 0) return null;
  const docked = cards.filter((c) => !moved[c.id]);
  return (
    <>
      <div className="agent-cards">
        {docked.map((c) => (
          <CardView
            key={c.id}
            card={c}
            onMove={(x, y) => {
              setMoved((m) => ({ ...m, [c.id]: { x, y } }));
            }}
          />
        ))}
        {cards.length > 1 && (
          <button type="button" className="agent-cards-clear" onClick={closeAllCards}>
            {t('card.closeAll')}
          </button>
        )}
      </div>
      {cards
        .filter((c) => moved[c.id])
        .map((c) => {
          const at = moved[c.id] ?? { x: 0, y: 0 };
          return (
            <CardView
              key={c.id}
              card={c}
              floating={at}
              onMove={(x, y) => {
                setMoved((m) => ({ ...m, [c.id]: { x, y } }));
              }}
            />
          );
        })}
    </>
  );
}

function CardView({
  card,
  floating,
  onMove,
}: {
  card: AgentCard;
  floating?: { x: number; y: number };
  onMove: (x: number, y: number) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const down = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = ref.current;
    const host = el?.offsetParent;
    if (!el || !host) return;
    const box = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    const host = ref.current?.closest('.viewport-host');
    if (!d || !host) return;
    const h = host.getBoundingClientRect();
    const w = ref.current?.offsetWidth ?? 300;
    onMove(
      Math.min(Math.max(0, e.clientX - h.left - d.dx), h.width - w),
      Math.min(Math.max(0, e.clientY - h.top - d.dy), h.height - 60),
    );
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <section
      ref={ref}
      className={`agent-card${floating ? ' floating' : ''}`}
      style={floating ? { left: floating.x, top: floating.y } : undefined}
    >
      <header
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        title={t('card.drag')}
      >
        <span className="agent-card-grip" aria-hidden />
        <div>
          <small>{t('card.live')}</small>
          <h3>{card.title}</h3>
          {card.sub && <p>{card.sub}</p>}
        </div>
        <button
          type="button"
          aria-label={t('card.close')}
          onClick={() => {
            closeCard(card.id);
          }}
        >
          <X size={16} />
        </button>
      </header>
      {card.detailRows && (
        <div className="agent-card-detail">
          {card.detailRows
            .flatMap((line) => ('label' in line ? [line] : [...line]))
            .map((row, i) => (
              <div key={i}>
                {row.label && (
                  <p>
                    {row.swatch && (
                      <span style={{ color: row.swatch }} aria-hidden>
                        ●{' '}
                      </span>
                    )}
                    {row.label}
                  </p>
                )}
                {row.bar && (
                  <div className="agent-card-column" aria-label="Columna de carga de boca a fondo">
                    {row.bar.map((part, j) => (
                      <span key={j} style={{ flex: part.fraction, background: part.color }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
      {card.metrics.length > 0 && (
        <dl>
          {card.metrics.map((m) => (
            <div key={m.label} className={m.tone ? `tone-${m.tone}` : undefined}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.bars.map((b) => (
        <div key={b.label} className={`agent-card-bar tone-${b.tone}`}>
          <div className="agent-card-bar-text">
            <span>{b.label}</span>
            <strong>{b.text}</strong>
          </div>
          <div className="agent-card-track">
            <i style={{ width: `${Math.min(100, b.fill * 100)}%` }} />
            {b.limit !== undefined && (
              <b style={{ left: `${Math.min(100, b.limit * 100)}%` }} aria-hidden />
            )}
          </div>
        </div>
      ))}
      {card.notes.length > 0 && (
        <ul>
          {card.notes.slice(0, 3).map((note) => (
            <li key={note.text} className={`tone-${note.tone}`}>
              {note.text}
            </li>
          ))}
        </ul>
      )}
      {card.choices && card.choices.length > 0 && (
        <div className="agent-card-choices">
          {card.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                chooseCardOption(card.id, c.id);
              }}
            >
              <strong>{c.label}</strong>
              {c.hint && <span>{c.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
