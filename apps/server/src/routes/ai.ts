import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  aiGenerateRequestSchema,
  aiLiveTokenRequestSchema,
  aiLogRequestSchema,
  aiSpeechRequestSchema,
  type AiGenerateResponse,
  type AiLiveTokenResponse,
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
const LIVE_TOKENS_URL = 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';
const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const DEFAULT_LIVE_VOICE = 'Sulafat';
/**
 * Tope de sesiones de voz en vivo por usuario y hora. La sesión se reutiliza entre turnos, así que
 * solo se alcanza con algo roto o con abuso.
 */
export const LIVE_TOKENS_PER_HOUR = 40;
/** El token abre la sesión en este plazo; la sesión vive hasta `LIVE_SESSION_MS`. */
const LIVE_OPEN_MS = 60_000;
const LIVE_SESSION_MS = 30 * 60_000;

/** Ventana deslizante de una hora por usuario (en memoria: un solo proceso de API). */
export class HourlyLimiter {
  private readonly uses = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const t = this.now();
    const recent = (this.uses.get(key) ?? []).filter((x) => t - x < 3_600_000);
    const ok = recent.length < this.max;
    if (ok) recent.push(t);
    this.uses.set(key, recent);
    return ok;
  }
}

/**
 * Asistente de IA: puente hacia Gemini (`generateContent`) para que la clave quede en el servidor.
 * La web arma la conversación y las herramientas (las ejecuta ella, sobre el documento abierto);
 * aquí solo se exige sesión, se agrega la clave y se devuelve el turno del modelo tal cual (con sus
 * `thoughtSignature`, que Gemini pide de vuelta en el turno siguiente).
 */
export function aiRoutes(app: FastifyInstance, deps: AppDeps): void {
  const liveLimiter = new HourlyLimiter(LIVE_TOKENS_PER_HOUR);

  // Voz en vivo (Gemini Live): el navegador abre el WebSocket directo a Google con un token de un
  // uso que deja fijados modelo, voz, instrucciones y herramientas. La clave no sale de aquí.
  app.post('/ai/live-token', { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    const user = await requireUser(deps.auth, deps.db, req, reply);
    if (!user) return reply;
    if (!deps.ai) return sendError(reply, 503, 'ai_not_configured', 'GEMINI_API_KEY is not set');
    const parsed = aiLiveTokenRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'bad_request', parsed.error.message);
    if (!liveLimiter.take(user.id))
      return sendError(reply, 429, 'ai_rate_limited', 'Too many live voice sessions this hour');
    const model = deps.ai.liveModel ?? DEFAULT_LIVE_MODEL;
    const now = Date.now();
    const setup = {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: deps.ai.liveVoice ?? DEFAULT_LIVE_VOICE },
          },
          languageCode: parsed.data.languageCode ?? 'es-US',
        },
      },
      systemInstruction: { parts: [{ text: parsed.data.systemInstruction }] },
      tools: parsed.data.tools,
      // El navegador marca inicio y fin de cada intervención (detección de voz en el visor).
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      // Subtítulos de lo que se dijo y de lo que respondió.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Sesiones largas: sin esto el audio acumulado corta la sesión a los ~15 min.
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: {},
    };
    const doFetch = deps.fetch ?? fetch;
    let res: Response;
    try {
      res = await doFetch(LIVE_TOKENS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': deps.ai.apiKey },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(now + LIVE_SESSION_MS).toISOString(),
          newSessionExpireTime: new Date(now + LIVE_OPEN_MS).toISOString(),
          bidiGenerateContentSetup: setup,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      return sendError(reply, 502, 'ai_upstream', err instanceof Error ? err.message : String(err));
    }
    const data = (await res.json().catch(() => null)) as {
      name?: string;
      error?: { message?: string };
    } | null;
    if (!res.ok || !data?.name)
      return sendError(reply, 502, 'ai_upstream', data?.error?.message ?? `Gemini ${res.status}`);
    const body: AiLiveTokenResponse = { token: data.name, model };
    return reply.send(body);
  });

  // Registro de conversaciones (para revisar sesiones de prueba): JSONL por día en AI_LOG_DIR.
  app.post('/ai/log', { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    const user = await requireUser(deps.auth, deps.db, req, reply);
    if (!user) return reply;
    const dir = deps.ai?.logDir;
    if (!dir) return reply.code(204).send();
    const parsed = aiLogRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'bad_request', parsed.error.message);
    const { events, ...meta } = parsed.data;
    const received = new Date().toISOString();
    const lines = events
      .map((e) => JSON.stringify({ received, user: user.email, ...meta, ...e }))
      .join('\n');
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${received.slice(0, 10)}.jsonl`), `${lines}\n`, 'utf8');
    return reply.code(204).send();
  });

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
