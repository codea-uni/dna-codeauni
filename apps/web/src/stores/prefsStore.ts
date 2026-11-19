import { create } from 'zustand';

/**
 * Preferencias de este navegador que no son del proyecto. Se guardan en localStorage y, si no se
 * puede (modo privado), valen solo mientras la pestaña esté abierta.
 */
interface Prefs {
  /** Deslizador bajo los campos numéricos con rango (opcional: útil para demostraciones). */
  numberSliders: boolean;
  setNumberSliders: (on: boolean) => void;
}

const KEY = 'cronos.prefs';

function load(): Partial<Prefs> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
  } catch {
    return {};
  }
}

function save(prefs: Pick<Prefs, 'numberSliders'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Sin almacenamiento: la preferencia dura hasta cerrar la pestaña.
  }
}

export const usePrefs = create<Prefs>((set) => ({
  numberSliders: load().numberSliders === true,
  setNumberSliders: (numberSliders) => {
    set({ numberSliders });
    save({ numberSliders });
  },
}));
