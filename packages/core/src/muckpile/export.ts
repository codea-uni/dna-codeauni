import type { ScalarGrid } from '../energy/contours';
import type { Blast, Vec3 } from '../model/types';
import type { MuckpileBlocks } from './types';

/**
 * Exportaciones de la pila (A7). Coordenadas de proyecto; el STL (float32) va relativo al origen
 * del proyecto, que se escribe en la cabecera, porque float32 no guarda UTM con precisión.
 */

const fixed = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '');

/** Nube XYZ de la superficie (un punto por celda), con cabecera `x,y,z`. */
export function surfaceToXyz(g: ScalarGrid, delimiter = ','): string {
  const lines = [['x', 'y', 'z'].join(delimiter)];
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const z = g.values[j * g.nx + i] ?? NaN;
      if (!Number.isFinite(z)) continue;
      lines.push(
        [
          fixed(g.originX + (i + 0.5) * g.cellSize),
          fixed(g.originY + (j + 0.5) * g.cellSize),
          fixed(z),
        ].join(delimiter),
      );
    }
  return lines.join('\n') + '\n';
}

/** Recorre los triángulos de la grilla (dos por celda entre centros), con vértices válidos. */
function forEachTriangle(g: ScalarGrid, fn: (a: number, b: number, c: number) => void): void {
  for (let j = 0; j + 1 < g.ny; j++)
    for (let i = 0; i + 1 < g.nx; i++) {
      const k = j * g.nx + i;
      const ok = (q: number) => Number.isFinite(g.values[q] ?? NaN);
      if (ok(k) && ok(k + 1) && ok(k + g.nx)) fn(k, k + 1, k + g.nx);
      if (ok(k + 1) && ok(k + g.nx + 1) && ok(k + g.nx)) fn(k + 1, k + g.nx + 1, k + g.nx);
    }
}

/** Malla OBJ de la superficie (vértices en coordenadas de proyecto, caras 1-indexadas). */
export function surfaceToObj(g: ScalarGrid, name = 'pila'): string {
  const out: string[] = [`# Cronos · superficie de la pila (${name})`, `o ${name}`];
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const z = g.values[j * g.nx + i] ?? NaN;
      out.push(
        `v ${fixed(g.originX + (i + 0.5) * g.cellSize)} ${fixed(g.originY + (j + 0.5) * g.cellSize)} ${fixed(Number.isFinite(z) ? z : 0)}`,
      );
    }
  forEachTriangle(g, (a, b, c) => out.push(`f ${a + 1} ${b + 1} ${c + 1}`));
  return out.join('\n') + '\n';
}

/** STL binario de la superficie, relativo a `origin` (anotado en la cabecera de 80 bytes). */
export function surfaceToStl(g: ScalarGrid, origin: Vec3): Uint8Array {
  const tris: number[] = [];
  forEachTriangle(g, (a, b, c) => tris.push(a, b, c));
  const count = tris.length / 3;
  const buf = new ArrayBuffer(84 + 50 * count);
  const bytes = new Uint8Array(buf);
  const header = `Cronos pila · origen ${origin.x.toFixed(3)} ${origin.y.toFixed(3)} ${origin.z.toFixed(3)}`;
  for (let i = 0; i < Math.min(80, header.length); i++) bytes[i] = header.charCodeAt(i) & 0x7f;
  const view = new DataView(buf);
  view.setUint32(80, count, true);
  const vx = (k: number) => g.originX + ((k % g.nx) + 0.5) * g.cellSize - origin.x;
  const vy = (k: number) => g.originY + (Math.floor(k / g.nx) + 0.5) * g.cellSize - origin.y;
  const vz = (k: number) => (g.values[k] ?? 0) - origin.z;
  for (let t = 0; t < count; t++) {
    const off = 84 + 50 * t;
    const [a, b, c] = [tris[3 * t] ?? 0, tris[3 * t + 1] ?? 0, tris[3 * t + 2] ?? 0];
    const ux = vx(b) - vx(a);
    const uy = vy(b) - vy(a);
    const uz = vz(b) - vz(a);
    const wx = vx(c) - vx(a);
    const wy = vy(c) - vy(a);
    const wz = vz(c) - vz(a);
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    view.setFloat32(off, nx, true);
    view.setFloat32(off + 4, ny, true);
    view.setFloat32(off + 8, nz, true);
    [a, b, c].forEach((k, v) => {
      view.setFloat32(off + 12 + 12 * v, vx(k), true);
      view.setFloat32(off + 16 + 12 * v, vy(k), true);
      view.setFloat32(off + 20 + 12 * v, vz(k), true);
    });
    view.setUint16(off + 48, 0, true);
  }
  return bytes;
}

/** Vectores de desplazamiento por bloque (origen → destino) en CSV. */
export function blocksToCsv(
  blocks: MuckpileBlocks,
  blast: Pick<Blast, 'holes' | 'domains'>,
  delimiter = ',',
): string {
  const head = [
    'bloque',
    'taladro',
    'x0',
    'y0',
    'z0',
    'x1',
    'y1',
    'z1',
    'dx',
    'dy',
    'dz',
    'desplazamiento_horizontal_m',
    'volumen_m3',
    'salida_ms',
    'impacto_ms',
    'tamano_fragmento_m',
    'dominio',
  ];
  const lines = [head.join(delimiter)];
  const domains = blast.domains ?? [];
  const quote = (s: string) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  for (let k = 0; k < blocks.count; k++) {
    const o = [0, 1, 2].map((c) => blocks.origin[3 * k + c] ?? NaN);
    const d = [0, 1, 2].map((c) => blocks.destination[3 * k + c] ?? NaN);
    const dx = (d[0] ?? 0) - (o[0] ?? 0);
    const dy = (d[1] ?? 0) - (o[1] ?? 0);
    const dz = (d[2] ?? 0) - (o[2] ?? 0);
    const dom = blocks.domain[k] ?? -1;
    lines.push(
      [
        String(k + 1),
        quote(blast.holes[blocks.hole[k] ?? -1]?.label ?? ''),
        ...o.map((v) => fixed(v)),
        ...d.map((v) => fixed(v)),
        fixed(dx),
        fixed(dy),
        fixed(dz),
        fixed(Math.hypot(dx, dy)),
        fixed(blocks.volume[k] ?? NaN),
        fixed((blocks.launchTime[k] ?? NaN) * 1000, 1),
        fixed((blocks.impactTime[k] ?? NaN) * 1000, 1),
        fixed(blocks.fragmentSize[k] ?? NaN, 3),
        quote(dom >= 0 ? (domains[dom]?.name ?? '') : ''),
      ].join(delimiter),
    );
  }
  return lines.join('\n') + '\n';
}
