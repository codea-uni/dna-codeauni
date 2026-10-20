import { sql, type Kysely } from 'kysely';

/**
 * Labores subterráneas (sólidos y ejes de túneles) como levantamientos de la mina: un tipo más de
 * asset `CRTS` (`workings`). Solo se amplía el check de `kind`; los assets existentes no cambian.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table "topography_asset" drop constraint "topography_asset_kind_check"`.execute(
    db,
  );
  await sql`
    alter table "topography_asset" add constraint "topography_asset_kind_check"
    check ("kind" in ('tin', 'lines', 'image', 'cloud', 'blocks', 'workings'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table "topography_asset" drop constraint "topography_asset_kind_check"`.execute(
    db,
  );
  await sql`
    alter table "topography_asset" add constraint "topography_asset_kind_check"
    check ("kind" in ('tin', 'lines', 'image', 'cloud', 'blocks'))`.execute(db);
}
