import type { Project } from '@cronos/core';
import { APP_VERSION, getCompute, session } from '../session';
import { planWrite, type VersionInfo } from './history';

/** Versión autoguardada con el JSON del proyecto. */
export interface SavedVersion extends VersionInfo {
  text: string;
}

const DB_NAME = 'cronos';
/** Metadatos (livianos, se listan en cada guardado) y JSON (pesado, se lee solo al restaurar). */
const META = 'versions';
const TEXTS = 'texts';
const DEBOUNCE_MS = 1500;

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => {
      resolve(r.result);
    };
    r.onerror = () => {
      reject(r.error ?? new Error('IndexedDB'));
    };
  });
}

let db: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(META, { keyPath: 'id', autoIncrement: true });
      r.result.createObjectStore(TEXTS);
    };
    r.onsuccess = () => {
      resolve(r.result);
    };
    r.onerror = () => {
      reject(r.error ?? new Error('IndexedDB'));
    };
  });
  return db;
}

async function tx(mode: IDBTransactionMode) {
  const t = (await openDb()).transaction([META, TEXTS], mode);
  return { meta: t.objectStore(META), texts: t.objectStore(TEXTS) };
}

/** Versiones guardadas (sin el JSON), la más reciente primero. */
export async function listVersions(): Promise<VersionInfo[]> {
  const all = (await request((await tx('readonly')).meta.getAll())) as VersionInfo[];
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function readVersion(id: number): Promise<SavedVersion | undefined> {
  const { meta, texts } = await tx('readonly');
  const [info, text] = await Promise.all([
    request(meta.get(id)) as Promise<VersionInfo | undefined>,
    request(texts.get(id)) as Promise<string | undefined>,
  ]);
  return info && text !== undefined ? { ...info, text } : undefined;
}

let draftBase: string | null = null;
/**
 * Modo servidor: versión base del proyecto abierto. Cada borrador la guarda para saber, al volver
 * a abrir el proyecto, si el borrador se hizo sobre la última versión publicada.
 */
export function setDraftBase(versionId: string | null): void {
  draftBase = versionId;
}

/** Último borrador local del proyecto, si hay. */
export async function latestDraft(projectId: string): Promise<VersionInfo | undefined> {
  return (await listVersions()).find((v) => v.projectId === projectId);
}

/** Guarda el JSON ya serializado como versión del proyecto, según `planWrite`. */
export async function saveVersion(project: Project, text: string, now = new Date()): Promise<void> {
  const plan = planWrite(await listVersions(), project.id, now);
  const { meta, texts } = await tx('readwrite');
  const info = {
    projectId: project.id,
    name: project.name,
    savedAt: now.toISOString(),
    holes: project.blasts.reduce((n, b) => n + b.holes.length, 0),
    ...(draftBase === null ? {} : { baseVersionId: draftBase }),
    ...(plan.overwriteId === null ? {} : { id: plan.overwriteId }),
  };
  const id = await request(meta.put(info));
  await request(texts.put(text, id));
  for (const old of plan.deleteIds) {
    await request(meta.delete(old));
    await request(texts.delete(old));
  }
}

async function write(project: Project): Promise<void> {
  // Serializar es O(n) sobre taladros: va en el worker (CLAUDE.md, regla 2).
  const text = await getCompute().api.serializeProject(project, { appVersion: APP_VERSION });
  await saveVersion(project, text);
}

/**
 * Versión del documento que no hay que guardar: la de una carga (restaurar, abrir de la mina).
 * Se marca la versión exacta y no «el próximo cambio», porque el autoguardado puede no estar
 * suscrito en ese momento (el editor se está montando) y se saltaría un cambio real después.
 */
let skipVersion = -1;
/** Carga un proyecto sin volver a guardarlo como versión nueva. */
export function loadWithoutSaving(project: Project): void {
  skipVersion = session.document.version + 1;
  session.document.load(project);
}

/**
 * Autoguardado en IndexedDB (H-102): cada cambio del documento se guarda tras una pausa y al
 * ocultar la pestaña. Sin IndexedDB (modo privado restringido) solo avisa en la consola.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    dirty = false;
    write(session.document.project).catch((err: unknown) => {
      console.error('[autoguardado]', err);
    });
  };
  const off = session.document.subscribe((_changes, store) => {
    if (store.version === skipVersion) return;
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onHide);
  return () => {
    flush();
    off();
    document.removeEventListener('visibilitychange', onHide);
  };
}
