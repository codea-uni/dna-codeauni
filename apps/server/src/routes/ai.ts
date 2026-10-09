import {
  aiGenerateRequestSchema,
  aiSpeechRequestSchema,
  type AiGenerateResponse,
  type AiSpeechResponse,
} from '@cronos/api';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { sendError } from '../http/errors';
import { requireUser } from '../http/session';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
/**
 * Razonamiento corto: las órdenes de diseño son directas y las herramientas hacen los cálculos;
 * responde ~2 s antes que con el nivel por defecto.
 */
const THINKING = 'low';
/** Voz de Gemini TTS (cálida y clara en español). */
const VOICE = 'Kore';

/**
 * Asistente de IA: puente hacia Gemini (`generateContent`) para que la clave quede en el servidor.
 * La web arma la conversación y las herramientas (las ejecuta ella, sobre el documento abierto);
 * aquí solo se exige sesión, se agrega la clave y se devuelve el turno del modelo tal cual (con sus
 * `thoughtSignature`, que Gemini pide de vuelta en el turno siguiente).
 */
export function aiRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post('/ai/generate', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const user = await requireUser(deps.auth, deps.db, req, reply);
    if (!user) return reply;
    if (!deps.ai) return sendError(reply, 503, 'ai_not_configured', 'GEMINI_API_KEY is not set');
    const parsed = aiGenerateRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'bad_request', parsed.error.message);
    const { systemInstruction, contents, tools } = parsed.data;
    const doFetch = deps.fetch ?? fetch;
    const ai = deps.ai;
    const call = (thinking: boolean) =>
      doFetch(`${GEMINI_URL}/${encodeURIComponent(ai.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': ai.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          tools,
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          ...(thinking
            ? { generationConfig: { thinkingConfig: { thinkingLevel: THINKING } } }
            : {}),
        }),
        signal: AbortSignal.timeout(90_000),
      });
    let res: Response;
    try {
      res = await call(true);
      // Un modelo sin `thinkingLevel` (GEMINI_MODEL distinto) responde 400: se repite sin él.
      if (res.status === 400) {
        const text = await res.clone().text();
        if (/thinking/i.test(text)) res = await call(false);
      }
    } catch (err) {
      return sendError(reply, 502, 'ai_upstream', err instanceof Error ? err.message : String(err));
    }
    const data = (await res.json().catch(() => null)) as GeminiResponse | null;
    if (!res.ok || !data)
      return sendError(reply, 502, 'ai_upstream', data?.error?.message ?? `Gemini ${res.status}`);
    const candidate = data.candidates?.[0];
    const body: AiGenerateResponse = {
      content: candidate?.content?.parts ? { role: 'model', parts: candidate.content.parts } : null,
      finishReason: candidate?.finishReason ?? data.promptFeedback?.blockReason ?? null,
    };
    return reply.send(body);
  });

  // Voz del asistente en el visor (D-19): el navegador del Quest no garantiza speechSynthesis.
  app.post('/ai/speech', async (req, reply) => {
    const user = await requireUser(deps.auth, deps.db, req, reply);
    if (!user) return reply;
    if (!deps.ai) return sendError(reply, 503, 'ai_not_configured', 'GEMINI_API_KEY is not set');
    const parsed = aiSpeechRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'bad_request', parsed.error.message);
    const model = deps.ai.ttsModel ?? DEFAULT_TTS_MODEL;
    const doFetch = deps.fetch ?? fetch;
    let res: Response;
    try {
      res = await doFetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': deps.ai.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: parsed.data.text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      return sendError(reply, 502, 'ai_upstream', err instanceof Error ? err.message : String(err));
    }
    const data = (await res.json().catch(() => null)) as GeminiResponse | null;
    const audio = data?.candidates?.[0]?.content?.parts?.find((p) => 'inlineData' in p)
      ?.inlineData as { mimeType?: string; data?: string } | undefined;
    if (!res.ok || !audio?.data)
      return sendError(reply, 502, 'ai_upstream', data?.error?.message ?? `Gemini ${res.status}`);
    const body: AiSpeechResponse = { mimeType: audio.mimeType ?? 'audio/wav', data: audio.data };
    return reply.send(body);
  });
}

interface GeminiResponse {
  candidates?: { content?: { parts?: Record<string, unknown>[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}
