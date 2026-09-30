import type { ColumnType, Generated } from 'kysely';

/**
 * Tablas de la base de datos para Kysely, una por migración de `migrations/`. Las de Better Auth
 * las escribe la librería; aquí se declaran solo las columnas que el servidor lee o actualiza.
 */
export interface Database {
  user: UserTable;
}

export interface UserTable {
  id: string;
  name: string;
  email: string;
  locale: Generated<string>;
  mustChangePassword: Generated<boolean>;
  createdAt: ColumnType<Date, never, never>;
}
