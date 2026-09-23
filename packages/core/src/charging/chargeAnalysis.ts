import type { Blast, HoleId, ProductLibrary, Vec2 } from '../model/types';
import { holeCharge, indexLibrary } from './charge';
import { influenceAreas } from './influence';

/** Resultado de carguío y cubicación de una voladura. Arreglos indexados como `holeIds`. */
export interface ChargeResult {
  holeIds: HoleId[];
  /** kg de explosivo por taladro (incluye primas). */
  perHole: Float64Array;
  /** Energía por taladro [J]. */
  energyPerHole: Float64Array;
  /** Área de influencia por taladro [m²]. */
  areaPerHole: Float64Array;
  /** Volumen por taladro [m³] = área × altura de banco. */
  volumePerHole: Float64Array;
  /** Factor de carga por taladro [kg/m³] (0 si no tiene volumen). */
  powderFactorPerHole: Float64Array;
  totalExplosive: number;
  totalPrimers: number;
  totalEnergy: number;
  /** Metros perforados. */
  drilledLength: number;
  /** Área de la voladura [m²] y volumen [m³]. */
  area: number;
  volume: number;
  /** Tonelaje [kg]. */
  tonnage: number;
  /** kg/m³ y kg/kg (mostrar ×1000 como kg/t). */
  powderFactorVolume: number;
  powderFactorMass: number;
  /** Costo total de productos (explosivos, taco, primas, detonadores). */
  cost: number;
  loadedHoles: number;
  /** Contorno automático usado para taladros fuera de todo perímetro (null si no hizo falta). */
  autoBoundary: Vec2[] | null;
}

export function computeCharges(
  blast: Blast,
  library: ProductLibrary,
  rockDensity: number,
): ChargeResult {
  const holes = blast.holes;
  const n = holes.length;
  const lib = indexLibrary(library);
  const perHole = new Float64Array(n);
  const energyPerHole = new Float64Array(n);
  const volumePerHole = new Float64Array(n);
  const powderFactorPerHole = new Float64Array(n);
  let totalExplosive = 0;
  let totalPrimers = 0;
  let totalEnergy = 0;
  let drilledLength = 0;
  let cost = 0;
  let loadedHoles = 0;
  holes.forEach((hole, i) => {
    const c = holeCharge(hole, lib);
    const kg = c.explosive + c.primers;
    perHole[i] = kg;
    energyPerHole[i] = c.energy;
    totalExplosive += c.explosive;
    totalPrimers += c.primers;
    totalEnergy += c.energy;
    drilledLength += hole.length;
    cost += c.cost;
    if (c.explosive > 0) loadedHoles++;
  });
  const influence = influenceAreas(
    holes.map((h) => h.collar),
    blast.boundaries.map((b) => b.polygon),
  );
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = influence.areas[i] ?? 0;
    area += a;
    const v = a * blast.bench.height;
    volumePerHole[i] = v;
    powderFactorPerHole[i] = v > 0 ? (perHole[i] ?? 0) / v : 0;
  }
  const volume = area * blast.bench.height;
  const tonnage = volume * rockDensity;
  const kg = totalExplosive + totalPrimers;
  return {
    holeIds: holes.map((h) => h.id),
    perHole,
    energyPerHole,
    areaPerHole: influence.areas,
    volumePerHole,
    powderFactorPerHole,
    totalExplosive,
    totalPrimers,
    totalEnergy,
    drilledLength,
    area,
    volume,
    tonnage,
    powderFactorVolume: volume > 0 ? kg / volume : 0,
    powderFactorMass: tonnage > 0 ? kg / tonnage : 0,
    cost,
    loadedHoles,
    autoBoundary: influence.autoBoundary,
  };
}
