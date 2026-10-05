import { z } from 'zod';

/** Parte de un mensaje de Gemini (texto, `functionCall`, `functionResponse`…), sin interpretar. */
const partSchema = z.record(z.string(), z.unknown());

export const aiContentSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(partSchema),
});
export type AiContent = z.infer<typeof aiContentSchema>;

/** `POST /api/ai/generate`: un turno del asistente (la web ejecuta las herramientas). */
export const aiGenerateRequestSchema = z.object({
  systemInstruction: z.string().max(200_000),
  contents: z.array(aiContentSchema).min(1).max(400),
  /** Declaraciones de funciones en el formato de Gemini (`[{ functionDeclarations }]`). */
  tools: z.array(z.record(z.string(), z.unknown())).max(4),
});
export type AiGenerateRequest = z.infer<typeof aiGenerateRequestSchema>;

export const aiGenerateResponseSchema = z.object({
  /** Turno del modelo tal cual (se devuelve igual en el historial); null si no respondió. */
  content: aiContentSchema.nullable(),
  finishReason: z.string().nullable(),
});
export type AiGenerateResponse = z.infer<typeof aiGenerateResponseSchema>;
