import type { Id } from './types';

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** getRandomValues es caro por llamada (~10 µs); se piden bloques y se consumen de a 10 bytes. */
const POOL_SIZE = 16 * 1024;
const pool = new Uint8Array(POOL_SIZE);
let poolOffset = POOL_SIZE;

function randomBytes(n: number): Uint8Array {
  if (poolOffset + n > POOL_SIZE) {
    crypto.getRandomValues(pool);
    poolOffset = 0;
  }
  const out = pool.subarray(poolOffset, poolOffset + n);
  poolOffset += n;
  return out;
}

/**
 * UUID v7 (RFC 9562): 48 bits de timestamp en ms + aleatorio.
 * Ordenable por tiempo de creación, lo que mantiene estable el orden de inserción.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  bytes.set(randomBytes(10), 6);
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts & 0xff;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // versión 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122
  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
    out += HEX[bytes[i] ?? 0] ?? '00';
  }
  return out;
}

/** Crea un identificador nuevo con la marca de tipo indicada. */
export function newId<B extends string>(): Id<B> {
  return uuidv7() as Id<B>;
}
