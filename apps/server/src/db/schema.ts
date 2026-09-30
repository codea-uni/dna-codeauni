import type { Role } from '@cronos/api';
import type { ColumnType, Generated, JSONColumnType } from 'kysely';

/**
 * Tablas de la base de datos para Kysely, una por migración de `migrations/`. Las de Better Auth
 * las escribe la librería; aquí se declaran solo las columnas que el servidor lee o actualiza.
 */
export interface Database {
  user: UserTable;
  organization: OrganizationTable;
  member: MemberTable;
  mine: MineTable;
  mine_access: MineAccessTable;
  audit_event: AuditEventTable;
  project: ProjectTable;
  project_version: ProjectVersionTable;
}

type CreatedAt = ColumnType<Date, never, never>;

export interface UserTable {
  id: string;
  name: string;
  email: string;
  locale: Generated<string>;
  mustChangePassword: Generated<boolean>;
  createdAt: CreatedAt;
}

export interface OrganizationTable {
  id: string;
  name: string;
  createdAt: CreatedAt;
}

export interface MemberTable {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  createdAt: CreatedAt;
}

export interface MineTable {
  id: string;
  organizationId: string;
  name: string;
  epsg: number | null;
  createdBy: string | null;
  createdAt: CreatedAt;
}

export interface MineAccessTable {
  mineId: string;
  userId: string;
}

export interface AuditEventTable {
  id: string;
  organizationId: string;
  actorId: string | null;
  at: CreatedAt;
  action: string;
  targetType: string;
  targetId: string | null;
  data: JSONColumnType<Record<string, unknown>>;
}

export interface ProjectTable {
  id: string;
  mineId: string;
  name: string;
  versionCount: Generated<number>;
  createdBy: string | null;
  createdAt: CreatedAt;
  updatedAt: ColumnType<Date, never, Date>;
}

export interface ProjectVersionTable {
  id: string;
  projectId: string;
  number: number;
  parentVersionId: string | null;
  restoredFromVersionId: string | null;
  authorId: string;
  createdAt: CreatedAt;
  message: string;
  projectName: string;
  schemaVersion: number;
  holeCount: number;
  sizeBytes: number;
  contentHash: string;
  content: Buffer;
  summary: JSONColumnType<Record<string, unknown> | null, string | null, never>;
}
