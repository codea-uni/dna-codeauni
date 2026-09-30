import { ApiClient } from '@cronos/api';
import { describe, expect, it } from 'vitest';
import { createAuthStore } from './authStore';

const USER = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@mina.pe',
  locale: 'es',
  mustChangePassword: false,
  isSuperAdmin: false,
} as const;
const ORG = { id: 'o1', name: 'Minera Sur', role: 'designer', disabled: false } as const;

type Handler = (path: string, init?: RequestInit) => [number, unknown];

/** API falsa: cada ruta responde lo que diga el `handler` (o lanza si es `null`: sin red). */
function store(handler: Handler | null) {
  const api = new ApiClient({
    baseUrl: '/api',
    fetch: (input, init) => {
      if (!handler) return Promise.reject(new TypeError('Failed to fetch'));
      const url = input instanceof Request ? input.url : input.toString();
      const [status, body] = handler(url.replace('/api', ''), init);
      return Promise.resolve(
        new Response(body === undefined ? '' : JSON.stringify(body), { status }),
      );
    },
  });
  return createAuthStore(api);
}

describe('authStore', () => {
  it('sin sesión queda anónimo y con sesión, autenticado', async () => {
    const anon = store(() => [401, { code: 'unauthorized', message: '' }]);
    await anon.getState().refresh();
    expect(anon.getState().status).toBe('anonymous');

    const auth = store(() => [200, { user: USER, organization: ORG }]);
    await auth.getState().refresh();
    expect(auth.getState()).toMatchObject({
      status: 'authenticated',
      user: USER,
      organization: ORG,
    });
  });

  it('sin red queda en «sin conexión» con su mensaje', async () => {
    const s = store(null);
    await s.getState().refresh();
    expect(s.getState()).toMatchObject({ status: 'unreachable', error: 'auth.error.unreachable' });
  });

  it('entrar con credenciales malas deja el error traducible y no autentica', async () => {
    const s = store((path) =>
      path === '/auth/sign-in/email'
        ? [401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: '' }]
        : [401, {}],
    );
    await s.getState().refresh();
    expect(await s.getState().signIn('ana@mina.pe', 'mala')).toBe(false);
    expect(s.getState()).toMatchObject({
      status: 'anonymous',
      error: 'auth.error.invalidCredentials',
    });
  });

  it('el sexto intento bloqueado (429) se explica aparte', async () => {
    const s = store(() => [429, { code: 'TOO_MANY_REQUESTS', message: '' }]);
    expect(await s.getState().signIn('ana@mina.pe', 'x')).toBe(false);
    expect(s.getState().error).toBe('auth.error.tooManyAttempts');
  });

  it('entrar y salir', async () => {
    let signedIn = false;
    const s = store((path) => {
      if (path === '/auth/sign-in/email') signedIn = true;
      if (path === '/auth/sign-out') signedIn = false;
      if (path === '/me') return signedIn ? [200, { user: USER, organization: ORG }] : [401, {}];
      return [200, {}];
    });
    expect(await s.getState().signIn('ana@mina.pe', 'buena')).toBe(true);
    expect(s.getState()).toMatchObject({ status: 'authenticated', user: USER, busy: false });
    await s.getState().signOut();
    expect(s.getState()).toMatchObject({ status: 'anonymous', user: null });
  });

  it('cambiar la contraseña actualiza la marca de contraseña temporal', async () => {
    let temporary = true;
    const s = store((path) => {
      if (path === '/me/password') {
        temporary = false;
        return [200, { ok: true }];
      }
      return [200, { user: { ...USER, mustChangePassword: temporary }, organization: ORG }];
    });
    await s.getState().refresh();
    expect(s.getState().user?.mustChangePassword).toBe(true);
    expect(await s.getState().changePassword('temporal-123', 'definitiva-456')).toBe(true);
    expect(s.getState().user?.mustChangePassword).toBe(false);
  });

  it('una contraseña actual incorrecta muestra su propio error', async () => {
    const s = store((path) =>
      path === '/me/password'
        ? [400, { code: 'invalid_password', message: '' }]
        : [200, { user: USER, organization: ORG }],
    );
    expect(await s.getState().changePassword('mala', 'definitiva-456')).toBe(false);
    expect(s.getState().error).toBe('auth.error.invalidPassword');
  });

  it('una cuenta desactivada por la plataforma lo explica al entrar', async () => {
    const s = store(() => [403, { code: 'account_disabled', message: '' }]);
    expect(await s.getState().signIn('ana@mina.pe', 'x')).toBe(false);
    expect(s.getState().error).toBe('auth.error.accountDisabled');
  });
});
