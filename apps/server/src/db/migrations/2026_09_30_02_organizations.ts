import { sql, type Kysely } from 'kysely';

/**
 * Empresas, miembros con rol, minas con acceso opcional y registro de auditoría (D-14).
 * Columnas en camelCase entre comillas, igual que las tablas de Better Auth.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table "organization" (
      "id" text primary key,
      "name" text not null,
      "createdAt" timestamptz not null default now()
    )`.execute(db);
  await sql`
    create table "member" (
      "id" text primary key,
      "organizationId" text not null references "organization" ("id") on delete cascade,
      "userId" text not null references "user" ("id") on delete cascade,
      "role" text not null check ("role" in ('admin', 'designer', 'reviewer')),
      "createdAt" timestamptz not null default now(),
      unique ("organizationId", "userId")
    )`.execute(db);
  await sql`create index "member_userId_idx" on "member" ("userId")`.execute(db);
  await sql`
    create table "mine" (
      "id" text primary key,
      "organizationId" text not null references "organization" ("id") on delete restrict,
      "name" text not null,
      "epsg" integer check ("epsg" > 0),
      "createdBy" text references "user" ("id") on delete set null,
      "createdAt" timestamptz not null default now()
    )`.execute(db);
  await sql`create index "mine_organizationId_idx" on "mine" ("organizationId")`.execute(db);
  await sql`
    create table "mine_access" (
      "mineId" text not null references "mine" ("id") on delete cascade,
      "userId" text not null references "user" ("id") on delete cascade,
      primary key ("mineId", "userId")
    )`.execute(db);
  await sql`
    create table "audit_event" (
      "id" text primary key,
      "organizationId" text not null references "organization" ("id") on delete restrict,
      "actorId" text references "user" ("id") on delete restrict,
      "at" timestamptz not null default now(),
      "action" text not null,
      "targetType" text not null,
      "targetId" text,
      "data" jsonb not null default '{}'
    )`.execute(db);
  await sql`create index "audit_event_organizationId_at_idx" on "audit_event" ("organizationId", "at" desc)`.execute(
    db,
  );
  // Auditoría inalterable (NF-07): la base rechaza modificar o borrar un evento.
  await sql`
    create function "audit_event_append_only"() returns trigger language plpgsql as $$
    begin
      raise exception 'audit_event is append-only';
    end $$`.execute(db);
  await sql`
    create trigger "audit_event_append_only" before update or delete on "audit_event"
    for each row execute function "audit_event_append_only"()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table "audit_event", "mine_access", "mine", "member", "organization"`.execute(db);
  await sql`drop function "audit_event_append_only"`.execute(db);
}
