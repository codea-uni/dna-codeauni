import { sql, type Kysely } from 'kysely';

/**
 * Vibración compartida por mina: puntos de control de la mina (los ven y usan todos sus proyectos:
 * comunidad, taludes del tajo, labores) y mediciones de sismógrafo para calibrar la ley de
 * vibración (factor de terreno). `data` es el `MonitoringPoint` o el `SeismographRecord` del núcleo.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table "mine_monitoring_point" (
      "mineId" text not null references "mine" ("id") on delete cascade,
      "id" text not null,
      "data" jsonb not null,
      "sourceProjectId" text references "project" ("id") on delete set null,
      "createdBy" text references "user" ("id") on delete set null,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now(),
      primary key ("mineId", "id")
    )`.execute(db);
  await sql`
    create table "mine_vibration_record" (
      "mineId" text not null references "mine" ("id") on delete cascade,
      "id" text not null,
      "data" jsonb not null,
      "createdBy" text references "user" ("id") on delete set null,
      "createdAt" timestamptz not null default now(),
      primary key ("mineId", "id")
    )`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table "mine_vibration_record"`.execute(db);
  await sql`drop table "mine_monitoring_point"`.execute(db);
}
