import type { AiLogEvent } from '@cronos/api';
import { api, serverMode } from '../server/api';
import { session } from '../session';

/**
 * Registro de la conversación con el asistente en el servidor (`POST /api/ai/log`): lo que dijo
 * cada uno y cada herramienta con sus argumentos y su resultado, para revisar después una sesión
 * de prueba. Se manda en lotes; si falla, se descarta (no estorba al usuario).
 */

const FLUSH_MS = 1500;
const MAX_BATCH = 40;
const MAX_RESULT = 3000;

let conversation = newId();
let surface = 'web-text';
let queue: AiLogEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Empieza una conversación nueva (una por sesión de voz). */
export function startConversation(name: string): void {
  flush();
  conversation = newId();
  surface = name;
  logEvent({ kind: 'session', text: name });
}

export function logEvent(e: Omit<AiLogEvent, 'at'>): void {
  if (!serverMode) return;
  queue.push({ at: new Date().toISOString(), ...e });
  if (queue.length >= MAX_BATCH) flush();
  else timer ??= setTimeout(flush, FLUSH_MS);
}

/** Herramienta ejecutada, con su resultado recortado. */
export function logTool(
  name: string,
  args: unknown,
  out: { ok: true; result: unknown } | { ok: false; error: string },
): void {
  let result: string;
  try {
    result = out.ok ? JSON.stringify(out.result ?? null) : out.error;
  } catch {
    result = '(sin serializar)';
  }
  logEvent({
    kind: 'tool',
    name,
    args,
    ok: out.ok,
    result: result.length > MAX_RESULT ? `${result.slice(0, MAX_RESULT)}…` : result,
  });
}

function flush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  const project = session.document.project;
  void api
    .aiLog({
      conversation,
      surface,
      projectId: project.id,
      projectName: project.name.slice(0, 200),
      events,
    })
    .catch(() => undefined);
}

/** Una entrada de la conversación del panel (texto y voz): lo que dijo cada uno y los errores. */
export function logEntry(
  e:
    | { kind: 'user' | 'assistant'; text: string }
    | { kind: 'tool'; name: string; ok: boolean }
    | { kind: 'error'; code: string; text: string },
): void {
  if (e.kind === 'user' || e.kind === 'assistant') logEvent({ kind: e.kind, text: e.text });
  else if (e.kind === 'error') logEvent({ kind: 'error', text: `${e.code}: ${e.text}` });
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
