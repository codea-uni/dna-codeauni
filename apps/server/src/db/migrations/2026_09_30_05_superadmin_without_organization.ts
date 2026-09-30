import { sql, type Kysely } from 'kysely';

/**
 * El superadministrador es el dueño del software (D-15): no pertenece a ninguna empresa.
 * - Si alguien era superadministrador y miembro a la vez, conserva su empresa y deja de ser
 *   superadministrador (la empresa no se queda sin su administrador).
 * - La base impide volver a mezclarlos: ni sumar un superadministrador a una empresa ni volver
 *   superadministrador a un miembro.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    update "user" set "isSuperAdmin" = false
    where "isSuperAdmin" and exists (select 1 from "member" m where m."userId" = "user"."id")`.execute(
    db,
  );
  await sql`
    create function "member_not_superadmin"() returns trigger language plpgsql as $$
    begin
      if exists (select 1 from "user" u where u."id" = new."userId" and u."isSuperAdmin") then
        raise exception 'a platform superadmin cannot belong to an organization';
      end if;
      return new;
    end $$`.execute(db);
  await sql`
    create trigger "member_not_superadmin" before insert or update on "member"
    for each row execute function "member_not_superadmin"()`.execute(db);
  await sql`
    create function "superadmin_not_member"() returns trigger language plpgsql as $$
    begin
      if new."isSuperAdmin" and exists (select 1 from "member" m where m."userId" = new."id") then
        raise exception 'a member of an organization cannot be a platform superadmin';
      end if;
      return new;
    end $$`.execute(db);
  await sql`
    create trigger "superadmin_not_member" before insert or update of "isSuperAdmin" on "user"
    for each row execute function "superadmin_not_member"()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop trigger "superadmin_not_member" on "user"`.execute(db);
  await sql`drop function "superadmin_not_member"`.execute(db);
  await sql`drop trigger "member_not_superadmin" on "member"`.execute(db);
  await sql`drop function "member_not_superadmin"`.execute(db);
}
