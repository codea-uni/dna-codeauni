import { uuidv7 } from '@cronos/core';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';

export interface AuditInput {
  organizationId: string;
  actorId: string | null;
  /** `recurso.verbo`, p. ej. `member.add`, `mine.create`, `version.create`. */
  action: string;
  targetType: string;
  targetId: string | null;
  data?: Record<string, unknown>;
}

/** Agrega un evento al registro de auditoría (la base impide modificarlo después). */
export async function recordAudit(db: Kysely<Database>, e: AuditInput): Promise<void> {
  await db
    .insertInto('audit_event')
    .values({
      id: uuidv7(),
      organizationId: e.organizationId,
      actorId: e.actorId,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      data: JSON.stringify(e.data ?? {}),
    })
    .execute();
}
