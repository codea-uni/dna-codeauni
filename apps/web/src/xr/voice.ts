import type { Engine, XrLine } from '@cronos/engine';
import { sendToAssistant, useAiStore } from '../ai/agent';
import { encodeWav, toBase64, toWav } from '../ai/audio';
import { ERROR_KEYS, speak, speechLang, TOOL_LABELS } from '../ai/labels';
import { t, useLocale } from '../i18n';
import { api, serverMode } from '../server/api';

/**
 * Edición por voz dentro del visor (D-18, D-19). El navegador del Quest no tiene reconocimiento de
 * voz (Web Speech API), así que se graba el audio y lo escucha Gemini con el mismo asistente de la
 * web: mismas herramientas y comandos, y cada cambio se deshace. Se habla manteniendo A en el
 * control derecho o con el botón del menú.
 */

/** La grabación se corta sola a los 15 s. */
const MAX_MS = 15_000;
/** Menos de esto es un toque sin querer: no se envía. */
const MIN_MS = 400;
/** El saludo llega unos segundos después de entrar (cuando ya se ve la escena). */
const GREET_MS = 2500;
/** Caracteres por línea en el panel de voz. */
const WRAP = 38;

/** Corta un texto en líneas de hasta `width` caracteres por palabras. */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Audio de Gemini TTS listo para `decodeAudioData`: WAV tal cual, o PCM de 16 bits crudo
 * (`audio/L16;rate=24000`, little-endian) envuelto en WAV.
 */
export function playableAudio(mimeType: string, bytes: Uint8Array): Uint8Array {
  if (!/l16|pcm/i.test(mimeType)) return bytes;
  const rate = Number(/rate=(\d+)/i.exec(mimeType)?.[1] ?? 24_000);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = v.getInt16(i * 2, true) / 0x8000;
  return encodeWav(samples, rate);
}

function fromBase64(data: string): Uint8Array {
  return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'listening'; since: number }
  | { kind: 'thinking' }
  | { kind: 'answer'; lines: string[]; tools: ToolChip[]; speaking: boolean };

interface ToolChip {
  name: string;
  ok: boolean;
}

export interface XrVoice {
  /** ¿Se puede hablar? (hace falta el servidor: el asistente pasa por él). */
  readonly available: boolean;
  readonly listening: boolean;
  /** Empieza a grabar o, si ya graba, envía. */
  toggle: () => void;
  dispose: () => void;
}

/**
 * Voz en el visor: graba, envía al asistente con el contexto del visor (`context()`: escenario y
 * taladro apuntado) y muestra «escuchando → pensando → respuesta» en el panel frente a la cabeza.
 */
export function bindXrVoice(engine: Engine, context: () => string, onChange: () => void): XrVoice {
  let phase: Phase = { kind: 'idle' };
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let analyser: AnalyserNode | null = null;
  /** Contexto de audio de la sesión (vúmetro y voz del asistente). */
  let audioCtx: AudioContext | null = null;
  /** Respuesta que se está leyendo en voz alta (se corta al volver a hablar). */
  let playing: AudioBufferSourceNode | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let meter: ReturnType<typeof setInterval> | null = null;
  /** Se pidió hablar y no se soltó (A puede soltarse mientras se pide el micrófono). */
  let wanted = false;

  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  /** Volumen del micrófono 0–1 (RMS con algo de ganancia) para el vúmetro. */
  const level = (): number => {
    if (!analyser) return 0;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const x of buf) sum += x * x;
    return Math.min(1, Math.sqrt(sum / buf.length) * 4);
  };

  const rows = (): XrLine[] => {
    switch (phase.kind) {
      case 'idle':
        return [];
      case 'starting':
        return [{ icon: '●', label: t('xr.voice.starting') }];
      case 'listening':
        return [
          { icon: '●', label: t('xr.voice.listening') },
          { label: t('xr.voice.release'), slider: Math.round(level() * 20) / 20 },
        ];
      case 'thinking':
        return [{ icon: '…', label: t('xr.voice.thinking') }];
      case 'answer': {
        const lines: XrLine[] = phase.lines.map((label) => ({ label }));
        if (phase.speaking) lines.unshift({ icon: '♪', label: t('xr.voice.speaking') });
        for (let i = 0; i < phase.tools.length; i += 2)
          lines.push(
            phase.tools.slice(i, i + 2).map((tool) => ({
              label: `${tool.ok ? '✓' : '✗'} ${t(TOOL_LABELS[tool.name] ?? 'ai.tool.other')}`,
              active: tool.ok,
            })),
          );
        lines.push({ label: t('xr.voice.reply') });
        return lines;
      }
    }
  };

  const show = (next: Phase) => {
    phase = next;
    engine.setXrVoice(rows());
    onChange();
  };

  const stopMeter = () => {
    if (meter !== null) clearInterval(meter);
    meter = null;
  };

  const start = async () => {
    if (phase.kind !== 'idle' && phase.kind !== 'answer') return;
    wanted = true;
    clearTimers();
    // El micrófono tarda en abrirse la primera vez: que se vea que el pedido llegó.
    if (!stream) show({ kind: 'starting' });
    hush();
    try {
      stream ??= await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
      return;
    }
    // `wanted` cambia mientras se espera el micrófono (TS no lo ve dentro de la función).
    if (!engine.xrMode || !(wanted as boolean)) {
      show({ kind: 'idle' });
      return;
    }
    const ctx = ensureAudio();
    analyser ??= (() => {
      const a = ctx.createAnalyser();
      a.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(a);
      return a;
    })();
    const chunks: Blob[] = [];
    const since = performance.now();
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => void send(new Blob(chunks, { type: rec.mimeType }), since);
    recorder = rec;
    rec.start();
    show({ kind: 'listening', since });
    // Vúmetro: el panel se redibuja ~10 veces por segundo (rAF de la ventana no corre en XR).
    meter = setInterval(() => {
      engine.setXrVoice(rows());
    }, 100);
    timers.push(setTimeout(stop, MAX_MS));
  };

  const stop = () => {
    wanted = false;
    stopMeter();
    clearTimers();
    if (recorder?.state === 'recording') recorder.stop();
    recorder = null;
  };

  const send = async (blob: Blob, since: number) => {
    if (performance.now() - since < MIN_MS) {
      show({ kind: 'idle' });
      return;
    }
    show({ kind: 'thinking' });
    const before = useAiStore.getState().entries.length;
    let answer: string;
    try {
      const wav = await toWav(blob);
      answer = await sendToAssistant(context(), { mimeType: 'audio/wav', data: toBase64(wav) });
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
      return;
    }
    const added = useAiStore.getState().entries.slice(before);
    const tools = added.flatMap((e) => (e.kind === 'tool' ? [{ name: e.name, ok: e.ok }] : []));
    const err = added.find((e) => e.kind === 'error');
    const text = err
      ? t(ERROR_KEYS[err.code] ?? 'ai.error.ai_failed', { text: err.text })
      : answer || t('ai.error.ai_empty');
    void reply(text, answer ? answer : null, tools);
  };

  /** Muestra la respuesta, la lee en voz alta y la quita unos segundos después de terminar. */
  const reply = async (text: string, spoken: string | null, tools: ToolChip[]) => {
    const lines = wrapText(text, WRAP);
    show({ kind: 'answer', lines, tools, speaking: spoken !== null });
    if (spoken !== null) {
      await say(spoken);
      if (phase.kind !== 'answer' || phase.lines !== lines) return; // ya se habló de nuevo
      show({ kind: 'answer', lines, tools, speaking: false });
    }
    timers.push(
      setTimeout(
        () => {
          show({ kind: 'idle' });
        },
        Math.max(6000, spoken === null ? text.length * 70 : 0),
      ),
    );
  };

  /** Contexto de audio de la sesión; creado fuera de un clic queda suspendido: se reanuda. */
  const ensureAudio = (): AudioContext => {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
    return audioCtx;
  };

  /** Corta la voz del asistente (al volver a hablar o al salir). */
  const hush = () => {
    playing?.stop();
    playing = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  /**
   * Lee un texto con la voz de Gemini (el navegador del Quest no garantiza `speechSynthesis`); si
   * falla, con la voz del navegador. Termina cuando acaba de hablar.
   */
  const say = async (text: string): Promise<void> => {
    hush();
    try {
      const res = await api.aiSpeech({ text: text.slice(0, 2000) });
      const ctx = ensureAudio();
      const bytes = playableAudio(res.mimeType, fromBase64(res.data));
      const buffer = await ctx.decodeAudioData(bytes.slice().buffer);
      if (!engine.xrMode) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      playing = src;
      await new Promise<void>((resolve) => {
        src.onended = () => {
          resolve();
        };
        src.start();
      });
      if (playing === src) playing = null;
    } catch {
      speak(text, speechLang(useLocale.getState().locale));
    }
  };

  /** Saludo al entrar: invita a hablar y a pedir recomendaciones (una vez por sesión). */
  const greet = () => {
    if (!serverMode || !engine.xrMode || phase.kind !== 'idle') return;
    const text = t('xr.voice.greeting');
    void reply(text, text, []);
  };

  const showError = (message: string) => {
    show({
      kind: 'answer',
      lines: wrapText(t('xr.voice.error', { message }), WRAP),
      tools: [],
      speaking: false,
    });
    timers.push(
      setTimeout(() => {
        show({ kind: 'idle' });
      }, 6000),
    );
  };

  const close = () => {
    stop();
    hush();
    clearTimers();
    phase = { kind: 'idle' };
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    stream = null;
    analyser = null;
    void audioCtx?.close();
    audioCtx = null;
  };

  const offs = [
    engine.on('xrTalk', (down) => {
      if (!serverMode) return;
      if (down) void start();
      else stop();
    }),
    engine.on('xrSession', (mode) => {
      if (!mode) {
        close();
        return;
      }
      // Recién se entró con un clic: el audio todavía puede arrancar sin otro gesto.
      if (serverMode) ensureAudio();
      timers.push(setTimeout(greet, GREET_MS));
    }),
  ];

  return {
    available: serverMode,
    get listening() {
      return phase.kind === 'listening';
    },
    toggle: () => {
      if (phase.kind === 'listening' || phase.kind === 'starting') stop();
      else void start();
    },
    dispose: () => {
      close();
      for (const off of offs) off();
    },
  };
}
