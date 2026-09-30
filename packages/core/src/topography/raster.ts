import type { ImageGeoref } from './asset';

/**
 * Imágenes georreferenciadas con archivo de mundo (`.jgw`, `.pgw`, `.tfw`, `.wld`): seis líneas
 * A, D, B, E, C, F de la transformación afín `x = A·col + B·fila + C`, `y = D·col + E·fila + F`,
 * donde (C, F) es el **centro** del píxel superior izquierdo (formato de ESRI).
 */
export function parseWorldFile(text: string): ImageGeoref | null {
  const v = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map(Number);
  if (v.length < 6 || !v.slice(0, 6).every(Number.isFinite)) return null;
  const [a = 0, d = 0, b = 0, e = 0, c = 0, f = 0] = v;
  // Esquina superior izquierda: medio píxel hacia atrás en ambos ejes de la imagen.
  const originX = c - a / 2 - b / 2;
  const originY = f - d / 2 - e / 2;
  const pixelSizeX = Math.hypot(a, d);
  const pixelSizeY = -Math.hypot(b, e);
  // Giro horario desde el Norte: el eje de columnas apunta a (a, d).
  const rotation = -Math.atan2(d, a);
  return { originX, originY, pixelSizeX, pixelSizeY, rotation };
}

/** Tipo y tamaño de una imagen PNG, JPEG o WebP leyendo solo su encabezado. */
export function imageSize(
  bytes: Uint8Array,
): { mime: string; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u8 = (i: number) => bytes[i] ?? 0;
  // PNG: firma de 8 bytes y el bloque IHDR con ancho y alto (big-endian).
  if (bytes.length >= 24 && u8(0) === 0x89 && u8(1) === 0x50 && u8(2) === 0x4e && u8(3) === 0x47)
    return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  // JPEG: se recorren los marcadores hasta un SOF (C0–CF salvo C4, C8 y CC).
  if (bytes.length >= 4 && u8(0) === 0xff && u8(1) === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (u8(i) !== 0xff) return null;
      const marker = u8(i + 1);
      const len = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { mime: 'image/jpeg', height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      i += 2 + len;
    }
    return null;
  }
  // WebP (VP8X, VP8 y VP8L).
  if (
    bytes.length >= 30 &&
    String.fromCharCode(u8(0), u8(1), u8(2), u8(3), u8(8), u8(9), u8(10), u8(11)) === 'RIFFWEBP'
  ) {
    const chunk = String.fromCharCode(u8(12), u8(13), u8(14), u8(15));
    if (chunk === 'VP8X')
      return {
        mime: 'image/webp',
        width: 1 + (u8(24) | (u8(25) << 8) | (u8(26) << 16)),
        height: 1 + (u8(27) | (u8(28) << 8) | (u8(29) << 16)),
      };
    if (chunk === 'VP8 ')
      return {
        mime: 'image/webp',
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return {
        mime: 'image/webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
  }
  return null;
}
