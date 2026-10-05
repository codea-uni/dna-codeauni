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
  organizationListSchema,
  platformOrganizationListSchema,
  platformOrganizationSchema,
  platformUserListSchema,
  platformUserSchema,
  type AddMember,
  type AddPlatformAdmin,
  type AuditEvent,
  type CreateMine,
  type CreatePlatformOrganization,
  type PlatformOrganization,
  type PlatformUser,
  type UpdatePlatformOrganization,
  type Member,
  type Mine,
  type MineAccess,
  type MineDetail,
  type Organization,
  type UpdateMember,
  type UpdateMine,
} from './organizations';
import {
  projectDetailSchema,
  projectListSchema,
  projectSummarySchema,
  timelineSchema,
  versionListSchema,
  versionSchema,
  type CreateProject,
  type ProjectDetail,
  type ProjectSummary,
  type ProjectVersion,
  type RestoreVersion,
  type Timeline,
  type TimelineQuery,
} from './projects';
import { aiGenerateResponseSchema, type AiGenerateRequest, type AiGenerateResponse } from './ai';
import {
  assetInfoSchema,
  missingAssetsResultSchema,
  mineSurveyListSchema,
  type AssetInfo,
  type MineSurvey,
} from './topography';

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
  /** Cuerpo JSON ya serializado (p. ej. un proyecto grande que serializó el worker). */
  rawBody?: string;
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
    const text = await this.requestText(path, options);
    return schema.parse(text === '' ? undefined : JSON.parse(text));
  }

  /**
   * Respuesta como texto, sin parsear. Para el contenido de un proyecto: el JSON grande se parsea
   * y valida en el worker (CLAUDE.md, regla 2), no en el hilo principal.
   */
  async requestText(path: string, options: RequestOptions = {}): Promise<string> {
    const body =
      options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    const init: RequestInit = {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
    };
    if (body !== undefined) init.body = body;
    if (options.signal) init.signal = options.signal;
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    const text = await res.text();
    if (!res.ok) throw errorFrom(res.status, text);
    return text;
  }

  /** Un turno del asistente de IA (Gemini detrás del servidor). */
  aiGenerate(body: AiGenerateRequest, signal?: AbortSignal): Promise<AiGenerateResponse> {
    return this.request('/ai/generate', aiGenerateResponseSchema, {
      method: 'POST',
      body,
      ...(signal ? { signal } : {}),
    });
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

  // Plataforma (superadministrador)

  async platformOrganizations(): Promise<PlatformOrganization[]> {
    return (await this.request('/platform/organizations', platformOrganizationListSchema))
      .organizations;
  }

  createPlatformOrganization(body: CreatePlatformOrganization): Promise<PlatformOrganization> {
    return this.request('/platform/organizations', platformOrganizationSchema, {
      method: 'POST',
      body,
    });
  }

  updatePlatformOrganization(
    orgId: string,
    body: UpdatePlatformOrganization,
  ): Promise<PlatformOrganization> {
    return this.request(`/platform/organizations/${enc(orgId)}`, platformOrganizationSchema, {
      method: 'PATCH',
      body,
    });
  }

  addPlatformAdmin(orgId: string, body: AddPlatformAdmin): Promise<PlatformOrganization> {
    return this.request(
      `/platform/organizations/${enc(orgId)}/admins`,
      platformOrganizationSchema,
      {
        method: 'POST',
        body,
      },
    );
  }

  /** Minas de una empresa, con sus proyectos y última versión (consola de la plataforma). */
  async platformMines(orgId: string): Promise<Mine[]> {
    return (await this.request(`/platform/organizations/${enc(orgId)}/mines`, mineListSchema))
      .mines;
  }

  async platformUsers(orgId: string): Promise<PlatformUser[]> {
    return (
      await this.request(`/platform/organizations/${enc(orgId)}/users`, platformUserListSchema)
    ).users;
  }

  setUserDisabled(userId: string, disabled: boolean): Promise<PlatformUser> {
    return this.request(`/platform/users/${enc(userId)}`, platformUserSchema, {
      method: 'PATCH',
      body: { disabled },
    });
  }

  // Proyectos y versiones (D-14)

  async projects(mineId: string): Promise<ProjectSummary[]> {
    return (await this.request(`/mines/${enc(mineId)}/projects`, projectListSchema)).projects;
  }

  createProject(mineId: string, body: CreateProject): Promise<ProjectSummary> {
    return this.request(`/mines/${enc(mineId)}/projects`, projectSummarySchema, {
      method: 'POST',
      body,
    });
  }

  /**
   * Como `createProject`, con el ProjectFile ya serializado: se arma el cuerpo sin volver a
   * parsear ni serializar el JSON grande en el hilo principal.
   */
  createProjectFromText(
    mineId: string,
    fileJson: string,
    message?: string,
  ): Promise<ProjectSummary> {
    const rawBody = `{"file":${fileJson}${message === undefined ? '' : `,"message":${JSON.stringify(message)}`}}`;
    return this.request(`/mines/${enc(mineId)}/projects`, projectSummarySchema, {
      method: 'POST',
      rawBody,
    });
  }

  project(projectId: string): Promise<ProjectDetail> {
    return this.request(`/projects/${enc(projectId)}`, projectDetailSchema);
  }

  async versions(projectId: string): Promise<ProjectVersion[]> {
    return (await this.request(`/projects/${enc(projectId)}/versions`, versionListSchema)).versions;
  }

  /** Publica el ProjectFile (ya serializado por el worker) como versión nueva. */
  publishVersionFromText(
    projectId: string,
    parentVersionId: string,
    message: string,
    fileJson: string,
  ): Promise<ProjectVersion> {
    const rawBody = `{"parentVersionId":${JSON.stringify(parentVersionId)},"message":${JSON.stringify(message)},"file":${fileJson}}`;
    return this.request(`/projects/${enc(projectId)}/versions`, versionSchema, {
      method: 'POST',
      rawBody,
    });
  }

  restoreVersion(projectId: string, number: number, body: RestoreVersion): Promise<ProjectVersion> {
    return this.request(`/projects/${enc(projectId)}/versions/${number}/restore`, versionSchema, {
      method: 'POST',
      body,
    });
  }

  /** Historial de la mina: versiones de todos sus proyectos, filtradas y paginadas. */
  timeline(mineId: string, query: TimelineQuery = {}): Promise<Timeline> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== '') params.set(k, String(v));
    const qs = params.size ? `?${params.toString()}` : '';
    return this.request(`/mines/${enc(mineId)}/versions${qs}`, timelineSchema);
  }

  // Topografía de la mina (D-16)

  /** Hashes que el servidor aún no tiene (para subir solo esos antes de publicar). */
  async missingAssets(mineId: string, hashes: readonly string[]): Promise<string[]> {
    if (hashes.length === 0) return [];
    const r = await this.request(
      `/mines/${enc(mineId)}/assets/missing`,
      missingAssetsResultSchema,
      {
        method: 'POST',
        body: { hashes },
      },
    );
    return r.missing;
  }

  /** Sube un asset `CRTS`; el servidor verifica que el hash coincida con el contenido. */
  async uploadAsset(mineId: string, hash: string, bytes: Uint8Array): Promise<AssetInfo> {
    const res = await this.fetchImpl(`${this.baseUrl}/mines/${enc(mineId)}/assets/${enc(hash)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes as BodyInit,
    });
    const text = await res.text();
    if (!res.ok) throw errorFrom(res.status, text);
    return assetInfoSchema.parse(JSON.parse(text));
  }

  /** Binario de un asset (inmutable: el navegador lo puede guardar en caché). */
  async asset(mineId: string, hash: string): Promise<Uint8Array> {
    const res = await this.fetchImpl(`${this.baseUrl}/mines/${enc(mineId)}/assets/${enc(hash)}`, {
      credentials: 'include',
    });
    if (!res.ok) throw errorFrom(res.status, await res.text());
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Levantamientos de la mina, del más nuevo al más viejo. */
  async surveys(mineId: string): Promise<MineSurvey[]> {
    return (await this.request(`/mines/${enc(mineId)}/surveys`, mineSurveyListSchema)).surveys;
  }

  /** URL para descargar el `.cronos.json` de una versión (mismo origen: la cookie viaja sola). */
  versionDownloadUrl(projectId: string, number: number): string {
    return `${this.baseUrl}/projects/${enc(projectId)}/versions/${number}/content?download=1`;
  }

  /** JSON del ProjectFile de una versión (`'latest'` = la última), sin parsear. */
  versionContent(projectId: string, version: number | 'latest'): Promise<string> {
    return this.requestText(`/projects/${enc(projectId)}/versions/${version}/content`);
  }

  async audit(orgId: string, limit = 100): Promise<AuditEvent[]> {
    return (
      await this.request(`/organizations/${enc(orgId)}/audit?limit=${limit}`, auditListSchema)
    ).events;
  }
}

const enc = encodeURIComponent;

/** `ApiError` a partir de una respuesta de error (cuerpo `ApiErrorBody` o cualquier otro). */
function errorFrom(status: number, text: string): ApiError {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  const parsed = apiErrorSchema.safeParse(body);
  return parsed.success
    ? new ApiError(status, parsed.data.code, parsed.data.message)
    : new ApiError(status, 'http_error', `HTTP ${String(status)}`);
}
