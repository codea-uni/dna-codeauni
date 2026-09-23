/**
 * Alias documentales de unidades SI. Internamente todo el modelo usa SI;
 * las conversiones solo ocurren en la capa de presentación.
 */
export type Meters = number; // m
export type Seconds = number; // s
export type Radians = number; // rad

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
