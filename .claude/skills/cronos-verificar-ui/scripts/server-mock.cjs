// Páginas del modo servidor sin base de datos (no hay Docker): intercepta /api/* con datos que
// cumplen los esquemas Zod de @cronos/api. Requiere `VITE_API_URL=/api vite --port 5174`. Uso: node server-mock.cjs <ruta> <captura> [ancho alto]
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const path = require('path');

const BASE = 'http://localhost:5174';
const route = process.argv[2] || '/mines/m1';
const name = process.argv[3] || 'mine';
const W = Number(process.argv[4] || 1440), H = Number(process.argv[5] || 900);

const iso = (d) => new Date(d).toISOString();
const mine = (id, n, projects, last) => ({ id, organizationId: 'o1', name: n, epsg: 32719, restricted: false, accessUserIds: [], createdAt: iso('2026-08-01'), projectCount: projects, lastActivityAt: last && iso(last) });
const version = (pid, num, pname, msg, date, holes, summary = null) => ({ id: `${pid}-v${num}`, projectId: pid, number: num, parentVersionId: num > 1 ? `${pid}-v${num - 1}` : null, restoredFromVersionId: null, authorId: 'u1', authorName: num % 2 ? 'Ana Quispe' : 'Luis Mamani', createdAt: iso(date), message: msg, projectName: pname, schemaVersion: 9, holeCount: holes, sizeBytes: 182000, contentHash: 'a'.repeat(64), summary });
const sum = (o) => ({ blastsAdded: 0, blastsRemoved: 0, holesAdded: 0, holesRemoved: 0, holesMoved: 0, holesGeometry: 0, holesCharge: 0, holesTiming: 0, holesOther: 0, blastFields: [], projectFields: [], ...o });
const project = (id, n, versions, latest, created) => ({ id, mineId: 'm1', name: n, versionCount: versions, createdAt: iso(created), updatedAt: latest.createdAt, latest });
const P = [
  project('p1', 'Polígono 77', 3, version('p1', 3, 'Polígono 77', 'Ajuste de retardos fila 4 a 6', '2026-11-17T18:12:00', 214, sum({ holesTiming: 38 })), '2026-11-10'),
  project('p2', 'Banco 3420 · Fase 2', 5, version('p2', 5, 'Banco 3420 · Fase 2', 'Carguío con emulsión en taladros con agua', '2026-11-15T09:40:00', 318, sum({ holesCharge: 61 })), '2026-10-02'),
  project('p3', 'Demo · Tajo con topografía', 1, version('p3', 1, 'Demo · Tajo con topografía', 'Proyecto de demostración con topografía', '2026-10-19T20:04:00', 251), '2026-10-19'),
];
const routes = {
  'GET /api/me': { user: { id: 'u1', name: 'Ana Quispe', email: 'ana@demo.pe', locale: 'es', mustChangePassword: false, isSuperAdmin: false }, organization: { id: 'o1', name: 'Minera Andina', role: 'admin', disabled: false } },
  'GET /api/organizations/o1/mines': { mines: [mine('m1', 'Cuajone', 3, '2026-11-17T18:12:00'), mine('m2', 'Toquepala', 0, null)] },
  'GET /api/organizations/o1/members': { members: [] },
  'GET /api/mines/m1': { mine: mine('m1', 'Cuajone', 3, '2026-11-17T18:12:00'), role: 'admin' },
  'GET /api/mines/m1/projects': { projects: P },
  'GET /api/mines/m1/versions': { versions: [P[0].latest, P[1].latest, version('p1', 2, 'Polígono 77', 'Cara libre redefinida', '2026-11-14T11:20:00', 214, sum({ holesMoved: 12 })), P[2].latest], hasMore: false },
  'GET /api/mines/m1/surveys': { surveys: [{ survey: { id: 's1', name: 'NP-POL 77', surveyDate: '2026-10-21', epsg: 32719, source: { format: 'dxf', files: ['np-pol-77.dxf'] }, bounds: { minX: 0, minY: 0, minZ: 3300, maxX: 900, maxY: 700, maxZ: 3620 }, stats: { points: 184220, triangles: 366012, lines: 412 }, assets: {} }, createdAt: iso('2026-10-21T15:00:00'), createdBy: { id: 'u2', name: 'Luis Mamani' } }] },
};

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'es-ES' });
  const page = await ctx.newPage();
  const missing = new Set();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  await page.route((u) => u.pathname.startsWith('/api/'), (r) => {
    const u = new URL(r.request().url());
    const key = `${r.request().method()} ${u.pathname}`;
    // MOCK_SIGNED_OUT=1: sin sesión, para ver el login.
    const signedOut = process.env.MOCK_SIGNED_OUT && key === 'GET /api/me';
    const body = signedOut ? undefined : routes[key];
    if (!body) missing.add(key);
    return r.fulfill({ status: body ? 200 : signedOut ? 401 : 404, contentType: 'application/json', body: JSON.stringify(body ?? { error: 'not_found', message: 'mock' }) });
  });
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(process.cwd(), `${name}.png`) });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  console.log(JSON.stringify({ missing: [...missing], errors, axe: axe.violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`) }, null, 1));
  await b.close();
})();
