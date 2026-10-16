import { mkdtemp, readdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TtsCache } from './ttsCache';

describe('caché exacta de voz', () => {
  it('la clave cambia con cualquier diferencia de texto, modelo o voz', () => {
    const k = TtsCache.key('m', 'Kore', 'Listo.');
    expect(TtsCache.key('m', 'Kore', 'Listo.')).toBe(k);
    expect(TtsCache.key('m', 'Kore', 'Listo')).not.toBe(k);
    expect(TtsCache.key('m2', 'Kore', 'Listo.')).not.toBe(k);
    expect(TtsCache.key('m', 'Puck', 'Listo.')).not.toBe(k);
  });

  it('respeta el tope: borra primero lo menos usado', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tts-'));
    const cache = new TtsCache(dir, 250);
    const audio = { mimeType: 'audio/wav', data: 'x'.repeat(100) };
    await cache.set('viejo', audio);
    await utimes(join(dir, 'viejo.json'), new Date(1000), new Date(1000));
    await cache.set('medio', audio);
    await cache.set('nuevo', audio);
    await cache.sweep();
    const left = await readdir(dir);
    expect(left).not.toContain('viejo.json');
    expect(left).toContain('nuevo.json');
    expect(await cache.get('nuevo')).toEqual(audio);
    expect(await cache.get('viejo')).toBeNull();
  });
});
