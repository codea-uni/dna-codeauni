import type {
  Blast,
  HoleGroupId,
  HoleId,
  Kilograms,
  Meters,
  PatternId,
  ProductLibrary,
  Vec2,
} from '../model/types';
import { nominalVolume } from '../design/burden';
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
  /** Factor de carga por taladro con su volumen cubicado [kg/m³] (0 si no tiene volumen). */
  loadingFactorPerHole: Float64Array;
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
  /**
   * Factores reales con el volumen cubicado (P-06), nombres de D-10: factor de carga [kg/m³] y
   * factor de potencia [kg/kg; se muestra ×1000 como kg/t].
   */
  loadingFactor: number;
  powderFactor: number;
  /**
   * Agregados de diseño de los taladros con malla (P-06, FC-02): volumen nominal Σ B·S·H [m³],
   * su explosivo [kg], su energía [J] y sus metros perforados. De aquí salen el factor de carga,
   * de potencia y de energía de diseño y el rendimiento m³/m (FC-13 a FC-16).
   */
  nominal: { volume: number; explosive: Kilograms; energy: number; drilledLength: Meters };
  /** Por grupo (null = sin grupo): taladros, kg y volumen nominal. */
  byGroup: ChargeSummary[];
  /** Por fila de cada malla: taladros, kg y volumen nominal. */
  byRow: (ChargeSummary & { patternId: PatternId; row: number })[];
  /** Costo total de productos (explosivos, taco, primas, detonadores). */
  cost: number;
  /** Costo de perforación [US$]: metros perforados × `calcParams.drillingCostPerMeter` (`R1` F28). */
  drillingCost: number;
  loadedHoles: number;
  /** Contorno automático usado para taladros fuera de todo perímetro (null si no hizo falta). */
  autoBoundary: Vec2[] | null;
}

export interface ChargeSummary {
  groupId: HoleGroupId | null;
  holes: number;
  explosive: Kilograms;
  nominalVolume: number;
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
  const loadingFactorPerHole = new Float64Array(n);
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
    loadingFactorPerHole[i] = v > 0 ? (perHole[i] ?? 0) / v : 0;
  }
  const volume = area * blast.bench.height;
  const patterns = new Map(blast.patterns.map((p) => [p.id, p]));
  const nominal = { volume: 0, explosive: 0, energy: 0, drilledLength: 0 };
  const byGroup = new Map<HoleGroupId | null, ChargeSummary>();
  const byRow = new Map<string, ChargeSummary & { patternId: PatternId; row: number }>();
  holes.forEach((h, i) => {
    const kgHole = perHole[i] ?? 0;
    const p = h.patternId ? patterns.get(h.patternId) : undefined;
    const v = p
      ? nominalVolume(
          p.burden,
          p.spacing,
          blast.bench.height,
          h.inclination,
          blast.calcParams.subdrillConvention,
        )
      : 0;
    if (p) {
      nominal.volume += v;
      nominal.explosive += kgHole;
      nominal.energy += energyPerHole[i] ?? 0;
      nominal.drilledLength += h.length;
    }
    const gid = h.groupId ?? null;
    const g = byGroup.get(gid) ?? { groupId: gid, holes: 0, explosive: 0, nominalVolume: 0 };
    g.holes++;
    g.explosive += kgHole;
    g.nominalVolume += v;
    byGroup.set(gid, g);
    if (p && h.row !== undefined) {
      const key = `${p.id}:${String(h.row)}`;
      const r = byRow.get(key) ?? {
        groupId: null,
        patternId: p.id,
        row: h.row,
        holes: 0,
        explosive: 0,
        nominalVolume: 0,
      };
      r.holes++;
      r.explosive += kgHole;
      r.nominalVolume += v;
      byRow.set(key, r);
    }
  });
  const tonnage = volume * rockDensity;
  const kg = totalExplosive + totalPrimers;
  return {
    holeIds: holes.map((h) => h.id),
    perHole,
    energyPerHole,
    areaPerHole: influence.areas,
    volumePerHole,
    loadingFactorPerHole,
    totalExplosive,
    totalPrimers,
    totalEnergy,
    drilledLength,
    area,
    volume,
    tonnage,
    loadingFactor: volume > 0 ? kg / volume : 0,
    powderFactor: tonnage > 0 ? kg / tonnage : 0,
    nominal,
    byGroup: [...byGroup.values()],
    byRow: [...byRow.values()].sort((a, b) => a.row - b.row),
    cost,
    drillingCost: drilledLength * blast.calcParams.drillingCostPerMeter,
    loadedHoles,
    autoBoundary: influence.autoBoundary,
  };
}
