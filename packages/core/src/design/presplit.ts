import { deckIntervals, indexLibrary } from '../charging/charge';
import type { DesignCheck, DesignCheckOptions } from '../diagnostics/designChecks';
import { PointIndex } from '../geometry/spatialIndex';
import type {
  Blast,
  HoleId,
  KgPerM3,
  Meters,
  MetersPerSecond,
  Pascals,
  ProductLibrary,
  Ratio,
  RockMass,
} from '../model/types';

/**
 * Precorte y voladura amortiguada (buffer), `docs/theory/references/R1` F26 y el ejemplo A.2/A.3
 * (CR-01 de `docs/theory/04`); FC-31 y FC-32 en `docs/RULES.md`. La fórmula de Pb es empírica y
 * trae sus unidades (MPa, g/cc, km/s): aquí se convierte en la entrada y en la salida, sin tocar
 * el 110 de la fuente.
 */

/** Exponente n de Pb: 1,25 con el taladro seco y 0,9 con agua (`R1` F26, `X-PRE`). */
export function presplitExponent(wet: boolean): number {
  return wet ? 0.9 : 1.25;
}

/**
 * Relación de desacople f = volumen de carga / volumen del taladro = (D_c/D)²·(l_c/l). En CR-01
 * los 2 m superiores van sin carga: f = (1,75/6,5)²·13/15 = 0,0628.
 */
export function decouplingRatio(
  chargeDiameter: Meters,
  holeDiameter: Meters,
  chargedLength: Meters,
  holeLength: Meters,
): Ratio {
  return (chargeDiameter / holeDiameter) ** 2 * (chargedLength / holeLength);
}

/** Pb [MPa] = 110·f^n·ρ[g/cc]·VOD[km/s]² (FC-31), devuelta en Pa. */
export function presplitPressure(
  f: Ratio,
  density: KgPerM3,
  vod: MetersPerSecond,
  wet: boolean,
): Pascals {
  return 110 * f ** presplitExponent(wet) * (density / 1000) * (vod / 1000) ** 2 * 1e6;
}

/** f que da la presión buscada (Pb = UCS·R, con R ≈ 1): inversa de `presplitPressure`. */
export function presplitDecoupling(
  target: Pascals,
  density: KgPerM3,
  vod: MetersPerSecond,
  wet: boolean,
): Ratio {
  return (
    (target / 1e6 / (110 * (density / 1000) * (vod / 1000) ** 2)) ** (1 / presplitExponent(wet))
  );
}

/** Diámetro de carga que da la relación f: D_c = D·√(f·l/l_c). */
export function presplitChargeDiameter(
  f: Ratio,
  holeDiameter: Meters,
  chargedLength: Meters,
  holeLength: Meters,
): Meters {
  return holeDiameter * Math.sqrt((f * holeLength) / chargedLength);
}

/** Espaciamiento máximo E ≤ D·(Pb + RT)/RT. */
export function presplitMaxSpacing(holeDiameter: Meters, pb: Pascals, tensile: Pascals): Meters {
  return (holeDiameter * (pb + tensile)) / tensile;
}

/** Factor de carga del precorte γ [kg/m²] = carga lineal / espaciamiento (`X-PRE`). */
export function presplitLoadFactor(
  chargeDiameter: Meters,
  density: KgPerM3,
  spacing: Meters,
): number {
  return ((Math.PI / 4) * chargeDiameter ** 2 * density) / spacing;
}

/**
 * Burden del buffer B_buf = [W/(FC·K_BP·H·ρ_r·SBR)]^0,5 (FC-32). La fuente usa W·1000 [g], FC
 * [g/t] y ρ_r [t/m³]; en SI es lo mismo con W [kg], FC [kg/kg] y ρ_r [kg/m³], y da metros.
 */
export function bufferBurden(
  chargeMass: number,
  powderFactor: Ratio,
  benchHeight: Meters,
  rockDensity: KgPerM3,
  spacingBurdenRatio: Ratio,
  kBP: Ratio = 1,
): Meters {
  return Math.sqrt(
    chargeMass / (powderFactor * kBP * benchHeight * rockDensity * spacingBurdenRatio),
  );
}

/** Espaciamiento del buffer S_buf = 1,15·B_buf (`R1` A.2). */
export function bufferSpacing(burden: Meters, ratio: Ratio = 1.15): Meters {
  return ratio * burden;
}

export interface RowGeometry {
  diameter: Meters;
  spacing: Meters;
  burden: Meters;
}

/**
 * Distancia precorte–buffer DST = [K_BP·(D·S·B)_buf/(D·S·B)_prod]^0,5·Q_b, con Q_b la quebradura
 * (sobrexcavación) de la producción.
 */
export function presplitBufferDistance(
  buffer: RowGeometry,
  production: RowGeometry,
  backbreak: Meters,
  kBP: Ratio = 1,
): Meters {
  const volume = (r: RowGeometry) => r.diameter * r.spacing * r.burden;
  return Math.sqrt((kBP * volume(buffer)) / volume(production)) * backbreak;
}

/** Datos de precorte de un taladro, a partir de sus tramos de explosivo. */
export interface PresplitHole {
  /** Relación de desacople f. */
  f: Ratio;
  /** Presión en el taladro Pb [Pa]. */
  pb: Pascals;
  /** Espaciamiento máximo [m] (solo con RT de la roca). */
  maxSpacing: Meters | null;
  /** Diámetro de carga que da Pb = UCS con el mismo producto y largo cargado [m]. */
  chargeDiameterForUcs: Meters | null;
}

export function presplitHole(
  hole: Blast['holes'][number],
  library: ProductLibrary,
  rock: Pick<RockMass, 'ucs' | 'tensileStrength'> | undefined,
): PresplitHole | null {
  const lib = indexLibrary(library);
  let volume = 0;
  let chargedLength = 0;
  let main: { length: number; density: KgPerM3; vod: MetersPerSecond } | null = null;
  for (const iv of deckIntervals(hole)) {
    if (iv.deck.kind !== 'explosive') continue;
    const product = lib.explosives.get(iv.deck.explosiveId);
    if (!product) continue;
    const length = iv.bottom - iv.top;
    volume += (iv.deck.effectiveDiameter ?? hole.diameter) ** 2 * length;
    chargedLength += length;
    // ponytail: ρ y VOD del tramo más largo; con productos mezclados habría que ponderar.
    if (!main || length > main.length)
      main = { length, density: iv.deck.densityOverride ?? product.density, vod: product.vod };
  }
  if (!main || volume <= 0 || hole.length <= 0) return null;
  const f = volume / (hole.diameter ** 2 * hole.length);
  const wet = hole.water !== undefined && hole.water !== 'dry';
  const pb = presplitPressure(f, main.density, main.vod, wet);
  const tensile = rock?.tensileStrength;
  const ucs = rock?.ucs;
  return {
    f,
    pb,
    maxSpacing: tensile ? presplitMaxSpacing(hole.diameter, pb, tensile) : null,
    chargeDiameterForUcs: ucs
      ? presplitChargeDiameter(
          presplitDecoupling(ucs, main.density, main.vod, wet),
          hole.diameter,
          chargedLength,
          hole.length,
        )
      : null,
  };
}

/**
 * Revisión del precorte (grupos de tipo precorte, `R1` F26), siempre como advertencia (R1):
 * Pb por encima de la UCS (tritura la pared), espaciamiento mayor que el máximo y salida con
 * menos de `presplitLead` antes que el resto de la voladura.
 */
export function presplitChecks(
  blast: Blast,
  library: ProductLibrary,
  rock: RockMass | undefined,
  fireTime: Float64Array,
  options: DesignCheckOptions,
): DesignCheck[] {
  const presplitGroups = new Set(
    blast.groups.filter((g) => g.kind === 'presplit').map((g) => g.id),
  );
  if (presplitGroups.size === 0) return [];
  const isPresplit = blast.holes.map(
    (h) => h.groupId !== undefined && presplitGroups.has(h.groupId),
  );
  const members = blast.holes.filter((_, i) => isPresplit[i]);
  if (members.length === 0) return [];
  const index = new PointIndex(
    members.map((h) => h.id),
    Float64Array.from(members, (h) => h.collar.x),
    Float64Array.from(members, (h) => h.collar.y),
  );
  const highPressure: HoleId[] = [];
  const wideSpacing: HoleId[] = [];
  for (const h of members) {
    const p = presplitHole(h, library, rock);
    if (!p) continue;
    if (rock && p.pb > rock.ucs) highPressure.push(h.id);
    if (p.maxSpacing === null) continue;
    const n = index.nearest(h.collar.x, h.collar.y, Infinity, (id) => id === h.id);
    if (n && Math.hypot(n.x - h.collar.x, n.y - h.collar.y) > p.maxSpacing) wideSpacing.push(h.id);
  }
  let lastPresplit = -Infinity;
  let firstOther = Infinity;
  blast.holes.forEach((_, i) => {
    const t = fireTime[i] ?? NaN;
    if (!Number.isFinite(t)) return;
    if (isPresplit[i]) lastPresplit = Math.max(lastPresplit, t);
    else firstOther = Math.min(firstOther, t);
  });
  const lateLead =
    Number.isFinite(lastPresplit) &&
    Number.isFinite(firstOther) &&
    firstOther - lastPresplit < options.presplitLead - 1e-9;
  const checks: DesignCheck[] = [];
  const add = (c: DesignCheck) => {
    if (c.holes.length > 0) checks.push(c);
  };
  add({
    id: 'presplitPressure',
    severity: 'warning',
    title: 'Precorte con Pb mayor que la UCS',
    detail:
      'Pb = 110·f^n·ρ·VOD² supera la UCS: tritura la pared en vez de abrir el plano (R1 F26). Desacopla más la carga.',
    holes: highPressure,
  });
  add({
    id: 'presplitSpacing',
    severity: 'warning',
    title: 'Precorte con espaciamiento mayor que el máximo',
    detail:
      'El vecino más cercano está más lejos que E = D·(Pb + RT)/RT: la grieta no une los taladros (R1 F26).',
    holes: wideSpacing,
  });
  add({
    id: 'presplitLead',
    severity: 'warning',
    title: 'Precorte sin adelanto suficiente',
    detail: `El precorte debe salir al menos ${String(options.presplitLead * 1000)} ms antes que el resto de la voladura (R1 F26).`,
    params: { value: options.presplitLead * 1000 },
    holes: lateLead ? members.map((h) => h.id) : [],
  });
  return checks;
}
