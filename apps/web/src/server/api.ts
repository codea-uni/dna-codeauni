import { ApiClient } from '@cronos/api';
import { createAuthStore } from '../stores/authStore';
import { createWorkspaceStore } from '../stores/workspaceStore';

/** Base de la API; vacía = modo local (sin login, solo autoguardado en el navegador). */
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Con servidor configurado, la app pide login y guarda las versiones en la mina (D-14). */
export const serverMode = API_BASE !== '';

/** Cliente de la API. En modo local no se usa. */
export const api = new ApiClient({ baseUrl: API_BASE || '/api' });

/** Sesión del usuario (solo tiene sentido en modo servidor). */
export const useAuth = createAuthStore(api);

/** Empresa activa, minas y miembros. */
export const useWorkspace = createWorkspaceStore(api);

// Al cerrar sesión no quedan datos de la empresa anterior en memoria.
useAuth.subscribe((s, prev) => {
  if (prev.status === 'authenticated' && s.status !== 'authenticated')
    useWorkspace.getState().reset();
});
