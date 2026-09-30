import { sql, type Kysely } from 'kysely';

/**
 * Una persona, una empresa; superadministrador de la plataforma; empresas y cuentas
 * desactivables (D-14).
 * - `user.isSuperAdmin`: ve todas las empresas, las crea y las desactiva.
 * - `user.disabledAt` / `organization.disabledAt`: desactivadas conservan sus datos e historial.
 * - `member.userId` único: si alguien pertenecía a varias empresas, conserva la más antigua.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table "user" add column "isSuperAdmin" boolean not null default false`.execute(
    db,
  );
  await sql`alter table "user" add column "disabledAt" timestamptz`.execute(db);
  await sql`alter table "organization" add column "disabledAt" timestamptz`.execute(db);
  await sql`
    delete from "member" m
    using "member" older
    where older."userId" = m."userId"
      and (older."createdAt", older."id") < (m."createdAt", m."id")`.execute(db);
  await sql`drop index "member_userId_idx"`.execute(db);
  await sql`create unique index "member_userId_key" on "member" ("userId")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index "member_userId_key"`.execute(db);
  await sql`create index "member_userId_idx" on "member" ("userId")`.execute(db);
  await sql`alter table "organization" drop column "disabledAt"`.execute(db);
  await sql`alter table "user" drop column "disabledAt", drop column "isSuperAdmin"`.execute(db);
}
