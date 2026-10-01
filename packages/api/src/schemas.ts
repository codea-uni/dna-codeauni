import { z } from 'zod';

/** Estado del servidor y de su base de datos (`GET /api/health`). */
export const healthSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.enum(['ok', 'error']),
  version: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

/** Cuerpo de todo error de la API: `code` estable para la UI (se traduce), `message` para logs. */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const localeSchema = z.enum(['es', 'en']);

/** Usuario de la sesión (guía 03 §2: id, nombre, correo, idioma). */
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  locale: localeSchema,
  /** Cuenta con contraseña temporal del administrador: debe cambiarla antes de seguir. */
  mustChangePassword: z.boolean(),
  /** Superadministrador de la plataforma: ve todas las empresas y las desactiva. */
  isSuperAdmin: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

/** Empresa del usuario (una por persona) con su rol; `disabled` si la desactivó la plataforma. */
export const myOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'designer', 'reviewer']),
  disabled: z.boolean(),
});
export type MyOrganization = z.infer<typeof myOrganizationSchema>;

/** `GET /api/me`: el usuario y su empresa (`null` si no pertenece a ninguna). */
export const meSchema = z.object({
  user: userSchema,
  organization: myOrganizationSchema.nullable(),
});
export type Me = z.infer<typeof meSchema>;

/** `POST /api/auth/sign-in/email`. */
export const signInSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});
export type SignIn = z.infer<typeof signInSchema>;

/** `POST /api/me/password`. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ChangePassword = z.infer<typeof changePasswordSchema>;

/** `PATCH /api/me`. */
export const updateMeSchema = z.object({ locale: localeSchema });
export type UpdateMe = z.infer<typeof updateMeSchema>;

/** Respuesta sin contenido útil (`{ ok: true }`). */
export const okSchema = z.object({ ok: z.literal(true) });
