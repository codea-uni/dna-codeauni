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
  password: z.string().min(8).optional(),
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
  /** Proyectos de la mina y fecha de su última versión (`null` sin versiones). */
  projectCount: z.number().int().nonnegative(),
  lastActivityAt: isoDate.nullable(),
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

/** Consola de la plataforma (superadministrador): una empresa con sus números. */
export const platformOrganizationSchema = z.object({
  id,
  name: z.string(),
  createdAt: isoDate,
  disabled: z.boolean(),
  members: z.number().int(),
  mines: z.number().int(),
  projects: z.number().int(),
  versions: z.number().int(),
  /** Última versión publicada en la empresa. */
  lastActivityAt: isoDate.nullable(),
  admins: z.array(z.object({ name: z.string(), email: z.string() })),
});
export type PlatformOrganization = z.infer<typeof platformOrganizationSchema>;
export const platformOrganizationListSchema = z.object({
  organizations: z.array(platformOrganizationSchema),
});

/** Empresa nueva con su primer administrador (cuenta nueva con su contraseña). */
export const createPlatformOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  admin: z.object({
    email: z.email(),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(8).optional(),
  }),
});
export type CreatePlatformOrganization = z.infer<typeof createPlatformOrganizationSchema>;

/** Administrador para una empresa existente (p. ej. una que quedó sin administrador). */
export const addPlatformAdminSchema = createPlatformOrganizationSchema.shape.admin;
export type AddPlatformAdmin = z.infer<typeof addPlatformAdminSchema>;

export const updatePlatformOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  disabled: z.boolean().optional(),
});
export type UpdatePlatformOrganization = z.infer<typeof updatePlatformOrganizationSchema>;

/** Usuario visto desde la plataforma: estado de la cuenta y última actividad. */
export const platformUserSchema = memberSchema.extend({
  disabled: z.boolean(),
  lastSeenAt: isoDate.nullable(),
});
export type PlatformUser = z.infer<typeof platformUserSchema>;
export const platformUserListSchema = z.object({ users: z.array(platformUserSchema) });

export const updatePlatformUserSchema = z.object({ disabled: z.boolean() });
export type UpdatePlatformUser = z.infer<typeof updatePlatformUserSchema>;
