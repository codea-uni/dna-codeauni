import { z } from 'zod';

/**
 * Roles de la guía `01 §1.4`, asignados por empresa (D-14):
 * - `admin`: usuarios, roles y minas de la empresa; además todo lo del diseñador.
 * - `designer`: crea, simula, compara, reporta y publica versiones.
 * - `reviewer`: ve diseños y resultados y comenta; **no edita** (H-801).
 */
export const ROLES = ['admin', 'designer', 'reviewer'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Permisos por rol. El servidor los hace cumplir; la web solo los usa para mostrar u ocultar. */
export const permissions = {
  manageMembers: (role: Role) => role === 'admin',
  manageMines: (role: Role) => role === 'admin',
  viewAudit: (role: Role) => role === 'admin',
  /** Editar el diseño, publicar y restaurar versiones. */
  editDesign: (role: Role) => role !== 'reviewer',
} as const;
