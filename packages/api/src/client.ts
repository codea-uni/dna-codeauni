import { z } from 'zod';
import {
  apiErrorSchema,
  healthSchema,
  meSchema,
  okSchema,
  type ChangePassword,
  type Health,
  type Me,
  type SignIn,
  type UpdateMe,
} from './schemas';
import {
  auditListSchema,
  memberListSchema,
  memberSchema,
  mineDetailSchema,
  mineListSchema,
  mineSchema,
  organizationSchema,
  organizationListSchema,
  type AddMember,
  type AuditEvent,
  type CreateMine,
  type CreateOrganization,
  type Member,
  type Mine,
  type MineAccess,
  type MineDetail,
  type Organization,
  type UpdateMember,
  type UpdateMine,
} from './organizations';

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

  /** Usuario de la sesión; `ApiError` 401 si no hay sesión. */
  me(): Promise<Me> {
    return this.request('/me', meSchema);
  }

  async signIn(body: SignIn): Promise<void> {
    await this.request('/auth/sign-in/email', z.unknown(), { method: 'POST', body });
  }

  async signOut(): Promise<void> {
    await this.request('/auth/sign-out', z.unknown(), { method: 'POST', body: {} });
  }

  async changePassword(body: ChangePassword): Promise<void> {
    await this.request('/me/password', okSchema, { method: 'POST', body });
  }

  updateMe(body: UpdateMe): Promise<Me> {
    return this.request('/me', meSchema, { method: 'PATCH', body });
  }

  // Empresas, miembros, minas y auditoría (D-14)

  async organizations(): Promise<Organization[]> {
    return (await this.request('/organizations', organizationListSchema)).organizations;
  }

  createOrganization(body: CreateOrganization): Promise<Organization> {
    return this.request('/organizations', organizationSchema, { method: 'POST', body });
  }

  async members(orgId: string): Promise<Member[]> {
    return (await this.request(`/organizations/${enc(orgId)}/members`, memberListSchema)).members;
  }

  addMember(orgId: string, body: AddMember): Promise<Member> {
    return this.request(`/organizations/${enc(orgId)}/members`, memberSchema, {
      method: 'POST',
      body,
    });
  }

  updateMember(orgId: string, userId: string, body: UpdateMember): Promise<Member> {
    return this.request(`/organizations/${enc(orgId)}/members/${enc(userId)}`, memberSchema, {
      method: 'PATCH',
      body,
    });
  }

  async removeMember(orgId: string, userId: string): Promise<void> {
    await this.request(`/organizations/${enc(orgId)}/members/${enc(userId)}`, okSchema, {
      method: 'DELETE',
    });
  }

  async mines(orgId: string): Promise<Mine[]> {
    return (await this.request(`/organizations/${enc(orgId)}/mines`, mineListSchema)).mines;
  }

  createMine(orgId: string, body: CreateMine): Promise<Mine> {
    return this.request(`/organizations/${enc(orgId)}/mines`, mineSchema, { method: 'POST', body });
  }

  mine(mineId: string): Promise<MineDetail> {
    return this.request(`/mines/${enc(mineId)}`, mineDetailSchema);
  }

  updateMine(mineId: string, body: UpdateMine): Promise<Mine> {
    return this.request(`/mines/${enc(mineId)}`, mineSchema, { method: 'PATCH', body });
  }

  setMineAccess(mineId: string, body: MineAccess): Promise<Mine> {
    return this.request(`/mines/${enc(mineId)}/access`, mineSchema, { method: 'PUT', body });
  }

  async audit(orgId: string, limit = 100): Promise<AuditEvent[]> {
    return (
      await this.request(`/organizations/${enc(orgId)}/audit?limit=${limit}`, auditListSchema)
    ).events;
  }
}

const enc = encodeURIComponent;
