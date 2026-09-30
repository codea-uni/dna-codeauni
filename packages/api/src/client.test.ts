import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError } from './client';

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    seen.url = input instanceof Request ? input.url : input.toString();
    if (init) seen.init = init;
    const text = body === undefined ? '' : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status }));
  };
}

describe('ApiClient', () => {
  it('valida la respuesta y une la base sin barras dobles', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const api = new ApiClient({
      baseUrl: '/api/',
      fetch: fakeFetch(200, { status: 'ok', database: 'ok', version: '0.1.0' }, seen),
    });
    await expect(api.health()).resolves.toEqual({ status: 'ok', database: 'ok', version: '0.1.0' });
    expect(seen.url).toBe('/api/health');
    expect(seen.init?.credentials).toBe('include');
  });

  it('convierte el cuerpo de error en ApiError con su código', async () => {
    const api = new ApiClient({
      baseUrl: '/api',
      fetch: fakeFetch(403, { code: 'forbidden', message: 'reviewer cannot edit' }),
    });
    const err = await api.health().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: 'forbidden' });
  });

  it('rechaza una respuesta que no cumple el esquema', async () => {
    const api = new ApiClient({ baseUrl: '/api', fetch: fakeFetch(200, { status: 'maybe' }) });
    await expect(api.health()).rejects.toThrow();
  });
});
