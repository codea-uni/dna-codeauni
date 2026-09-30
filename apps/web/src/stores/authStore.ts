import { ApiError, type ApiClient, type User } from '@cronos/api';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { MessageKey } from '../i18n';

const FAILED = Symbol('failed');

/**
 * - `loading`: consultando la sesión al arrancar.
 * - `anonymous`: sin sesión, se muestra el login.
 * - `authenticated`: con sesión; si `user.mustChangePassword`, primero se cambia la contraseña.
 * - `unreachable`: el servidor no responde; se ofrece reintentar.
 */
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'unreachable';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Clave de i18n del último error (la UI la traduce); `null` sin error. */
  error: MessageKey | null;
  busy: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  setLocale: (locale: User['locale']) => Promise<void>;
  clearError: () => void;
}

export type AuthStore = UseBoundStore<StoreApi<AuthState>>;

/** Traduce un fallo de la API a la clave de i18n que ve el usuario. */
export function authErrorKey(err: unknown): MessageKey {
  if (!(err instanceof ApiError)) return 'auth.error.unreachable';
  if (err.status === 429) return 'auth.error.tooManyAttempts';
  if (err.code === 'invalid_password') return 'auth.error.invalidPassword';
  if (err.code === 'password_too_short') return 'auth.error.passwordTooShort';
  if (err.status === 401) return 'auth.error.invalidCredentials';
  return err.status >= 500 ? 'auth.error.unreachable' : 'auth.error.unexpected';
}

/** Store de la sesión; recibe el cliente para poder probarlo con un `fetch` falso. */
export function createAuthStore(api: ApiClient): AuthStore {
  return create<AuthState>((set, get) => {
    const run = async <T>(fn: () => Promise<T>): Promise<T | typeof FAILED> => {
      set({ busy: true, error: null });
      try {
        return await fn();
      } catch (err) {
        set({ error: authErrorKey(err) });
        return FAILED;
      } finally {
        set({ busy: false });
      }
    };

    return {
      status: 'loading',
      user: null,
      error: null,
      busy: false,

      refresh: async () => {
        try {
          const { user } = await api.me();
          set({ status: 'authenticated', user, error: null });
        } catch (err) {
          if (err instanceof ApiError && err.status === 401)
            set({ status: 'anonymous', user: null, error: null });
          else set({ status: 'unreachable', user: null, error: authErrorKey(err) });
        }
      },

      signIn: async (email, password) => {
        const res = await run(async () => {
          await api.signIn({ email, password });
          return (await api.me()).user;
        });
        if (res === FAILED) return false;
        set({ status: 'authenticated', user: res });
        return true;
      },

      signOut: async () => {
        await run(() => api.signOut());
        set({ status: 'anonymous', user: null });
      },

      changePassword: async (currentPassword, newPassword) => {
        const res = await run(async () => {
          await api.changePassword({ currentPassword, newPassword });
          return (await api.me()).user;
        });
        if (res === FAILED) return false;
        set({ user: res });
        return true;
      },

      setLocale: async (locale) => {
        if (get().user?.locale === locale) return;
        const res = await run(() => api.updateMe({ locale }));
        if (res !== FAILED) set({ user: res.user });
      },

      clearError: () => {
        set({ error: null });
      },
    };
  });
}
