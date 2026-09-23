import type { Blast, HoleId, Project } from '@blastlab/core';
import { useSyncExternalStore } from 'react';
import { session } from '../session';

const { document, selection } = session;

const subscribeDocument = (onChange: () => void) => document.subscribe(onChange);
const subscribeSelection = (onChange: () => void) => selection.subscribe(onChange);

/** Proyecto actual. Es inmutable: la referencia cambia solo cuando hay cambios. */
export function useProject(): Project {
  return useSyncExternalStore(subscribeDocument, () => document.project);
}

export function useActiveBlast(): Blast | undefined {
  return useProject().blasts[0];
}

export function useSelectionIds(): ReadonlySet<HoleId> {
  return useSyncExternalStore(subscribeSelection, () => selection.ids);
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | undefined;
  redoLabel: string | undefined;
}

let cachedHistory: HistoryState | null = null;
let cachedVersion = -1;
function historySnapshot(): HistoryState {
  if (cachedHistory === null || cachedVersion !== document.version) {
    cachedVersion = document.version;
    cachedHistory = {
      canUndo: document.canUndo,
      canRedo: document.canRedo,
      undoLabel: document.undoLabel,
      redoLabel: document.redoLabel,
    };
  }
  return cachedHistory;
}

export function useHistory(): HistoryState {
  return useSyncExternalStore(subscribeDocument, historySnapshot);
}
