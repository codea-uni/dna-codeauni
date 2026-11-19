import { useId, type KeyboardEvent } from 'react';
import { useLocale, useT } from '../i18n';
import { formatInputNumber } from '../i18n/numbers';
import { useNumberInput } from './useNumberInput';

export interface NumberFieldProps {
  label: string;
  /** Valor en unidades de presentación; null = valores mixtos en una selección múltiple. */
  value: number | null;
  onCommit: (value: number) => void;
  unit?: string;
  decimals?: number;
  min?: number;
  max?: number;
  /** Paso de ↑/↓ (por defecto 1 o 0,1 según los decimales). */
  step?: number;
  disabled?: boolean;
  integer?: boolean;
  /** Lectura propia del texto (p. ej. pies con «'»); devuelve el valor en unidades de presentación. */
  parseText?: (text: string) => number | null;
}

/**
 * Campo numérico con etiqueta: acepta coma o punto, confirma con Enter o al salir, Escape revierte,
 * ↑/↓ cambian el valor y un valor fuera de rango explica el rango (cronos-entrada-numerica).
 */
export function NumberField(props: NumberFieldProps) {
  const locale = useLocale((s) => s.locale);
  const { value, decimals = 3 } = props;
  // Remontar cuando cambia el valor externo (o el idioma) resetea el borrador.
  const key = value === null ? '' : `${locale}:${formatInputNumber(value, decimals, locale)}`;
  return <NumberFieldInner key={key} {...props} decimals={decimals} />;
}

function NumberFieldInner({
  label,
  value,
  onCommit,
  unit,
  decimals = 3,
  min,
  max,
  step,
  disabled,
  integer,
  parseText,
}: NumberFieldProps) {
  const tr = useT();
  const errorId = useId();
  const { draft, setDraft, error, dirty, commit, revert, stepKey } = useNumberInput(
    value,
    onCommit,
    {
      decimals,
      min,
      max,
      integer,
      step,
      unit,
      parseText,
    },
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (stepKey(e)) return;
    if (e.key === 'Enter') {
      // Confirma sin soltar el foco: se ve el resultado y se puede seguir ajustando o pasar con Tab.
      const input = e.currentTarget;
      if (commit())
        requestAnimationFrame(() => {
          input.select();
        });
    } else if (e.key === 'Escape' && dirty) {
      // Solo revierte; un segundo Esc (sin borrador) cierra la ventana.
      e.preventDefault();
      revert();
    }
  };

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          placeholder={value === null ? tr('common.multiple') : ''}
          disabled={disabled}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          title={tr('common.number.hint')}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onBlur={() => {
            commit();
          }}
          onKeyDown={onKeyDown}
        />
        {unit && <span className="field-unit">{unit}</span>}
      </span>
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
