import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useLocale, useT } from '../i18n';
import { formatInputNumber } from '../i18n/numbers';
import { session } from '../session';
import { usePrefs } from '../stores/prefsStore';
import { liveCommit, startScrub } from './numberDrag';
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

/** Paso por defecto de ↑/↓, del deslizador y del arrastre. */
const defaultStep = (integer: boolean | undefined, decimals: number) =>
  integer || decimals === 0 ? 1 : 0.1;

/**
 * Campo numérico con etiqueta: acepta coma o punto, confirma con Enter o al salir, Escape revierte,
 * ↑/↓ cambian el valor y un valor fuera de rango explica el rango (cronos-entrada-numerica).
 * Además, arrastrar la etiqueta cambia el valor y, si se activó en Vista, un deslizador lo hace en
 * los campos con mínimo y máximo (útil para demostraciones; es opcional).
 */
export function NumberField(props: NumberFieldProps) {
  const locale = useLocale((s) => s.locale);
  const sliders = usePrefs((s) => s.numberSliders);
  const { value, decimals = 3, min, max, disabled } = props;
  // Remontar cuando cambia el valor externo (o el idioma) resetea el borrador.
  const key = value === null ? '' : `${locale}:${formatInputNumber(value, decimals, locale)}`;
  return (
    <>
      <NumberFieldInner key={key} {...props} decimals={decimals} />
      {/* Fuera del campo que se remonta: el deslizador no se corta a mitad del arrastre. */}
      {sliders && min !== undefined && max !== undefined && !disabled && value !== null && (
        <NumberSlider {...props} value={value} min={min} max={max} decimals={decimals} />
      )}
    </>
  );
}

/** Deslizador opcional bajo el campo: cambia el valor en vivo y todo el gesto es un solo deshacer. */
function NumberSlider({
  label,
  value,
  min,
  max,
  step,
  integer,
  decimals,
  onCommit,
}: NumberFieldProps & { value: number; min: number; max: number; decimals: number }) {
  // Mientras se arrastra se muestra el valor propio (el externo llega un cuadro después).
  const [live, setLive] = useState<number | null>(null);
  const gesture = useRef<{ end: () => void; push: (v: number) => void; flush: () => void } | null>(
    null,
  );
  const finish = () => {
    const g = gesture.current;
    if (!g) return;
    g.flush();
    g.end();
    gesture.current = null;
    setLive(null);
  };
  return (
    <input
      type="range"
      className="field-slider"
      aria-label={label}
      min={min}
      max={max}
      step={step ?? defaultStep(integer, decimals)}
      value={live ?? value}
      onPointerDown={() => {
        gesture.current = { end: session.document.beginGroup(), ...liveCommit(onCommit) };
      }}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (gesture.current) {
          setLive(v);
          gesture.current.push(v);
        } else onCommit(v); // teclado: cada flecha es un paso
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onBlur={finish}
    />
  );
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
      {/* Arrastrar la etiqueta a izquierda o derecha cambia el valor (Mayús ×10, Alt ÷10). */}
      <span
        className={disabled || value === null ? 'field-label' : 'field-label scrub'}
        onPointerDown={(e) => {
          if (disabled || value === null) return;
          startScrub(
            e,
            {
              start: value,
              decimals,
              step: step ?? defaultStep(integer, decimals),
              min,
              max,
              integer,
            },
            onCommit,
          );
        }}
      >
        {label}
      </span>
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
