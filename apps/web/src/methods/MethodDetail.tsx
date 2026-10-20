import { Sigma, X } from 'lucide-react';
import { Suspense, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { methodModel, type MethodId } from '@cronos/core';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { lazyWithRetry } from '../components/lazyRetry';
import { useLocale, useT } from '../i18n';
import type { MethodValues } from './MethodDetailBody';
import './methodDetail.css';

// KaTeX y el cuerpo del detalle se descargan solo al abrirlo (no pesan en la carga inicial).
const MethodDetailBody = lazyWithRetry(() => import('./MethodDetailBody'));

export type { MethodValues };

/** Opción de un selector de metodología: valor guardado y modelo del catálogo. */
export interface MethodOption {
  value: string;
  model: MethodId;
}

export interface MethodChoice {
  label: string;
  value: string;
  options: readonly MethodOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Barra «Modelo: … [Detalle]» de un cálculo. Con `choice`, el modelo se elige en un selector (la
 * metodología se guarda donde la guarde quien llama). «Detalle» despliega debajo, dentro de la
 * misma ventana, el modelo con su fórmula, los valores que usa ahora este cálculo, la confianza,
 * los supuestos y las reglas (`docs/RULES.md`).
 */
export function MethodDetail({
  id,
  values,
  choice,
  note,
}: {
  /** Modelo mostrado (con `choice`, el de la opción elegida). */
  id: MethodId;
  values?: MethodValues | undefined;
  choice?: MethodChoice | undefined;
  /** Texto extra al pie del detalle (p. ej. el contexto del valor de ejemplo). */
  note?: ReactNode;
}) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const selectId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const model = methodModel(id);
  const name = model.name[locale];
  useEffect(() => {
    if (!open) return;
    // La barra (selector y botón) queda a la vista junto con el comienzo del detalle.
    button.current?.closest('.method-detail')?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <div className={`method-detail${open ? ' open' : ''}`}>
      <div className="method-detail-bar">
        {choice ? (
          <label className="method-detail-choice" htmlFor={selectId}>
            <span className="method-detail-label">{choice.label}</span>
            <select
              id={selectId}
              value={choice.value}
              disabled={choice.disabled}
              onChange={(e) => {
                choice.onChange(e.target.value);
              }}
            >
              {choice.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {methodModel(o.model).name[locale]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="method-detail-name">
            <span className="method-detail-label">{t('md.model')}</span> {name}
          </span>
        )}
        <button
          ref={button}
          type="button"
          className={`method-detail-btn${open ? ' active' : ''}`}
          aria-expanded={open}
          aria-controls={panelId}
          title={t('md.detailOf', { name })}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <Sigma size={14} aria-hidden="true" />
          {t('md.detail')}
        </button>
      </div>
      {open && (
        <div
          id={panelId}
          className="method-detail-panel"
          role="region"
          aria-label={t('md.detailOf', { name })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        >
          <button
            type="button"
            className="icon method-detail-close"
            aria-label={t('md.close')}
            title={t('md.close')}
            onClick={close}
          >
            <X size={14} aria-hidden="true" />
          </button>
          <ErrorBoundary>
            <Suspense
              fallback={
                <p className="hint" role="status">
                  {t('md.loading')}
                </p>
              }
            >
              <MethodDetailBody
                id={id}
                {...(values ? { values } : {})}
                {...(choice ? { alternatives: choice.options.map((o) => o.model) } : {})}
              />
            </Suspense>
          </ErrorBoundary>
          {note && <p className="hint method-detail-note">{note}</p>}
        </div>
      )}
    </div>
  );
}
