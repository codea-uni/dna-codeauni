import { sql, type Kysely } from 'kysely';

/**
 * Tipo de proyecto (Cronos Open Pit / Cronos Underground). Los proyectos existentes quedan como
 * superficiales (`surface`). Se guarda en columna para listar y filtrar sin abrir las versiones;
 * el contenido de cada versión también lo lleva (`Project.kind`).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table "project" add column "kind" text not null default 'surface'
    check ("kind" in ('surface', 'underground'))`.execute(db);
  await sql`create index "project_mineId_kind_idx" on "project" ("mineId", "kind")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index "project_mineId_kind_idx"`.execute(db);
  await sql`alter table "project" drop column "kind"`.execute(db);
}
