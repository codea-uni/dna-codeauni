import {
  decodeAsset,
  newId,
  type BlastId,
  type Op,
  type Project,
  type SurveyInput,
  type SurveyParts,
  type TinData,
  type TopographySurvey,
} from '@cronos/core';
import { getAsset, putAsset } from '../persistence/assets';
import { getCompute, getEngine, session } from '../session';

/**
 * Topografía cargada en la sesión (D-16): los levantamientos que usa el proyecto, decodificados
 * de sus assets `CRTS` (vistas sobre el binario, sin copiar) y enviados al motor.
 */
const tins = new Map<string, TinData>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

export function topographyTin(surveyId: string): TinData | undefined {
  return tins.get(surveyId);
}

/** Avisa cuando cambia lo cargado (para paneles). Devuelve la función para dejar de escuchar. */
export function onTopographyChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Pasa al motor lo que esté cargado (al montar el visor o al cargar un levantamiento). */
export function applyTopographyToEngine(): void {
  getEngine()?.setTopographyTins(new Map(tins));
}

async function load(survey: TopographySurvey): Promise<void> {
  const hash = survey.assets.tin;
  if (!hash || tins.has(survey.id) || loading.has(survey.id)) return;
  loading.add(survey.id);
  try {
    const bytes = await getAsset(hash);
    if (!bytes) {
      console.warn(`[topografía] falta el asset ${hash} del levantamiento «${survey.name}»`);
      return;
    }
    const asset = decodeAsset(bytes);
    if (asset.kind === 'tin') tins.set(survey.id, asset.tin);
  } finally {
    loading.delete(survey.id);
  }
}

/** Carga lo que falte del proyecto y suelta lo que ya no usa. */
export async function syncTopography(project: Project): Promise<void> {
  const ids = new Set(project.topography.map((s) => s.id as string));
  let changed = false;
  for (const id of [...tins.keys()])
    if (!ids.has(id)) {
      tins.delete(id);
      changed = true;
    }
  const before = tins.size;
  await Promise.all(project.topography.map(load));
  if (changed || tins.size !== before) {
    applyTopographyToEngine();
    for (const l of listeners) l();
  }
}

/** Mantiene la topografía cargada al día con el documento. */
export function startTopographySync(): () => void {
  let last = session.document.project.topography;
  void syncTopography(session.document.project);
  return session.document.subscribe((_cs, store) => {
    if (store.project.topography === last) return;
    last = store.project.topography;
    void syncTopography(store.project);
  });
}

/**
 * Crea un levantamiento: el worker codifica sus partes, los assets se guardan en el navegador y
 * se devuelven las operaciones para agregarlo al documento (y, si se indica, usarlo en el banco).
 */
export async function createSurveyOps(
  input: SurveyInput,
  parts: SurveyParts,
  useInBlast?: BlastId,
): Promise<{ ops: Op[]; survey: TopographySurvey }> {
  const built = await getCompute().api.buildSurvey(input, parts);
  await Promise.all(built.assets.map((a) => putAsset(a.hash, a.bytes)));
  const survey: TopographySurvey = { ...built.survey, id: newId<'TopographySurvey'>() };
  const project = session.document.project;
  const ops: Op[] = [
    { type: 'project/patch', patch: { topography: [...project.topography, survey] } },
  ];
  const blast = useInBlast ? project.blasts.find((b) => b.id === useInBlast) : undefined;
  if (blast)
    ops.push({
      type: 'blast/patch',
      blastId: blast.id,
      patch: { bench: { ...blast.bench, topographyId: survey.id } },
    });
  return { ops, survey };
}

/** Binarios de los assets que usa el proyecto (para exportar un `.cronos.json` autocontenido). */
export async function collectAssets(project: Project): Promise<Record<string, Uint8Array>> {
  const hashes = new Set(
    project.topography.flatMap((s) => [s.assets.tin, s.assets.lines, s.assets.image]),
  );
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
