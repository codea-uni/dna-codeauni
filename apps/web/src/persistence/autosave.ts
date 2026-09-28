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

/** Guarda el JSON ya serializado como versión del proyecto, según `planWrite`. */
export async function saveVersion(project: Project, text: string, now = new Date()): Promise<void> {
  const plan = planWrite(await listVersions(), project.id, now);
  const { meta, texts } = await tx('readwrite');
  const info = {
    projectId: project.id,
    name: project.name,
    savedAt: now.toISOString(),
    holes: project.blasts.reduce((n, b) => n + b.holes.length, 0),
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

let suppressNext = false;
/** Carga una versión sin volver a guardarla como nueva. */
export function loadWithoutSaving(project: Project): void {
  suppressNext = true;
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
  const off = session.document.subscribe(() => {
    if (suppressNext) {
      suppressNext = false;
      return;
    }
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
