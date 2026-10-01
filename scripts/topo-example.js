/**
 * Genera `packages/core/src/examples/mineTopoData.ts` (ejemplo «Mina sobre levantamiento DXF») a
 * partir del levantamiento `data/surveys/new-topo.dxf.gz` (TIN de 3DFACE, UTM):
 *
 *   node scripts/topo-example.js [levantamiento.dxf | levantamiento.dxf.gz]
 *
 * 1. Recorta el tajo (caja `BOX`): triángulos con sus tres vértices adentro, vértices únicos al cm.
 * 2. Codifica el TIN: vértices en orden de primer uso, en cm desde `base`, deltas zigzag en varint;
 *    cada índice como (próximo nuevo − índice) en varint (0 = vértice nuevo); deflate crudo y base64.
 * 3. Traza la cresta y el pie del banco 3465 hacia el tajo (Sur): la cresta donde el terreno baja
 *    1 m del banco y el pie donde queda a 1 m del banco de abajo (3450), cada 5 m en Este.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { format, resolveConfig } from 'prettier';

const BOX = { x0: 326_450, y0: 8_107_950, x1: 327_650, y1: 8_109_150 };
const BENCH_TOP = 3465;
const BENCH_FLOOR = 3450;
const CREST_X = [327_040, 327_370];
const OUT = new URL('../packages/core/src/examples/mineTopoData.ts', import.meta.url);

const source = 'data/surveys/new-topo.dxf.gz';
const file = process.argv[2] ?? new URL(`../${source}`, import.meta.url);
const input = fs.createReadStream(file);
const decoded = String(file).endsWith('.gz') ? input.pipe(zlib.createGunzip()) : input;

// ---------------------------------------------------------------- 1. Recorte
const inBox = (x, y) => x >= BOX.x0 && x <= BOX.x1 && y >= BOX.y0 && y <= BOX.y1;
const vIndex = new Map();
const V = [];
const T = [];
const vertex = (x, y, z) => {
  const key = `${Math.round(x * 100)},${Math.round(y * 100)}`;
  let i = vIndex.get(key);
  if (i === undefined) {
    i = V.length / 3;
    vIndex.set(key, i);
    V.push(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
  }
  return i;
};
/** Triángulo en sentido antihorario en planta (normales hacia arriba al sombrear). */
const triangle = (a, b, c) => {
  const cross =
    (V[b * 3] - V[a * 3]) * (V[c * 3 + 1] - V[a * 3 + 1]) -
    (V[b * 3 + 1] - V[a * 3 + 1]) * (V[c * 3] - V[a * 3]);
  if (cross > 0) T.push(a, b, c);
  else if (cross < 0) T.push(a, c, b);
};
let code = '';
let type = '';
let face = {};
let line = 0;
const flush = () => {
  const p = [0, 1, 2, 3].map((k) => [face[`1${k}`], face[`2${k}`], face[`3${k}`]]);
  const ok = (q) => q[0] !== undefined && inBox(q[0], q[1]);
  if (!ok(p[0]) || !ok(p[1]) || !ok(p[2])) return;
  const [a, b, c] = p.slice(0, 3).map((q) => vertex(...q));
  if (a !== b && b !== c && a !== c) triangle(a, b, c);
  // 3DFACE de cuatro vértices distintos: segundo triángulo.
  if (ok(p[3]) && (p[3][0] !== p[2][0] || p[3][1] !== p[2][1])) {
    const d = vertex(...p[3]);
    if (d !== a && d !== c) triangle(a, c, d);
  }
};
for await (const raw of readline.createInterface({ input: decoded })) {
  const s = raw.trim();
  if (line++ % 2 === 0) {
    code = s;
    continue;
  }
  if (code === '0') {
    if (type === '3DFACE') flush();
    type = s;
    face = {};
  } else if (type === '3DFACE') face[code] = Number(s);
}

// ---------------------------------------------------------------- 2. Codificación
const order = [];
const remap = new Map();
const idx = T.map((v) => {
  let n = remap.get(v);
  if (n === undefined) {
    n = order.length;
    remap.set(v, n);
    order.push(v);
  }
  return n;
});
const base = [0, 1, 2].map((k) => Math.floor(Math.min(...order.map((v) => V[v * 3 + k])) / 100));
const bytes = [];
const varint = (n) => {
  while (n >= 128) {
    bytes.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  bytes.push(n);
};
const zigzag = (n) => (n >= 0 ? n * 2 : -n * 2 - 1);
varint(order.length);
varint(idx.length / 3);
const prev = [0, 0, 0];
for (const v of order)
  for (let k = 0; k < 3; k++) {
    const q = V[v * 3 + k] - base[k] * 100;
    varint(zigzag(q - prev[k]));
    prev[k] = q;
  }
let next = 0;
for (const i of idx) {
  varint(next - i);
  if (i === next) next++;
}
const tin = zlib.deflateRawSync(Buffer.from(bytes), { level: 9 }).toString('base64');

// ---------------------------------------------------------------- 3. Cresta y pie
const xyz = (v) => [V[v * 3] / 100, V[v * 3 + 1] / 100, V[v * 3 + 2] / 100];
/** Cota del TIN en (x, y) (barrido lineal: el script corre una vez). */
const tris = [];
for (let t = 0; t < T.length; t += 3) tris.push([xyz(T[t]), xyz(T[t + 1]), xyz(T[t + 2])]);
const near = tris.filter(([a, b, c]) =>
  [a, b, c].some(
    (p) => p[0] > CREST_X[0] - 20 && p[0] < CREST_X[1] + 20 && p[1] > 8_108_450 && p[1] < 8_108_800,
  ),
);
function z(x, y) {
  for (const [a, b, c] of near) {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (d === 0) continue;
    const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
    const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * a[2] + l2 * b[2] + l3 * c[2];
  }
  return NaN;
}
const crest = [];
const toe = [];
const runs = [];
for (let x = CREST_X[0]; x <= CREST_X[1]; x += 5) {
  let y = 8_108_760;
  while (!(z(x, y) < BENCH_TOP - 1)) y -= 0.25;
  const yc = y;
  while (!(z(x, y) < BENCH_FLOOR + 1)) y -= 0.25;
  crest.push(x, yc, BENCH_TOP);
  toe.push(x, y, BENCH_FLOOR);
}
// Avance cresta–pie perpendicular a la cresta (el barrido es hacia el Sur, oblicuo a ella).
for (let i = 1; i + 1 < crest.length / 3; i++) {
  const dx = crest[(i + 1) * 3] - crest[(i - 1) * 3];
  const dy = crest[(i + 1) * 3 + 1] - crest[(i - 1) * 3 + 1];
  runs.push(((crest[i * 3 + 1] - toe[i * 3 + 1]) * Math.abs(dx)) / Math.hypot(dx, dy));
}
runs.sort((a, b) => a - b);
const run = runs[Math.floor(runs.length / 2)];
// Ángulo de la cara medido en el levantamiento: (banco − 2 m) de alto en la mediana del avance.
const faceAngleDeg = Math.round(
  (Math.atan((BENCH_TOP - 1 - (BENCH_FLOOR + 1)) / run) * 180) / Math.PI,
);

const fmt = (a) => a.map((n) => +n.toFixed(2)).join(', ');
fs.writeFileSync(
  OUT,
  await format(
    `// Generado por scripts/topo-example.js desde «${source}»: no editar a mano.
// ${order.length} vértices y ${idx.length / 3} triángulos del tajo (E ${BOX.x0}–${BOX.x1}, N ${BOX.y0}–${BOX.y1}).

/** Origen de las coordenadas del TIN codificado [m]. */
export const MINE_TOPO_BASE = [${base.join(', ')}] as const;

/** TIN del tajo: varint + deflate crudo en base64 (ver el script). */
export const MINE_TOPO_TIN =
  '${tin}';

/** Cresta del banco ${BENCH_TOP} hacia el tajo, de Oeste a Este (x, y, z) [m]. */
export const MINE_TOPO_CREST = [${fmt(crest)}];

/** Pie de esa cara, sobre el banco ${BENCH_FLOOR} (x, y, z) [m]. */
export const MINE_TOPO_TOE = [${fmt(toe)}];

/** Ángulo de la cara medido en el levantamiento [°] (mediana del avance cresta–pie perpendicular: ${run.toFixed(1)} m). */
export const MINE_TOPO_FACE_ANGLE_DEG = ${faceAngleDeg};
`,
    { ...(await resolveConfig(OUT.pathname)), filepath: OUT.pathname },
  ),
);
console.log({
  vertices: order.length,
  triangles: idx.length / 3,
  base64: tin.length,
  run,
  faceAngleDeg,
});
