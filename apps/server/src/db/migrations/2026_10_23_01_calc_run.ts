import { sql, type Kysely } from 'kysely';

/**
 * Registro del servicio de cálculo interno (`apps/calc`): una fila por corrida con quién la pidió
 * (empresa, mina, usuario, conversación), el módulo, la versión del motor, las entradas comprimidas,
 * el resultado y los tiempos. Trazabilidad y medición de uso por cliente. Sin claves foráneas: el
 * servicio anota lo que le dice el agente aunque la mina se borre después.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table "calc_run" (
      "id" text primary key,
      "createdAt" timestamptz not null default now(),
      "organizationId" text not null,
      "mineId" text not null,
      "userId" text not null,
      "conversationId" text,
      "sessionId" text,
      "module" text not null,
      "engineVersion" text not null,
      "ok" boolean not null,
      "errorCode" text,
      "durationMs" integer not null,
      "calcMs" integer not null,
      "flagged" boolean not null default false,
      "inputHash" text not null,
      "inputGzip" bytea not null,
      "inputBytes" integer not null,
      "result" jsonb
    )`.execute(db);
  await sql`create index "calc_run_org_created_idx" on "calc_run" ("organizationId", "createdAt" desc)`.execute(
    db,
  );
  await sql`create index "calc_run_user_created_idx" on "calc_run" ("userId", "createdAt" desc)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table "calc_run"`.execute(db);
}
