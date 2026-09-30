import type { DiffMarker, Project, ProjectDiff } from '@cronos/core';
import { create } from 'zustand';
import type { MessageKey } from '../i18n';
import { getCompute, getEngine, session } from '../session';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { api } from './api';

interface CompareState {
  /** Versión contra la que se compara el documento abierto. */
  against: number | null;
  diff: ProjectDiff | null;
  markers: DiffMarker[];
  busy: boolean;
  error: MessageKey | null;
  /** Compara el documento abierto con la versión `number` del proyecto. */
  start: (projectId: string, number: number) => Promise<void>;
  stop: () => void;
}

let baseline: Project | null = null;
let offDocument: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let run = 0;

/** Diff y marcadores en el worker (O(n) sobre taladros); descarta resultados viejos. */
async function recompute(set: (s: Partial<CompareState>) => void): Promise<void> {
  const base = baseline;
  if (!base) return;
  const mine = ++run;
  const { diff, markers } = await getCompute().api.compareVersions(base, session.document.project);
  // Otra comparación empezó o se cerró mientras el worker calculaba: el resultado ya no sirve.
  if (mine !== run) return;
  getEngine()?.setVersionDiff(markers);
  set({ diff, markers, busy: false });
}

/**
 * Comparación de versiones (D-14): el documento abierto contra una versión anterior del mismo
 * proyecto. El engine dibuja los marcadores; si el documento cambia, se recalcula.
 */
export const useCompare = create<CompareState>((set, get) => ({
  against: null,
  diff: null,
  markers: [],
  busy: false,
  error: null,

  start: async (projectId, number) => {
    get().stop();
    set({ against: number, busy: true, error: null });
    try {
      const text = await api.versionContent(projectId, number);
      const parsed = await getCompute().api.parseProject(text);
      if (!parsed.ok) throw new Error(parsed.error);
      baseline = parsed.file.project;
      await recompute(set);
      offDocument = session.document.subscribe(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void recompute(set), 300);
      });
    } catch (err) {
      baseline = null;
      set({ against: null, busy: false, error: workspaceErrorKey(err) });
    }
  },

  stop: () => {
    run++;
    baseline = null;
    offDocument?.();
    offDocument = null;
    if (timer) clearTimeout(timer);
    timer = null;
    getEngine()?.setVersionDiff(null);
    set({ against: null, diff: null, markers: [], busy: false });
  },
}));
