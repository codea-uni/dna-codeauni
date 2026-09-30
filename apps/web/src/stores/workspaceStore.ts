import {
  ApiError,
  type AddMember,
  type ApiClient,
  type CreateMine,
  type Member,
  type Mine,
  type Organization,
  type Role,
  type UpdateMine,
} from '@cronos/api';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { MessageKey } from '../i18n';

const ORG_KEY = 'cronos.organization';

/** Empresa activa y sus minas y miembros (modo servidor, D-14). */
export interface WorkspaceState {
  organizations: Organization[] | null;
  activeOrgId: string | null;
  mines: Mine[] | null;
  members: Member[] | null;
  /** Clave de i18n del último error (la UI la traduce). */
  error: MessageKey | null;
  busy: boolean;
  loadOrganizations: () => Promise<void>;
  setActiveOrganization: (id: string) => Promise<void>;
  createOrganization: (name: string) => Promise<boolean>;
  loadMines: () => Promise<void>;
  loadMembers: () => Promise<void>;
  createMine: (body: CreateMine) => Promise<Mine | null>;
  updateMine: (mineId: string, body: UpdateMine) => Promise<boolean>;
  setMineAccess: (mineId: string, userIds: string[]) => Promise<boolean>;
  addMember: (body: AddMember) => Promise<boolean>;
  updateMemberRole: (userId: string, role: Role) => Promise<boolean>;
  removeMember: (userId: string) => Promise<boolean>;
  clearError: () => void;
  /** Al cerrar sesión. */
  reset: () => void;
}

export type WorkspaceStore = UseBoundStore<StoreApi<WorkspaceState>>;

/** Traduce un fallo de la API a la clave de i18n que ve el usuario. */
export function workspaceErrorKey(err: unknown): MessageKey {
  if (!(err instanceof ApiError)) return 'auth.error.unreachable';
  switch (err.code) {
    case 'last_admin':
      return 'workspace.error.lastAdmin';
    case 'already_member':
      return 'workspace.error.alreadyMember';
    case 'password_required':
      return 'workspace.error.passwordRequired';
    case 'password_too_short':
      return 'auth.error.passwordTooShort';
    case 'forbidden':
      return 'workspace.error.forbidden';
    case 'not_found':
      return 'workspace.error.notFound';
    case 'crs_mismatch':
      return 'projects.error.crsMismatch';
    case 'invalid_project':
      return 'projects.error.invalid';
    default:
      return err.status >= 500 ? 'auth.error.unreachable' : 'auth.error.unexpected';
  }
}

function storedOrg(): string | null {
  try {
    return globalThis.localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

function storeOrg(id: string): void {
  try {
    globalThis.localStorage.setItem(ORG_KEY, id);
  } catch {
    // sin almacenamiento: la empresa activa dura la sesión
  }
}

/** Store del espacio de trabajo; recibe el cliente para poder probarlo con un `fetch` falso. */
export function createWorkspaceStore(api: ApiClient): WorkspaceStore {
  return create<WorkspaceState>((set, get) => {
    /** Ejecuta `fn` con el estado de ocupado y el error traducido; `true` si salió bien. */
    const run = async (fn: (orgId: string) => Promise<void>): Promise<boolean> => {
      const orgId = get().activeOrgId;
      if (!orgId) return false;
      set({ busy: true, error: null });
      try {
        await fn(orgId);
        return true;
      } catch (err) {
        set({ error: workspaceErrorKey(err) });
        return false;
      } finally {
        set({ busy: false });
      }
    };
    const refreshMembers = async (orgId: string) => {
      set({ members: await api.members(orgId) });
    };
    const refreshMines = async (orgId: string) => {
      set({ mines: await api.mines(orgId) });
    };

    return {
      organizations: null,
      activeOrgId: null,
      mines: null,
      members: null,
      error: null,
      busy: false,

      loadOrganizations: async () => {
        try {
          const organizations = await api.organizations();
          const wanted = get().activeOrgId ?? storedOrg();
          const active =
            organizations.find((o) => o.id === wanted)?.id ?? organizations[0]?.id ?? null;
          set({ organizations, error: null });
          if (active && active !== get().activeOrgId) await get().setActiveOrganization(active);
        } catch (err) {
          set({ error: workspaceErrorKey(err) });
        }
      },

      setActiveOrganization: async (id) => {
        storeOrg(id);
        set({ activeOrgId: id, mines: null, members: null });
        await run(refreshMines);
      },

      createOrganization: async (name) => {
        set({ busy: true, error: null });
        try {
          const org = await api.createOrganization({ name });
          set({ organizations: [...(get().organizations ?? []), org] });
          await get().setActiveOrganization(org.id);
          return true;
        } catch (err) {
          set({ error: workspaceErrorKey(err) });
          return false;
        } finally {
          set({ busy: false });
        }
      },

      loadMines: async () => {
        await run(refreshMines);
      },

      loadMembers: async () => {
        await run(refreshMembers);
      },

      createMine: async (body) => {
        let created: Mine | null = null;
        await run(async (orgId) => {
          created = await api.createMine(orgId, body);
          await refreshMines(orgId);
        });
        return created;
      },

      updateMine: (mineId, body) =>
        run(async (orgId) => {
          await api.updateMine(mineId, body);
          await refreshMines(orgId);
        }),

      setMineAccess: (mineId, userIds) =>
        run(async (orgId) => {
          await api.setMineAccess(mineId, { userIds });
          await refreshMines(orgId);
        }),

      addMember: (body) =>
        run(async (orgId) => {
          await api.addMember(orgId, body);
          await refreshMembers(orgId);
        }),

      updateMemberRole: (userId, role) =>
        run(async (orgId) => {
          await api.updateMember(orgId, userId, { role });
          await refreshMembers(orgId);
        }),

      removeMember: (userId) =>
        run(async (orgId) => {
          await api.removeMember(orgId, userId);
          await Promise.all([refreshMembers(orgId), refreshMines(orgId)]);
        }),

      clearError: () => {
        set({ error: null });
      },

      reset: () => {
        set({ organizations: null, activeOrgId: null, mines: null, members: null, error: null });
      },
    };
  });
}

/** Rol del usuario en la empresa activa. */
export function activeRole(s: WorkspaceState): Role | null {
  return s.organizations?.find((o) => o.id === s.activeOrgId)?.role ?? null;
}
