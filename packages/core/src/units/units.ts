/**
 * Conversiones SI ↔ presentación. Internamente todo el modelo usa SI;
 * estas funciones solo se usan en la capa de presentación e IO.
 */
import type { Meters, Radians, Seconds } from '../model/types';

const DEG_PER_RAD = 180 / Math.PI;
const MM_PER_M = 1000;
const MS_PER_S = 1000;
const FT_PER_M = 1 / 0.3048; // pie internacional: 0.3048 m exactos

export const degToRad = (deg: number): Radians => deg / DEG_PER_RAD;
export const radToDeg = (rad: Radians): number => rad * DEG_PER_RAD;

export const mmToM = (mm: number): Meters => mm / MM_PER_M;
export const mToMm = (m: Meters): number => m * MM_PER_M;

export const msToS = (ms: number): Seconds => ms / MS_PER_S;
export const sToMs = (s: Seconds): number => s * MS_PER_S;

export const ftToM = (ft: number): Meters => ft / FT_PER_M;
export const mToFt = (m: Meters): number => m * FT_PER_M;

// ------------------------------------------------------------------ Unidades de visualización (H-104)

export type LengthUnit = 'm' | 'ft';
export type DiameterUnit = 'mm' | 'in';

const MM_PER_IN = 25.4; // pulgada internacional: 25,4 mm exactos

/** m → unidad de visualización de longitud. */
export const lengthToDisplay = (m: Meters, unit: LengthUnit): number =>
  unit === 'ft' ? mToFt(m) : m;
/** Unidad de visualización de longitud → m. */
export const lengthFromDisplay = (v: number, unit: LengthUnit): Meters =>
  unit === 'ft' ? ftToM(v) : v;

/** m → unidad de visualización de diámetro (mm o in). */
export const diameterToDisplay = (m: Meters, unit: DiameterUnit): number =>
  unit === 'in' ? mToMm(m) / MM_PER_IN : mToMm(m);
/** Unidad de visualización de diámetro (mm o in) → m. */
export const diameterFromDisplay = (v: number, unit: DiameterUnit): Meters =>
  mmToM(unit === 'in' ? v * MM_PER_IN : v);
