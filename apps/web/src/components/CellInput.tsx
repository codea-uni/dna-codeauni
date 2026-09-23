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
}: NumberCellProps) {
  const text = String(Number(value.toFixed(decimals)));
  const [draft, setDraft] = useState(text);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    const n = Number(draft.trim().replace(',', '.'));
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
