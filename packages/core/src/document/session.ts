import { createEmptyProject } from '../model/factories';
import type { Project } from '../model/types';
import { DocumentStore } from './DocumentStore';
import { SelectionStore } from './SelectionStore';

export interface EditorSession {
  readonly document: DocumentStore;
  readonly selection: SelectionStore;
  dispose(): void;
}

/** Documento + selección, con la selección depurada cuando se borran taladros o se reemplaza el proyecto. */
export function createEditorSession(project: Project = createEmptyProject()): EditorSession {
  const document = new DocumentStore(project);
  const selection = new SelectionStore();
  const unsubscribe = document.subscribe((cs) => {
    if (cs.reset) selection.clear();
    else if (cs.holes.removed.length > 0) selection.remove(cs.holes.removed);
  });
  return { document, selection, dispose: unsubscribe };
}
