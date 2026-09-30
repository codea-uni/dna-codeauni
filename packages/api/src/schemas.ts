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
