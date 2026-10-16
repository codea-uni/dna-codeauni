import { create } from 'zustand';
import { useLocale } from '../i18n';
import { api } from '../server/api';
import { useAiStore } from './agent';
import { startConversation } from './transcript';
import { loadKnowledge } from './knowledge';
import { liveSystemInstruction, liveContextNote } from './prompts';
import { AI_FUNCTION_DECLARATIONS, orderToolCalls, READ_ONLY_TOOLS, runTool } from './tools';

/**
 * Voz en vivo con Gemini Live (voz a voz). El navegador habla directo con Google por WebSocket con
 * un token de un uso que entrega la API (`/api/ai/live-token`): el audio no pasa por el servidor y
 * la respuesta empieza ~1,5 s después de terminar de hablar. Las herramientas son las mismas del
 * asistente de texto (`tools.ts`) y corren aquí, sobre el documento abierto: cada cambio se
 * deshace.
 *
 * Turno: micrófono a 16 kHz → (al detectar voz) `activityStart` + audio → silencio → `activityEnd`
 * → herramientas → audio de 24 kHz encolado sin huecos. Sin voz no se manda nada (se cobra el
 * audio). En manos libres el micrófono queda abierto y cada intervención abre un turno sola;
 * mientras el asistente habla solo se escucha una voz claramente más fuerte que su eco, que lo
 * interrumpe (`watchBargeIn`), para que no se responda a sí mismo por el parlante.
 */

export type LivePhase =
  'off' | 'connecting' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface LiveState {
  phase: LivePhase;
  /** Volumen del micrófono 0–1. */
  level: number;
  /** Lo que entendió del usuario en este turno. */
  heard: string;
  /** Lo que va respondiendo (subtítulo). */
  said: string;
  /** Herramienta en curso. */
  tool: string | null;
  /** Herramientas que cambiaron el diseño en el turno (para las fichas del visor). */
  tools: { name: string; ok: boolean }[];
  error: string | null;
  /** De terminar de hablar al primer audio, en el último turno [ms]. */
  latencyMs: number | null;
  /** Manos libres: escucha siempre, sin botón. */
  handsFree: boolean;
}

const INITIAL: LiveState = {
  phase: 'off',
  level: 0,
  heard: '',
  said: '',
  tool: null,
  tools: [],
  error: null,
  latencyMs: null,
  handsFree: false,
};

export const useLiveStore = create<LiveState>(() => ({ ...INITIAL }));

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.' +
  'GenerativeService.BidiGenerateContentConstrained?access_token=';

/** Detección de voz en el navegador: solo decide cuándo empieza y termina la intervención. */
const VOICE_RMS = 0.02;
/** Tras haber hablado, este silencio cierra el turno [ms]. */
const END_SILENCE_MS = 1200;
/** Tocó el botón y no dijo nada: se cancela [ms]. */
const NO_VOICE_MS = 8000;
const MAX_TURN_MS = 30_000;
/** Trozos de 40 ms que se guardan antes de detectar voz (las primeras sílabas). */
const PREROLL = 15;
/** Manos libres: más fuerte y al menos 160 ms seguidos, para no disparar con un golpe o una tos. */
const HANDS_FREE_RMS = 0.035;
const HANDS_FREE_CHUNKS = 4;
/** El eco de la voz del asistente tarda en apagarse [ms]. */
const ECHO_MS = 450;
/**
 * Interrumpir hablando (manos libres): mientras el asistente habla o piensa, una voz más fuerte que
 * el eco que deja pasar la cancelación y sostenida ~240 ms lo corta y abre un turno nuevo.
 */
const BARGE_RMS = 0.06;
const BARGE_CHUNKS = 6;
/** Si tras `activityEnd` no llega nada en este tiempo, se vuelve a escuchar [ms]. */
const THINK_TIMEOUT_MS = 25_000;
/** Sin voz ni herramienta nueva tras responder las herramientas: se le pide que conteste [ms]. */
const STALL_MS = 7000;

// Corre en el hilo de audio: baja a 16 kHz promediando (sirve para 44,1 kHz) y entrega trozos de
// 40 ms en Int16 con su RMS.
const WORKLET = `
class Capture16k extends AudioWorkletProcessor {
  constructor() { super(); this.r = sampleRate / 16000; this.f = 0; this.acc = 0; this.cnt = 0;
    this.buf = new Int16Array(640); this.n = 0; this.sq = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.cnt++; this.f += 1;
      if (this.f >= this.r) {
        this.f -= this.r;
        const s = Math.max(-1, Math.min(1, this.acc / this.cnt));
        this.acc = 0; this.cnt = 0;
        this.buf[this.n++] = s * 32767; this.sq += s * s;
        if (this.n === 640) {
          this.port.postMessage({ pcm: this.buf.buffer, rms: Math.sqrt(this.sq / 640) }, [this.buf.buffer]);
          this.buf = new Int16Array(640); this.n = 0; this.sq = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('capture-16k', Capture16k);`;

export function toBase64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

/** PCM de 16 bits little-endian en base64 → muestras en [-1, 1]. */
export function pcm16ToFloat(data: string): Float32Array<ArrayBuffer> {
  const bin = atob(data);
  const n = bin.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    out[i] = (v >= 0x8000 ? v - 0x10000 : v) / 32768;
  }
  return out;
}

interface FunctionCall {
  id?: string;
  name: string;
  args?: unknown;
}

interface ServerMessage {
  setupComplete?: unknown;
  goAway?: unknown;
  toolCall?: { functionCalls?: FunctionCall[] };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
  };
}

/** Contexto extra por superficie (el visor agrega el estilo de presentación y lo que se apunta). */
export interface LiveSurface {
  /** Instrucciones extra de esta superficie (van en el token, fijas para la sesión). */
  style: string;
  /** Contexto del momento (escenario, taladro apuntado…); va como nota al empezar cada turno. */
  context?: () => string;
  /** Cada herramienta que corre (el visor mueve la vista o enciende capas). */
  onTool?: (name: string, ok: boolean) => void;
  /** Nombre de la superficie en el registro de conversaciones (`web-voice`, `xr-voice`). */
  name?: string;
}

class LiveVoice {
  private ctx: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private preparing: Promise<void> | null = null;
  private surface: LiveSurface = { style: '' };

  private ws: WebSocket | null = null;
  private wsReady = false;
  private pending: string[] = [];
  private reconnect = false;

  private capturing = false;
  private spoke = false;
  private preroll: string[] = [];
  private tStart = 0;
  private tLastVoice = 0;
  private tEnd = 0;
  private tQuiet = 0;
  private streak = 0;
  private audioChunks = 0;
  private toolsPending = 0;
  private hadTool = false;
  private turnDone = false;
  private muted = false;
  /** Se interrumpió a media respuesta: lo que quede de ella no suena ni se muestra. */
  private dropOld = false;
  private bargeStreak = 0;
  private bargeRoll: string[] = [];
  private thinkGuard: ReturnType<typeof setTimeout> | null = null;

  private sources = new Set<AudioBufferSourceNode>();
  private nextAt = 0;

  private get st(): LiveState {
    return useLiveStore.getState();
  }

  private set(patch: Partial<LiveState>): void {
    const before = this.st.phase;
    useLiveStore.setState(patch);
    if (patch.phase === 'ready' && before !== 'ready') {
      if (before === 'speaking') this.tQuiet = performance.now();
      queueMicrotask(() => {
        this.rearm();
      });
    }
  }

  /** Superficie que usa la voz (web o visor); cambia instrucciones: la próxima sesión las toma. */
  use(surface: LiveSurface): void {
    if (surface.style !== this.surface.style) this.reconnect = true;
    this.surface = surface;
  }

  /**
   * Llamar DENTRO de un gesto real (clic): el AudioContext solo arranca con activación del
   * usuario, y dentro del visor el pellizco no siempre cuenta como gesto.
   */
  prepare(): Promise<void> {
    this.ctx ??= new AudioContext();
    void this.ctx.resume().catch(() => undefined);
    if (this.preparing) return this.preparing;
    const ctx = this.ctx;
    this.preparing = (async () => {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(ctx, 'capture-16k');
        node.port.onmessage = (ev: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
          this.chunk(ev.data.pcm, ev.data.rms);
        };
        ctx.createMediaStreamSource(this.mic).connect(node);
        // Sin salida conectada Chrome no procesa el nodo: va a volumen 0.
        const silent = ctx.createGain();
        silent.gain.value = 0;
        node.connect(silent).connect(ctx.destination);
        if (this.st.phase === 'off' || this.st.phase === 'error')
          this.set({ phase: 'ready', error: null });
      } catch (e) {
        this.preparing = null;
        const name = e instanceof DOMException ? e.name : '';
        this.set({
          phase: 'error',
          error:
            name === 'NotAllowedError' || name === 'SecurityError'
              ? 'mic-denied'
              : e instanceof Error
                ? e.message
                : String(e),
        });
        throw e;
      }
    })();
    return this.preparing;
  }

  /** Botón: empieza a escuchar, cierra la intervención o interrumpe al asistente. */
  async toggle(): Promise<void> {
    const phase = this.st.phase;
    if (phase === 'speaking' || phase === 'thinking') {
      this.interrupt();
      if (!this.st.handsFree) await this.begin();
      return;
    }
    if (this.st.handsFree) {
      // Silencia el micrófono; el próximo toque lo vuelve a abrir en manos libres.
      void this.setHandsFree(false);
      this.handsFreeBefore = true;
      return;
    }
    if (this.handsFreeBefore && !this.capturing) {
      await this.setHandsFree(true);
      return;
    }
    if (phase === 'listening') {
      this.finish();
      return;
    }
    await this.begin();
  }

  /** Se silenció desde manos libres: el botón lo reabre así (no pasa a «con botón»). */
  private handsFreeBefore = false;

  /**
   * Turno de texto sin voz del usuario (el saludo al entrar al visor): el modelo responde en voz.
   * No escucha mientras habla; al terminar vuelve a escuchar si está en manos libres.
   */
  greet(prompt: string): void {
    if (this.reconnect) this.closeWs();
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) void this.connect();
    this.capturing = false;
    this.preroll = [];
    this.muted = false;
    this.newTurn();
    this.tEnd = performance.now();
    this.set({ phase: 'thinking', heard: '', said: '', tools: [] });
    this.send({
      clientContent: { turns: [{ role: 'user', parts: [{ text: prompt }] }], turnComplete: true },
    });
  }

  /** Corta la respuesta en curso (lo que siga llegando de ella no suena). */
  interrupt(): void {
    this.stopAudio();
    this.muted = true;
    this.capturing = false;
    this.set({ phase: 'ready' });
  }

  /**
   * Silenciar de verdad (botón del micrófono): deja de escuchar AUNQUE ya se esté hablando o haya
   * gente o un parlante sonando, y corta lo que el asistente estaba diciendo. Volver a activarlo
   * reabre las manos libres.
   */
  async setMicMuted(on: boolean): Promise<void> {
    if (!on) {
      await this.setHandsFree(true);
      return;
    }
    this.handsFreeBefore = true;
    this.set({ handsFree: false });
    if (this.capturing && this.spoke) {
      // La intervención ya abierta se cierra y su respuesta se descarta.
      this.send({ realtimeInput: { activityEnd: {} } });
    }
    this.interrupt();
    this.cancel();
  }

  get micMuted(): boolean {
    return !this.st.handsFree;
  }

  /** Manos libres («tipo Jarvis»): el micrófono queda abierto y cada intervención abre un turno. */
  async setHandsFree(on: boolean): Promise<void> {
    this.handsFreeBefore = on;
    this.set({ handsFree: on });
    if (!on) {
      if (this.capturing && !this.spoke) this.cancel();
      return;
    }
    try {
      await this.prepare();
    } catch {
      this.set({ handsFree: false });
      return;
    }
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) void this.connect();
    this.rearm();
  }

  private rearm(): void {
    if (!this.st.handsFree || this.capturing) return;
    const p = this.st.phase;
    if (p !== 'ready' && p !== 'off' && p !== 'error') return;
    this.capturing = true;
    this.spoke = false;
    this.preroll = [];
    this.tStart = performance.now();
    this.tLastVoice = 0;
    this.streak = 0;
    this.set({ phase: 'listening', error: null });
  }

  private async begin(): Promise<void> {
    try {
      await this.prepare();
    } catch {
      return;
    }
    this.stopAudio();
    this.muted = false;
    this.dropOld = false;
    if (this.reconnect) this.closeWs();
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) void this.connect();
    this.capturing = true;
    this.spoke = false;
    this.preroll = [];
    this.tStart = performance.now();
    this.tLastVoice = 0;
    this.streak = 0;
    this.newTurn();
    this.set({ phase: 'listening', heard: '', said: '', tool: null, tools: [], error: null });
  }

  private newTurn(): void {
    this.audioChunks = 0;
    this.turnDone = false;
    this.toolsPending = 0;
    this.hadTool = false;
  }

  /** Fin de la intervención (botón o silencio). */
  private finish(): void {
    if (!this.capturing) return;
    this.capturing = false;
    if (!this.spoke) {
      // La detección no la oyó pero el usuario dice que habló: se manda igual.
      this.startActivity();
      this.preroll.forEach((m) => {
        this.sendRaw(m);
      });
    }
    this.preroll = [];
    this.send({ realtimeInput: { activityEnd: {} } });
    this.tEnd = performance.now();
    this.set({ phase: 'thinking', level: 0 });
    if (this.thinkGuard) clearTimeout(this.thinkGuard);
    this.thinkGuard = setTimeout(() => {
      if (this.st.phase === 'thinking') this.set({ phase: 'ready' });
    }, THINK_TIMEOUT_MS);
  }

  private cancel(): void {
    this.capturing = false;
    this.preroll = [];
    this.set({ phase: 'ready', level: 0 });
  }

  /** Abre la intervención: contexto del momento (sin pedir respuesta) y `activityStart`. */
  private startActivity(): void {
    this.spoke = true;
    this.clearStall();
    const note = liveContextNote(this.surface.context?.() ?? '');
    this.send({
      clientContent: { turns: [{ role: 'user', parts: [{ text: note }] }], turnComplete: false },
    });
    this.send({ realtimeInput: { activityStart: {} } });
  }

  /** Sin turno abierto: ¿el usuario le está hablando encima al asistente? */
  private watchBargeIn(pcm: ArrayBuffer, rms: number): void {
    const p = this.st.phase;
    // Con una herramienta en curso no se corta (el diseño quedaría a medio cambiar).
    if (!this.st.handsFree || (p !== 'speaking' && p !== 'thinking') || this.toolsPending > 0) {
      this.bargeStreak = 0;
      this.bargeRoll = [];
      return;
    }
    this.bargeRoll.push(
      JSON.stringify({ realtimeInput: { audio: { data: toBase64(pcm), mimeType: 'audio/pcm;rate=16000' } } }),
    );
    if (this.bargeRoll.length > PREROLL) this.bargeRoll.shift();
    this.bargeStreak = rms > BARGE_RMS ? this.bargeStreak + 1 : 0;
    if (this.bargeStreak < BARGE_CHUNKS) return;
    // Lo que falte de la respuesta anterior (aún generándose) se descarta hasta que Gemini la corte.
    this.dropOld = !this.turnDone;
    this.muted = this.dropOld;
    this.stopAudio();
    if (this.thinkGuard) clearTimeout(this.thinkGuard);
    this.capturing = true;
    this.spoke = false;
    this.preroll = this.bargeRoll;
    this.bargeRoll = [];
    this.bargeStreak = 0;
    this.tStart = performance.now();
    this.tLastVoice = this.tStart;
    this.tQuiet = 0;
    // El próximo trozo con voz abre el turno (con lo ya dicho como pre-roll).
    this.streak = HANDS_FREE_CHUNKS - 1;
    this.set({ phase: 'listening' });
  }

  private chunk(pcm: ArrayBuffer, rms: number): void {
    if (!this.capturing) {
      this.watchBargeIn(pcm, rms);
      return;
    }
    const now = performance.now();
    useLiveStore.setState({ level: Math.min(1, rms * 8) });
    const msg = JSON.stringify({
      realtimeInput: { audio: { data: toBase64(pcm), mimeType: 'audio/pcm;rate=16000' } },
    });
    if (rms > VOICE_RMS) this.tLastVoice = now;
    if (!this.spoke) {
      const free = this.st.handsFree;
      this.preroll.push(msg);
      if (this.preroll.length > (free ? PREROLL : NO_VOICE_MS / 40)) this.preroll.shift();
      const echo = free && now - this.tQuiet < ECHO_MS;
      this.streak = !echo && rms > (free ? HANDS_FREE_RMS : VOICE_RMS) ? this.streak + 1 : 0;
      if (this.streak >= (free ? HANDS_FREE_CHUNKS : 1)) {
        if (this.reconnect) this.closeWs();
        if (!this.ws || this.ws.readyState > WebSocket.OPEN) void this.connect();
        this.stopAudio();
        this.muted = this.dropOld;
        this.newTurn();
        this.set({ said: '', heard: '', tools: [] });
        this.startActivity();
        this.preroll.slice(-PREROLL).forEach((m) => {
          this.sendRaw(m);
        });
        this.preroll = [];
      } else if (!free && now - this.tStart > NO_VOICE_MS) {
        this.cancel();
      }
      return;
    }
    this.sendRaw(msg);
    if (now - this.tLastVoice > END_SILENCE_MS || now - this.tStart > MAX_TURN_MS) this.finish();
  }

  // ---------------------------------------------------------------- conexión

  private send(o: unknown): void {
    this.sendRaw(JSON.stringify(o));
  }

  private sendRaw(s: string): void {
    if (this.ws && this.wsReady && this.ws.readyState === WebSocket.OPEN) this.ws.send(s);
    else this.pending.push(s);
  }

  private async connect(): Promise<void> {
    this.wsReady = false;
    this.reconnect = false;
    // Marcador: mientras se pide el token no se abre otra conexión.
    const placeholder = {} as WebSocket;
    this.ws = placeholder;
    if (this.st.phase === 'ready' || this.st.phase === 'off') this.set({ phase: 'connecting' });
    let token: { token: string; model: string };
    try {
      const locale = useLocale.getState().locale;
      await loadKnowledge();
      token = await api.aiLiveToken({
        systemInstruction: liveSystemInstruction(this.surface.style),
        tools: [{ functionDeclarations: AI_FUNCTION_DECLARATIONS }],
        // Gemini Live habla es-US / es-ES / en-US: el español de Latinoamérica es es-US.
        languageCode: locale === 'en' ? 'en-US' : 'es-US',
      });
    } catch (e) {
      if (this.ws === placeholder) this.ws = null;
      this.pending = [];
      this.capturing = false;
      this.set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (this.ws !== placeholder) return;
    const ws = new WebSocket(WS_URL + encodeURIComponent(token.token));
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ setup: { model: `models/${token.model}` } }));
    };
    ws.onmessage = async (ev: MessageEvent<string | Blob>) => {
      const text = typeof ev.data === 'string' ? ev.data : await ev.data.text();
      let m: ServerMessage;
      try {
        m = JSON.parse(text) as ServerMessage;
      } catch {
        return;
      }
      this.message(m, ws);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.wsReady = false;
      this.pending = [];
      const p = this.st.phase;
      if (p === 'thinking' || p === 'connecting' || (p === 'listening' && this.spoke)) {
        this.capturing = false;
        this.set({
          phase: 'error',
          error: `closed${ev.reason ? `: ${ev.reason}` : ''}`,
        });
      }
    };
  }

  private closeWs(): void {
    this.dropOld = false;
    const ws = this.ws;
    this.ws = null;
    this.wsReady = false;
    this.pending = [];
    try {
      ws?.close();
    } catch {
      // ya cerrado
    }
  }

  private message(m: ServerMessage, ws: WebSocket): void {
    if (m.setupComplete) {
      startConversation(this.surface.name ?? 'voice');
      this.wsReady = true;
      if (this.st.phase === 'connecting')
        this.set({ phase: this.capturing ? 'listening' : 'ready' });
      const queued = this.pending;
      this.pending = [];
      queued.forEach((s) => {
        ws.send(s);
      });
      return;
    }
    if (m.goAway) {
      this.reconnect = true;
      return;
    }
    if (m.toolCall) {
      // En orden de flujo y una tras otra (las que esperan red no se intercalan). Las respuestas
      // van juntas en un solo mensaje: respondidas de a una, el modelo a veces contestaba a la
      // primera y se quedaba callado esperando el resto hasta que el usuario volvía a hablar.
      this.clearStall();
      const calls = orderToolCalls(m.toolCall.functionCalls ?? []);
      this.toolsPending += calls.length;
      void (async () => {
        const responses: unknown[] = [];
        for (const fc of calls) responses.push(await this.tool(fc));
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
        this.watchStall(ws);
      })();
      return;
    }
    const sc = m.serverContent;
    if (!sc) return;
    if (this.dropOld) {
      // Restos de la respuesta interrumpida: termina con `interrupted` o con su `turnComplete`.
      if (sc.interrupted || sc.turnComplete) {
        this.dropOld = false;
        this.muted = false;
      }
      const heardOld = sc.inputTranscription?.text;
      if (heardOld) this.set({ heard: this.st.heard + heardOld });
      return;
    }
    if (sc.interrupted) this.stopAudio();
    for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data) this.play(p.inlineData.data);
    const heard = sc.inputTranscription?.text;
    if (heard) this.set({ heard: this.st.heard + heard });
    const said = sc.outputTranscription?.text;
    if (said) this.set({ said: this.st.said + said });
    if (sc.turnComplete) {
      this.log();
      // Tras una herramienta llega un turnComplete ANTES de la respuesta de verdad: solo cierra si
      // ya hubo audio o si no queda nada pendiente.
      if (this.audioChunks > 0) {
        this.turnDone = true;
        this.maybeReady();
      } else if (this.toolsPending === 0 && this.st.phase === 'thinking' && !this.hadTool) {
        this.set({ phase: 'ready' });
      }
    }
  }

  /** Lleva el turno a la conversación del panel (lo que oyó y lo que respondió). */
  private logged = { heard: '', said: '' };
  private log(): void {
    const { heard, said } = this.st;
    const ai = useAiStore.getState();
    // Si el turno siguió sin empezar uno nuevo (habló otra vez tras una herramienta), solo va lo
    // nuevo: antes se repetía la frase anterior pegada a la siguiente («¿Qué másMe gusta…»).
    const fresh = (now: string, before: string) =>
      (before && now.startsWith(before) ? now.slice(before.length) : now).trim();
    const newHeard = heard !== this.logged.heard ? fresh(heard, this.logged.heard) : '';
    const newSaid = said !== this.logged.said ? fresh(said, this.logged.said) : '';
    if (newHeard) ai.push({ kind: 'user', text: `🎙 ${newHeard}` });
    if (newSaid) ai.push({ kind: 'assistant', text: newSaid });
    this.logged = { heard, said };
  }

  /**
   * Tras responder las herramientas, si el modelo no dice nada en `STALL_MS` (ni pide otra
   * herramienta), se le pide que responda: a veces Gemini Live se quedaba mudo hasta que el usuario
   * le volvía a hablar. Una sola vez por tanda.
   */
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private clearStall(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }
  private watchStall(ws: WebSocket): void {
    this.clearStall();
    const chunks = this.audioChunks;
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      // En manos libres el micrófono queda «escuchando» sin que nadie hable: eso no cuenta como turno.
      if (this.audioChunks !== chunks || this.toolsPending > 0 || (this.capturing && this.spoke)) return;
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          clientContent: {
            turns: [
              {
                role: 'user',
                parts: [
                  {
                    text: '[sistema] Ya tienes los resultados de las herramientas. Respóndele ahora al usuario en una o dos frases (lo que se hizo y cualquier advertencia).',
                  },
                ],
              },
            ],
            turnComplete: true,
          },
        }),
      );
    }, STALL_MS);
  }

  /** Ejecuta una herramienta ya contada en `toolsPending`; devuelve la respuesta para el modelo. */
  private async tool(fc: FunctionCall): Promise<unknown> {
    this.hadTool = true;
    this.set({ tool: fc.name });
    const out = await runTool(fc.name, fc.args);
    if (!READ_ONLY_TOOLS.has(fc.name) || !out.ok) {
      useAiStore.getState().push({ kind: 'tool', name: fc.name, ok: out.ok });
      this.set({ tools: [...this.st.tools, { name: fc.name, ok: out.ok }] });
    }
    try {
      this.surface.onTool?.(fc.name, out.ok);
    } catch {
      // la vista no está: nada que mover
    }
    this.toolsPending--;
    if (this.toolsPending === 0) this.set({ tool: null });
    return {
      ...(fc.id ? { id: fc.id } : {}),
      name: fc.name,
      response: out.ok ? { result: out.result ?? null } : { error: out.error },
    };
  }

  // ---------------------------------------------------------------- audio de salida

  private play(data: string): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    this.clearStall();
    if (this.audioChunks === 0) {
      this.set({ latencyMs: Math.round(performance.now() - this.tEnd) });
      this.hadTool = false;
    }
    this.audioChunks++;
    const samples = pcm16ToFloat(data);
    if (samples.length === 0) return;
    const buf = ctx.createBuffer(1, samples.length, 24_000);
    buf.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.04, this.nextAt);
    src.start(at);
    this.nextAt = at + buf.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      this.maybeReady();
    };
    if (this.st.phase !== 'listening' && this.st.phase !== 'speaking') {
      if (this.thinkGuard) clearTimeout(this.thinkGuard);
      this.set({ phase: 'speaking' });
    }
  }

  private maybeReady(): void {
    if (this.turnDone && this.sources.size === 0 && this.st.phase === 'speaking')
      this.set({ phase: 'ready' });
  }

  private stopAudio(): void {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        // ya terminó
      }
    });
    this.sources.clear();
    this.nextAt = 0;
  }

  /** Corta todo y suelta el micrófono (al salir del visor o cerrar el panel). */
  close(): void {
    this.capturing = false;
    this.dropOld = false;
    this.stopAudio();
    this.closeWs();
    this.mic?.getTracks().forEach((t) => {
      t.stop();
    });
    this.mic = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.preparing = null;
    this.clearStall();
    if (this.thinkGuard) clearTimeout(this.thinkGuard);
    this.handsFreeBefore = false;
    useLiveStore.setState({ ...INITIAL });
  }
}

export const liveVoice = new LiveVoice();
