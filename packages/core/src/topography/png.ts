/**
 * Codificador PNG mínimo (RGB de 8 bits, W3C «PNG Specification» 3.ª ed.): bloques deflate sin
 * comprimir (RFC 1951 §3.2.4) dentro de zlib (RFC 1950). Funciona igual en el navegador, en los
 * workers y en Node, sin canvas. Se usa para imágenes generadas (la ortofoto de un ejemplo).
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** PNG de una imagen RGB (`rgb` fila a fila, fila 0 arriba). */
export function encodePngRgb(rgb: Uint8Array, width: number, height: number): Uint8Array {
  if (rgb.length !== width * height * 3) throw new Error('Tamaño de imagen inconsistente');
  // Datos crudos: cada fila empieza con el filtro 0 (ninguno).
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++)
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * stride + 1);
  // zlib: encabezado, bloques «stored» de hasta 65 535 bytes y Adler-32.
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let at = 2;
  for (let b = 0; b < blocks; b++) {
    const from = b * 65535;
    const len = Math.min(65535, raw.length - from);
    zlib[at++] = b === blocks - 1 ? 1 : 0;
    zlib[at++] = len & 0xff;
    zlib[at++] = len >>> 8;
    zlib[at++] = ~len & 0xff;
    zlib[at++] = (~len >>> 8) & 0xff;
    zlib.set(raw.subarray(from, from + len), at);
    at += len;
  }
  new DataView(zlib.buffer).setUint32(at, adler32(raw));

  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, deflate, filtro por fila, sin entrelazado
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    png.set(p, o);
    o += p.length;
  }
  return png;
}
