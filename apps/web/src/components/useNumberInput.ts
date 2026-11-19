import { useState, type KeyboardEvent } from 'react';
import { useFormat, useLocale, useT } from '../i18n';
import { formatInputNumber, parseUserNumber } from '../i18n/numbers';

export interface NumberRules {
  /** Decimales que se muestran (solo presentación: el valor guardado no se redondea). */
  decimals: number;
  min?: number | undefined;
  max?: number | undefined;
  integer?: boolean | undefined;
  /** Paso de ↑/↓; por defecto 1 si es entero o sin decimales, si no 0,1. */
  step?: number | undefined;
  /** Unidad del campo: se acepta escrita al final («7,25 m»). */
  unit?: string | undefined;
  /**
   * Lectura propia del texto (p. ej. pies con «'»), en unidades de presentación. Si devuelve null se
   * intenta la lectura normal con coma o punto.
   */
  parseText?: ((text: string) => number | null) | undefined;
  /**
   * Texto del valor 0 cuando significa otra cosa (p. ej. «∞» = sin límite): con 0 el campo queda
   * vacío con este texto de ayuda, y vacío, «∞» o este texto confirman 0.
   */
  zeroText?: string | undefined;
}

const clamp = (v: number, min?: number, max?: number) =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

/**
 * Borrador de un campo numérico: lee coma o punto (cronos-entrada-numerica), confirma solo si el
 * texto cambió, da un mensaje con el rango si no es válido y cambia el valor con ↑/↓.
 */
export function useNumberInput(
  value: number | null,
  onCommit: (value: number) => void,
  rules: NumberRules,
) {
  const t = useT();
  const fmt = useFormat();
  const locale = useLocale((s) => s.locale);
  const { decimals, min, max, integer, unit, parseText, zeroText } = rules;
  const show = (v: number) =>
    v === 0 && zeroText !== undefined ? '' : formatInputNumber(v, decimals, locale);
  const shown = value === null ? '' : show(value);
  const read = (text: string) => {
    if (zeroText !== undefined && (text === '' || text === '∞' || text === zeroText)) return 0;
    return parseText?.(text) ?? parseUserNumber(text, unit);
  };
  const [draft, setDraft] = useState(shown);
  const [error, setError] = useState<string | null>(null);

  /** Límite legible: solo los decimales que tiene, con la unidad («Entre 0 y 89 °»). */
  const limit = (v: number) => {
    const d = integer ? 0 : Math.min(decimals, (String(v).split('.')[1] ?? '').length);
    return unit ? `${fmt(v, d)} ${unit}` : fmt(v, d);
  };
  const rangeText = () => {
    if (min !== undefined && max !== undefined)
      return t('common.number.range', { min: limit(min), max: limit(max) });
    if (min !== undefined) return t('common.number.min', { min: limit(min) });
    if (max !== undefined) return t('common.number.max', { max: limit(max) });
    return t('common.number.invalid');
  };

  /** Valida el texto; devuelve el número o deja el mensaje de error. */
  const check = (text: string): number | null => {
    const n = read(text);
    if (n === null) {
      setError(t('common.number.invalid'));
      return null;
    }
    if (integer && !Number.isInteger(n)) {
      setError(t('common.number.integer'));
      return null;
    }
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
      setError(rangeText());
      return null;
    }
    setError(null);
    return n;
  };

  /** Confirma el borrador. `true` si quedó aceptado (también cuando no cambió nada). */
  const commit = (): boolean => {
    const text = draft.trim();
    if (text === shown || (text === '' && zeroText === undefined)) {
      setDraft(shown);
      setError(null);
      return true;
    }
    const n = check(text);
    if (n === null) return false;
    // Normaliza lo escrito («6.5» → «6,5»); si el valor externo cambia, el campo se remonta igual.
    setDraft(show(n));
    onCommit(n);
    return true;
  };

  const revert = () => {
    setDraft(shown);
    setError(null);
  };

  /** ↑/↓ (Mayús ×10, Alt ÷10) y RePág/AvPág (×10) cambian el borrador; se confirma con Enter. */
  const stepKey = (e: KeyboardEvent<HTMLInputElement>): boolean => {
    const dir = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
    if (dir === undefined) return false;
    e.preventDefault();
    const base = (draft.trim() === '' ? null : read(draft.trim())) ?? value ?? min ?? 0;
    const step = rules.step ?? (integer || decimals === 0 ? 1 : 0.1);
    const factor = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const precision = Math.max(decimals, e.altKey ? decimals + 1 : 0);
    const next = clamp(Number((base + dir * step * factor).toFixed(precision)), min, max);
    setDraft(formatInputNumber(next, precision, locale));
    setError(null);
    return true;
  };

  /** Hay algo que revertir: Esc lo revierte y no cierra la ventana. */
  const dirty = draft.trim() !== shown || error !== null;

  return { draft, setDraft, error, dirty, commit, revert, stepKey };
}
