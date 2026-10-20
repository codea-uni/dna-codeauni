import type { MinePoint } from '@cronos/api';
import {
  monitoringPointSchema,
  seismographRecordSchema,
  type MonitoringPoint,
  type SeismographRecord,
} from '@cronos/core';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';
import type { MineRow } from './access';
import { recordAudit } from './audit';

/** Puntos de control de la mina, del más nuevo al más viejo (se descartan los que no validan). */
export async function listMinePoints(db: Kysely<Database>, mineId: string): Promise<MinePoint[]> {
  const rows = await db
    .selectFrom('mine_monitoring_point as m')
    .leftJoin('project as p', 'p.id', 'm.sourceProjectId')
    .leftJoin('user as u', 'u.id', 'm.createdBy')
    .select([
      'm.data',
      'm.sourceProjectId',
      'p.name as projectName',
      'u.name as userName',
      'm.updatedAt',
    ])
    .where('m.mineId', '=', mineId)
    .orderBy('m.createdAt', 'asc')
    .execute();
  const out: MinePoint[] = [];
  for (const r of rows) {
    const point = monitoringPointSchema.safeParse(r.data);
    if (!point.success) continue;
    out.push({
      point: point.data,
      sourceProjectId: r.sourceProjectId,
      sourceProjectName: r.projectName,
      createdBy: r.userName,
      updatedAt: r.updatedAt.toISOString(),
    });
  }
  return out;
}

/** Crea o reemplaza un punto de la mina (mismo id que el del proyecto que lo compartió). */
export async function saveMinePoint(
  db: Kysely<Database>,
  mine: MineRow,
  point: MonitoringPoint,
  sourceProjectId: string | null,
  userId: string,
): Promise<MinePoint> {
  // Un proyecto de otra mina no queda como origen.
  let source: string | null = null;
  if (sourceProjectId) {
    const p = await db
      .selectFrom('project')
      .select('id')
      .where('id', '=', sourceProjectId)
      .where('mineId', '=', mine.id)
      .executeTakeFirst();
    source = p?.id ?? null;
  }
  await db
    .insertInto('mine_monitoring_point')
    .values({
      mineId: mine.id,
      id: point.id,
      data: JSON.stringify(point),
      sourceProjectId: source,
      createdBy: userId,
    })
    .onConflict((oc) =>
      oc
        .columns(['mineId', 'id'])
        .doUpdateSet({ data: JSON.stringify(point), updatedAt: new Date() }),
    )
    .execute();
  await recordAudit(db, {
    organizationId: mine.organizationId,
    actorId: userId,
    action: 'mine_point.save',
    targetType: 'mine',
    targetId: mine.id,
    data: { name: point.name },
  });
  const all = await listMinePoints(db, mine.id);
  const saved = all.find((p) => p.point.id === point.id);
  if (!saved) throw new Error('mine point not saved');
  return saved;
}

export async function deleteMinePoint(
  db: Kysely<Database>,
  mine: MineRow,
  pointId: string,
  userId: string,
): Promise<boolean> {
  const r = await db
    .deleteFrom('mine_monitoring_point')
    .where('mineId', '=', mine.id)
    .where('id', '=', pointId)
    .executeTakeFirst();
  const removed = Number(r.numDeletedRows) > 0;
  if (removed)
    await recordAudit(db, {
      organizationId: mine.organizationId,
      actorId: userId,
      action: 'mine_point.delete',
      targetType: 'mine',
      targetId: mine.id,
      data: { id: pointId },
    });
  return removed;
}

/** Mediciones de sismógrafo de la mina, por fecha. */
export async function listVibrationRecords(
  db: Kysely<Database>,
  mineId: string,
): Promise<SeismographRecord[]> {
  const rows = await db
    .selectFrom('mine_vibration_record')
    .select('data')
    .where('mineId', '=', mineId)
    .orderBy('createdAt', 'asc')
    .orderBy('id', 'asc')
    .execute();
  const out: SeismographRecord[] = [];
  for (const r of rows) {
    const rec = seismographRecordSchema.safeParse(r.data);
    if (rec.success) out.push(rec.data);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Crea o reemplaza mediciones (por id) en una transacción. */
export async function saveVibrationRecords(
  db: Kysely<Database>,
  mine: MineRow,
  records: readonly SeismographRecord[],
  userId: string,
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      await tx
        .insertInto('mine_vibration_record')
        .values(
          chunk.map((r) => ({
            mineId: mine.id,
            id: r.id,
            data: JSON.stringify(r),
            createdBy: userId,
          })),
        )
        .onConflict((oc) =>
          oc.columns(['mineId', 'id']).doUpdateSet((eb) => ({ data: eb.ref('excluded.data') })),
        )
        .execute();
    }
    await recordAudit(tx, {
      organizationId: mine.organizationId,
      actorId: userId,
      action: 'vibration_records.save',
      targetType: 'mine',
      targetId: mine.id,
      data: { count: records.length },
    });
  });
}

export async function deleteVibrationRecord(
  db: Kysely<Database>,
  mineId: string,
  id: string,
): Promise<boolean> {
  const r = await db
    .deleteFrom('mine_vibration_record')
    .where('mineId', '=', mineId)
    .where('id', '=', id)
    .executeTakeFirst();
  return Number(r.numDeletedRows) > 0;
}
