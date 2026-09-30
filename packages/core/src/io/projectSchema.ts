import { z } from 'zod';
import type * as M from '../model/types';

/**
 * Esquemas de validación del JSON de proyecto. Cada esquema se anota con su tipo del modelo
 * (`z.ZodType<T>`), así que el compilador verifica que ambos coincidan.
 */

const id = <B extends string>() =>
  z.custom<M.Id<B>>((v) => typeof v === 'string' && v.length > 0, { message: 'id inválido' });

const num = z.number().refine(Number.isFinite, 'número no finito');
const nonNeg = num.refine((v) => v >= 0, 'debe ser ≥ 0');
const pos = num.refine((v) => v > 0, 'debe ser > 0');

const range = z.object({ min: nonNeg, max: nonNeg });

const vec2: z.ZodType<M.Vec2> = z.object({ x: num, y: num });
const vec3: z.ZodType<M.Vec3> = z.object({ x: num, y: num, z: num });
const polygon2: z.ZodType<M.Polygon2> = z.array(vec2);

const chargeRule: z.ZodType<M.ChargeRule> = z.object({
  stemmingLength: nonNeg,
  stemmingMaterialId: id<'StemmingMaterial'>(),
  explosiveId: id<'Explosive'>(),
  airDeckLength: nonNeg.exactOptional(),
  primerId: id<'Primer'>().exactOptional(),
  detonatorId: id<'Detonator'>().exactOptional(),
  primerOffsetFromToe: nonNeg,
});

const holeTemplate: z.ZodType<M.HoleTemplate> = z.object({
  diameter: pos,
  inclination: num,
  azimuth: num,
  subdrill: num,
  chargeRule: chargeRule.exactOptional(),
});

const pattern: z.ZodType<M.Pattern> = z.object({
  id: id<'Pattern'>(),
  name: z.string(),
  kind: z.enum(['square', 'rectangular', 'staggered']),
  burden: pos,
  spacing: pos,
  origin: vec2,
  rowAzimuth: num,
  rowAdvance: z.enum(['left', 'right']),
  rows: z.int().nonnegative(),
  holesPerRow: z.int().nonnegative(),
  clipBoundary: polygon2.exactOptional(),
  boundaryId: id<'Boundary'>().exactOptional(),
  holeTemplate,
});

const deckBase = { id: id<'Deck'>(), length: nonNeg };
const deck: z.ZodType<M.Deck> = z.discriminatedUnion('kind', [
  z.object({
    ...deckBase,
    kind: z.literal('explosive'),
    explosiveId: id<'Explosive'>(),
    densityOverride: pos.exactOptional(),
    swell: nonNeg.exactOptional(),
    effectiveDiameter: pos.exactOptional(),
  }),
  z.object({ ...deckBase, kind: z.literal('stemming'), materialId: id<'StemmingMaterial'>() }),
  z.object({ ...deckBase, kind: z.literal('air') }),
  z.object({ ...deckBase, kind: z.literal('water') }),
  z.object({
    ...deckBase,
    kind: z.literal('plug'),
    name: z.string().exactOptional(),
    cost: nonNeg.exactOptional(),
  }),
]);

const inHoleInitiator: z.ZodType<M.InHoleInitiator> = z.object({
  id: id<'InHoleInitiator'>(),
  detonatorId: id<'Detonator'>(),
  primerId: id<'Primer'>().exactOptional(),
  depth: nonNeg,
  delay: nonNeg,
});

const holeActual = z.object({
  collar: vec3.exactOptional(),
  length: nonNeg.exactOptional(),
  inclination: num.exactOptional(),
  azimuth: num.exactOptional(),
  diameter: pos.exactOptional(),
});

const hole: z.ZodType<M.Hole> = z.object({
  id: id<'Hole'>(),
  label: z.string(),
  patternId: id<'Pattern'>().exactOptional(),
  row: z.int().exactOptional(),
  col: z.int().exactOptional(),
  groupId: id<'HoleGroup'>().exactOptional(),
  water: z.enum(['dry', 'static', 'dynamic']).exactOptional(),
  collar: vec3,
  diameter: pos,
  length: nonNeg,
  inclination: num,
  azimuth: num,
  subdrill: num,
  decks: z.array(deck),
  initiators: z.array(inHoleInitiator),
  status: z.enum(['designed', 'drilled', 'loaded', 'fired', 'abandoned']),
  actual: holeActual.exactOptional(),
  tags: z.array(z.string()).exactOptional(),
});

const bench: z.ZodType<M.Bench> = z.object({
  floorElevation: num,
  height: pos,
  topographyId: id<'TopographySurvey'>().exactOptional(),
  faceAngle: num,
});

const freeFace: z.ZodType<M.FreeFace> = z.object({
  id: id<'FreeFace'>(),
  crest: z.array(vec3),
  toe: z.array(vec3).exactOptional(),
});

const nodeRef: z.ZodType<M.NodeRef> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hole'), holeId: id<'Hole'>() }),
  z.object({ kind: z.literal('node'), nodeId: id<'SurfaceNode'>() }),
]);

const initiation: z.ZodType<M.InitiationPlan> = z.object({
  system: z.enum(['nonel', 'electronic', 'electric', 'mixed']),
  nodes: z.array(z.object({ id: id<'SurfaceNode'>(), position: vec3 })),
  connections: z.array(
    z.object({
      id: id<'Connection'>(),
      from: nodeRef,
      to: nodeRef,
      connectorId: id<'SurfaceConnector'>(),
      delayOverride: nonNeg.exactOptional(),
    }),
  ),
  initiationPoints: z.array(z.object({ id: id<'InitiationPoint'>(), at: nodeRef, time: num })),
});

const blast: z.ZodType<M.Blast> = z.object({
  id: id<'Blast'>(),
  name: z.string(),
  status: z.enum(['design', 'drilled', 'loaded', 'fired']),
  bench,
  rockMassId: id<'RockMass'>(),
  boundaries: z.array(
    z.object({
      id: id<'Boundary'>(),
      name: z.string(),
      polygon: polygon2,
      freeFaceEdges: z.array(z.int().nonnegative()),
      floorElevation: num.exactOptional(),
    }),
  ),
  freeFaces: z.array(freeFace),
  groups: z.array(
    z.object({
      id: id<'HoleGroup'>(),
      name: z.string(),
      kind: z.enum(['presplit', 'buffer', 'production', 'other']),
      color: z.string(),
      template: holeTemplate.exactOptional(),
    }),
  ),
  patterns: z.array(pattern),
  holes: z.array(hole),
  initiation,
  calcParams: z.object({
    micWindow: pos,
    detonationGamma: pos,
    reliefRate: nonNeg,
    drillDeviation: nonNeg,
    sdobBands: z.array(nonNeg),
    drillingCostPerMeter: nonNeg,
    displacement: z.object({ cB: pos, theta: pos, rowFactor: pos }),
    subdrillConvention: z.enum(['vertical', 'lopezJimeno']),
    delayGuide: z.object({ interHole: range, interRow: range }),
    checks: z.object({
      minStemmingRatio: nonNeg,
      duplicateDistance: nonNeg,
      neighborFactor: pos,
      maxStemmingRatio: pos,
      stemmingDiameterRatio: range,
      subdrillBurdenRatio: range,
      minStiffness: nonNeg,
      benchDiameterRatio: range,
      minStemmingDiameters: nonNeg,
      sdob: z.object({ severe: nonNeg, safe: nonNeg }),
      rockFactorRange: range,
      maxEffectiveBurdenRatio: pos,
      minEffectiveBurdenRatio: nonNeg,
      midEffectiveBurdenRatio: pos,
      presplitLead: nonNeg,
      minInterRowDelay: nonNeg,
      uniformityRange: range,
    }),
  }),
  notes: z.string().exactOptional(),
});

const sourced = { source: z.string().exactOptional(), version: z.string().exactOptional() };

const explosive: z.ZodType<M.Explosive> = z.object({
  ...sourced,
  id: id<'Explosive'>(),
  name: z.string(),
  manufacturer: z.string().exactOptional(),
  family: z.enum(['anfo', 'heavy-anfo', 'emulsion', 'watergel', 'dynamite', 'other']),
  form: z.enum(['bulk', 'packaged']),
  density: pos,
  densityRange: z.object({ min: pos, max: pos }).exactOptional(),
  vod: pos,
  energy: pos,
  rws: pos,
  gasVolume: pos.exactOptional(),
  waterResistance: z.enum(['none', 'limited', 'high']),
  criticalDiameter: pos.exactOptional(),
  gassing: z.object({ initialDensity: pos, finalDensity: pos }).exactOptional(),
  needsBooster: z.boolean().exactOptional(),
  cartridge: z.object({ diameter: pos, length: pos, mass: pos }).exactOptional(),
  costPerKg: nonNeg.exactOptional(),
});

const detonator: z.ZodType<M.Detonator> = z.object({
  ...sourced,
  id: id<'Detonator'>(),
  name: z.string(),
  manufacturer: z.string().exactOptional(),
  type: z.enum(['electronic', 'nonel', 'electric']),
  nominalDelay: nonNeg,
  delayScatter: nonNeg,
  programmableRange: z.object({ min: nonNeg, max: nonNeg, step: pos }).exactOptional(),
  costPerUnit: nonNeg.exactOptional(),
});

const surfaceConnector: z.ZodType<M.SurfaceConnector> = z.object({
  ...sourced,
  id: id<'SurfaceConnector'>(),
  name: z.string(),
  type: z.enum(['nonel-surface', 'detonating-cord', 'electronic-lead']),
  delay: nonNeg,
  delayScatter: nonNeg,
  costPerUnit: nonNeg.exactOptional(),
});

const primer: z.ZodType<M.Primer> = z.object({
  ...sourced,
  id: id<'Primer'>(),
  name: z.string(),
  mass: pos,
  explosiveId: id<'Explosive'>().exactOptional(),
  costPerUnit: nonNeg.exactOptional(),
});

const stemmingMaterial: z.ZodType<M.StemmingMaterial> = z.object({
  ...sourced,
  id: id<'StemmingMaterial'>(),
  name: z.string(),
  kind: z.enum(['crushed-rock', 'sand', 'drill-cuttings', 'plug', 'other']).exactOptional(),
  angularity: z.enum(['angular', 'rounded']).exactOptional(),
  grading: z.object({ min: pos, max: pos }).exactOptional(),
  density: pos,
  costPerM3: nonNeg.exactOptional(),
});

const rockMass: z.ZodType<M.RockMass> = z.object({
  id: id<'RockMass'>(),
  name: z.string(),
  density: pos,
  ucs: pos,
  youngModulus: pos,
  tensileStrength: pos.exactOptional(),
  vp: pos.exactOptional(),
  vppc: pos.exactOptional(),
  rqd: z.number().min(0).max(1).exactOptional(),
  blastability: z.object({ rmd: num, jps: num, jpa: num, rdi: num, hf: num }).exactOptional(),
  rockFactor: pos.exactOptional(),
  swebrecB: pos.exactOptional(),
});

const siteModels: z.ZodType<M.SiteModels> = z.object({
  vibrationLaws: z.array(
    z.object({
      id: id<'VibrationLaw'>(),
      name: z.string(),
      scaling: z.enum(['square-root', 'cube-root']),
      k: pos,
      beta: pos,
      confidence: num.exactOptional(),
    }),
  ),
  nearField: z.object({ k: pos, alpha: pos, beta: pos }).exactOptional(),
  airblast: z.object({ k: pos, beta: pos }),
  flyrock: z.object({ k: pos, safetyFactor: pos }),
});

const hash = z.string().regex(/^[0-9a-f]{64}$/);

export const topographySurveySchema: z.ZodType<M.TopographySurvey> = z.object({
  id: id<'TopographySurvey'>(),
  name: z.string(),
  surveyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  epsg: z.int().positive().exactOptional(),
  source: z.object({
    format: z.enum(['dxf', 'surpac', 'points', 'landxml', 'geotiff', 'image', 'las', 'legacy']),
    files: z.array(z.string()),
    sourceEpsg: z.int().positive().exactOptional(),
    transform: z.string().exactOptional(),
  }),
  bounds: z.object({ minX: num, minY: num, minZ: num, maxX: num, maxY: num, maxZ: num }),
  stats: z.object({
    points: z.int().nonnegative(),
    triangles: z.int().nonnegative(),
    lines: z.int().nonnegative(),
  }),
  assets: z.object({
    tin: hash.exactOptional(),
    lines: hash.exactOptional(),
    image: hash.exactOptional(),
  }),
});

const displayUnits: z.ZodType<M.DisplayUnits> = z.object({
  length: z.enum(['m', 'ft']),
  diameter: z.enum(['mm', 'in']),
  mass: z.enum(['kg', 'lb']),
  time: z.enum(['ms', 's']),
  angle: z.enum(['deg', 'rad']),
  ppv: z.enum(['mm/s', 'in/s']),
  pressure: z.enum(['dB', 'kPa', 'psi']),
});

const scenario: z.ZodType<M.Scenario> = z.object({
  id: id<'Scenario'>(),
  name: z.string(),
  savedAt: z.string(),
  blast,
});

export const projectSchema: z.ZodType<M.Project> = z.object({
  id: id<'Project'>(),
  name: z.string(),
  description: z.string().exactOptional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  currency: z.string(),
  coordinateSystem: z.object({
    name: z.string().exactOptional(),
    epsg: z.int().exactOptional(),
    origin: vec3,
  }),
  library: z.object({
    explosives: z.array(explosive),
    detonators: z.array(detonator),
    surfaceConnectors: z.array(surfaceConnector),
    primers: z.array(primer),
    stemmingMaterials: z.array(stemmingMaterial),
  }),
  rockMasses: z.array(rockMass),
  siteModels,
  topography: z.array(topographySurveySchema),
  blasts: z.array(blast),
  monitoringPoints: z
    .array(
      z.object({
        id: id<'MonitoringPoint'>(),
        name: z.string(),
        position: vec3,
        ppvLimit: pos.exactOptional(),
        k: pos.exactOptional(),
        beta: pos.exactOptional(),
        structure: z.string().exactOptional(),
      }),
    )
    .exactOptional(),
  scenarios: z.array(scenario).exactOptional(),
  ppvLimits: z
    .array(
      z.object({
        structure: z.string().exactOptional(),
        from: nonNeg,
        to: pos.exactOptional(),
        ppvMax: pos,
        source: z.string().min(1),
      }),
    )
    .exactOptional(),
  displayUnits,
});

export const projectFileSchema: z.ZodType<M.ProjectFile> = z.object({
  format: z.literal('cronos-project'),
  schemaVersion: z.literal(12),
  savedAt: z.string(),
  appVersion: z.string(),
  project: projectSchema,
  embeddedAssets: z.record(hash, z.string()).exactOptional(),
});
