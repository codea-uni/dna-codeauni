import type { Engine, XrLine } from '@cronos/engine';
import { sendToAssistant, useAiStore } from '../ai/agent';
import { ERROR_KEYS, speak, speechLang, TOOL_LABELS } from '../ai/labels';
import { t, useLocale } from '../i18n';
import { serverMode } from '../server/api';

/**
 * Edición por voz dentro del visor (D-18, D-19). El navegador del Quest no tiene reconocimiento de
 * voz (Web Speech API), así que se graba el audio y lo escucha Gemini con el mismo asistente de la
 * web: mismas herramientas y comandos, y cada cambio se deshace. Se habla manteniendo A en el
 * control derecho o con el botón del menú.
 */

/** Frecuencia del audio que se envía [Hz]: alcanza para voz y pesa poco. */
const RATE = 16_000;
/** La grabación se corta sola a los 15 s. */
const MAX_MS = 15_000;
/** Menos de esto es un toque sin querer: no se envía. */
const MIN_MS = 400;
/** Caracteres por línea en el panel de voz. */
const WRAP = 38;

/** WAV PCM de 16 bits mono con las muestras en [−1, 1]. */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // tamaño del bloque fmt
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // bytes por segundo
  v.setUint16(32, 2, true); // bytes por muestra
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => {
    const c = Math.max(-1, Math.min(1, x));
    v.setInt16(44 + i * 2, c < 0 ? c * 0x8000 : c * 0x7fff, true);
  });
  return out;
}

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

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Lo grabado (webm/opus del navegador) a WAV mono de 16 kHz: Gemini no lista webm entre sus formatos. */
async function toWav(blob: Blob): Promise<Uint8Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const mono = await offline.startRendering();
    return encodeWav(mono.getChannelData(0), RATE);
  } finally {
    void ctx.close();
  }
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'listening'; since: number }
  | { kind: 'thinking' }
  | { kind: 'answer'; lines: string[]; tools: { name: string; ok: boolean }[] };

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
  let meterCtx: AudioContext | null = null;
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
        for (let i = 0; i < phase.tools.length; i += 2)
          lines.push(
            phase.tools.slice(i, i + 2).map((tool) => ({
              label: `${tool.ok ? '✓' : '✗'} ${t(TOOL_LABELS[tool.name] ?? 'ai.tool.other')}`,
              active: tool.ok,
            })),
          );
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
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
    meterCtx ??= new AudioContext();
    // Creado fuera de un clic queda suspendido y el analizador da ceros.
    void meterCtx.resume();
    analyser ??= (() => {
      const a = meterCtx.createAnalyser();
      a.fftSize = 512;
      meterCtx.createMediaStreamSource(stream).connect(a);
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
    show({ kind: 'answer', lines: wrapText(text, WRAP), tools });
    if (answer) speak(answer, speechLang(useLocale.getState().locale));
    // Se va solo: más tiempo cuanto más largo es el texto.
    timers.push(
      setTimeout(
        () => {
          show({ kind: 'idle' });
        },
        Math.max(8000, text.length * 70),
      ),
    );
  };

  const showError = (message: string) => {
    show({
      kind: 'answer',
      lines: wrapText(t('xr.voice.error', { message }), WRAP),
      tools: [],
    });
    timers.push(
      setTimeout(() => {
        show({ kind: 'idle' });
      }, 6000),
    );
  };

  const close = () => {
    stop();
    clearTimers();
    phase = { kind: 'idle' };
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    stream = null;
    analyser = null;
    void meterCtx?.close();
    meterCtx = null;
  };

  const offs = [
    engine.on('xrTalk', (down) => {
      if (!serverMode) return;
      if (down) void start();
      else stop();
    }),
    engine.on('xrSession', (mode) => {
      if (!mode) close();
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
