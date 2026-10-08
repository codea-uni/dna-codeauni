/**
 * Audio para el asistente cuando el navegador no reconoce voz (Meta Quest, Firefox, Safari…): se
 * graba con el micrófono y lo escucha Gemini (D-18, D-19). Lo usan el panel de la web y el visor.
 */

/** Frecuencia del audio que se envía [Hz]: alcanza para voz y pesa poco. */
const RATE = 16_000;

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

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Lo grabado (webm/opus del navegador) a WAV mono de 16 kHz: Gemini no lista webm entre sus formatos. */
export async function toWav(blob: Blob): Promise<Uint8Array> {
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

/** ¿Se puede grabar el micrófono? (exige HTTPS o localhost). */
export const canRecord: boolean =
  typeof navigator !== 'undefined' &&
  'mediaDevices' in navigator &&
  typeof MediaRecorder !== 'undefined';

/** Grabación en curso: `stop()` entrega el WAV en base64 (o `null` si se canceló). */
export interface Recording {
  stop: () => Promise<string | null>;
  cancel: () => void;
  /** Tiempo grabado [ms]. */
  elapsed: () => number;
}

/** Abre el micrófono y empieza a grabar; al terminar libera el micrófono. */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const release = () => {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  };
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => chunks.push(e.data);
  let cancelled = false;
  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => {
      release();
      resolve();
    };
  });
  rec.start();
  const since = performance.now();
  return {
    elapsed: () => performance.now() - since,
    stop: async () => {
      if (rec.state === 'recording') rec.stop();
      await stopped;
      if (cancelled || chunks.length === 0) return null;
      return toBase64(await toWav(new Blob(chunks, { type: rec.mimeType })));
    },
    cancel: () => {
      cancelled = true;
      if (rec.state === 'recording') rec.stop();
    },
  };
}
