import { sql, type Kysely } from 'kysely';

/**
 * Nubes de puntos y modelos de bloques como levantamientos de la mina: dos tipos más de asset
 * `CRTS` (`cloud`, `blocks`). Solo se amplía el check de `kind`; los assets existentes no cambian.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table "topography_asset" drop constraint "topography_asset_kind_check"`.execute(
    db,
  );
  await sql`
    alter table "topography_asset" add constraint "topography_asset_kind_check"
    check ("kind" in ('tin', 'lines', 'image', 'cloud', 'blocks'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table "topography_asset" drop constraint "topography_asset_kind_check"`.execute(
    db,
  );
  await sql`
    alter table "topography_asset" add constraint "topography_asset_kind_check"
    check ("kind" in ('tin', 'lines', 'image'))`.execute(db);
}
