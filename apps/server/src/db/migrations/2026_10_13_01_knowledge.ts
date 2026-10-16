import { sql, type Kysely } from 'kysely';

/**
 * Capas de conocimiento del agente (general → empresa → mina → proyecto) y catálogo de explosivos
 * de la empresa.
 * - `knowledge_doc`: un documento por capa; solo uno de `organizationId`/`mineId`/`projectId` según
 *   la capa (ninguno en la general).
 * - `knowledge_chunk`: el texto partido por títulos y párrafos, con su vector de búsqueda de texto
 *   en español (sin tildes, para que «voladura» y «VOLADURA» o «presion»/«presión» coincidan).
 * - `organization_explosive`: fichas de explosivos de la empresa; cada proyecto habilita las suyas
 *   copiándolas a la biblioteca del diseño.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create function "cronos_fold"(t text) returns text language sql immutable parallel safe as $$
      select translate(lower(t), 'áéíóúüñàèìòù', 'aeiouunaeiou')
    $$`.execute(db);

  await sql`
    create table "knowledge_doc" (
      "id" text primary key,
      "layer" text not null check ("layer" in ('general', 'organization', 'mine', 'project')),
      "organizationId" text references "organization" ("id") on delete cascade,
      "mineId" text references "mine" ("id") on delete cascade,
      "projectId" text references "project" ("id") on delete cascade,
      "category" text not null,
      "title" text not null,
      "source" text,
      "content" text not null,
      "createdBy" text references "user" ("id") on delete set null,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now(),
      check (
        ("layer" = 'general' and "organizationId" is null and "mineId" is null and "projectId" is null)
        or ("layer" = 'organization' and "organizationId" is not null and "mineId" is null and "projectId" is null)
        or ("layer" = 'mine' and "mineId" is not null and "organizationId" is null and "projectId" is null)
        or ("layer" = 'project' and "projectId" is not null and "organizationId" is null and "mineId" is null)
      )
    )`.execute(db);
  await sql`create index "knowledge_doc_owner_idx" on "knowledge_doc" ("layer", "organizationId", "mineId", "projectId")`.execute(
    db,
  );

  await sql`
    create table "knowledge_chunk" (
      "docId" text not null references "knowledge_doc" ("id") on delete cascade,
      "ordinal" integer not null,
      "heading" text,
      "text" text not null,
      "search" tsvector generated always as (
        setweight(to_tsvector('spanish', cronos_fold(coalesce("heading", ''))), 'A')
        || setweight(to_tsvector('spanish', cronos_fold("text")), 'B')
      ) stored,
      primary key ("docId", "ordinal")
    )`.execute(db);
  await sql`create index "knowledge_chunk_search_idx" on "knowledge_chunk" using gin ("search")`.execute(
    db,
  );

  await sql`
    create table "organization_explosive" (
      "organizationId" text not null references "organization" ("id") on delete cascade,
      "id" text not null,
      "name" text not null,
      "data" jsonb not null,
      "updatedBy" text references "user" ("id") on delete set null,
      "updatedAt" timestamptz not null default now(),
      primary key ("organizationId", "id"),
      unique ("organizationId", "name")
    )`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table "organization_explosive", "knowledge_chunk", "knowledge_doc"`.execute(db);
  await sql`drop function "cronos_fold"`.execute(db);
}
