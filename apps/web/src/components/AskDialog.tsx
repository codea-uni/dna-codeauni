import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useT } from '../i18n';

/** Opción de un aviso: `primary` es la recomendada (destacada), `danger` la que borra o reemplaza. */
export interface AskChoice {
  id: string;
  label: string;
  kind?: 'primary' | 'danger';
}

export interface AskRequest {
  title: string;
  /** Qué pasa y qué hacer, en frases cortas (un párrafo por línea). */
  text: string;
  choices: AskChoice[];
}

interface Pending extends AskRequest {
  resolve: (id: string | null) => void;
}

const useAsk = create<{ pending: Pending | null }>(() => ({ pending: null }));

/**
 * Pregunta dentro de la app (en lugar de `window.confirm`): resuelve con el `id` elegido, o `null`
 * si se cierra (Esc, ×, clic fuera). Una pregunta nueva cancela la anterior.
 */
export function ask(request: AskRequest): Promise<string | null> {
  useAsk.getState().pending?.resolve(null);
  return new Promise((resolve) => {
    useAsk.setState({
      pending: {
        ...request,
        resolve: (id) => {
          useAsk.setState({ pending: null });
          resolve(id);
        },
      },
    });
  });
}

/** Aviso montado una vez en el editor. */
export function AskDialog() {
  const t = useT();
  const pending = useAsk((s) => s.pending);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pending) return;
    // El foco va al aviso, no a un botón: el Enter que confirmó un campo no debe elegir una opción.
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        pending.resolve(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [pending]);
  if (!pending) return null;
  const close = () => {
    pending.resolve(null);
  };
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={pending.title}
      onClick={close}
    >
      <div
        ref={box}
        tabIndex={-1}
        className="modal ask-dialog"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>{pending.title}</h2>
          <button className="icon" onClick={close} aria-label={t('settings.close')}>
            <X size={16} />
          </button>
        </header>
        {pending.text.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        <footer>
          {pending.choices.map((c) => (
            <button
              key={c.id}
              className={
                c.kind === 'primary' ? 'primary-inline' : c.kind === 'danger' ? 'danger' : ''
              }
              onClick={() => {
                pending.resolve(c.id);
              }}
            >
              {c.label}
            </button>
          ))}
        </footer>
      </div>
    </div>
  );
}
