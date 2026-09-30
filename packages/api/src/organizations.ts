import { z } from 'zod';
import { roleSchema } from './roles';

const id = z.string().min(1);
const isoDate = z.string();

/** Empresa (`Organization`) con el rol de quien consulta. */
export const organizationSchema = z.object({
  id,
  name: z.string(),
  role: roleSchema,
  createdAt: isoDate,
});
export type Organization = z.infer<typeof organizationSchema>;
export const organizationListSchema = z.object({ organizations: z.array(organizationSchema) });

export const createOrganizationSchema = z.object({ name: z.string().trim().min(1).max(120) });
export type CreateOrganization = z.infer<typeof createOrganizationSchema>;

/** Miembro (`Member`): usuario con su rol en la empresa. */
export const memberSchema = z.object({
  userId: id,
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  createdAt: isoDate,
});
export type Member = z.infer<typeof memberSchema>;
export const memberListSchema = z.object({ members: z.array(memberSchema) });

/**
 * Alta de un miembro por el administrador (H-801). Si el correo ya tiene cuenta (de otra empresa),
 * solo se agrega a esta; si no, se crea con `password` temporal, que debe cambiar al entrar.
 */
export const addMemberSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120),
  role: roleSchema,
  password: z.string().min(10).optional(),
});
export type AddMember = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.object({ role: roleSchema });
export type UpdateMember = z.infer<typeof updateMemberSchema>;

/** Mina (`Mine`) de una empresa. `restricted`: solo la ven los usuarios de `accessUserIds`. */
export const mineSchema = z.object({
  id,
  organizationId: id,
  name: z.string(),
  epsg: z.number().int().positive().nullable(),
  restricted: z.boolean(),
  accessUserIds: z.array(id),
  createdAt: isoDate,
});
export type Mine = z.infer<typeof mineSchema>;
export const mineListSchema = z.object({ mines: z.array(mineSchema) });
/** `GET /mines/:id`: la mina y el rol de quien consulta en su empresa. */
export const mineDetailSchema = z.object({ mine: mineSchema, role: roleSchema });
export type MineDetail = z.infer<typeof mineDetailSchema>;

export const createMineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  epsg: z.number().int().positive().nullable().optional(),
});
export type CreateMine = z.infer<typeof createMineSchema>;

export const updateMineSchema = createMineSchema.partial();
export type UpdateMine = z.infer<typeof updateMineSchema>;

/** Lista vacía = la ven todos los miembros de la empresa. Los administradores siempre la ven. */
export const mineAccessSchema = z.object({ userIds: z.array(id) });
export type MineAccess = z.infer<typeof mineAccessSchema>;

/** Evento del registro de auditoría (NF-07): quién, cuándo y qué. Solo se agregan. */
export const auditEventSchema = z.object({
  id,
  at: isoDate,
  actorId: id.nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
export const auditListSchema = z.object({ events: z.array(auditEventSchema) });
