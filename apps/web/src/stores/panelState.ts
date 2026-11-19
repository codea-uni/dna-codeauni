import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { create } from 'zustand';

/** Valores de formularios de panel que aún no se aplicaron, por clave. Viven en la sesión. */
const usePanelStore = create<{ values: Record<string, unknown> }>(() => ({ values: {} }));

/**
 * Como `useState`, pero el valor sobrevive a cerrar la ventana del panel (cronos-ux-interfaz,
 * regla 4: lo que el usuario escribió no se pierde). La clave debe incluir el id del proyecto
 * cuando el valor apunta a datos del proyecto (productos de su librería, grupos).
 */
export function usePanelState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [fallback] = useState(initial);
  const stored = usePanelStore((s) => s.values[key]);
  // Solo este hook escribe en `key`, siempre con un T: la conversión desde unknown es segura.
  const value = stored === undefined ? fallback : (stored as T);
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      usePanelStore.setState((s) => {
        const prev = key in s.values ? (s.values[key] as T) : fallback;
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        return { values: { ...s.values, [key]: v } };
      });
    },
    [key, fallback],
  );
  return [value, set];
}
