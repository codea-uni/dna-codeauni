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
  topSurfaceId: id<'Surface'>().exactOptional(),
  floorSurfaceId: id<'Surface'>().exactOptional(),
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
    }),
  ),
  freeFaces: z.array(freeFace),
  patterns: z.array(pattern),
  holes: z.array(hole),
  initiation,
  notes: z.string().exactOptional(),
});

const explosive: z.ZodType<M.Explosive> = z.object({
  id: id<'Explosive'>(),
  name: z.string(),
  manufacturer: z.string().exactOptional(),
  family: z.enum(['anfo', 'heavy-anfo', 'emulsion', 'watergel', 'dynamite', 'other']),
  form: z.enum(['bulk', 'packaged']),
  density: pos,
  vod: pos,
  energy: pos,
  rws: pos,
  gasVolume: pos.exactOptional(),
  waterResistant: z.boolean(),
  minDiameter: pos.exactOptional(),
  cartridge: z.object({ diameter: pos, length: pos, mass: pos }).exactOptional(),
  costPerKg: nonNeg.exactOptional(),
});

const detonator: z.ZodType<M.Detonator> = z.object({
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
  id: id<'SurfaceConnector'>(),
  name: z.string(),
  type: z.enum(['nonel-surface', 'detonating-cord', 'electronic-lead']),
  delay: nonNeg,
  delayScatter: nonNeg,
  costPerUnit: nonNeg.exactOptional(),
});

const primer: z.ZodType<M.Primer> = z.object({
  id: id<'Primer'>(),
  name: z.string(),
  mass: pos,
  explosiveId: id<'Explosive'>().exactOptional(),
  costPerUnit: nonNeg.exactOptional(),
});

const stemmingMaterial: z.ZodType<M.StemmingMaterial> = z.object({
  id: id<'StemmingMaterial'>(),
  name: z.string(),
  density: pos,
  costPerM3: nonNeg.exactOptional(),
});

const rockMass: z.ZodType<M.RockMass> = z.object({
  id: id<'RockMass'>(),
  name: z.string(),
  density: pos,
  ucs: pos,
  youngModulus: pos,
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

const surface: z.ZodType<M.Surface> = z.object({
  id: id<'Surface'>(),
  name: z.string(),
  kind: z.enum(['topography', 'floor', 'other']),
  vertices: z.array(num),
  triangles: z.array(z.int().nonnegative()),
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
  surfaces: z.array(surface),
  blasts: z.array(blast),
  displayUnits,
});

export const projectFileSchema: z.ZodType<M.ProjectFile> = z.object({
  format: z.literal('blastlab-project'),
  schemaVersion: z.literal(2),
  savedAt: z.string(),
  appVersion: z.string(),
  project: projectSchema,
});
