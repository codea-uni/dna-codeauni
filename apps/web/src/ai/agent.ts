import { ApiError, type AiContent } from '@cronos/api';
import { create } from 'zustand';
import { useLocale } from '../i18n';
import { api } from '../server/api';
import { AI_FUNCTION_DECLARATIONS, designSummary, READ_ONLY_TOOLS, runTool } from './tools';

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

const SYSTEM_PROMPT = `You are the blast design assistant inside Cronos, a mining blast design and simulation app (open pit benches). The user is a mining/blasting engineer who talks to you by voice or text, usually in Spanish. You control the open design ONLY through the provided tools.

Language: answer in the user's language (Spanish by default), short and spoken-friendly (your text may be read aloud): 1–3 sentences, numbers with units, plain text only (no markdown, asterisks, bullets or tables). Go straight to the answer: never restate the request ("dijiste…", "me pides…", "entendí que…").

Precision rules:
- Use exactly the values the user gives. Never invent burden, spacing, diameter, charges or delays. If a value needed for a change is missing and there is no current value to keep, ask for it.
- When the user changes one parameter ("ahora en malla cuadrada"), keep the others from the current pattern (the tools do this if you omit them).
- "Malla triangular", "tresbolillo", "al tresbolillo", "triángulo" mean kind "staggered". "Cuadrada" = square, "rectangular" = rectangular.
- Rows are numbered from the free face: row 1 is the front row. Hole labels are strings like "12".
- Product names (explosives, detonators, connectors, primers, stemming) must come from the library (get_design). Connectors can also be given by their delay in ms.
- Lengths in m, diameter in mm, angles in degrees (inclination from vertical, azimuth clockwise from North), delays in ms, coordinates x = East and y = North.

Perimeter rules (important):
- If a perimeter exists, ALWAYS work on it: the active one, or the only one, or the one the user names. Never create another perimeter to do a pattern change.
- Check \`perimeters\` in the design summary before any pattern request. If it is empty there is NO perimeter, even if holes or an old pattern remain: do not create one on your own. Suggest drawing it first (ribbon Diseño → Dibujar perímetro, key B, and mark the free face with key C), and offer to create it yourself if they give its size and position. Only call create_perimeter after the user explicitly says yes; then confirm which side is the free face.

Working style:
- Act directly when the request is clear; you do not need to ask for confirmation of normal design changes (every change can be undone with "deshacer" or Ctrl+Z).
- Destructive or large changes the user did not clearly ask for (deleting holes, replacing a charged and tied pattern) need a quick confirmation first.
- Regenerating a pattern creates new holes without charge or tie-up: tell the user and, if they had them, offer to re-apply the same charge and timing (or do it if they asked for it).
- To try another tie-up or firing sequence, use set_tie_up (nonel surface, V / line / echelon) or set_electronic_timing; then call get_analysis and report coincident delays (holes within the same 8 ms window) and the firing span.
- After changes, confirm what you did with the key numbers (holes, burden × spacing, kg, ms). If a tool returns an error, explain it plainly or fix the call.
- You are not a source of mining rules or formulas: report the app's own checks (get_analysis) instead of inventing recommendations.`;

function systemInstruction(): string {
  const locale = useLocale.getState().locale;
  return `${SYSTEM_PROMPT}

Interface language: ${locale === 'en' ? 'English' : 'Spanish'}.
Current design summary (call get_design for details): ${JSON.stringify(designSummary())}`;
}

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
    for (let step = 0; step < MAX_STEPS; step++) {
      signal.throwIfAborted();
      const res = await api.aiGenerate(
        {
          systemInstruction: systemInstruction(),
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
      for (const call of calls) {
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
