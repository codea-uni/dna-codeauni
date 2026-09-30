import {
  ApiError,
  type AddMember,
  type ApiClient,
  type CreateMine,
  type Member,
  type Mine,
  type MyOrganization,
  type Role,
  type UpdateMine,
} from '@cronos/api';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { MessageKey } from '../i18n';

/** La empresa del usuario (una por persona) con sus minas y miembros (modo servidor, D-14). */
export interface WorkspaceState {
  /** Llega con la sesión (`/me`); `null` si el usuario no pertenece a ninguna empresa. */
  organization: MyOrganization | null;
  mines: Mine[] | null;
  members: Member[] | null;
  /** Clave de i18n del último error (la UI la traduce). */
  error: MessageKey | null;
  busy: boolean;
  /** Fija la empresa de la sesión y carga sus minas. */
  setOrganization: (organization: MyOrganization | null) => Promise<void>;
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
    case 'version_conflict':
      return 'history.error.conflict';
    case 'no_changes':
      return 'history.error.noChanges';
    case 'other_organization':
      return 'workspace.error.otherOrganization';
    case 'organization_disabled':
      return 'workspace.error.organizationDisabled';
    case 'account_disabled':
      return 'auth.error.accountDisabled';
    case 'cannot_disable_self':
      return 'platform.error.cannotDisableSelf';
    default:
      return err.status >= 500 ? 'auth.error.unreachable' : 'auth.error.unexpected';
  }
}

/** Store del espacio de trabajo; recibe el cliente para poder probarlo con un `fetch` falso. */
export function createWorkspaceStore(api: ApiClient): WorkspaceStore {
  return create<WorkspaceState>((set, get) => {
    /** Ejecuta `fn` con el estado de ocupado y el error traducido; `true` si salió bien. */
    const run = async (fn: (orgId: string) => Promise<void>): Promise<boolean> => {
      const org = get().organization;
      if (!org || org.disabled) return false;
      const orgId = org.id;
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
      organization: null,
      mines: null,
      members: null,
      error: null,
      busy: false,

      setOrganization: async (organization) => {
        if (
          get().organization?.id === organization?.id &&
          get().organization?.disabled === organization?.disabled
        )
          return;
        set({ organization, mines: null, members: null, error: null });
        if (organization && !organization.disabled) await run(refreshMines);
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
        set({ organization: null, mines: null, members: null, error: null });
      },
    };
  });
}

/** Rol del usuario en su empresa. */
export function activeRole(s: WorkspaceState): Role | null {
  return s.organization?.role ?? null;
}
