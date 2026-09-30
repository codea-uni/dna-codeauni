import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256';

/** Vectores de prueba de FIPS 180-4 / NIST CSRC (ejemplos de SHA-256). */
describe('sha256Hex', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it('"abc"', () => {
    expect(sha256Hex(enc('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('mensaje vacío', () => {
    expect(sha256Hex(enc(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('mensaje de dos bloques (448 bits)', () => {
    expect(sha256Hex(enc('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
});
