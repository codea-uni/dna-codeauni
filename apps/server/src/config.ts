import { z } from 'zod';

/**
 * Configuración desde variables de entorno (guía §14: sin credenciales en el repositorio).
 * Se valida al arrancar: una variable faltante detiene el servidor con un mensaje claro.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  CRONOS_DEMO_DATA: z.enum(['true', 'false']).default('true'),
  // Superadministrador: se crea o sincroniza desde el entorno, sin cambio obligatorio.
  CRONOS_SUPERADMIN_EMAIL: z.email().optional(),
  CRONOS_SUPERADMIN_PASSWORD: z.string().min(8).optional(),
  CRONOS_SUPERADMIN_NAME: z.string().min(1).default('Administrador de la plataforma'),
  // Asistente de IA (Gemini): sin clave, la pestaña IA avisa que no está configurado.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-flash-latest'),
  /** Modelo de voz para leer las respuestas en el visor (`/api/ai/speech`). */
  GEMINI_TTS_MODEL: z.string().min(1).default('gemini-3.8-flash-lite-tts'),
  /** Modelo de voz a voz en vivo (`/api/ai/live-token`): el más rápido medido en FleetView. */
  GEMINI_LIVE_MODEL: z.string().min(1).default('gemini-3.1-flash-live-preview'),
  /** Voz de Gemini Live. */
  GEMINI_LIVE_VOICE: z.string().min(1).default('Sulafat'),
  /** Carpeta donde guardar las conversaciones con el asistente (JSONL por día); sin ella, no se guardan. */
  AI_LOG_DIR: z.string().min(1).optional(),
  /**
   * Topes y ajustes de costo de la IA (ver `AiLimits` en routes/ai.ts); sin ellos rigen los
   * valores por defecto de allí. `LIVE_CONTEXT_TRIGGER_TOKENS=0` apaga el recorte del contexto Live.
   */
  AI_CHAT_PER_HOUR: z.coerce.number().int().positive().optional(),
  AI_SPEECH_PER_HOUR: z.coerce.number().int().positive().optional(),
  AI_DAILY_CHAT: z.coerce.number().int().positive().optional(),
  AI_DAILY_SPEECH: z.coerce.number().int().positive().optional(),
  AI_DAILY_LIVE: z.coerce.number().int().positive().optional(),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  AI_FALLBACK_MODEL: z.string().min(1).optional(),
  AI_TTS_CACHE_DIR: z.string().min(1).optional(),
  AI_TTS_CACHE_MB: z.coerce.number().int().positive().optional(),
  LIVE_CONTEXT_TRIGGER_TOKENS: z.coerce.number().int().min(0).optional(),
  LIVE_CONTEXT_TARGET_TOKENS: z.coerce.number().int().positive().optional(),
});

const LIMIT_ENV = {
  AI_CHAT_PER_HOUR: 'chatPerHour',
  AI_SPEECH_PER_HOUR: 'speechPerHour',
  AI_DAILY_CHAT: 'dailyChat',
  AI_DAILY_SPEECH: 'dailySpeech',
  AI_DAILY_LIVE: 'dailyLive',
  AI_MAX_OUTPUT_TOKENS: 'maxOutputTokens',
  AI_FALLBACK_MODEL: 'fallbackModel',
  AI_TTS_CACHE_DIR: 'ttsCacheDir',
  AI_TTS_CACHE_MB: 'ttsCacheMb',
  LIVE_CONTEXT_TRIGGER_TOKENS: 'liveContextTrigger',
  LIVE_CONTEXT_TARGET_TOKENS: 'liveContextTarget',
} as const;

export interface ServerConfig {
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: string;
  authSecret: string;
  baseUrl: string;
  demoData: boolean;
  initialAdmin: { email: string; password: string; name: string } | null;
  ai: AiConfig | null;
}

/** Clave y modelo de Gemini para el asistente (`/api/ai`). */
export interface AiConfig {
  apiKey: string;
  model: string;
  /** Modelo de texto a voz (por defecto el de `GEMINI_TTS_MODEL`). */
  ttsModel?: string;
  /** Modelo de Gemini Live y su voz (por defecto los de `GEMINI_LIVE_MODEL` y `GEMINI_LIVE_VOICE`). */
  liveModel?: string;
  liveVoice?: string;
  /** Carpeta del registro de conversaciones (`AI_LOG_DIR`). */
  logDir?: string;
  /** Topes y ajustes de costo; lo que falte toma el valor por defecto de routes/ai.ts. */
  limits?: Partial<AiLimits>;
}

export interface AiLimits {
  chatPerHour: number;
  speechPerHour: number;
  dailyChat: number;
  dailySpeech: number;
  dailyLive: number;
  maxOutputTokens: number;
  fallbackModel: string;
  ttsCacheDir: string;
  ttsCacheMb: number;
  liveContextTrigger: number;
  liveContextTarget: number;
}

/** Nombres anteriores de las variables del superadministrador (siguen valiendo). */
const LEGACY: Record<string, string> = {
  CRONOS_ADMIN_EMAIL: 'CRONOS_SUPERADMIN_EMAIL',
  CRONOS_ADMIN_PASSWORD: 'CRONOS_SUPERADMIN_PASSWORD',
  CRONOS_ADMIN_NAME: 'CRONOS_SUPERADMIN_NAME',
};

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const withLegacy = { ...env };
  for (const [old, name] of Object.entries(LEGACY))
    if (withLegacy[name] === undefined && withLegacy[old] !== undefined)
      withLegacy[name] = withLegacy[old];
  const parsed = envSchema.safeParse(withLegacy);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variables de entorno inválidas o faltantes: ${fields}`);
  }
  const e = parsed.data;
  const limits: Partial<Record<keyof AiLimits, string | number>> = {};
  for (const [name, field] of Object.entries(LIMIT_ENV)) {
    const v = e[name as keyof typeof LIMIT_ENV];
    if (v !== undefined) limits[field] = v;
  }
  return {
    databaseUrl: e.DATABASE_URL,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    authSecret: e.BETTER_AUTH_SECRET,
    baseUrl: e.BETTER_AUTH_URL,
    demoData: e.CRONOS_DEMO_DATA !== 'false',
    initialAdmin:
      e.CRONOS_SUPERADMIN_EMAIL && e.CRONOS_SUPERADMIN_PASSWORD
        ? {
            email: e.CRONOS_SUPERADMIN_EMAIL,
            password: e.CRONOS_SUPERADMIN_PASSWORD,
            name: e.CRONOS_SUPERADMIN_NAME,
          }
        : null,
    ai: e.GEMINI_API_KEY
      ? {
          apiKey: e.GEMINI_API_KEY,
          model: e.GEMINI_MODEL,
          ttsModel: e.GEMINI_TTS_MODEL,
          liveModel: e.GEMINI_LIVE_MODEL,
          liveVoice: e.GEMINI_LIVE_VOICE,
          ...(e.AI_LOG_DIR ? { logDir: e.AI_LOG_DIR } : {}),
          ...(Object.keys(limits).length ? { limits: limits as Partial<AiLimits> } : {}),
        }
      : null,
  };
}
