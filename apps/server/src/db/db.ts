import { Kysely, PostgresDialect, sql } from 'kysely';
import { Migrator, type MigrationProvider } from 'kysely/migration';
import pg from 'pg';
import { migrations } from './migrations';
import type { Database } from './schema';

export type Db = Kysely<Database>;

export function createPool(connectionString: string, searchPath?: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {}),
  });
}

export function createDb(pool: pg.Pool): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

const provider: MigrationProvider = { getMigrations: () => Promise.resolve(migrations) };

/**
 * Aplica las migraciones pendientes; si una falla, lanza el error y no aplica las siguientes.
 * `schema` fija dónde viven las tablas del migrador (las pruebas usan un esquema propio).
 */
export async function migrateToLatest(db: Db, schema?: string): Promise<string[]> {
  const migrator = new Migrator({
    db,
    provider,
    ...(schema ? { migrationTableSchema: schema } : {}),
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error)
    throw error instanceof Error ? error : new Error('Falló una migración', { cause: error });
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}

export async function pingDb(db: Db): Promise<boolean> {
  try {
    await sql`select 1`.execute(db);
    return true;
  } catch {
    return false;
  }
}
