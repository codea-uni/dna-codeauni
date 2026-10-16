import { ApiError, type AiContent } from '@cronos/api';
import { logEntry } from './transcript';
import { create } from 'zustand';
import { api } from '../server/api';
import { loadKnowledge } from './knowledge';
import { textSystemInstruction } from './prompts';
import { AI_FUNCTION_DECLARATIONS, orderToolCalls, READ_ONLY_TOOLS, runTool } from './tools';

/**
 * Asistente de IA (Gemini con function calling). La conversación vive aquí; el servidor solo
 * agrega la clave (`/api/ai/generate`). Cada turno: el modelo responde con texto o pide
 * herramientas; la web las ejecuta sobre el documento abierto y le devuelve los resultados, hasta
 * que el modelo contesta en texto.
 */

export type ChatEntry =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; ok: boolean }
  | { kind: 'error'; code: string; text: string };

interface AiState {
  entries: ChatEntry[];
  busy: boolean;
  push: (entry: ChatEntry) => void;
  reset: () => void;
}

export const useAiStore = create<AiState>((set) => ({
  entries: [],
  busy: false,
  push: (entry) => {
    set((s) => ({ entries: [...s.entries, entry] }));
    logEntry(entry);
  },
  reset: () => {
    set({ entries: [], busy: false });
  },
}));

/** Pasos de herramientas por mensaje: corta un bucle si el modelo no termina. */
const MAX_STEPS = 24;
/** Historial que viaja al modelo (turnos); lo más viejo se descarta por mensajes completos. */
const MAX_CONTENTS = 80;

let history: AiContent[] = [];
let controller: AbortController | null = null;

/** Descarta los turnos más viejos sin cortar un par llamada–respuesta de herramientas. */
function trimmed(contents: AiContent[]): AiContent[] {
  if (contents.length <= MAX_CONTENTS) return contents;
  let start = contents.length - MAX_CONTENTS;
  while (start < contents.length) {
    const c = contents[start];
    if (c?.role === 'user' && c.parts.some((p) => typeof p.text === 'string')) break;
    start++;
  }
  return contents.slice(start);
}

interface FunctionCall {
  id?: string;
  name: string;
  args?: unknown;
}

function functionCalls(content: AiContent): FunctionCall[] {
  return content.parts
    .map((p) => p.functionCall as FunctionCall | undefined)
    .filter((c): c is FunctionCall => !!c && typeof c.name === 'string');
}

/** Texto visible del turno (sin los «pensamientos» del modelo). */
function textOf(content: AiContent): string {
  return content.parts
    .filter((p) => typeof p.text === 'string' && p.thought !== true)
    .map((p) => p.text as string)
    .join('')
    .replace(/\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`/g, '$1$2$3')
    .trim();
}

/** Mensaje de voz grabado (el visor no tiene reconocimiento de voz: Gemini escucha el audio). */
export interface VoiceAudio {
  mimeType: string;
  /** Audio en base64. */
  data: string;
}

/** Va con el audio: que conteste directo, sin repetir lo que se le dijo. */
const AUDIO_NOTE =
  'Voice message attached. Act on it and answer directly in 1–2 short sentences. Never repeat, quote or paraphrase what the user said (no "you said…", "dijiste…", "entendí…").';

/**
 * Envía un mensaje del usuario (texto, o audio con un texto de contexto) y ejecuta el bucle de
 * herramientas. Devuelve el texto final del asistente ('' si se canceló o falló; el error queda en
 * la conversación).
 */
export async function sendToAssistant(text: string, audio?: VoiceAudio): Promise<string> {
  const store = useAiStore.getState();
  if (store.busy || (!text.trim() && !audio)) return '';
  store.push({ kind: 'user', text: audio ? `🎤 ${text.trim()}`.trim() : text.trim() });
  useAiStore.setState({ busy: true });
  controller = new AbortController();
  const signal = controller.signal;
  history = trimmed(history);
  const mark = history.length;
  history.push({
    role: 'user',
    parts: audio
      ? [{ text: `${text.trim()}\n${AUDIO_NOTE}`.trim() }, { inlineData: audio }]
      : [{ text: text.trim() }],
  });
  try {
    // Capas de conocimiento del proyecto (empresa, sitio, proyecto) para el contexto del turno.
    await loadKnowledge();
    for (let step = 0; step < MAX_STEPS; step++) {
      signal.throwIfAborted();
      const res = await api.aiGenerate(
        {
          systemInstruction: textSystemInstruction(),
          contents: [...history],
          tools: [{ functionDeclarations: AI_FUNCTION_DECLARATIONS }],
        },
        signal,
      );
      if (!res.content) {
        useAiStore.getState().push({
          kind: 'error',
          code: 'ai_empty',
          text: res.finishReason ?? '',
        });
        return '';
      }
      history.push(res.content);
      const calls = functionCalls(res.content);
      if (calls.length === 0) {
        const answer = textOf(res.content);
        if (answer) useAiStore.getState().push({ kind: 'assistant', text: answer });
        return answer;
      }
      const said = textOf(res.content);
      if (said) useAiStore.getState().push({ kind: 'assistant', text: said });
      const responses: Record<string, unknown>[] = [];
      for (const call of orderToolCalls(calls)) {
        signal.throwIfAborted();
        const out = await runTool(call.name, call.args);
        if (!READ_ONLY_TOOLS.has(call.name) || !out.ok)
          useAiStore.getState().push({ kind: 'tool', name: call.name, ok: out.ok });
        responses.push({
          functionResponse: {
            ...(call.id ? { id: call.id } : {}),
            name: call.name,
            response: out.ok ? { result: out.result ?? null } : { error: out.error },
          },
        });
      }
      history.push({ role: 'user', parts: responses });
    }
    useAiStore.getState().push({ kind: 'error', code: 'ai_steps', text: String(MAX_STEPS) });
    return '';
  } catch (err) {
    if (signal.aborted) {
      useAiStore.getState().push({ kind: 'error', code: 'ai_cancelled', text: '' });
    } else {
      useAiStore.getState().push({
        kind: 'error',
        code: err instanceof ApiError ? err.code : 'ai_failed',
        text: err instanceof Error ? err.message : String(err),
      });
    }
    // El historial vuelve a como estaba (sin turnos a medias); los cambios ya hechos quedan en el
    // documento y el modelo los ve en el resumen del diseño del próximo turno.
    history = history.slice(0, mark);
    return '';
  } finally {
    // El audio no vuelve a viajar en los turnos siguientes (pesa y el límite es de 4 MB): queda la
    // cita de lo que el modelo entendió en su respuesta.
    if (audio) {
      const turn = history[mark];
      if (turn) history[mark] = { ...turn, parts: turn.parts.filter((p) => !('inlineData' in p)) };
    }
    controller = null;
    useAiStore.setState({ busy: false });
  }
}

export function cancelAssistant(): void {
  controller?.abort();
}

export function resetAssistant(): void {
  cancelAssistant();
  history = [];
  useAiStore.getState().reset();
}
