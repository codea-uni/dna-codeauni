/**
 * Registro de cada corrida: quién (empresa, mina, usuario, conversación), qué (módulo, versión del
 * motor, entradas, resultados), cuánto tardó y si terminó bien. Sirve para trazabilidad y para medir
 * el uso por cliente. Las entradas se guardan comprimidas (un proyecto pesa varios MB).
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

export interface Caller {
  organizationId: string;
  mineId: string;
  userId: string;
  conversationId: string | null;
}

export interface RunRecord {
  id: string;
  createdAt: Date;
  caller: Caller;
  sessionId: string | null;
  module: string;
  engineVersion: string;
  ok: boolean;
  errorCode: string | null;
  /** Tiempo total (cola + cálculo) y solo de cálculo [ms]. */
  durationMs: number;
  calcMs: number;
  /** Barrido de un solo parámetro detectado en esta corrida. */
  flagged: boolean;
  input: unknown;
  result: unknown;
}

export interface RunSummary extends Omit<RunRecord, 'input' | 'result' | 'caller'> {
  organizationId: string;
  mineId: string;
  userId: string;
  conversationId: string | null;
  inputHash: string;
}

export interface RunFilter {
  organizationId?: string;
  mineId?: string;
  userId?: string;
  module?: string;
  since?: Date;
  limit: number;
}

export interface RunLog {
  add(r: RunRecord): Promise<void>;
  list(f: RunFilter): Promise<RunSummary[]>;
  close(): Promise<void>;
}

export const inputHash = (input: unknown) =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');

const summary = (r: RunRecord): RunSummary => ({
  id: r.id,
  createdAt: r.createdAt,
  organizationId: r.caller.organizationId,
  mineId: r.caller.mineId,
  userId: r.caller.userId,
  conversationId: r.caller.conversationId,
  sessionId: r.sessionId,
  module: r.module,
  engineVersion: r.engineVersion,
  ok: r.ok,
  errorCode: r.errorCode,
  durationMs: r.durationMs,
  calcMs: r.calcMs,
  flagged: r.flagged,
  inputHash: inputHash(r.input),
});

const matches = (s: RunSummary, f: RunFilter) =>
  (!f.organizationId || s.organizationId === f.organizationId) &&
  (!f.mineId || s.mineId === f.mineId) &&
  (!f.userId || s.userId === f.userId) &&
  (!f.module || s.module === f.module) &&
  (!f.since || s.createdAt >= f.since);

/** En memoria (pruebas, o sin base de datos configurada): las últimas `max` corridas. */
export class MemoryRunLog implements RunLog {
  private readonly rows: RunSummary[] = [];
  constructor(private readonly max = 5000) {}
  add(r: RunRecord) {
    this.rows.unshift(summary(r));
    this.rows.length = Math.min(this.rows.length, this.max);
    return Promise.resolve();
  }
  list(f: RunFilter) {
    return Promise.resolve(this.rows.filter((s) => matches(s, f)).slice(0, f.limit));
  }
  close() {
    return Promise.resolve();
  }
}

interface CalcRunTable {
  id: string;
  createdAt: Date;
  organizationId: string;
  mineId: string;
  userId: string;
  conversationId: string | null;
  sessionId: string | null;
  module: string;
  engineVersion: string;
  ok: boolean;
  errorCode: string | null;
  durationMs: number;
  calcMs: number;
  flagged: boolean;
  inputHash: string;
  inputGzip: Buffer;
  inputBytes: number;
  result: unknown;
}

/** En PostgreSQL (tabla `calc_run`, migración del servidor `2026_10_23_01_calc_run`). */
export class PgRunLog implements RunLog {
  private readonly db: Kysely<{ calc_run: CalcRunTable }>;
  private readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 4 });
    this.db = new Kysely({ dialect: new PostgresDialect({ pool: this.pool }) });
  }
  async add(r: RunRecord) {
    const json = Buffer.from(JSON.stringify(r.input));
    const s = summary(r);
    await this.db
      .insertInto('calc_run')
      .values({
        ...s,
        inputGzip: gzipSync(json),
        inputBytes: json.length,
        result: JSON.stringify(r.result ?? null),
      })
      .execute();
  }
  async list(f: RunFilter): Promise<RunSummary[]> {
    let q = this.db
      .selectFrom('calc_run')
      .select([
        'id',
        'createdAt',
        'organizationId',
        'mineId',
        'userId',
        'conversationId',
        'sessionId',
        'module',
        'engineVersion',
        'ok',
        'errorCode',
        'durationMs',
        'calcMs',
        'flagged',
        'inputHash',
      ])
      .orderBy('createdAt', 'desc')
      .limit(f.limit);
    if (f.organizationId) q = q.where('organizationId', '=', f.organizationId);
    if (f.mineId) q = q.where('mineId', '=', f.mineId);
    if (f.userId) q = q.where('userId', '=', f.userId);
    if (f.module) q = q.where('module', '=', f.module);
    if (f.since) q = q.where('createdAt', '>=', f.since);
    return q.execute();
  }
  async close() {
    await this.db.destroy();
  }
}
