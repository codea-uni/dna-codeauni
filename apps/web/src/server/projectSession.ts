import { permissions, type Mine, type ProjectVersion, type Role } from '@cronos/api';
import { create } from 'zustand';
import type { MessageKey } from '../i18n';
import { parseErrorText } from '../i18n/coreText';
import { loadWithoutSaving } from '../persistence/autosave';
import { getCompute, session } from '../session';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { api } from './api';

/** Proyecto de una mina abierto en el editor (modo servidor, D-14). */
export interface OpenProject {
  projectId: string;
  mine: Mine;
  role: Role;
  /** Versión sobre la que se trabaja: la base de la próxima que se publique. */
  base: ProjectVersion;
}

interface ProjectSessionState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  current: OpenProject | null;
  /** Error de la API (clave de i18n) o del archivo (texto ya traducido). */
  error: MessageKey | { text: string } | null;
  open: (projectId: string) => Promise<void>;
  close: () => void;
}

/**
 * Abrir un proyecto: metadatos y contenido de la última versión desde la API; el JSON se parsea,
 * migra y valida en el worker (regla 2). Para el revisor el documento queda en solo lectura (H-801).
 */
export const useProjectSession = create<ProjectSessionState>((set, get) => ({
  status: 'idle',
  current: null,
  error: null,

  open: async (projectId) => {
    if (get().current?.projectId === projectId && get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      const [detail, text] = await Promise.all([
        api.project(projectId),
        api.versionContent(projectId, 'latest'),
      ]);
      const parsed = await getCompute().api.parseProject(text);
      if (!parsed.ok) {
        set({ status: 'error', error: { text: parseErrorText(parsed.error) } });
        return;
      }
      session.document.setReadOnly(false);
      loadWithoutSaving(parsed.file.project);
      session.document.setReadOnly(!permissions.editDesign(detail.role));
      set({
        status: 'ready',
        current: {
          projectId,
          mine: detail.mine,
          role: detail.role,
          base: detail.project.latest,
        },
      });
    } catch (err) {
      set({ status: 'error', error: workspaceErrorKey(err) });
    }
  },

  close: () => {
    session.document.setReadOnly(false);
    set({ status: 'idle', current: null, error: null });
  },
}));
