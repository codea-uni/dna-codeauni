import { describe, expect, it } from 'vitest';
import { encodeWav } from '../ai/audio';
import { playableAudio, wrapText } from './voice';

describe('audio de voz para el asistente', () => {
  it('WAV PCM 16 bits mono: cabecera RIFF de 44 bytes y muestras en little-endian', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16_000);
    const v = new DataView(wav.buffer);
    const ascii = (at: number, n: number) => String.fromCharCode(...wav.subarray(at, at + n));
    expect(wav.length).toBe(44 + 4 * 2);
    expect(ascii(0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + 8);
    expect(ascii(8, 8)).toBe('WAVEfmt ');
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint32(28, true)).toBe(32_000); // bytes por segundo
    expect(ascii(36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(8);
    // Extremos de 16 bits con signo: +1 → 32767, −1 → −32768.
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([
      0, 32767, -32768, 16383,
    ]);
  });

  it('las respuestas se cortan por palabras para el panel del visor', () => {
    expect(wrapText('Listo: subí el taco a 3 m en el taladro 12.', 16)).toEqual([
      'Listo: subí el',
      'taco a 3 m en el',
      'taladro 12.',
    ]);
    expect(wrapText('  ', 10)).toEqual([]);
  });

  it('el PCM crudo de Gemini TTS (16 bits, 24 kHz) se envuelve en WAV; el WAV pasa tal cual', () => {
    const pcm = new Uint8Array([0x00, 0x00, 0xff, 0x7f]); // 0 y +32767 little-endian
    const wav = playableAudio('audio/L16;codec=pcm;rate=24000', pcm);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(24_000);
    expect([v.getInt16(44, true), v.getInt16(46, true)]).toEqual([0, 32766]);
    expect(playableAudio('audio/wav', pcm)).toBe(pcm);
  });
});
