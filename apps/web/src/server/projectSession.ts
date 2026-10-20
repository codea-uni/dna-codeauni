import { permissions, type Mine, type ProjectVersion, type Role } from '@cronos/api';
import { projectKind, type Project, type ProjectKind } from '@cronos/core';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import type { MessageKey } from '../i18n';
import { parseErrorText } from '../i18n/coreText';
import { latestDraft, loadWithoutSaving, readVersion, setDraftBase } from '../persistence/autosave';
import type { VersionInfo } from '../persistence/history';
import { getCompute, session } from '../session';
import { setRemoteAssetSource, storeEmbeddedAssets } from '../topography/session';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { api } from './api';

/** Proyecto de una mina abierto en el editor (modo servidor, D-14). */
export interface OpenProject {
  projectId: string;
  mine: Mine;
  role: Role;
  /** Versión cargada: la base de la próxima que se publique. */
  base: ProjectVersion;
  /** Número de la última versión del proyecto. */
  latestNumber: number;
  /** `true` si se abrió una versión anterior solo para consultarla. */
  viewingOld: boolean;
  /** Tipo del proyecto (herramienta a la que pertenece). */
  kind: ProjectKind;
  /**
   * Herramienta desde la que se mira (Cronos Open Pit o Underground). Si difiere de `kind`, el
   * proyecto se abrió desde la otra herramienta solo para visualizarlo (`isCrossView`).
   */
  tool: ProjectKind;
}

/** El proyecto es de la otra herramienta: se ve completo pero no se edita. */
export function isCrossView(cur: Pick<OpenProject, 'kind' | 'tool'> | null | undefined): boolean {
  return cur ? cur.kind !== cur.tool : false;
}

type SessionError = MessageKey | { text: string };

interface ProjectSessionState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  current: OpenProject | null;
  /** Proyecto tal como está en la versión base (para calcular qué cambió). */
  baseProject: Project | null;
  /** `document.version` justo después de cargar o publicar: si cambia, hay cambios sin publicar. */
  baseDocVersion: number;
  /** Borrador local más nuevo que la versión base, ofrecido para recuperar. */
  draft: VersionInfo | null;
  error: SessionError | null;
  /**
   * Abre la última versión o, con `version`, una anterior en solo lectura. `tool`: herramienta
   * desde la que se abre; si el proyecto es del otro tipo, se abre solo para visualizarlo.
   */
  open: (projectId: string, version?: number, tool?: ProjectKind) => Promise<void>;
  /** Vuelve a abrir aunque sea el mismo proyecto (tras restaurar, o para descartar cambios). */
  reload: () => Promise<void>;
  /** La publicación salió bien: la nueva versión pasa a ser la base. */
  published: (version: ProjectVersion, project: Project) => void;
  recoverDraft: () => Promise<void>;
  dismissDraft: () => void;
  close: () => void;
}

async function load(projectId: string, version?: number) {
  const [detail, text] = await Promise.all([
    api.project(projectId),
    api.versionContent(projectId, version ?? 'latest'),
  ]);
  const latest = detail.project.latest;
  const base =
    version === undefined || version === latest.number
      ? latest
      : (await api.versions(projectId)).find((v) => v.number === version);
  const parsed = await getCompute().api.parseProject(text);
  return { detail, base, parsed };
}

/**
 * Abrir un proyecto: metadatos y contenido desde la API; el JSON se parsea, migra y valida en el
 * worker (regla 2). Solo lectura para el revisor (H-801) y para versiones anteriores.
 */
/** Número de la última apertura pedida (las anteriores que terminen tarde se descartan). */
let openTicket = 0;

export const useProjectSession = create<ProjectSessionState>((set, get) => ({
  status: 'idle',
  current: null,
  baseProject: null,
  baseDocVersion: 0,
  draft: null,
  error: null,

  open: async (projectId, version, tool) => {
    // Aperturas seguidas (p. ej. el agente abre uno y otro dispositivo pide otro): solo cuenta la
    // última. Si una anterior termina después, no carga su contenido bajo el proyecto nuevo.
    const ticket = ++openTicket;
    const cur = get().current;
    const same =
      cur?.projectId === projectId &&
      (version === undefined ? !cur.viewingOld : cur.viewingOld && cur.base.number === version) &&
      (tool ?? cur.kind) === cur.tool;
    if (same && get().status === 'ready') return;
    set({ status: 'loading', error: null, draft: null });
    try {
      const { detail, base, parsed } = await load(projectId, version);
      if (ticket !== openTicket) return;
      if (!base) {
        set({ status: 'error', error: 'workspace.error.notFound' });
        return;
      }
      if (!parsed.ok) {
        set({ status: 'error', error: { text: parseErrorText(parsed.error) } });
        return;
      }
      const viewingOld = base.number !== detail.project.latest.number;
      const kind = projectKind(parsed.file.project);
      const viewTool = tool ?? kind;
      // Un proyecto de la otra herramienta se mira completo, sin editar (se trabaja en la suya).
      const editable = permissions.editDesign(detail.role) && !viewingOld && viewTool === kind;
      session.document.setReadOnly(false);
      setDraftBase(editable ? base.id : null);
      if (parsed.file.embeddedAssets) await storeEmbeddedAssets(parsed.file.embeddedAssets);
      if (ticket !== openTicket) return;
      // La topografía que no esté en este navegador se baja de la mina (D-16).
      const mineId = detail.mine.id;
      setRemoteAssetSource((hash) => api.asset(mineId, hash));
      loadWithoutSaving(parsed.file.project);
      session.document.setReadOnly(!editable);
      set({
        status: 'ready',
        current: {
          projectId,
          mine: detail.mine,
          role: detail.role,
          base,
          latestNumber: detail.project.latest.number,
          viewingOld,
          kind,
          tool: viewTool,
        },
        baseProject: parsed.file.project,
        baseDocVersion: session.document.version,
      });
      if (editable) {
        // Un borrador local posterior a la versión base: trabajo sin publicar de otra sesión.
        const draft = await latestDraft(projectId).catch(() => undefined);
        if (draft && Date.parse(draft.savedAt) > Date.parse(base.createdAt)) set({ draft });
      }
    } catch (err) {
      if (ticket === openTicket) set({ status: 'error', error: workspaceErrorKey(err) });
    }
  },

  reload: async () => {
    const cur = get().current;
    if (!cur) return;
    set({ current: null });
    await get().open(cur.projectId, undefined, cur.tool);
  },

  published: (version, project) => {
    const cur = get().current;
    if (!cur) return;
    setDraftBase(version.id);
    set({
      current: { ...cur, base: version, latestNumber: version.number },
      baseProject: project,
      baseDocVersion: session.document.version,
      draft: null,
    });
  },

  recoverDraft: async () => {
    const draft = get().draft;
    if (!draft) return;
    const saved = await readVersion(draft.id);
    set({ draft: null });
    if (!saved) return;
    const parsed = await getCompute().api.parseProject(saved.text);
    if (!parsed.ok) return;
    if (parsed.file.embeddedAssets) await storeEmbeddedAssets(parsed.file.embeddedAssets);
    loadWithoutSaving(parsed.file.project);
  },

  dismissDraft: () => {
    set({ draft: null });
  },

  close: () => {
    openTicket++;
    setRemoteAssetSource(null);
    session.document.setReadOnly(false);
    setDraftBase(null);
    set({ status: 'idle', current: null, baseProject: null, draft: null, error: null });
  },
}));

const subscribeDocument = (onChange: () => void) => session.document.subscribe(onChange);

/** `true` si el documento cambió desde la versión base (cambios sin publicar). */
export function useUnpublished(): boolean {
  const docVersion = useSyncExternalStore(subscribeDocument, () => session.document.version);
  const base = useProjectSession((s) => s.baseDocVersion);
  const ready = useProjectSession((s) => s.status === 'ready' && !s.current?.viewingOld);
  return ready && docVersion !== base;
}

/** Igual que `useUnpublished`, fuera de React (al salir del editor). */
export function hasUnpublished(): boolean {
  const s = useProjectSession.getState();
  return (
    s.status === 'ready' && !s.current?.viewingOld && session.document.version !== s.baseDocVersion
  );
}
