import { useId, useState, type KeyboardEvent } from 'react';
import { useLocale } from '../i18n';
import { useNumberInput } from './useNumberInput';

interface BaseProps {
  title?: string;
  /** Nombre accesible de la celda («Burden, taladro 12»); si falta, se usa `title`. */
  label?: string;
  className?: string;
}

interface NumberCellProps extends BaseProps {
  value: number;
  onCommit: (value: number) => void;
  decimals?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  /** Paso de ↑/↓ (por defecto 1 o 0,1 según los decimales). */
  step?: number;
  unit?: string;
  /** Texto en gris cuando el valor es 0 (p. ej. «∞» = sin límite): la celda queda vacía y vacío es 0. */
  zeroText?: string;
}

/**
 * Pasa el foco a la celda de la misma columna en la fila siguiente (o anterior), como en una hoja
 * de cálculo. Devuelve false si no hay otra fila.
 */
function focusSibling(input: HTMLInputElement, up: boolean): boolean {
  const td = input.closest('td');
  const row = td?.parentElement;
  if (!td || !row) return false;
  const col = Array.prototype.indexOf.call(row.children, td);
  const next = (up ? row.previousElementSibling : row.nextElementSibling)?.children[col];
  const target = next?.querySelector<HTMLInputElement>('input.cell');
  if (!target) return false;
  target.focus();
  target.select();
  return true;
}

/**
 * Celda numérica compacta para tablas: acepta coma o punto, Enter confirma y baja (Mayús+Enter
 * sube), Escape revierte, ↑/↓ cambian el valor; el error con el rango va en el tooltip.
 */
export function NumberCell(props: NumberCellProps) {
  return <NumberInput {...props} className={`cell ${props.className ?? ''}`} />;
}

/**
 * Entrada numérica sin etiqueta propia (para filas `.field` ya armadas o barras de herramientas):
 * mismo comportamiento que `NumberCell`, con la clase que se le pase.
 */
export function NumberInput(props: NumberCellProps) {
  const locale = useLocale((s) => s.locale);
  return <NumberInputInner key={`${locale}:${props.value}`} {...props} />;
}

function NumberInputInner({
  value,
  onCommit,
  decimals = 3,
  min,
  max,
  integer,
  step,
  unit,
  title,
  label,
  className,
  zeroText,
}: NumberCellProps) {
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
      zeroText,
    },
  );
  return (
    <>
      <input
        className={className}
        inputMode="decimal"
        autoComplete="off"
        title={error ?? title}
        aria-label={label ?? title}
        value={draft}
        placeholder={zeroText}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={() => {
          commit();
        }}
        onFocus={(e) => {
          e.currentTarget.select();
        }}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (stepKey(e)) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            const input = e.currentTarget;
            // Sin fila siguiente, el foco se queda en la celda (no se pierde el lugar).
            if (commit() && !focusSibling(input, e.shiftKey)) input.select();
          }
          if (e.key === 'Escape' && dirty) {
            e.preventDefault();
            revert();
          }
        }}
      />
      {error && (
        <span id={errorId} className="visually-hidden">
          {error}
        </span>
      )}
    </>
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
