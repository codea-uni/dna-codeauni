import { sql, type Kysely } from 'kysely';

/**
 * Proyectos de cada mina y sus versiones (D-14, NF-08). Una versión es **inmutable**: guarda el
 * ProjectFile completo (gzip) con autor, fecha, mensaje y hash; restaurar crea otra versión.
 * `versionCount` del proyecto es el número de la última versión y sirve de candado optimista.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table "project" (
      "id" text primary key,
      "mineId" text not null references "mine" ("id") on delete restrict,
      "name" text not null,
      "versionCount" integer not null default 0,
      "createdBy" text references "user" ("id") on delete set null,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    )`.execute(db);
  await sql`create index "project_mineId_idx" on "project" ("mineId")`.execute(db);
  await sql`
    create table "project_version" (
      "id" text primary key,
      "projectId" text not null references "project" ("id") on delete restrict,
      "number" integer not null check ("number" > 0),
      "parentVersionId" text references "project_version" ("id") on delete restrict,
      "restoredFromVersionId" text references "project_version" ("id") on delete restrict,
      "authorId" text not null references "user" ("id") on delete restrict,
      "createdAt" timestamptz not null default now(),
      "message" text not null,
      "projectName" text not null,
      "schemaVersion" integer not null,
      "holeCount" integer not null,
      "sizeBytes" integer not null,
      "contentHash" text not null,
      "content" bytea not null,
      "summary" jsonb,
      unique ("projectId", "number")
    )`.execute(db);
  await sql`create index "project_version_createdAt_idx" on "project_version" ("createdAt" desc)`.execute(
    db,
  );
  await sql`
    create function "project_version_immutable"() returns trigger language plpgsql as $$
    begin
      raise exception 'project_version is immutable';
    end $$`.execute(db);
  await sql`
    create trigger "project_version_immutable" before update or delete on "project_version"
    for each row execute function "project_version_immutable"()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table "project_version", "project"`.execute(db);
  await sql`drop function "project_version_immutable"`.execute(db);
}
