import {
  projectKind,
  workingDips,
  type WorkingDip,
  benchFloorFor,
  boundaryBench,
  holeBoundary,
  type BlastBoundary,
  benchOffTopography,
  decodeAsset,
  holesOffBench,
  newId,
  SurfaceIndex,
  surveyAssetHashes,
  type Bench,
  type Blast,
  type BlastId,
  type Hole,
  type Bounds3,
  type LineSetData,
  type LineSummary,
  type Op,
  type OrthoImageData,
  type Project,
  type SurveyInput,
  type SurveyParts,
  type TinData,
  type Ground,
  type TopographySurvey,
  type BlockColoring,
  type BlockModelData,
  type PointCloudData,
  type WorkingsData,
  colorBlocks,
  turboRgb,
  buildGeotechModel,
  colorBlocksByCompetence,
  projectRock,
  type BlockModelMapping,
  type GeotechModel,
  workingKinds,
  workingTriangleOwners,
  workingTrianglesByKind,
  type WorkingKind,
} from '@cronos/core';
import type {
  BlockModelView,
  PointCloudView,
  TopographyViewData,
  WorkingsView,
} from '@cronos/engine';
import { getAsset, putAsset } from '../persistence/assets';
import { getCompute, getEngine, session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';

/**
 * Topografía cargada en la sesión (D-16): los levantamientos que usa el proyecto, decodificados
 * de sus assets `CRTS` (vistas sobre el binario, sin copiar). El worker calcula el sombreado, las
 * curvas y el índice espacial; el motor los dibuja y el índice da la cota bajo el cursor.
 */
interface LoadedSurvey {
  survey: TopographySurvey;
  tin?: TinData;
  lines?: LineSetData;
  /** Resumen de cada línea (rol, largo, cota), para elegirlas como perímetro. */
  lineSummaries?: LineSummary[];
  index?: SurfaceIndex;
  /** Nube de puntos para ver (sin triangular). */
  cloud?: PointCloudData;
  /** Modelo de bloques. */
  blocks?: BlockModelData;
  /** Labores subterráneas (sólidos y ejes de túneles). */
  workings?: WorkingsData;
  view: TopographyViewData;
}

/** Cómo se colorea cada modelo de bloques (por levantamiento). */
export interface BlockStyle {
  attribute: string;
  /** Filtro por valor (atributo numérico): fuera del rango no se dibuja. */
  min?: number;
  max?: number;
  opacity: number;
}
const blockStyles = new Map<string, BlockStyle>();
const blockColorings = new Map<string, BlockColoring>();

/** Atributos especiales de color: competencia por RMR o por UCS (modelo geotécnico). */
export const COMPETENCE_RMR = '@competence:rmr';
export const COMPETENCE_UCS = '@competence:ucs';

/**
 * Atributo con el que se colorea al cargar: la competencia si el modelo es geotécnico; si no,
 * litología o material; si no, densidad.
 */
function defaultBlockStyle(m: BlockModelData, mapping?: BlockModelMapping): BlockStyle {
  if (mapping?.geotechnical) {
    const c = mapping.columns;
    if (c.rmr ?? c.gsi ?? c.q) return { attribute: COMPETENCE_RMR, opacity: 1 };
    if (c.ucs) return { attribute: COMPETENCE_UCS, opacity: 1 };
  }
  const cat =
    m.categorical.find((a) => /^(lito|litologia|litología|lith|rock|roca)/i.test(a.name)) ??
    m.categorical.find((a) => /material|tipo/i.test(a.name)) ??
    m.categorical.find((a) => a.categories.length > 1);
  return { attribute: cat?.name ?? m.densityAttribute ?? m.numeric[0]?.name ?? '', opacity: 1 };
}

export function blockStyle(surveyId: string): BlockStyle | undefined {
  return blockStyles.get(surveyId);
}

/** Leyenda y totales del color actual de un modelo de bloques. */
export function blockColoring(surveyId: string): BlockColoring | undefined {
  return blockColorings.get(surveyId);
}

export function blockModelOf(surveyId: string): BlockModelData | undefined {
  return loaded.get(surveyId)?.blocks;
}

export function setBlockStyle(surveyId: string, style: BlockStyle): void {
  blockStyles.set(surveyId, style);
  blockColorings.delete(surveyId);
  notify();
}

const geotechModels = new Map<string, { key: string; model: GeotechModel }>();

/**
 * Modelo geotécnico de un levantamiento (roca de cada bloque completada e índice espacial), con la
 * roca de la voladura como respaldo. undefined si no es geotécnico o no está cargado.
 */
export function geotechModelOf(surveyId: string): GeotechModel | undefined {
  const s = loaded.get(surveyId);
  const mapping = s?.survey.blockModel;
  if (!s?.blocks || !mapping?.geotechnical) return undefined;
  const project = session.document.project;
  const base = projectRock(project, project.blasts[0]);
  const key = JSON.stringify([mapping, base]);
  const hit = geotechModels.get(surveyId);
  if (hit?.key === key) return hit.model;
  const model = buildGeotechModel(surveyId, s.blocks, mapping, base);
  geotechModels.set(surveyId, { key, model });
  return model;
}

/** Operación que cambia el mapeo de un modelo de bloques (viaja con el levantamiento). */
export function blockMappingOps(surveyId: string, mapping: BlockModelMapping): Op[] {
  const topography = session.document.project.topography.map((s) =>
    s.id === surveyId ? { ...s, blockModel: mapping } : s,
  );
  return [{ type: 'project/patch', patch: { topography } }];
}

function coloringOf(id: string, m: BlockModelData): BlockColoring {
  let c = blockColorings.get(id);
  if (c) return c;
  const style = blockStyles.get(id) ?? defaultBlockStyle(m, loaded.get(id)?.survey.blockModel);
  blockStyles.set(id, style);
  const geo =
    style.attribute === COMPETENCE_RMR || style.attribute === COMPETENCE_UCS
      ? geotechModelOf(id)
      : undefined;
  if (geo) {
    c = colorBlocksByCompetence(geo, style.attribute === COMPETENCE_RMR ? 'rmr' : 'ucs');
    blockColorings.set(id, c);
    return c;
  }
  c = colorBlocks(m, style.attribute, turboRgb, {
    ...(style.min !== undefined ? { min: style.min } : {}),
    ...(style.max !== undefined ? { max: style.max } : {}),
  });
  blockColorings.set(id, c);
  return c;
}

/**
 * Color de cada tipo de labor en 3D: el tajeo (donde se carga explosivo) resalta en rojo anaranjado
 * y más opaco; el desarrollo en tonos fríos.
 */
export const WORKING_KIND_COLORS: Record<WorkingKind, number> = {
  drift: 0x4fc3f7,
  crosscut: 0x81c784,
  ramp: 0xffb74d,
  bypass: 0x9575cd,
  raise: 0xf06292,
  stope: 0xff3d00,
  access: 0xa1887f,
  other: 0xb0bec5,
};
/** Labores sin eje asignado (partes pequeñas de un sólido). */
const WORKINGS_UNASSIGNED = 0x90a4ae;

/** Tipos de labor ocultos en 3D (filtro de la leyenda). */
const hiddenKinds = new Set<WorkingKind>();

export function isWorkingKindHidden(kind: WorkingKind): boolean {
  return hiddenKinds.has(kind);
}

export function setWorkingKindHidden(kind: WorkingKind, hidden: boolean): void {
  if (hidden) hiddenKinds.add(kind);
  else hiddenKinds.delete(kind);
  notify();
}

/** Dueño (eje) de cada triángulo de las labores: se calcula una vez por malla. */
const ownersCache = new WeakMap<WorkingsData, Int32Array>();
function ownersOf(w: WorkingsData): Int32Array {
  let o = ownersCache.get(w);
  if (!o) {
    o = workingTriangleOwners(w);
    ownersCache.set(w, o);
  }
  return o;
}

/** Buzamiento de cada labor de un levantamiento (solo las que vienen de un sólido). */
const dipsCache = new WeakMap<WorkingsData, (WorkingDip | null)[]>();
export function surveyWorkingDips(surveyId: string): (WorkingDip | null)[] {
  const w = loaded.get(surveyId)?.workings;
  if (!w) return [];
  let d = dipsCache.get(w);
  if (!d) {
    d = workingDips(w, ownersOf(w));
    dipsCache.set(w, d);
  }
  return d;
}

/** Tipo de cada labor de un levantamiento: el guardado o el de por defecto (nombre, pendiente). */
export function surveyWorkingKinds(surveyId: string): WorkingKind[] {
  const s = loaded.get(surveyId);
  return s?.workings ? workingKinds(s.workings, s.survey.workingKinds) : [];
}

/** Operación que cambia el tipo de las labores de un levantamiento (viaja con él a la mina). */
export function workingKindsOps(surveyId: string, kinds: WorkingKind[]): Op[] {
  const topography = session.document.project.topography.map((s) =>
    s.id === surveyId ? { ...s, workingKinds: kinds } : s,
  );
  return [{ type: 'project/patch', patch: { topography } }];
}

/** Vista previa de un levantamiento movido (malla en coordenadas nuevas), o null. */
let movePreview: WorkingsView | null = null;

export function setMovePreview(view: { vertices: Float64Array; triangles: Uint32Array } | null) {
  movePreview = view ? { id: 'move-preview', ...view, color: 0xffd600, opacity: 0.35 } : null;
  applyTopographyToEngine();
}

const loaded = new Map<string, LoadedSurvey>();
/** De dónde bajar un asset que no está en el navegador (el servidor de la mina, D-16). */
let remoteAssets: ((hash: string) => Promise<Uint8Array>) | null = null;
/** Vista previa del asistente de importación (aún no está en el proyecto). */
let preview: TopographyViewData | null = null;
const loading = new Set<string>();
const listeners = new Set<() => void>();

export function topographyTin(surveyId: string): TinData | undefined {
  return loaded.get(surveyId)?.tin;
}

/** Avisa cuando cambia lo cargado (para paneles). Devuelve la función para dejar de escuchar. */
export function onTopographyChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  applyTopographyToEngine();
  for (const l of listeners) l();
}

/** Proyecto que cada visor ya encuadró al abrirlo (un visor nuevo por cada vez que se abre). */
const framedOnOpen = new WeakMap<object, string>();

/**
 * Bajo tierra, al abrir un proyecto con labores se pasa a 3D y se encuadra la mina: en planta, de
 * cerca, solo se ve el terreno sobre el frente. Una vez por visor y proyecto, para no pelear con la
 * cámara del usuario.
 */
function frameMineOnOpen(engine: NonNullable<ReturnType<typeof getEngine>>, hasWorkings: boolean) {
  const project = session.document.project;
  if (!hasWorkings || projectKind(project) !== 'underground') return;
  if (framedOnOpen.get(engine) === project.id) return;
  framedOnOpen.set(engine, project.id);
  if (useUiStore.getState().viewMode !== '3d') useUiStore.getState().setViewMode('3d');
  requestAnimationFrame(() => getEngine()?.frameModels3d());
}

/** Pasa al motor lo que esté cargado (al montar el visor o al cargar un levantamiento). */
export function applyTopographyToEngine(): void {
  const engine = getEngine();
  if (!engine) return;
  const tins = new Map<string, TinData>();
  const grounds = new Map<string, Ground>();
  for (const [id, s] of loaded) {
    if (s.tin) tins.set(id, s.tin);
    const index = s.index;
    if (index) grounds.set(id, (x, y) => index.elevationAt(x, y));
  }
  engine.setTopographyTins(tins, grounds);
  const clouds: PointCloudView[] = [];
  const blocks: BlockModelView[] = [];
  for (const [id, s] of loaded) {
    if (s.cloud) clouds.push({ id, cloud: s.cloud });
    if (s.blocks) {
      const c = coloringOf(id, s.blocks);
      blocks.push({
        id,
        blocks: s.blocks,
        colors: c.colors,
        visible: c.visible,
        opacity: blockStyles.get(id)?.opacity ?? 1,
      });
    }
  }
  engine.setModels3d(clouds, blocks);
  const workings: WorkingsView[] = [];
  for (const [id, s] of loaded) {
    if (!s.workings) continue;
    // Un trozo de malla por tipo de labor: color propio y filtro de la leyenda.
    const kinds = workingKinds(s.workings, s.survey.workingKinds);
    const byKind = workingTrianglesByKind(s.workings, kinds, ownersOf(s.workings));
    for (const [kind, triangles] of byKind) {
      if (kind && hiddenKinds.has(kind)) continue;
      workings.push({
        id: `${id}:${kind ?? 'none'}`,
        vertices: s.workings.vertices,
        triangles,
        color: kind ? WORKING_KIND_COLORS[kind] : WORKINGS_UNASSIGNED,
        // Tajeos semitransparentes: cara doble, no deben tapar los taladros del abanico (A9).
        ...(kind === 'stope' ? { opacity: 0.16 } : {}),
      });
    }
  }
  if (movePreview) workings.push(movePreview);
  engine.setWorkings(workings);
  frameMineOnOpen(engine, workings.length > 0);
  engine.setElevationSource(
    loaded.size > 0
      ? (x, y) => topographyElevation(x, y, session.document.project.blasts[0]?.bench.topographyId)
      : null,
  );
  // El más reciente arriba: se dibujan en orden de fecha.
  const views = [...loaded.values()]
    .sort((a, b) => a.survey.surveyDate.localeCompare(b.survey.surveyDate))
    .map((s) => s.view);
  engine.setTopography(preview ? [...views, preview] : views);
}

/**
 * Muestra en el mapa lo que se va a importar (regla de `03 §5`: vista previa antes de aceptar) y
 * encuadra su extensión.
 */
export async function showTopographyPreview(parts: SurveyParts, bounds: Bounds3): Promise<void> {
  const api = getCompute().api;
  const { tin, lines } = parts;
  const image = parts.image ? await imageView(parts.image) : null;
  const interval = contourIntervalFor(bounds);
  const [shade, contours] = tin
    ? await Promise.all([api.topographyHillshade(tin), api.topographyContours(tin, { interval })])
    : [null, null];
  preview = { id: 'preview', bounds, shade, contours, lines: lines ?? null, image };
  applyTopographyToEngine();
  getEngine()?.fitBounds(bounds);
}

/** Ortofoto lista para el motor: el navegador decodifica la imagen (WebP, JPEG o PNG). */
async function imageView(
  image: OrthoImageData,
): Promise<NonNullable<TopographyViewData['image']> | null> {
  try {
    const bitmap = await createImageBitmap(
      new Blob([image.bytes as BlobPart], { type: image.mime }),
    );
    return { bitmap, width: image.width, height: image.height, georef: image.georef };
  } catch (err) {
    console.warn('[topografía] no se pudo decodificar la ortofoto', err);
    return null;
  }
}

/** Quita la vista previa del mapa. */
export function clearTopographyPreview(): void {
  if (!preview) return;
  preview = null;
  applyTopographyToEngine();
}

/**
 * Cota del terreno bajo (x, y): la del levantamiento que usa el banco de la voladura activa y, si
 * no la cubre, la del más reciente que lo cubra. `null` fuera de toda topografía.
 */
export function topographyElevation(x: number, y: number, preferred?: string): number | null {
  const first = preferred ? loaded.get(preferred) : undefined;
  const z = first?.index?.elevationAt(x, y);
  if (z !== undefined && z !== null) return z;
  const byDate = [...loaded.values()].sort((a, b) =>
    b.survey.surveyDate.localeCompare(a.survey.surveyDate),
  );
  for (const s of byDate) {
    const e = s.index?.elevationAt(x, y);
    if (e !== undefined && e !== null) return e;
  }
  return null;
}

/** Intervalo de curvas automático: ~25 curvas en el rango de cotas, redondeado a 1, 2 o 5 × 10ⁿ. */
export function autoContourInterval(zMin: number, zMax: number): number {
  const raw = Math.max(zMax - zMin, 1) / 25;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((k) => k * p >= raw) ?? 10;
  return Math.max(0.5, step * p);
}

function contourInterval(survey: TopographySurvey): number {
  return contourIntervalFor(survey.bounds);
}

function contourIntervalFor({ minZ, maxZ }: Bounds3): number {
  const fixed = useAnalysisStore.getState().topoContourInterval;
  // Tope de 500 curvas: un intervalo muy chico en un tajo alto congelaría el dibujo.
  return fixed > 0 ? Math.max(fixed, (maxZ - minZ) / 500) : autoContourInterval(minZ, maxZ);
}

/**
 * Fuente remota de assets: al abrir un proyecto de la mina, los levantamientos que no están en
 * este navegador se bajan del servidor y se guardan. `null` = solo lo local.
 */
export function setRemoteAssetSource(source: ((hash: string) => Promise<Uint8Array>) | null): void {
  remoteAssets = source;
}

/** Binario de un asset: del navegador o, si falta, del servidor (y queda guardado). */
async function assetBytes(hash: string): Promise<Uint8Array | undefined> {
  const local = await getAsset(hash);
  if (local) return local;
  if (!remoteAssets) return undefined;
  try {
    const bytes = await remoteAssets(hash);
    await putAsset(hash, bytes);
    return bytes;
  } catch (err) {
    console.warn(`[topografía] no se pudo bajar el asset ${hash}`, err);
    return undefined;
  }
}

async function decode(
  hash: string | undefined,
): Promise<ReturnType<typeof decodeAsset> | undefined> {
  if (!hash) return undefined;
  const bytes = await assetBytes(hash);
  if (!bytes) {
    console.warn(`[topografía] falta el asset ${hash}`);
    return undefined;
  }
  return decodeAsset(bytes);
}

async function load(survey: TopographySurvey): Promise<boolean> {
  if (loaded.has(survey.id) || loading.has(survey.id)) return false;
  loading.add(survey.id);
  try {
    const [tinAsset, linesAsset, imageAsset, cloudAsset, blocksAsset, workingsAsset] =
      await Promise.all([
        decode(survey.assets.tin),
        decode(survey.assets.lines),
        decode(survey.assets.image),
        decode(survey.assets.cloud),
        decode(survey.assets.blocks),
        decode(survey.assets.workings),
      ]);
    const workings = workingsAsset?.kind === 'workings' ? workingsAsset.workings : undefined;
    const cloud = cloudAsset?.kind === 'cloud' ? cloudAsset.cloud : undefined;
    const blocks = blocksAsset?.kind === 'blocks' ? blocksAsset.blocks : undefined;
    const image = imageAsset?.kind === 'image' ? await imageView(imageAsset.image) : null;
    const tin = tinAsset?.kind === 'tin' ? tinAsset.tin : undefined;
    const lines = linesAsset?.kind === 'lines' ? linesAsset.lines : undefined;
    const api = getCompute().api;
    const [[shade, contours, indexData], lineInfo] = await Promise.all([
      tin
        ? Promise.all([
            api.topographyHillshade(tin),
            api.topographyContours(tin, { interval: contourInterval(survey) }),
            api.topographyIndex(tin),
          ])
        : Promise.resolve([null, null, null] as const),
      lines ? api.topographyLineInfo(lines) : Promise.resolve(null),
    ]);
    loaded.set(survey.id, {
      survey,
      ...(tin ? { tin, index: SurfaceIndex.fromData(tin, indexData) } : {}),
      ...(lines ? { lines } : {}),
      ...(lineInfo ? { lineSummaries: lineInfo.summaries } : {}),
      ...(cloud ? { cloud } : {}),
      ...(blocks ? { blocks } : {}),
      ...(workings ? { workings } : {}),
      view: {
        id: survey.id,
        bounds: survey.bounds,
        shade,
        contours,
        lines: lines ?? null,
        lineIndex: lineInfo?.index ?? null,
        image,
      },
    });
    return true;
  } finally {
    loading.delete(survey.id);
  }
}

/** Carga lo que falte del proyecto y suelta lo que ya no usa. */
export async function syncTopography(project: Project): Promise<void> {
  const ids = new Set(project.topography.map((s) => s.id as string));
  let changed = false;
  for (const id of [...loaded.keys()])
    if (!ids.has(id)) {
      loaded.delete(id);
      changed = true;
    }
  // Metadatos editados (mapeo del modelo de bloques): se toman sin recargar los datos.
  for (const s of project.topography) {
    const l = loaded.get(s.id);
    if (!l || l.survey === s) continue;
    if (JSON.stringify(l.survey.workingKinds) !== JSON.stringify(s.workingKinds)) changed = true;
    if (JSON.stringify(l.survey.blockModel) !== JSON.stringify(s.blockModel)) {
      blockColorings.delete(s.id);
      const style = blockStyles.get(s.id);
      if (style?.attribute.startsWith('@competence') && !s.blockModel?.geotechnical)
        blockStyles.delete(s.id);
      changed = true;
    }
    l.survey = s;
  }
  const added = await Promise.all(project.topography.map(load));
  pushRockModels();
  if (changed || added.some(Boolean)) notify();
}

let pushedRockKey = '';
const rockListeners = new Set<() => void>();

/** Avisa cuando el worker recibe otros modelos de bloques (la roca de cálculo puede cambiar). */
export function onRockModelsChange(listener: () => void): () => void {
  rockListeners.add(listener);
  return () => {
    rockListeners.delete(listener);
  };
}

/**
 * Pasa al worker los modelos de bloques geotécnicos cargados (una vez por conjunto): la roca de
 * cálculo por bloque (`rockFromModel`) los usa si el levantamiento lo tiene activo.
 */
function pushRockModels(): void {
  const models = [...loaded.values()].flatMap((s) =>
    s.blocks && s.survey.blockModel?.geotechnical
      ? [{ surveyId: s.survey.id, blocks: s.blocks }]
      : [],
  );
  const key = models.map((m) => m.surveyId).join(',');
  if (key === pushedRockKey) return;
  pushedRockKey = key;
  void getCompute()
    .api.setRockModels(models)
    .then(() => {
      for (const l of rockListeners) l();
    });
}

/** Recalcula las curvas de nivel (al cambiar el intervalo). */
async function refreshContours(): Promise<void> {
  const api = getCompute().api;
  await Promise.all(
    [...loaded.values()].map(async (s) => {
      if (!s.tin) return;
      const contours = await api.topographyContours(s.tin, { interval: contourInterval(s.survey) });
      s.view = { ...s.view, contours };
    }),
  );
  notify();
}

/** Mantiene la topografía cargada al día con el documento y con el intervalo de curvas. */
export function startTopographySync(): () => void {
  let last = session.document.project.topography;
  void syncTopography(session.document.project);
  const offDoc = session.document.subscribe((_cs, store) => {
    if (store.project.topography === last) return;
    last = store.project.topography;
    void syncTopography(store.project);
  });
  const offInterval = useAnalysisStore.subscribe((s, prev) => {
    if (s.topoContourInterval !== prev.topoContourInterval) void refreshContours();
  });
  return () => {
    offDoc();
    offInterval();
  };
}

/**
 * Crea un levantamiento: el worker codifica sus partes, los assets se guardan en el navegador y
 * se devuelven las operaciones para agregarlo al documento (y, si se indica, usarlo en el banco).
 */
export async function createSurveyOps(
  input: SurveyInput,
  parts: SurveyParts,
  useInBlast?: BlastId,
  /** Levantamientos a los que se suma (los del proyecto; al crear varios juntos, los acumulados). */
  existing: readonly TopographySurvey[] = session.document.project.topography,
): Promise<{ ops: Op[]; survey: TopographySurvey; bench: BenchOnSurvey | null }> {
  const built = await getCompute().api.buildSurvey(input, parts);
  await Promise.all(built.assets.map((a) => putAsset(a.hash, a.bytes)));
  const survey: TopographySurvey = { ...built.survey, id: newId<'TopographySurvey'>() };
  const project = session.document.project;
  const ops: Op[] = [{ type: 'project/patch', patch: { topography: [...existing, survey] } }];
  const blast = useInBlast ? project.blasts.find((b) => b.id === useInBlast) : undefined;
  if (!blast) return { ops, survey, bench: null };
  const r = await benchOnSurveyOps(blast, survey, parts.tin);
  return { ops: [...ops, ...r.ops], survey, bench: r };
}

/** Qué cambió al apoyar el banco en un levantamiento. */
export interface BenchOnSurvey {
  ops: Op[];
  /** Nuevo piso del banco [m] si el anterior quedaba lejos del terreno. */
  floor: number | null;
  /** Taladros cuya boca pasó a la cota del terreno, y los que quedan fuera de él. */
  draped: number;
  outside: number;
}

/**
 * El banco usa el levantamiento (D-16) y sus taladros respetan el terreno. Cada perímetro es
 * independiente (en un tajo pueden estar en bancos distintos):
 * - las bocas de los taladros toman la cota del terreno;
 * - el piso de cada perímetro sale de sus bocas (mediana menos la altura del banco) si su piso
 *   actual no les corresponde (S-18); un perímetro sin taladros toma la mediana del terreno en su
 *   polígono; los taladros fuera de todo perímetro ajustan el piso del banco;
 * - los largos llegan al piso de su perímetro + sobreperforación.
 * El trabajo sobre el TIN corre en el worker; todo vuelve como operaciones que se deshacen juntas.
 */
export async function benchOnSurveyOps(
  blast: Blast,
  survey: TopographySurvey,
  tin: TinData | undefined,
  forceFloor = false,
): Promise<BenchOnSurvey> {
  const api = getCompute().api;
  let bench: Bench = { ...blast.bench, topographyId: survey.id };
  if (!tin) return { ops: [benchPatch(blast, { bench })], floor: null, draped: 0, outside: 0 };
  const drape = (b: Pick<Blast, 'bench' | 'boundaries'>) =>
    api.topographyDrape(tin, blast.holes, {
      bench: b.bench,
      boundaries: b.boundaries,
      patterns: blast.patterns,
      calcParams: blast.calcParams,
    });
  let r = blast.holes.length > 0 ? await drape({ bench, boundaries: blast.boundaries }) : null;
  const off = new Set(r?.outside ?? []);
  // Bocas sobre el terreno agrupadas por perímetro ('' = fuera de todo perímetro).
  const groups = new Map<string, number[]>();
  for (const h of r?.holes ?? []) {
    if (off.has(h.id)) continue;
    const key = holeBoundary(blast, h)?.id ?? '';
    groups.set(key, [...(groups.get(key) ?? []), h.collar.z]);
  }
  let floor: number | null = null;
  const boundaries: BlastBoundary[] = [];
  for (const b of blast.boundaries) {
    const own = boundaryBench(bench, b);
    const collars = groups.get(b.id) ?? [];
    let next: number | null = null;
    if (collars.length > 0) {
      if (forceFloor || holesOffBench(own, collars)) next = benchFloorFor(collars, own.height);
    } else if (forceFloor || benchOffTopography(own, survey.bounds)) {
      const z = await api.topographyBenchElevation(tin, [...b.polygon]);
      if (z !== null) next = z - own.height;
    }
    boundaries.push(next === null ? b : { ...b, floorElevation: next });
    if (next !== null) floor = next;
  }
  const loose = groups.get('') ?? [];
  if (
    loose.length > 0
      ? forceFloor || holesOffBench(bench, loose)
      : blast.boundaries.length === 0 && (forceFloor || benchOffTopography(bench, survey.bounds))
  ) {
    const z =
      loose.length > 0
        ? benchFloorFor(loose, bench.height)
        : await api
            .topographyMedianElevation(tin)
            .then((m) => (m === null ? null : m - bench.height));
    if (z !== null) {
      bench = { ...bench, floorElevation: z };
      floor = z;
    }
  }
  // Con los pisos nuevos cambian los largos.
  if (r) r = await drape({ bench, boundaries });
  const ops: Op[] = [benchPatch(blast, { bench, boundaries })];
  const changed = (r?.holes ?? []).filter((h) => !off.has(h.id));
  if (changed.length > 0) ops.push({ type: 'holes/replace', blastId: blast.id, holes: changed });
  return { ops, floor, draped: changed.length, outside: off.size };
}

const benchPatch = (blast: Blast, patch: Partial<Pick<Blast, 'bench' | 'boundaries'>>): Op => ({
  type: 'blast/patch',
  blastId: blast.id,
  patch,
});

/**
 * Taladros recién generados sobre el banco con topografía: la boca en el terreno y el largo hasta
 * el piso de su perímetro + J (en el worker). Si ese piso no corresponde a las bocas (S-18), se
 * propone el que les corresponde (`floor`); el llamador lo aplica **solo a ese perímetro** (o al
 * banco si la malla no tiene perímetro), en el mismo paso. Sin topografía, vuelven igual.
 */
export async function drapeNewHoles(
  blast: Blast,
  holes: Hole[],
  boundary?: BlastBoundary,
): Promise<{ holes: Hole[]; outside: number; floor: number | null }> {
  const id = blast.bench.topographyId;
  const tin = id ? loaded.get(id)?.tin : undefined;
  if (!tin || holes.length === 0) return { holes, outside: 0, floor: null };
  const api = getCompute().api;
  const own = boundaryBench(blast.bench, boundary);
  let r = await api.topographyDrape(tin, holes, { bench: own, calcParams: blast.calcParams });
  const off = new Set(r.outside);
  const collars = r.holes.filter((h) => !off.has(h.id)).map((h) => h.collar.z);
  let floor: number | null = null;
  if (holesOffBench(own, collars)) {
    floor = benchFloorFor(collars, own.height);
    if (floor !== null)
      r = await api.topographyDrape(tin, holes, {
        bench: { ...own, floorElevation: floor },
        calcParams: blast.calcParams,
      });
  }
  return { holes: r.holes, outside: off.size, floor };
}

/** Levantamientos cargados con sus datos (para las herramientas de diseño). */
export function loadedSurveys(): readonly {
  survey: TopographySurvey;
  tin?: TinData;
  lines?: LineSetData;
  lineSummaries?: LineSummary[];
}[] {
  return [...loaded.values()];
}

/**
 * El levantamiento para diseñar: el que usa el banco de la voladura y, si no hay, el más reciente
 * con triangulación.
 */
export function designSurvey(): (LoadedSurvey & { tin: TinData }) | undefined {
  const preferred = session.document.project.blasts[0]?.bench.topographyId;
  const all = [...loaded.values()].filter((s): s is LoadedSurvey & { tin: TinData } => !!s.tin);
  return (
    all.find((s) => s.survey.id === preferred) ??
    all.sort((a, b) => b.survey.surveyDate.localeCompare(a.survey.surveyDate))[0]
  );
}

/** Labores subterráneas cargadas, por levantamiento (para ubicar frentes y abanicos). */
export function loadedWorkings(): readonly { survey: TopographySurvey; workings: WorkingsData }[] {
  const out: { survey: TopographySurvey; workings: WorkingsData }[] = [];
  for (const s of loaded.values())
    if (s.workings) out.push({ survey: s.survey, workings: s.workings });
  return out;
}

/**
 * Partes de un levantamiento cargado (para moverlo, convertirlo o exportarlo). La ortofoto se lee
 * de su asset (en memoria solo está la imagen decodificada).
 */
export async function surveyParts(surveyId: string): Promise<SurveyParts | undefined> {
  const s = loaded.get(surveyId);
  if (!s) return undefined;
  const imageAsset = await decode(s.survey.assets.image);
  return {
    ...(s.tin ? { tin: s.tin } : {}),
    ...(s.lines ? { lines: s.lines } : {}),
    ...(imageAsset?.kind === 'image' ? { image: imageAsset.image } : {}),
    ...(s.cloud ? { cloud: s.cloud } : {}),
    ...(s.blocks ? { blocks: s.blocks } : {}),
    ...(s.workings ? { workings: s.workings } : {}),
  };
}

/** Partes cargadas sin la ortofoto (síncrono: centroide y vista previa). */
export function loadedParts(surveyId: string): SurveyParts | undefined {
  const s = loaded.get(surveyId);
  if (!s) return undefined;
  return {
    ...(s.tin ? { tin: s.tin } : {}),
    ...(s.lines ? { lines: s.lines } : {}),
    ...(s.cloud ? { cloud: s.cloud } : {}),
    ...(s.blocks ? { blocks: s.blocks } : {}),
    ...(s.workings ? { workings: s.workings } : {}),
  };
}

/** Cota del terreno de un levantamiento con TIN en (x, y); null fuera de él o sin TIN. */
export function surveyElevation(surveyId: string, x: number, y: number): number | null {
  return loaded.get(surveyId)?.index?.elevationAt(x, y) ?? null;
}

/** ¿Están en este navegador los datos del levantamiento? */
export function isTopographyLoaded(surveyId: string): boolean {
  return loaded.has(surveyId);
}

/** Binarios de los assets que usa el proyecto (para exportar un `.cronos.json` autocontenido). */
export async function collectAssets(project: Project): Promise<Record<string, Uint8Array>> {
  const hashes = new Set(project.topography.flatMap(surveyAssetHashes));
  const out: Record<string, Uint8Array> = {};
  for (const hash of hashes) {
    if (!hash) continue;
    const bytes = await getAsset(hash);
    if (bytes) out[hash] = bytes;
  }
  return out;
}

/** Guarda en el navegador los assets que venían embebidos en un archivo. */
export async function storeEmbeddedAssets(embedded: Record<string, string>): Promise<void> {
  if (Object.keys(embedded).length === 0) return;
  const assets = await getCompute().api.extractAssets(embedded);
  await Promise.all(Object.entries(assets).map(([hash, bytes]) => putAsset(hash, bytes)));
}
