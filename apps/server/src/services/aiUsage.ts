import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Registro de costo de cada llamada a la IA, SIN contenido (Ley 29733): tarea, modelo, tokens,
 * costo estimado, latencia, si salió de la caché y si se reintentó. Va a `usage-AAAA-MM-DD.jsonl`
 * en la carpeta del registro (`AI_LOG_DIR`, ya persistida en un volumen): no agrega escrituras a
 * la base en el camino de cada respuesta ni pide migración, y `scripts/ai-usage-report.mjs` lo
 * resume por día y tarea.
 */

export type AiTask = 'chat' | 'speech' | 'live';

/** USD por millón de tokens. */
interface Price {
  in: number;
  out: number;
  /** Entrada de audio (Live), si cuesta distinto que la de texto. */
  audioIn?: number;
  /** Salida de audio (TTS y Live). */
  audioOut?: number;
}

/**
 * Precios de lista (ai.google.dev/pricing). Los de TTS y Live son SUPUESTOS hasta verificarlos en
 * la factura: se toman los de la generación anterior (2.5 Flash TTS y 2.5 Flash Live).
 * Los tokens que salen de la caché implícita se cobran al 10 % de la entrada.
 */
const PRICES: { match: RegExp; price: Price }[] = [
  { match: /flash-lite-tts/, price: { in: 0.5, out: 10, audioOut: 10 } },
  { match: /tts/, price: { in: 0.5, out: 10, audioOut: 10 } },
  { match: /live|native-audio/, price: { in: 0.5, out: 2, audioIn: 3, audioOut: 12 } },
  { match: /flash-lite/, price: { in: 0.25, out: 1.5 } },
  { match: /pro/, price: { in: 2, out: 12 } },
  { match: /flash/, price: { in: 0.75, out: 3.75 } },
];
const CACHED_FRACTION = 0.1;

/** Lo que interesa de `usageMetadata` (generateContent y Live usan los mismos nombres). */
export interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  /** Live lo llama así en vez de `candidatesTokenCount`. */
  responseTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  toolUsePromptTokenCount?: number;
  promptTokensDetails?: { modality?: string; tokenCount?: number }[];
  responseTokensDetails?: { modality?: string; tokenCount?: number }[];
  candidatesTokensDetails?: { modality?: string; tokenCount?: number }[];
}

export interface UsageTokens {
  in: number;
  out: number;
  thinking: number;
  cached: number;
  audioIn: number;
  audioOut: number;
}

const audioOf = (d?: { modality?: string; tokenCount?: number }[]) =>
  (d ?? []).filter((x) => x.modality === 'AUDIO').reduce((s, x) => s + (x.tokenCount ?? 0), 0);

export function tokensOf(u: GeminiUsage | undefined | null): UsageTokens {
  return {
    in: (u?.promptTokenCount ?? 0) + (u?.toolUsePromptTokenCount ?? 0),
    out: u?.candidatesTokenCount ?? u?.responseTokenCount ?? 0,
    thinking: u?.thoughtsTokenCount ?? 0,
    cached: u?.cachedContentTokenCount ?? 0,
    audioIn: audioOf(u?.promptTokensDetails),
    audioOut: audioOf(u?.responseTokensDetails ?? u?.candidatesTokensDetails),
  };
}

export function priceOf(model: string): Price {
  return PRICES.find((p) => p.match.test(model))?.price ?? { in: 0.75, out: 3.75 };
}

/** Costo estimado en USD. El razonamiento se cobra como salida. */
export function costUsd(model: string, t: UsageTokens): number {
  const p = priceOf(model);
  const textIn = Math.max(0, t.in - t.audioIn - t.cached);
  const textOut = Math.max(0, t.out - t.audioOut) + t.thinking;
  const usd =
    textIn * p.in +
    t.cached * p.in * CACHED_FRACTION +
    t.audioIn * (p.audioIn ?? p.in) +
    textOut * p.out +
    t.audioOut * (p.audioOut ?? p.out);
  return usd / 1e6;
}

export interface UsageRecord {
  task: AiTask;
  model: string;
  ms: number;
  tokens?: UsageTokens;
  /** Respuesta servida desde la caché exacta (sin llamar a Gemini). */
  cacheHit?: boolean;
  /** Hubo un segundo intento (5xx/timeout o respuesta vacía/cortada) y por qué. */
  retried?: string;
  /** Código de error si la llamada no terminó bien. */
  error?: string;
}

export class UsageLog {
  constructor(
    private readonly dir: string | undefined,
    private readonly warn: (msg: string) => void = () => undefined,
  ) {}

  async write(r: UsageRecord): Promise<void> {
    if (!this.dir) return;
    const at = new Date().toISOString();
    const line = {
      at,
      ...r,
      key: 'paid',
      costUsd: r.tokens && !r.cacheHit ? Number(costUsd(r.model, r.tokens).toFixed(6)) : 0,
    };
    try {
      await mkdir(this.dir, { recursive: true });
      await appendFile(
        join(this.dir, `usage-${at.slice(0, 10)}.jsonl`),
        `${JSON.stringify(line)}\n`,
      );
    } catch (err) {
      // El registro nunca tumba la respuesta al usuario.
      this.warn(`usage log: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Tope diario por tarea (en memoria, un solo proceso de API; se reinicia a medianoche UTC). */
export class DailyCap {
  private day = '';
  private readonly used = new Map<string, number>();
  constructor(
    private readonly limits: Partial<Record<AiTask, number>>,
    private readonly now: () => number = Date.now,
  ) {}

  take(task: AiTask): boolean {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.used.clear();
    }
    const max = this.limits[task];
    const n = this.used.get(task) ?? 0;
    if (max !== undefined && n >= max) return false;
    this.used.set(task, n + 1);
    return true;
  }
}
