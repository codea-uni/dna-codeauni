import {
  moveXyz,
  newId,
  surveyPartsCentroid,
  workingKinds,
  workingTriangleOwners,
  type CloudSurfaceOptions,
  type DxfMeshLayer,
  type Op,
  type SurveyInput,
  type SurveyMove,
  type SurveyParts,
  type TopographySurvey,
  type Vec3,
  type WorkingKind,
  workingAxisPoints,
} from '@cronos/core';
import { downloadFile } from '../actions';
import { formatNumber, t } from '../i18n';
import { putAsset } from '../persistence/assets';
import { getCompute, getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { applyLocation, workingTargets } from '../underground/location';
import { useUndergroundStore, type UndergroundTab } from '../underground/store';
import {
  isTopographyLoaded,
  loadedParts,
  onTopographyChange,
  surveyParts,
  surveyWorkingKinds,
  workingKindsOps,
} from './session';

/**
 * Editar levantamientos ya importados: moverlos (traslación y giro en planta horneados en un
 * levantamiento nuevo), convertir una nube en superficie TIN, marcar el tipo de cada labor y
 * exportarlos a DXF. Todo vuelve como operaciones del documento (se deshacen) y los assets nuevos
 * se guardan en el navegador y, al publicar, en la mina, como al importar.
 */

const today = () => new Date().toISOString().slice(0, 10);

/** Centroide de un levantamiento cargado (null si no está en el navegador). */
export function surveyCentroid(surveyId: string): Vec3 | null {
  const parts = loadedParts(surveyId);
  return parts ? surveyPartsCentroid(parts) : null;
}

/** Entrada de `buildSurvey` con los metadatos del levantamiento original. */
function inputOf(s: TopographySurvey, name: string): SurveyInput {
  return {
    name,
    surveyDate: s.surveyDate,
    format: s.source.format,
    files: s.source.files,
    ...(s.epsg !== undefined ? { epsg: s.epsg } : {}),
    ...(s.source.sourceEpsg !== undefined ? { sourceEpsg: s.source.sourceEpsg } : {}),
    ...(s.source.transform ? { transform: s.source.transform } : {}),
    ...(s.blockModel ? { blockModel: s.blockModel } : {}),
  };
}

/** Nombre del levantamiento movido: el mismo con «(movido)» una sola vez. */
function movedName(name: string): string {
  const suffix = ` ${t('topo.xform.suffix')}`;
  return name.endsWith(suffix) ? name : `${name}${suffix}`;
}

/**
 * Mueve un levantamiento: el worker gira y traslada sus partes y arma uno nuevo (nuevos assets,
 * mismos metadatos, tipo de labores y registro del movimiento) que reemplaza al original en el
 * proyecto en el mismo lugar. El original queda en la mina (los levantamientos son inmutables).
 * Las voladuras que lo usaban pasan a usar el nuevo; un solo deshacer.
 */
export async function moveSurvey(
  survey: TopographySurvey,
  move: SurveyMove,
): Promise<TopographySurvey | null> {
  const parts = await surveyParts(survey.id);
  if (!parts) {
    useUiStore.getState().notify(t('topo.panel.missing'), 'error');
    return null;
  }
  const api = getCompute().api;
  const moved = await api.moveSurvey(parts, move);
  const built = await api.buildSurvey(inputOf(survey, movedName(survey.name)), moved);
  await Promise.all(built.assets.map((a) => putAsset(a.hash, a.bytes)));
  const next: TopographySurvey = {
    ...built.survey,
    id: newId<'TopographySurvey'>(),
    ...(survey.workingKinds ? { workingKinds: survey.workingKinds } : {}),
    transforms: [
      ...(survey.transforms ?? []),
      {
        dx: move.dx,
        dy: move.dy,
        dz: move.dz,
        rotationDeg: move.rotationDeg,
        pivot: { x: move.pivot.x, y: move.pivot.y },
        date: new Date().toISOString(),
        fromSurveyId: survey.id,
      },
    ],
  };
  const project = session.document.project;
  const ops: Op[] = [
    {
      type: 'project/patch',
      patch: { topography: project.topography.map((s) => (s.id === survey.id ? next : s)) },
    },
  ];
  for (const b of project.blasts)
    if (b.bench.topographyId === survey.id)
      ops.push({
        type: 'blast/patch',
        blastId: b.id,
        patch: { bench: { ...b.bench, topographyId: next.id } },
      });
  session.document.dispatch(ops, t('topo.xform.undo', { name: survey.name }));
  followLocations(survey.id, next.id);
  return next;
}

/**
 * El frente o los abanicos ubicados sobre una labor del levantamiento movido pasan a la misma labor
 * del nuevo (misma progresiva) en cuanto se carga.
 */
function followLocations(fromId: string, toId: string): void {
  const store = useUndergroundStore.getState();
  const tabs = (Object.keys(store.locations) as UndergroundTab[]).filter((tab) =>
    store.locations[tab]?.targetId.startsWith(`${fromId}:`),
  );
  if (tabs.length === 0) return;
  const apply = () => {
    if (!isTopographyLoaded(toId)) return false;
    const targets = workingTargets();
    for (const tab of tabs) {
      const loc = useUndergroundStore.getState().locations[tab];
      if (!loc) continue;
      const targetId = `${toId}:${loc.targetId.slice(fromId.length + 1)}`;
      const target = targets.find((x) => x.id === targetId);
      if (target) applyLocation(tab, target, { ...loc, targetId }, false);
    }
    return true;
  };
  if (!apply()) {
    const off = onTopographyChange(() => {
      if (apply()) off();
    });
  }
}

/** Malla de la vista previa: la del levantamiento movida (labores) o su caja envolvente. */
export function movePreviewMesh(
  survey: TopographySurvey,
  move: SurveyMove,
): { vertices: Float64Array; triangles: Uint32Array } {
  const w = loadedParts(survey.id)?.workings;
  if (w && w.vertices.length <= 3_000_000)
    return { vertices: moveXyz(w.vertices, move), triangles: w.triangles };
  const b = survey.bounds;
  const corners: number[] = [];
  for (const z of [b.minZ, b.maxZ])
    for (const [x, y] of [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ] as const)
      corners.push(x, y, z);
  // Caja: 6 caras de 2 triángulos (abajo 0–3, arriba 4–7).
  const faces = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7,
    4, 3, 4, 0,
  ];
  return { vertices: moveXyz(corners, move), triangles: Uint32Array.from(faces) };
}

/**
 * Lleva la cámara a ver juntos el lugar original y el movido; si están muy lejos (labores en
 * coordenadas locales llevadas a la mina), solo el lugar nuevo.
 */
export function frameMove(survey: TopographySurvey, from: Vec3, to: Vec3): void {
  const b = survey.bounds;
  const extent = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ, 10);
  const span = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const both = span <= extent * 4;
  useUiStore.getState().setViewMode('3d');
  getEngine()?.flyCamera({
    at: both ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 } : to,
    size: (both ? Math.max(extent, span) : extent) * 1.8,
    yawDeg: 200,
    pitchDeg: 18,
    mode: '3d',
  });
}

// ------------------------------------------------------------------ Tipo de labor

/** Cambia el tipo de una o varias labores (índices de eje) de un levantamiento; un deshacer. */
export function setWorkingKinds(
  survey: TopographySurvey,
  changes: ReadonlyMap<number, WorkingKind>,
): void {
  const kinds = surveyWorkingKinds(survey.id);
  if (kinds.length === 0) return;
  for (const [i, k] of changes) if (i >= 0 && i < kinds.length) kinds[i] = k;
  session.document.dispatch(
    workingKindsOps(survey.id, kinds),
    t('topo.kind.undo', { name: survey.name }),
  );
}

// ------------------------------------------------------------------ Nube → superficie

/**
 * Superficie TIN de una nube: el worker la genera y se agrega como un levantamiento de topografía
 * más (relieve, curvas, cota bajo el cursor, «usar en la voladura», vibración). Devuelve el nuevo
 * levantamiento, la celda usada y la fracción de celdas con varias alturas (túnel, voladizos).
 */
export async function cloudToSurveySurface(
  survey: TopographySurvey,
  options: CloudSurfaceOptions,
): Promise<{ survey: TopographySurvey; cell: number; overhangRatio: number } | null> {
  const cloud = loadedParts(survey.id)?.cloud;
  if (!cloud) return null;
  const api = getCompute().api;
  const r = await api.cloudSurface(cloud, options);
  if (r.tin.triangles.length === 0) {
    useUiStore.getState().notify(t('topo.surface.empty'), 'error');
    return null;
  }
  const name = t('topo.surface.name', { name: survey.name, cell: formatNumber(r.cell, 1) });
  const parts: SurveyParts = { tin: r.tin };
  const built = await api.buildSurvey(
    {
      name,
      surveyDate: survey.surveyDate || today(),
      format: 'points',
      files: survey.source.files,
      ...(survey.epsg !== undefined ? { epsg: survey.epsg } : {}),
    },
    parts,
  );
  await Promise.all(built.assets.map((a) => putAsset(a.hash, a.bytes)));
  const next: TopographySurvey = { ...built.survey, id: newId<'TopographySurvey'>() };
  session.document.dispatch(
    [
      {
        type: 'project/patch',
        patch: { topography: [...session.document.project.topography, next] },
      },
    ],
    t('topo.surface.undo', { name: survey.name }),
  );
  return { survey: next, cell: r.cell, overhangRatio: r.overhangRatio };
}

// ------------------------------------------------------------------ DXF

/** Solo los vértices que usan los triángulos (no se manda la malla entera por cada labor). */
function subMesh(
  vertices: ArrayLike<number>,
  triangles: readonly number[],
): { vertices: number[]; triangles: number[] } {
  const map = new Map<number, number>();
  const v: number[] = [];
  const tri = triangles.map((i) => {
    let j = map.get(i);
    if (j === undefined) {
      j = v.length / 3;
      map.set(i, j);
      v.push(vertices[i * 3] ?? 0, vertices[i * 3 + 1] ?? 0, vertices[i * 3 + 2] ?? 0);
    }
    return j;
  });
  return { vertices: v, triangles: tri };
}

/** Color ACI de cada tipo de labor en el DXF. */
const KIND_ACI: Record<WorkingKind, number> = {
  drift: 4,
  crosscut: 3,
  ramp: 40,
  bypass: 200,
  raise: 6,
  stope: 1,
  access: 33,
  other: 8,
};

/**
 * DXF del levantamiento con coordenadas absolutas: la topografía como 3DFACE (y sus líneas como
 * polilíneas 3D); las labores, cada una en su capa (`TIPO_NOMBRE`) con sus caras y su eje.
 */
export async function exportSurveyDxf(survey: TopographySurvey): Promise<void> {
  const parts = loadedParts(survey.id);
  if (!parts) {
    useUiStore.getState().notify(t('topo.panel.missing'), 'error');
    return;
  }
  const layers: DxfMeshLayer[] = [];
  if (parts.tin) layers.push({ name: 'TOPOGRAFIA', color: 9, meshes: [parts.tin] });
  if (parts.lines) {
    const l = parts.lines;
    const lines: Vec3[][] = [];
    for (let i = 0; i + 1 < l.offsets.length; i++) {
      const pts: Vec3[] = [];
      for (let k = l.offsets[i] ?? 0; k < (l.offsets[i + 1] ?? 0); k++)
        pts.push({
          x: l.coords[k * 3] ?? 0,
          y: l.coords[k * 3 + 1] ?? 0,
          z: l.coords[k * 3 + 2] ?? 0,
        });
      if (l.closed[i] && pts[0]) pts.push(pts[0]);
      lines.push(pts);
    }
    layers.push({ name: 'LINEAS', color: 30, lines });
  }
  const w = parts.workings;
  if (w) {
    const kinds = workingKinds(w, survey.workingKinds);
    const owners = workingTriangleOwners(w);
    const tris: number[][] = w.axes.map(() => []);
    const loose: number[] = [];
    for (let k = 0; k < owners.length; k++) {
      const o = owners[k] ?? -1;
      const list = o >= 0 ? tris[o] : loose;
      list?.push(w.triangles[k * 3] ?? 0, w.triangles[k * 3 + 1] ?? 0, w.triangles[k * 3 + 2] ?? 0);
    }
    w.axes.forEach((a, i) => {
      const kind = kinds[i] ?? 'other';
      layers.push({
        name: `${t(`topo.kind.${kind}`)}_${a.name}`,
        color: KIND_ACI[kind],
        meshes: [subMesh(w.vertices, tris[i] ?? [])],
        lines: [workingAxisPoints(w, i)],
      });
    });
    if (loose.length > 0)
      layers.push({ name: 'LABORES', color: 8, meshes: [subMesh(w.vertices, loose)] });
  }
  if (layers.length === 0) {
    useUiStore.getState().notify(t('topo.dxf.nothing'), 'error');
    return;
  }
  const text = await getCompute().api.meshesDxf(layers);
  const file = `${survey.name.replace(/[^\w\-. ]+/g, '_').trim() || 'levantamiento'}.dxf`;
  downloadFile(text, file, 'application/dxf');
  useUiStore.getState().notify(t('topo.dxf.done', { file }));
}
