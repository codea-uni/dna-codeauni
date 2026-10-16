import { sql, type Kysely } from 'kysely';

/**
 * Presets de diseño: configuraciones guardadas (malla, carga, amarre, condiciones) que el agente
 * vuelve a aplicar con un nombre («usa el preset Banco 3370 mineral»). Son de la empresa o de una
 * mina (sitio); `steps` son los pasos de herramientas del agente con sus argumentos.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table "design_preset" (
      "id" text primary key,
      "organizationId" text not null references "organization" ("id") on delete cascade,
      "mineId" text references "mine" ("id") on delete cascade,
      "name" text not null,
      "description" text,
      "steps" jsonb not null,
      "createdBy" text references "user" ("id") on delete set null,
      "createdAt" timestamptz not null default now()
    )`.execute(db);
  await sql`create unique index "design_preset_name_idx" on "design_preset" ("organizationId", coalesce("mineId", ''), lower("name"))`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table "design_preset"`.execute(db);
}
