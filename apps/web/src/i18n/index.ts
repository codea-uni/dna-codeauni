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

/** Idioma de la interfaz (preferencia de quien mira; no es parte del proyecto). */
export const useLocale = create<LocaleState>((set) => ({
  locale: initialLocale(),
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
