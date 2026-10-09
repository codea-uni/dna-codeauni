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

/** `POST /api/ai/speech`: la respuesta del asistente leída en voz alta (el visor no tiene voz). */
export const aiSpeechRequestSchema = z.object({
  text: z.string().min(1).max(2000),
});
export type AiSpeechRequest = z.infer<typeof aiSpeechRequestSchema>;

export const aiSpeechResponseSchema = z.object({
  /** Tipo del audio (`audio/wav` o PCM crudo `audio/L16;rate=24000`). */
  mimeType: z.string(),
  /** Audio en base64. */
  data: z.string(),
});
export type AiSpeechResponse = z.infer<typeof aiSpeechResponseSchema>;
