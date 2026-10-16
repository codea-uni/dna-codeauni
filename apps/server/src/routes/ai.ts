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
import { z } from 'zod';
import type { AppDeps } from '../app';
import type { AiLimits } from '../config';
import { sendError } from '../http/errors';
import { requireUser } from '../http/session';
import { DailyCap, tokensOf, UsageLog, type GeminiUsage } from '../services/aiUsage';
import { TtsCache } from '../services/ttsCache';

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

/**
 * Topes y ajustes de costo por defecto (se cambian por entorno, ver config.ts). Las conversaciones
 * con el asistente son datos PERSONALES (Ley 29733): solo van a Gemini de pago, nunca a la capa
 * gratuita ni a otro proveedor. Tarea MEDIA (herramientas sobre el diseño), EN VIVO.
 */
export const DEFAULT_AI_LIMITS: AiLimits = {
  // Un mensaje puede encadenar hasta 24 pasos de herramientas: 300 pasos/h ≈ 12-20 mensajes/h.
  chatPerHour: 300,
  speechPerHour: 200,
  // Topes globales del día (todos los usuarios): cortan un bucle o un abuso antes de que cueste.
  dailyChat: 3000,
  dailySpeech: 2000,
  dailyLive: 300,
  // Las respuestas son de 1-3 frases y llamadas a herramientas; el razonamiento (bajo) también
  // cuenta aquí. 8192 deja margen: si se corta (MAX_TOKENS), se reintenta una vez.
  maxOutputTokens: 8192,
  // Vacío = el reintento por respuesta vacía o cortada usa el mismo modelo (cambiar de modelo a
  // mitad de una conversación con `thoughtSignature` puede no ser aceptado).
  fallbackModel: '',
  ttsCacheDir: '',
  ttsCacheMb: 200,
  // Live re-cobra todo el contexto acumulado en cada turno. Al pasar de 32k tokens Gemini recorta
  // los turnos más viejos hasta 16k (las instrucciones se conservan y cada turno trae la nota
  // [context] con el diseño actual, así que no se pierde el estado). 0 = sin recorte propio.
  liveContextTrigger: 32_000,
  liveContextTarget: 16_000,
};

/** Respuestas que no sirven y justifican UN reintento: vacía, cortada o herramienta mal llamada. */
const RETRY_FINISH: Record<string, string> = {
  MAX_TOKENS: 'max_tokens',
  MALFORMED_FUNCTION_CALL: 'malformed_call',
  UNEXPECTED_TOOL_CALL: 'malformed_call',
};

/** Uso de Live que informa el navegador (la sesión va directo a Google, el servidor no la ve). */
const liveUsageSchema = z.object({
  model: z.string().min(1).max(100),
  usage: z
    .object({
      promptTokenCount: z.number().int().min(0).optional(),
      responseTokenCount: z.number().int().min(0).optional(),
      candidatesTokenCount: z.number().int().min(0).optional(),
      thoughtsTokenCount: z.number().int().min(0).optional(),
      cachedContentTokenCount: z.number().int().min(0).optional(),
      toolUsePromptTokenCount: z.number().int().min(0).optional(),
      promptTokensDetails: z
        .array(z.object({ modality: z.string().optional(), tokenCount: z.number().optional() }))
        .max(10)
        .optional(),
      responseTokensDetails: z
        .array(z.object({ modality: z.string().optional(), tokenCount: z.number().optional() }))
        .max(10)
        .optional(),
    })
    .loose(),
  ms: z.number().min(0).max(3_600_000).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const limits: AiLimits = { ...DEFAULT_AI_LIMITS, ...deps.ai?.limits };
  const liveLimiter = new HourlyLimiter(LIVE_TOKENS_PER_HOUR);
  const chatLimiter = new HourlyLimiter(limits.chatPerHour);
  const speechLimiter = new HourlyLimiter(limits.speechPerHour);
  const daily = new DailyCap({
    chat: limits.dailyChat,
    speech: limits.dailySpeech,
    live: limits.dailyLive,
  });
  const usage = new UsageLog(deps.ai?.logDir, (m) => {
    app.log.warn(m);
  });
  const ttsDir = limits.ttsCacheDir || (deps.ai?.logDir ? join(deps.ai.logDir, 'tts-cache') : '');
  const ttsCache = ttsDir ? new TtsCache(ttsDir, limits.ttsCacheMb * 1024 * 1024) : null;

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
    if (!daily.take('live'))
      return sendError(reply, 429, 'ai_daily_cap', 'Daily live voice limit reached');
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
      // Con tope propio: cada turno se cobra con todo el contexto acumulado.
      contextWindowCompression:
        limits.liveContextTrigger > 0
          ? {
              triggerTokens: limits.liveContextTrigger,
              slidingWindow: {
                targetTokens: Math.min(limits.liveContextTarget, limits.liveContextTrigger),
              },
            }
          : { slidingWindow: {} },
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

  // Uso de cada turno de Live (tokens que Gemini manda al navegador): solo números, sin contenido.
  app.post('/ai/usage', { bodyLimit: 16 * 1024 }, async (req, reply) => {
    const user = await requireUser(deps.auth, deps.db, req, reply);
    if (!user) return reply;
    const parsed = liveUsageSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'bad_request', parsed.error.message);
    await usage.write({
      task: 'live',
      model: parsed.data.model,
      ms: Math.round(parsed.data.ms ?? 0),
      tokens: tokensOf(parsed.data.usage as GeminiUsage),
    });
    return reply.code(204).send();
  });

  app.post('/ai/generate', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const user = await requireUser(deps.auth, deps.db, req, reply);
    if (!user) return reply;
    if (!deps.ai) return sendError(reply, 503, 'ai_not_configured', 'GEMINI_API_KEY is not set');
    const parsed = aiGenerateRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'bad_request', parsed.error.message);
    if (!chatLimiter.take(user.id))
      return sendError(reply, 429, 'ai_rate_limited', 'Too many assistant requests this hour');
    if (!daily.take('chat'))
      return sendError(reply, 429, 'ai_daily_cap', 'Daily assistant limit reached');
    const { systemInstruction, contents, tools } = parsed.data;
    const doFetch = deps.fetch ?? fetch;
    const ai = deps.ai;
    // Orden fijo (instrucciones → herramientas → conversación): lo que no cambia va primero y
    // Gemini lo cobra al 10 % desde su caché implícita.
    const call = (model: string, thinking: boolean) =>
      doFetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': ai.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          tools,
          contents,
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          generationConfig: {
            maxOutputTokens: limits.maxOutputTokens,
            ...(thinking ? { thinkingConfig: { thinkingLevel: THINKING } } : {}),
          },
        }),
        signal: AbortSignal.timeout(90_000),
      });
    /**
     * Una llamada con su política de errores: un solo reintento (1 s después) ante 5xx, timeout o
     * red; nunca ante 4xx (clave, cuota o pedido inválido no se arreglan repitiendo). Cada llamada
     * real queda en el registro de uso.
     */
    const send = async (model: string): Promise<{ res: Response; why?: string }> => {
      let why: string | undefined;
      for (let tries = 0; ; tries++) {
        try {
          let res = await call(model, true);
          // Un modelo sin `thinkingLevel` (GEMINI_MODEL distinto) responde 400: se repite sin él.
          if (res.status === 400 && /thinking/i.test(await res.clone().text()))
            res = await call(model, false);
          if (res.status < 500 || tries > 0) return why ? { res, why } : { res };
          why = `http_${String(res.status)}`;
        } catch (err) {
          if (tries > 0) throw err;
          why = 'network';
        }
        await sleep(1000);
      }
    };
    const attempt = async (model: string, retried?: string) => {
      const t0 = Date.now();
      const { res, why = retried } = await send(model);
      const data = (await res.json().catch(() => null)) as GeminiResponse | null;
      await usage.write({
        task: 'chat',
        model,
        ms: Date.now() - t0,
        tokens: tokensOf(data?.usageMetadata),
        ...(why ? { retried: why } : {}),
        ...(!res.ok ? { error: `http_${String(res.status)}` } : {}),
      });
      return { res, data };
    };
    let out: Awaited<ReturnType<typeof attempt>>;
    try {
      out = await attempt(ai.model);
      // Validación: vacía, cortada o herramienta mal llamada → un reintento (modelo de respaldo
      // si se configuró). Un bloqueo de seguridad no se reintenta.
      const c = out.data?.candidates?.[0];
      const reason = !out.res.ok
        ? null
        : (RETRY_FINISH[c?.finishReason ?? ''] ??
          (!c?.content?.parts?.length && !out.data?.promptFeedback?.blockReason ? 'empty' : null));
      if (reason) out = await attempt(limits.fallbackModel || ai.model, reason);
    } catch (err) {
      await usage.write({ task: 'chat', model: ai.model, ms: 0, error: 'network' });
      return sendError(reply, 502, 'ai_upstream', err instanceof Error ? err.message : String(err));
    }
    const { res, data } = out;
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
    if (!speechLimiter.take(user.id))
      return sendError(reply, 429, 'ai_rate_limited', 'Too many speech requests this hour');
    const model = deps.ai.ttsModel ?? DEFAULT_TTS_MODEL;
    const text = parsed.data.text;
    // Caché exacta: el mismo texto con el mismo modelo y voz devuelve el mismo audio sin pagarlo.
    const key = TtsCache.key(model, VOICE, text);
    const hit = await ttsCache?.get(key);
    if (hit) {
      await usage.write({ task: 'speech', model, ms: 0, cacheHit: true });
      return reply.send(hit satisfies AiSpeechResponse);
    }
    if (!daily.take('speech'))
      return sendError(reply, 429, 'ai_daily_cap', 'Daily speech limit reached');
    const doFetch = deps.fetch ?? fetch;
    const t0 = Date.now();
    let res: Response;
    try {
      res = await doFetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': deps.ai.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      await usage.write({ task: 'speech', model, ms: Date.now() - t0, error: 'network' });
      return sendError(reply, 502, 'ai_upstream', err instanceof Error ? err.message : String(err));
    }
    const data = (await res.json().catch(() => null)) as GeminiResponse | null;
    await usage.write({
      task: 'speech',
      model,
      ms: Date.now() - t0,
      tokens: tokensOf(data?.usageMetadata),
      ...(!res.ok ? { error: `http_${res.status}` } : {}),
    });
    const audio = data?.candidates?.[0]?.content?.parts?.find((p) => 'inlineData' in p)
      ?.inlineData as { mimeType?: string; data?: string } | undefined;
    if (!res.ok || !audio?.data)
      return sendError(reply, 502, 'ai_upstream', data?.error?.message ?? `Gemini ${res.status}`);
    const body: AiSpeechResponse = { mimeType: audio.mimeType ?? 'audio/wav', data: audio.data };
    await ttsCache?.set(key, body).catch((err: unknown) => {
      app.log.warn(`tts cache: ${String(err)}`);
    });
    return reply.send(body);
  });
}

interface GeminiResponse {
  candidates?: { content?: { parts?: Record<string, unknown>[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsage;
  error?: { message?: string };
}
