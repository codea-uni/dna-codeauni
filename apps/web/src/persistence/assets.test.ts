import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getAsset, putAsset } from './assets';

describe('assets de topografía en IndexedDB', () => {
  it('guarda y lee por hash', async () => {
    await putAsset('a'.repeat(64), new Uint8Array([1, 2, 3]));
    expect([...((await getAsset('a'.repeat(64))) ?? [])]).toEqual([1, 2, 3]);
    expect(await getAsset('b'.repeat(64))).toBeUndefined();
  });
});
