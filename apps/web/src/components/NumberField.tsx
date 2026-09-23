import { useState, type KeyboardEvent } from 'react';

export interface NumberFieldProps {
  label: string;
  /** Valor en unidades de presentación; null = valores mixtos en una selección múltiple. */
  value: number | null;
  onCommit: (value: number) => void;
  unit?: string;
  decimals?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  integer?: boolean;
}

function format(value: number | null, decimals: number): string {
  return value === null ? '' : String(Number(value.toFixed(decimals)));
}

/** Campo numérico que confirma con Enter o al salir; Escape revierte. Acepta coma decimal. */
export function NumberField(props: NumberFieldProps) {
  const { value, decimals = 3 } = props;
  // Remontar cuando cambia el valor externo resetea el borrador.
  return <NumberFieldInner key={format(value, decimals)} {...props} decimals={decimals} />;
}

function NumberFieldInner({
  label,
  value,
  onCommit,
  unit,
  decimals = 3,
  min,
  max,
  disabled,
  integer,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(format(value, decimals));
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    const text = draft.trim().replace(',', '.');
    if (text === '' || text === format(value, decimals)) {
      setDraft(format(value, decimals));
      setInvalid(false);
      return;
    }
    const n = Number(text);
    const ok =
      Number.isFinite(n) &&
      (min === undefined || n >= min) &&
      (max === undefined || n <= max) &&
      (!integer || Number.isInteger(n));
    if (!ok) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(n);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(format(value, decimals));
      setInvalid(false);
      e.currentTarget.blur();
    }
  };

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          placeholder={value === null ? 'varios' : ''}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        {unit && <span className="field-unit">{unit}</span>}
      </span>
    </label>
  );
}
