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

/**
 * `POST /api/ai/live-token`: permiso de un uso para que el navegador hable directo con Gemini Live
 * (voz a voz por WebSocket, sin pasar el audio por el servidor). El token deja fijados el modelo,
 * la voz, las instrucciones y las herramientas: con él no se puede usar la clave para otra cosa.
 */
export const aiLiveTokenRequestSchema = z.object({
  systemInstruction: z.string().max(60_000),
  /** Declaraciones de funciones en el formato de Gemini (`[{ functionDeclarations }]`). */
  tools: z.array(z.record(z.string(), z.unknown())).max(4),
  /** Idioma de la voz (BCP-47, p. ej. `es-US`). */
  languageCode: z.string().max(10).optional(),
});
export type AiLiveTokenRequest = z.infer<typeof aiLiveTokenRequestSchema>;

export const aiLiveTokenResponseSchema = z.object({
  /** Token efímero (`auth_tokens/…`): abre UNA sesión en el minuto siguiente. */
  token: z.string(),
  /** Modelo de la sesión (`models/` se agrega al abrirla). */
  model: z.string(),
});
export type AiLiveTokenResponse = z.infer<typeof aiLiveTokenResponseSchema>;

/**
 * `POST /api/ai/log`: registro de lo que se habló con el asistente (lo que dijo cada uno y las
 * herramientas con sus argumentos), para revisar sesiones de prueba. Sin `AI_LOG_DIR` no se guarda.
 */
export const aiLogEventSchema = z.object({
  /** Momento en el navegador (ISO). */
  at: z.string().max(40),
  kind: z.enum(['user', 'assistant', 'tool', 'error', 'session']),
  text: z.string().max(8000).optional(),
  name: z.string().max(80).optional(),
  args: z.unknown().optional(),
  ok: z.boolean().optional(),
  /** Resultado o error de la herramienta (recortado). */
  result: z.string().max(4000).optional(),
});
export type AiLogEvent = z.infer<typeof aiLogEventSchema>;

export const aiLogRequestSchema = z.object({
  /** Conversación (una por sesión de voz o del panel). */
  conversation: z.string().max(64),
  /** Superficie: panel de texto, voz en la web o voz en el visor. */
  surface: z.string().max(20),
  projectId: z.string().max(64).optional(),
  projectName: z.string().max(200).optional(),
  events: z.array(aiLogEventSchema).min(1).max(100),
});
export type AiLogRequest = z.infer<typeof aiLogRequestSchema>;
