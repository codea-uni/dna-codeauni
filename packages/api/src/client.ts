import type { z } from 'zod';
import { apiErrorSchema, healthSchema, type Health } from './schemas';

/** Error de la API con el estado HTTP y el `code` estable que la UI traduce. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  /** Base de la API, p. ej. `/api` (mismo origen) o `http://localhost:3000/api`. */
  baseUrl: string;
  /** Inyectable para pruebas; por defecto el `fetch` global. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Cliente HTTP tipado. Toda respuesta se valida con su esquema zod (borde de IO): si el servidor
 * responde algo inesperado, falla aquí y no más adentro de la app.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async request<S extends z.ZodType>(
    path: string,
    schema: S,
    options: RequestOptions = {},
  ): Promise<z.infer<S>> {
    const init: RequestInit = {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    if (options.signal) init.signal = options.signal;
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    const text = await res.text();
    const json: unknown = text === '' ? undefined : JSON.parse(text);
    if (!res.ok) {
      const parsed = apiErrorSchema.safeParse(json);
      throw parsed.success
        ? new ApiError(res.status, parsed.data.code, parsed.data.message)
        : new ApiError(res.status, 'http_error', `HTTP ${res.status}`);
    }
    return schema.parse(json);
  }

  health(signal?: AbortSignal): Promise<Health> {
    return this.request('/health', healthSchema, signal ? { signal } : {});
  }
}
