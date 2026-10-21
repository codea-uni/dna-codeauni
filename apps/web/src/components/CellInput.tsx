import { useState, type KeyboardEvent } from 'react';

interface BaseProps {
  title?: string;
  className?: string;
}

interface NumberCellProps extends BaseProps {
  value: number;
  onCommit: (value: number) => void;
  decimals?: number;
  min?: number;
  /** Texto en gris cuando el valor es 0 (p. ej. «∞» = sin límite): la celda queda vacía y vacío es 0. */
  zeroText?: string;
}

/** Celda numérica compacta para tablas: confirma con Enter o al salir; Escape revierte. */
export function NumberCell(props: NumberCellProps) {
  return <NumberCellInner key={props.value} {...props} />;
}

function NumberCellInner({
  value,
  onCommit,
  decimals = 3,
  min,
  title,
  className,
  zeroText,
}: NumberCellProps) {
  const text = value === 0 && zeroText !== undefined ? '' : String(Number(value.toFixed(decimals)));
  const [draft, setDraft] = useState(text);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    const raw = draft.trim();
    const n =
      zeroText !== undefined && (raw === '' || raw === '∞' || raw === zeroText)
        ? 0
        : Number(raw.replace(',', '.'));
    if (draft.trim() === text) return;
    if (!Number.isFinite(n) || (min !== undefined && n < min)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(n);
  };
  return (
    <input
      className={`cell ${className ?? ''}`}
      inputMode="decimal"
      title={title}
      value={draft}
      placeholder={zeroText}
      aria-invalid={invalid}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(text);
          setInvalid(false);
        }
      }}
    />
  );
}

interface TextCellProps extends BaseProps {
  value: string;
  onCommit: (value: string) => void;
}

export function TextCell(props: TextCellProps) {
  return <TextCellInner key={props.value} {...props} />;
}

function TextCellInner({ value, onCommit, title, className }: TextCellProps) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className={`cell ${className ?? ''}`}
      title={title}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={() => {
        const v = draft.trim();
        if (v && v !== value) onCommit(v);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
