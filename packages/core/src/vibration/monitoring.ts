import type {
  Blast,
  Hole,
  MonitoringPointKind,
  MonitoringPoint,
  PpvLimit,
  Project,
  SiteModels,
  Vec3,
  VibrationLaw,
} from '../model/types';

/** Tipos de punto de control, en el orden de la interfaz. */
export const MONITORING_POINT_KINDS: readonly MonitoringPointKind[] = [
  'surface-structure',
  'community',
  'slope',
  'underground-working',
  'other',
];

/** El punto está bajo tierra (labor): la distancia se mide al segmento de carga más cercano. */
export function isUndergroundPoint(point: Pick<MonitoringPoint, 'kind'>): boolean {
  return point.kind === 'underground-working';
}

/**
 * Puntos «de superficie» a efectos de la tabla del EIA: sin tipo (los de siempre), estructura,
 * comunidad u otro. Las filas sin `kind` solo valen para ellos.
 */
export function isSurfaceReceiver(point: Pick<MonitoringPoint, 'kind'>): boolean {
  return (
    point.kind === undefined ||
    point.kind === 'surface-structure' ||
    point.kind === 'community' ||
    point.kind === 'other'
  );
}

/**
 * Límite de PPV por defecto según el tipo de punto (RM-21; `docs/RULES.md` RM-21b). Se usa solo
 * si ni el punto ni la tabla del proyecto dan uno; se pueden copiar a la tabla y editar.
 * - Comunidad: 12,7 mm/s, USBM RI 8507 / OSM (enlucido, baja frecuencia). DIN 4150-3 da 5 mm/s
 *   para viviendas bajo 10 Hz: si el EIA lo exige, cargar esa fila.
 * - Estructura de superficie (planta, chancadora, oficinas): 20 mm/s, DIN 4150-3 línea 1
 *   (industrial) bajo 10 Hz.
 * - Talud y labor subterránea: 254 mm/s, Bauer y Calder (1978), umbral sin fracturamiento de la
 *   roca intacta. El geotécnico debe bajarlo si el macizo está fracturado o el talud es crítico.
 * - Otro: sin límite por defecto.
 */
export const DEFAULT_KIND_PPV_LIMITS: Readonly<
  Record<MonitoringPointKind, { ppvMax: number; source: string } | null>
> = {
  community: { ppvMax: 0.0127, source: 'USBM RI 8507 / OSM (por defecto, comunidad)' },
  'surface-structure': { ppvMax: 0.02, source: 'DIN 4150-3 línea 1 < 10 Hz (por defecto)' },
  slope: { ppvMax: 0.254, source: 'Bauer y Calder 1978, roca intacta (por defecto, talud)' },
  'underground-working': {
    ppvMax: 0.254,
    source: 'Bauer y Calder 1978, roca intacta (por defecto, labor)',
  },
  other: null,
};

/** Filas por defecto (una por tipo con límite) para copiar a la tabla del proyecto y editarlas. */
export function defaultKindPpvLimits(): PpvLimit[] {
  const rows: PpvLimit[] = [];
  for (const kind of MONITORING_POINT_KINDS) {
    const d = DEFAULT_KIND_PPV_LIMITS[kind];
    if (d) rows.push({ kind, from: 0, ppvMax: d.ppvMax, source: d.source });
  }
  return rows;
}

const UG_PREFIX = 'ug-';

/** Taladro de un diseño subterráneo (marca `ug-*`). */
function isUgHole(h: Pick<Hole, 'tags'>): boolean {
  return h.tags?.some((t) => t.startsWith(UG_PREFIX)) ?? false;
}

/** La voladura es subterránea (todos o la mayoría de sus taladros cargados son `ug-*`). */
export function isUndergroundBlast(blast: Pick<Blast, 'holes'>): boolean {
  let ug = 0;
  for (const h of blast.holes) if (isUgHole(h)) ug++;
  return ug > 0 && ug * 2 >= blast.holes.length;
}

/**
 * Ley de vibración de una voladura: la elegida para el proyecto (`activeVibrationLawId`, se guarda
 * con el diseño); si no hay, la subterránea (`context: 'underground'`) si la voladura es subterránea
 * y hay una; si no, la primera superficial; si no, la primera.
 */
export function defaultVibrationLaw(
  project: Pick<Project, 'siteModels'>,
  blast: Pick<Blast, 'holes'> | undefined,
): VibrationLaw | null {
  const laws = project.siteModels.vibrationLaws;
  const active = project.siteModels.activeVibrationLawId;
  const chosen = active ? laws.find((l) => l.id === active) : undefined;
  if (chosen) return chosen;
  const ug = blast ? isUndergroundBlast(blast) : false;
  const match = laws.find((l) => (l.context ?? 'surface') === (ug ? 'underground' : 'surface'));
  return match ?? laws[0] ?? null;
}

/** Distancia 3D [m] de `p` al segmento ab. */
export function distanceToSegment3(p: Vec3, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const l2 = dx * dx + dy * dy + dz * dz;
  const t =
    l2 > 0
      ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / l2))
      : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t), p.z - (a.z + dz * t));
}

/** Punto 3D más cercano a `p` entre los vértices de las secciones de una excavación. */
export function nearestOnSections(p: Vec3, sections: readonly (readonly Vec3[])[]): Vec3 | null {
  let best: Vec3 | null = null;
  let bd = Infinity;
  for (const s of sections)
    for (const v of s) {
      const d = Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
  return best;
}

/** Centro (promedio de vértices) de las secciones de una excavación: punto en la labor. */
export function excavationCenter(sections: readonly (readonly Vec3[])[]): Vec3 | null {
  let n = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const s of sections)
    for (const v of s) {
      x += v.x;
      y += v.y;
      z += v.z;
      n++;
    }
  return n > 0 ? { x: x / n, y: y / n, z: z / n } : null;
}

/** Clase de daño en roca por PPV (Bauer y Calder 1978; `docs/RULES.md` RM-21b). */
export type RockDamageClass = 'none' | 'minor-slabbing' | 'strong-cracking' | 'breakup';

/** Umbrales de Bauer y Calder [m/s]: 254, 635 y 2 540 mm/s. */
export const BAUER_CALDER_THRESHOLDS = [0.254, 0.635, 2.54] as const;

/**
 * Daño esperable en roca (labor, pilar, talud) por el PPV: < 254 mm/s sin fracturar la roca
 * intacta; 254–635 descostre menor; 635–2 540 agrietamiento fuerte; > 2 540 rotura. Es un semáforo,
 * no un límite exacto (faltan datos de daño en labores; Fleetwood et al. 2009).
 */
export function rockDamageClass(ppv: number): RockDamageClass {
  const [a, b, c] = BAUER_CALDER_THRESHOLDS;
  return ppv < a ? 'none' : ppv < b ? 'minor-slabbing' : ppv < c ? 'strong-cracking' : 'breakup';
}

/**
 * Modelos de sitio con `law` en uso en el proyecto: reemplaza la ley calibrada de la misma zona y
 * tipo de voladura (recalibrar) o la agrega, y la deja elegida (`activeVibrationLawId`).
 */
export function withActiveVibrationLaw(site: SiteModels, law: VibrationLaw): SiteModels {
  const context = law.context ?? 'surface';
  const others = site.vibrationLaws.filter(
    (l) =>
      l.id !== law.id &&
      !(law.fit && l.fit?.zone === law.fit.zone && (l.context ?? 'surface') === context),
  );
  return { ...site, vibrationLaws: [...others, law], activeVibrationLawId: law.id };
}

/** La ley no viene de mediciones del sitio (sin ajuste): se avisa «ley no calibrada». */
export function isUncalibratedLaw(law: Pick<VibrationLaw, 'fit'> | null | undefined): boolean {
  return !law?.fit;
}
