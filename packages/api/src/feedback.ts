import { z } from 'zod';

/**
 * Buzón de mejoras: desde el editor cualquier persona dice «esto no funciona», «quisiera que
 * hiciera X» o «no entiendo esto». Se guarda con el contexto de la pantalla y el superadministrador
 * lo revisa y decide qué se programa (el producto no cambia solo).
 */

export const FEEDBACK_KINDS = ['bug', 'idea', 'question'] as const;
export const feedbackKindSchema = z.enum(FEEDBACK_KINDS);
export type FeedbackKind = z.infer<typeof feedbackKindSchema>;

export const FEEDBACK_STATUSES = ['new', 'reviewing', 'approved', 'done', 'discarded'] as const;
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

/** Tope del contexto serializado (JSON, bytes UTF-8). */
export const FEEDBACK_CONTEXT_MAX_BYTES = 64 * 1024;
/** Tope de la captura como data URL (caracteres; ~1,1 MB de imagen en base64). */
export const FEEDBACK_SCREENSHOT_MAX_CHARS = 1_500_000;
export const FEEDBACK_TEXT_MAX = 4000;

const short = z.string().max(500);

/**
 * Contexto que arma el cliente al enviar. Todo es opcional y se admiten campos extra (el editor
 * puede sumar lo que le sirva al revisor); el servidor solo controla el tamaño total.
 */
export const feedbackContextSchema = z.looseObject({
  /** Ruta o pantalla donde estaba (p. ej. `/mines/…/projects/…` o «Carguío»). */
  screen: short.optional(),
  /** Herramienta del proyecto abierto. */
  tool: z.enum(['surface', 'underground']).nullable().optional(),
  /** Ventanas o paneles abiertos. */
  windows: z.array(short).max(100).optional(),
  /** Últimas acciones, de la más vieja a la más nueva. */
  recentActions: z
    .array(z.object({ at: z.string().optional(), label: short }))
    .max(200)
    .optional(),
  /** Errores recientes que vio (mensajes ya traducidos o técnicos). */
  recentErrors: z
    .array(z.object({ at: z.string().optional(), message: z.string().max(4000) }))
    .max(100)
    .optional(),
  viewport: z
    .object({ width: z.number(), height: z.number(), dpr: z.number().optional() })
    .optional(),
  appVersion: short.optional(),
  userAgent: short.optional(),
  locale: short.optional(),
  /** Conversación reciente con el asistente (texto plano). */
  conversation: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(8000) }))
    .max(200)
    .optional(),
});
export type FeedbackContext = z.infer<typeof feedbackContextSchema>;

/** Bytes UTF-8 del JSON del contexto (lo que se guarda). */
export function feedbackContextBytes(context: unknown): number {
  return new TextEncoder().encode(JSON.stringify(context ?? {})).length;
}

/** `POST /feedback`. La empresa y la persona salen de la sesión. */
export const sendFeedbackSchema = z.object({
  kind: feedbackKindSchema,
  text: z.string().trim().min(1).max(FEEDBACK_TEXT_MAX),
  context: feedbackContextSchema.default({}),
  /** Captura de pantalla como data URL JPEG o PNG. */
  screenshot: z
    .string()
    .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/, 'JPEG or PNG data URL')
    .nullable()
    .optional(),
  mineId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
});
export type SendFeedback = z.input<typeof sendFeedbackSchema>;

export const feedbackCreatedSchema = z.object({ id: z.string(), createdAt: z.string() });
export type FeedbackCreated = z.infer<typeof feedbackCreatedSchema>;

/** Pedido en la lista del buzón (sin la captura). */
export const feedbackItemSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  userEmail: z.string().nullable(),
  mineId: z.string().nullable(),
  projectId: z.string().nullable(),
  kind: feedbackKindSchema,
  text: z.string(),
  status: feedbackStatusSchema,
  theme: z.string().nullable(),
  adminNote: z.string().nullable(),
  /** Pantalla y herramienta del contexto (para la lista). */
  screen: z.string().nullable(),
  tool: z.string().nullable(),
  hasScreenshot: z.boolean(),
});
export type FeedbackItem = z.infer<typeof feedbackItemSchema>;

export const feedbackListSchema = z.object({
  items: z.array(feedbackItemSchema),
  total: z.number().int(),
  /** Pedidos en estado `new` (contador de la pestaña). */
  newCount: z.number().int(),
});
export type FeedbackList = z.infer<typeof feedbackListSchema>;

export const feedbackDetailSchema = feedbackItemSchema.extend({
  context: z.record(z.string(), z.unknown()),
  screenshot: z.string().nullable(),
  mineName: z.string().nullable(),
  projectName: z.string().nullable(),
});
export type FeedbackDetail = z.infer<typeof feedbackDetailSchema>;

/** Filtros de `GET /platform/feedback` (query string). */
export const feedbackQuerySchema = z.object({
  status: feedbackStatusSchema.optional(),
  kind: feedbackKindSchema.optional(),
  organizationId: z.string().min(1).optional(),
  q: z.string().trim().max(200).optional(),
  /** Ids separados por coma (los de un tema agrupado). */
  ids: z.string().max(20_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type FeedbackQuery = z.input<typeof feedbackQuerySchema>;

export const updateFeedbackSchema = z
  .object({
    status: feedbackStatusSchema.optional(),
    adminNote: z.string().max(4000).nullable().optional(),
    theme: z.string().trim().max(80).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateFeedback = z.infer<typeof updateFeedbackSchema>;

/** Tema que agrupa pedidos parecidos (`POST /platform/feedback/summarize`). */
export const feedbackThemeSchema = z.object({
  theme: z.string(),
  summary: z.string(),
  count: z.number().int(),
  ids: z.array(z.string()),
  suggestion: z.string(),
});
export type FeedbackTheme = z.infer<typeof feedbackThemeSchema>;
export const feedbackSummarySchema = z.object({
  themes: z.array(feedbackThemeSchema),
  /** Pedidos abiertos considerados. */
  considered: z.number().int(),
});
export type FeedbackSummary = z.infer<typeof feedbackSummarySchema>;
