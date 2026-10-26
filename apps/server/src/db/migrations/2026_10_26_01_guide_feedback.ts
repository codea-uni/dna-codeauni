import { sql, type Kysely } from 'kysely';

/**
 * Buzón de mejoras del agente guía: pedidos de cualquier persona («no funciona», «quisiera que…»,
 * «no entiendo…») con el contexto de la pantalla. El superadministrador los revisa, les pone tema
 * y estado y decide qué se programa. `organizationId` es null si lo envía el superadministrador
 * (no pertenece a ninguna empresa); `context` es JSON que arma el cliente (máx. 64 KB) y
 * `screenshot` una data URL JPEG/PNG opcional.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table "guide_feedback" (
      "id" text primary key,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now(),
      "organizationId" text references "organization" ("id") on delete cascade,
      "userId" text references "user" ("id") on delete set null,
      "mineId" text references "mine" ("id") on delete set null,
      "projectId" text references "project" ("id") on delete set null,
      "kind" text not null check ("kind" in ('bug', 'idea', 'question')),
      "text" text not null,
      "context" jsonb not null default '{}',
      "screenshot" text,
      "status" text not null default 'new'
        check ("status" in ('new', 'reviewing', 'approved', 'done', 'discarded')),
      "adminNote" text,
      "theme" text
    )`.execute(db);
  await sql`create index "guide_feedback_createdAt_idx" on "guide_feedback" ("createdAt" desc)`.execute(
    db,
  );
  await sql`create index "guide_feedback_status_idx" on "guide_feedback" ("status")`.execute(db);
  await sql`create index "guide_feedback_userId_idx" on "guide_feedback" ("userId", "createdAt")`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table "guide_feedback"`.execute(db);
}
