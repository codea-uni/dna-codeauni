import { create } from 'zustand';
import { en } from './en';
import { es, type MessageKey, type Messages } from './es';

export type { MessageKey } from './es';
export type Locale = 'es' | 'en';

const MESSAGES: Record<Locale, Messages> = { es, en };
const STORAGE_KEY = 'cronos.locale';

function initialLocale(): Locale {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const initial = initialLocale();
if (typeof document !== 'undefined') document.documentElement.lang = initial;

/** Idioma de la interfaz (preferencia de quien mira; no es parte del proyecto). */
export const useLocale = create<LocaleState>((set) => ({
  locale: initial,
  setLocale: (locale) => {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // sin almacenamiento (modo privado): el idioma dura la sesión
    }
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
    set({ locale });
  },
}));

type Vars = Record<string, string | number>;

function format(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m)) : text;
}

/** Texto en el idioma activo, fuera de React (acciones, mensajes). */
export function t(key: MessageKey, vars?: Vars): string {
  return format(MESSAGES[useLocale.getState().locale][key], vars);
}

/** `t` para componentes: se vuelven a renderizar al cambiar el idioma. */
export function useT(): typeof t {
  const locale = useLocale((s) => s.locale);
  return (key, vars) => format(MESSAGES[locale][key], vars);
}

const NUMBER_LOCALE: Record<Locale, string> = { es: 'es-ES', en: 'en-US' };

/** Número con separadores del idioma («1.234,5» / «1,234.5»); «—» si no es finito. */
export function formatNumber(
  v: number,
  decimals = 0,
  locale: Locale = useLocale.getState().locale,
): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString(NUMBER_LOCALE[locale], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  });
}

/** `formatNumber` para componentes: se vuelven a renderizar al cambiar el idioma. */
export function useFormat(): (v: number, decimals?: number) => string {
  const locale = useLocale((s) => s.locale);
  return (v, decimals = 0) => formatNumber(v, decimals, locale);
}

/** Fecha y hora en el idioma activo («30/09/2026, 10:05» / «9/30/2026, 10:05 AM»). */
export function formatDateTime(iso: string, locale: Locale = useLocale.getState().locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(NUMBER_LOCALE[locale], { dateStyle: 'short', timeStyle: 'short' });
}

/** `formatDateTime` para componentes: se vuelven a renderizar al cambiar el idioma. */
export function useFormatDate(): (iso: string) => string {
  const locale = useLocale((s) => s.locale);
  return (iso) => formatDateTime(iso, locale);
}
