/**
 * Matriz (column-major, como Three.js) que lleva el cilindro unitario de Three
 * (eje +Y, alto 1 centrado en el origen, radio 1) al tramo from→to con radio `radius`.
 * Escribe 16 valores en `out` a partir de `offset`.
 */
export function writeSegmentMatrix(
  out: Float32Array | number[],
  offset: number,
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  radius: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  // Eje Y del cilindro → dirección del tramo (d). Base ortonormal (a, d, b).
  let ux = 0;
  let uy = 1;
  let uz = 0;
  if (len > 1e-9) {
    ux = dx / len;
    uy = dy / len;
    uz = dz / len;
  }
  // Vector auxiliar no paralelo a d.
  const hx = Math.abs(uz) < 0.9 ? 0 : 1;
  const hz = Math.abs(uz) < 0.9 ? 1 : 0;
  // a = normalize(h × d), b = d × a
  let ax = 0 * uz - hz * uy;
  let ay = hz * ux - hx * uz;
  let az = hx * uy - 0 * ux;
  const al = Math.hypot(ax, ay, az) || 1;
  ax /= al;
  ay /= al;
  az /= al;
  const bx = uy * az - uz * ay;
  const by = uz * ax - ux * az;
  const bz = ux * ay - uy * ax;
  const m = out;
  const o = offset;
  // Columna 0: a·r ; columna 1: d·len ; columna 2: b·r ; columna 3: punto medio.
  m[o] = ax * radius;
  m[o + 1] = ay * radius;
  m[o + 2] = az * radius;
  m[o + 3] = 0;
  m[o + 4] = ux * len;
  m[o + 5] = uy * len;
  m[o + 6] = uz * len;
  m[o + 7] = 0;
  m[o + 8] = bx * radius;
  m[o + 9] = by * radius;
  m[o + 10] = bz * radius;
  m[o + 11] = 0;
  m[o + 12] = (from.x + to.x) / 2;
  m[o + 13] = (from.y + to.y) / 2;
  m[o + 14] = (from.z + to.z) / 2;
  m[o + 15] = 1;
}
