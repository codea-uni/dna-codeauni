import { sql, type Kysely } from 'kysely';

/**
 * Topografía de la mina (D-16).
 * - `topography_asset`: binarios `CRTS` por empresa, con clave (empresa, SHA-256): se guardan una
 *   vez aunque varios proyectos o levantamientos los usen, y son inmutables como las versiones.
 * - `topography_survey`: levantamientos de cada mina (metadatos del núcleo en `meta`). Un
 *   levantamiento pertenece a una sola mina; los proyectos lo referencian por id.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table "topography_asset" (
      "organizationId" text not null references "organization" ("id") on delete restrict,
      "hash" text not null check ("hash" ~ '^[0-9a-f]{64}$'),
      "kind" text not null check ("kind" in ('tin', 'lines', 'image')),
      "sizeBytes" integer not null,
      "content" bytea not null,
      "createdBy" text references "user" ("id") on delete set null,
      "createdAt" timestamptz not null default now(),
      primary key ("organizationId", "hash")
    )`.execute(db);
  await sql`
    create function "topography_asset_immutable"() returns trigger language plpgsql as $$
    begin
      raise exception 'topography_asset is immutable';
    end $$`.execute(db);
  await sql`
    create trigger "topography_asset_immutable" before update or delete on "topography_asset"
    for each row execute function "topography_asset_immutable"()`.execute(db);

  await sql`
    create table "topography_survey" (
      "id" text primary key,
      "mineId" text not null references "mine" ("id") on delete restrict,
      "name" text not null,
      "surveyDate" text not null,
      "meta" jsonb not null,
      "createdBy" text references "user" ("id") on delete set null,
      "createdAt" timestamptz not null default now()
    )`.execute(db);
  await sql`create index "topography_survey_mineId_idx" on "topography_survey" ("mineId", "surveyDate" desc)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table "topography_survey", "topography_asset"`.execute(db);
  await sql`drop function "topography_asset_immutable"`.execute(db);
}
