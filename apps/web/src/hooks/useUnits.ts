import {
  diameterFromDisplay,
  diameterToDisplay,
  lengthFromDisplay,
  lengthToDisplay,
} from '@cronos/core';
import { useProject } from './useDocument';

/** Conversión SI ↔ unidad de visualización de una magnitud. */
export interface UnitConv {
  unit: string;
  show: (si: number) => number;
  parse: (display: number) => number;
}

/**
 * Unidades de visualización del proyecto (H-104). Los datos siguen en SI: solo se convierte al
 * mostrar (`show`) y al leer lo que escribe el usuario (`parse`).
 */
export function useUnits(): { len: UnitConv; area: UnitConv; volume: UnitConv; dia: UnitConv } {
  const { length, diameter } = useProject().displayUnits;
  const k = lengthToDisplay(1, length);
  return {
    len: {
      unit: length,
      show: (m) => lengthToDisplay(m, length),
      parse: (v) => lengthFromDisplay(v, length),
    },
    area: { unit: `${length}²`, show: (m2) => m2 * k * k, parse: (v) => v / (k * k) },
    volume: { unit: `${length}³`, show: (m3) => m3 * k ** 3, parse: (v) => v / k ** 3 },
    dia: {
      unit: diameter,
      show: (m) => diameterToDisplay(m, diameter),
      parse: (v) => diameterFromDisplay(v, diameter),
    },
  };
}
