import {
  analyzeBlast,
  computeVibration,
  DEFAULT_ANALYSIS_OPTIONS,
  DEFAULT_VIBRATION_OPTIONS,
  fragmentation,
  holeToe,
  indexLibrary,
  kuzRamInputsFromBlast,
  outwardNormal,
  polygonEdge,
  turboRgb,
  type BlastId,
  type Project,
} from '@cronos/core';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { fitPlan, scaleBarLength } from './planLayout';
import { fmtNumber, toWinAnsi } from './pdfText';
import { REPORT_TEXT, type ReportLanguage } from './reportText';

export interface ReportOptions {
  /** Fecha del informe (ISO). */
  date: string;
  appVersion: string;
  author?: string;
  /** Incluir la tabla de taladros (puede ocupar varias páginas). */
  holeTable: boolean;
  /** Idioma de todos los textos y del formato de números (por omisión 'es'). */
  language?: ReportLanguage;
}

const A4: [number, number] = [595.28, 841.89];
const M = 40; // margen [pt]
const INK = rgb(0.12, 0.14, 0.17);
const MUTED = rgb(0.45, 0.48, 0.52);
const LINE = rgb(0.82, 0.84, 0.87);
const ACCENT = rgb(0.9, 0.45, 0.1);

const color = (hex: number): RGB =>
  rgb(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const turbo = (t: number): RGB => {
  const [r, g, b] = turboRgb(t);
  return rgb(r / 255, g / 255, b / 255);
};

/** Página con cursor vertical y utilidades de texto/tablas. */
class Sheet {
  y: number;
  constructor(
    readonly page: PDFPage,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.y = A4[1] - M;
  }
  text(
    s: string,
    x: number,
    y: number,
    size = 9,
    opts: { bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center' } = {},
  ): void {
    const t = toWinAnsi(s);
    const f = opts.bold ? this.bold : this.font;
    const w = f.widthOfTextAtSize(t, size);
    const dx = opts.align === 'right' ? -w : opts.align === 'center' ? -w / 2 : 0;
    this.page.drawText(t, { x: x + dx, y, size, font: f, color: opts.color ?? INK });
  }
  heading(s: string): void {
    this.y -= 8;
    this.text(s, M, this.y - 12, 12, { bold: true });
    this.y -= 18;
    this.page.drawLine({
      start: { x: M, y: this.y },
      end: { x: A4[0] - M, y: this.y },
      thickness: 0.6,
      color: ACCENT,
    });
    this.y -= 8;
  }
  /** Tabla simple; devuelve false si no entró en la página. */
  table(headers: string[], rows: string[][], widths: number[], size = 8): void {
    const x0 = M;
    const rowH = size + 4;
    const draw = (cells: string[], bold: boolean) => {
      let x = x0;
      cells.forEach((c, i) => {
        const w = widths[i] ?? 60;
        this.text(c, i === 0 ? x : x + w - 2, this.y - size, size, {
          bold,
          align: i === 0 ? 'left' : 'right',
          color: bold ? MUTED : INK,
        });
        x += w;
      });
      this.y -= rowH;
    };
    draw(headers, true);
    this.page.drawLine({
      start: { x: x0, y: this.y + 2 },
      end: { x: x0 + widths.reduce((a, b) => a + b, 0), y: this.y + 2 },
      thickness: 0.4,
      color: LINE,
    });
    for (const r of rows) draw(r, false);
    this.y -= 4;
  }
  /** Párrafo con ajuste de línea al ancho de la página; devuelve false si ya no hay espacio. */
  paragraph(s: string, size = 8.5, color: RGB = INK): boolean {
    const maxW = A4[0] - 2 * M;
    const words = toWinAnsi(s).split(' ');
    let line = '';
    const flush = () => {
      if (!line) return;
      this.text(line, M, this.y - size, size, { color });
      this.y -= size + 3;
      line = '';
    };
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (this.font.widthOfTextAtSize(next, size) > maxW) {
        flush();
        line = w;
      } else line = next;
    }
    flush();
    this.y -= 2;
    return this.y > M + 30;
  }
  keyValues(pairs: [string, string][], columns = 2): void {
    const colW = (A4[0] - 2 * M) / columns;
    const rows = Math.ceil(pairs.length / columns);
    pairs.forEach(([k, v], i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const x = M + col * colW;
      const y = this.y - 10 - row * 13;
      this.text(k, x, y, 8.5, { color: MUTED });
      this.text(v, x + colW - 12, y, 9, { bold: true, align: 'right' });
    });
    this.y -= rows * 13 + 8;
  }
}

/** Informe PDF de la voladura: resumen, plano, carguío, fragmentación, vibración y taladros. */
export async function buildReport(
  project: Project,
  blastId: BlastId,
  options: ReportOptions,
): Promise<Uint8Array> {
  const blast = project.blasts.find((b) => b.id === blastId);
  if (!blast) throw new Error('Voladura inexistente');
  const analysis = analyzeBlast(project, blastId, DEFAULT_ANALYSIS_OPTIONS);
  if (!analysis) throw new Error('No se pudo analizar la voladura');
  const { charge, timing } = analysis;
  const rock = project.rockMasses.find((r) => r.id === blast.rockMassId) ?? {
    density: 2650,
    ucs: 150e6,
    youngModulus: 50e9,
  };
  const fragInputs = kuzRamInputsFromBlast(blast, project.library, charge, rock);
  const frag = fragInputs ? fragmentation(fragInputs, { oversizeSize: 1, finesSize: 0.01 }) : null;
  const vib = computeVibration(project, blast, { ...DEFAULT_VIBRATION_OPTIONS, skipGrid: true });

  const lang = options.language ?? 'es';
  const T = REPORT_TEXT[lang];
  const fmt = (v: number, decimals = 0) => fmtNumber(v, decimals, lang);

  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(T.docTitle(blast.name)));
  doc.setSubject(toWinAnsi(project.name));
  doc.setCreator(`Cronos ${options.appVersion}`);
  doc.setProducer('Cronos (pdf-lib)');
  if (options.author) doc.setAuthor(toWinAnsi(options.author));
  doc.setCreationDate(new Date(options.date));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const newSheet = () => new Sheet(doc.addPage(A4), font, bold);
  const date = options.date.slice(0, 10);
  const hasTimes = timing.initiated > 0;

  // ---------------------------------------------------------------- Página 1: resumen + plano
  let s = newSheet();
  s.text(T.title, M, s.y - 18, 18, { bold: true });
  s.text(`${project.name} · ${blast.name}`, M, s.y - 34, 10, { color: MUTED });
  s.text(date, A4[0] - M, s.y - 18, 9, { align: 'right', color: MUTED });
  s.y -= 46;
  s.heading(T.summary);
  const diameters = [...new Set(blast.holes.map((h) => Math.round(h.diameter * 1000)))].sort(
    (a, b) => a - b,
  );
  s.keyValues([
    [T.holes, T.holesValue(blast.holes.length, charge.loadedHoles)],
    [T.drilled, `${fmt(charge.drilledLength, 1)} m`],
    [T.diameter, diameters.length ? `${diameters.join(' / ')} mm` : '-'],
    [T.benchHeight, `${fmt(blast.bench.height, 1)} m`],
    [T.explosive, `${fmt(charge.totalExplosive)} kg`],
    [T.primers, `${fmt(charge.totalPrimers, 1)} kg`],
    [T.volume, `${fmt(charge.volume)} m³`],
    [T.tonnage, `${fmt(charge.tonnage / 1000)} t`],
    [
      T.loadingFactor,
      `${fmt(charge.loadingFactor, 3)} kg/m³ · ${fmt(charge.powderFactor * 1000, 3)} kg/t`,
    ],
    [
      T.designFactor,
      charge.nominal.volume > 0
        ? `${fmt(charge.nominal.explosive / charge.nominal.volume, 3)} kg/m³`
        : '-',
    ],
    [T.energy, `${fmt(charge.totalEnergy / 1e6)} MJ`],
    [T.cost, `${fmt(charge.cost)} ${project.currency}`],
    [T.duration, hasTimes ? `${fmt((timing.lastTime - timing.firstTime) * 1000)} ms` : T.noTimes],
    [
      T.maxPerDelay(fmt(blast.calcParams.micWindow * 1000)),
      hasTimes ? `${fmt(timing.maxChargePerWindow)} kg` : '-',
    ],
    [T.coincident, hasTimes ? String(timing.coincidentGroups.length) : '-'],
    [
      'P50 / P80 (Swebrec)',
      frag ? `${fmt(frag.p50.swebrec * 100, 1)} / ${fmt(frag.p80.swebrec * 100, 1)} cm` : '-',
    ],
    [T.flyrock, `${fmt(vib.flyrock.range)} m`],
  ]);

  s.heading(hasTimes ? T.planByTime : T.plan);
  const box = { x: M, y: M + 40, w: A4[0] - 2 * M, h: s.y - M - 48 };
  s.page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    borderColor: LINE,
    borderWidth: 0.6,
  });
  const pts = [...blast.holes.map((h) => h.collar), ...blast.boundaries.flatMap((b) => b.polygon)];
  const tf = fitPlan(pts, box);
  const P = tf.toPage;
  // Perímetros y caras libres
  blast.boundaries.forEach((b, bi) => {
    const col = color([0xff7b54, 0x8957e5, 0x1f9aa8, 0xb08800, 0x2da44e][bi % 5] ?? 0xff7b54);
    for (let i = 0; i < b.polygon.length; i++) {
      const e = polygonEdge(b.polygon, i);
      if (!e) continue;
      s.page.drawLine({ start: P(e[0]), end: P(e[1]), thickness: 0.9, color: col });
      if (!b.freeFaceEdges.includes(i)) continue;
      const nrm = outwardNormal(b.polygon, i);
      if (!nrm) continue;
      const len = Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y);
      const count = Math.max(1, Math.floor((len * tf.scale) / 6));
      for (let k = 0; k <= count; k++) {
        const t = k / count;
        const p = { x: e[0].x + (e[1].x - e[0].x) * t, y: e[0].y + (e[1].y - e[0].y) * t };
        const tick = (k % 2 === 0 ? 7 : 3.5) / tf.scale;
        s.page.drawLine({
          start: P(p),
          end: P({ x: p.x + nrm.x * tick, y: p.y + nrm.y * tick }),
          thickness: 0.6,
          color: col,
        });
      }
    }
    const first = b.polygon[0];
    if (first) s.text(b.name, P(first).x + 2, P(first).y + 3, 7, { color: col });
  });
  // Amarres
  const byId = new Map(blast.holes.map((h) => [h.id, h]));
  for (const c of blast.initiation.connections) {
    if (c.from.kind !== 'hole' || c.to.kind !== 'hole') continue;
    const a = byId.get(c.from.holeId);
    const b = byId.get(c.to.holeId);
    if (a && b)
      s.page.drawLine({
        start: P(a.collar),
        end: P(b.collar),
        thickness: 0.35,
        color: rgb(0.55, 0.6, 0.66),
      });
  }
  // Taladros coloreados por tiempo
  const radius = Math.max(
    1.2,
    Math.min(
      3.5,
      (Math.min(...blast.patterns.map((p) => Math.min(p.burden, p.spacing)), 5) * tf.scale) / 4,
    ),
  );
  const span = timing.lastTime - timing.firstTime;
  blast.holes.forEach((h, i) => {
    const t = timing.fireTime[i] ?? NaN;
    const fill = Number.isFinite(t)
      ? turbo(span > 0 ? (t - timing.firstTime) / span : 0.5)
      : rgb(0.35, 0.55, 0.85);
    const toe = holeToe(h);
    if (h.inclination > 0.01)
      s.page.drawLine({ start: P(h.collar), end: P(toe), thickness: 0.4, color: MUTED });
    s.page.drawCircle({
      ...P(h.collar),
      size: radius,
      color: fill,
      borderColor: INK,
      borderWidth: 0.25,
    });
  });
  if (blast.holes.length <= 400 && radius >= 2) {
    for (const h of blast.holes) {
      const p = P(h.collar);
      s.text(h.label, p.x + radius + 1, p.y + radius, 5, { color: MUTED });
    }
  }
  for (const ip of blast.initiation.initiationPoints) {
    if (ip.at.kind !== 'hole') continue;
    const h = byId.get(ip.at.holeId);
    if (h)
      s.page.drawCircle({
        ...P(h.collar),
        size: radius + 2.5,
        borderColor: rgb(0.9, 0.1, 0.1),
        borderWidth: 1,
      });
  }
  // Norte y escala
  const nx = box.x + box.w - 18;
  const ny = box.y + box.h - 30;
  s.page.drawLine({
    start: { x: nx, y: ny },
    end: { x: nx, y: ny + 18 },
    thickness: 1.2,
    color: INK,
  });
  s.page.drawLine({
    start: { x: nx - 4, y: ny + 12 },
    end: { x: nx, y: ny + 18 },
    thickness: 1.2,
    color: INK,
  });
  s.page.drawLine({
    start: { x: nx + 4, y: ny + 12 },
    end: { x: nx, y: ny + 18 },
    thickness: 1.2,
    color: INK,
  });
  s.text(T.north, nx, ny + 21, 8, { bold: true, align: 'center' });
  const bar = scaleBarLength(tf.scale);
  const bx = box.x + 12;
  const by = box.y + 12;
  s.page.drawRectangle({ x: bx, y: by, width: bar * tf.scale, height: 3, color: INK });
  s.text(`${fmt(bar)} m`, bx + bar * tf.scale + 4, by, 7);
  if (hasTimes) {
    const lx = box.x + box.w - 150;
    for (let k = 0; k < 50; k++)
      s.page.drawRectangle({ x: lx + k * 2.4, y: by, width: 2.5, height: 5, color: turbo(k / 49) });
    s.text(`${fmt(timing.firstTime * 1000)} ms`, lx, by - 9, 6.5, { color: MUTED });
    s.text(`${fmt(timing.lastTime * 1000)} ms`, lx + 120, by - 9, 6.5, {
      color: MUTED,
      align: 'right',
    });
  }
  s.text(`Cronos ${options.appVersion} · ${date}`, M, M - 4, 7, { color: MUTED });

  // ---------------------------------------------------------------- Página 2: carguío, fragmentación, vibración
  s = newSheet();
  s.heading(T.chargeByProduct);
  const lib = indexLibrary(project.library);
  const perProduct = new Map<string, { kg: number; holes: number }>();
  blast.holes.forEach((h) => {
    const used = new Set<string>();
    for (const d of h.decks) {
      if (d.kind !== 'explosive') continue;
      const e = lib.explosives.get(d.explosiveId);
      if (!e) continue;
      const q =
        e.form === 'packaged' && e.cartridge
          ? e.cartridge.mass / e.cartridge.length
          : ((d.densityOverride ?? e.density) * Math.PI * h.diameter * h.diameter) / 4;
      const entry = perProduct.get(e.name) ?? { kg: 0, holes: 0 };
      entry.kg += q * d.length;
      if (!used.has(e.name)) entry.holes++;
      used.add(e.name);
      perProduct.set(e.name, entry);
    }
  });
  s.table(
    [T.explosive, T.holes, 'kg'],
    perProduct.size
      ? [...perProduct].map(([name, v]) => [name, String(v.holes), fmt(v.kg)])
      : [[T.noCharge, '-', '-']],
    [300, 100, 115],
  );

  s.heading(T.fragTitle);
  if (!frag || !fragInputs) {
    s.text(T.noLoadedHoles, M, s.y - 10, 9, { color: MUTED });
    s.y -= 20;
  } else {
    s.keyValues([
      [T.rockFactor, fmt(fragInputs.rockFactor, 2)],
      [T.uniformity, fmt(frag.n, 2)],
      [
        'P20 / P50 / P80',
        `${fmt(frag.p20.swebrec * 100, 1)} / ${fmt(frag.p50.swebrec * 100, 1)} / ${fmt(frag.p80.swebrec * 100, 1)} cm`,
      ],
      [T.oversize, `${fmt(frag.oversize.swebrec * 100, 1)} %`],
    ]);
    // Curva (eje X log)
    const cb = { x: M + 30, y: s.y - 150, w: A4[0] - 2 * M - 40, h: 130 };
    s.page.drawRectangle({
      x: cb.x,
      y: cb.y,
      width: cb.w,
      height: cb.h,
      borderColor: LINE,
      borderWidth: 0.6,
    });
    const lo = Math.log10(0.1);
    const hi = Math.log10(Math.max(...frag.curve.map((p) => p.size * 100)));
    const cx = (sizeM: number) =>
      cb.x + ((Math.log10(Math.max(sizeM * 100, 0.1)) - lo) / (hi - lo)) * cb.w;
    const cy = (p: number) => cb.y + p * cb.h;
    for (const pct of [0.2, 0.5, 0.8]) {
      s.page.drawLine({
        start: { x: cb.x, y: cy(pct) },
        end: { x: cb.x + cb.w, y: cy(pct) },
        thickness: 0.3,
        color: LINE,
      });
      s.text(`${pct * 100} %`, cb.x - 3, cy(pct) - 3, 6.5, { align: 'right', color: MUTED });
    }
    for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) {
      const x = cb.x + ((d - lo) / (hi - lo)) * cb.w;
      s.page.drawLine({
        start: { x, y: cb.y },
        end: { x, y: cb.y + cb.h },
        thickness: 0.3,
        color: LINE,
      });
      s.text(`${fmt(Math.pow(10, d), d < 0 ? 1 : 0)} cm`, x, cb.y - 9, 6.5, {
        align: 'center',
        color: MUTED,
      });
    }
    const plot = (key: 'swebrec' | 'rosinRammler', col: RGB, width: number) => {
      for (let k = 1; k < frag.curve.length; k++) {
        const a = frag.curve[k - 1];
        const b = frag.curve[k];
        if (!a || !b || b.size * 100 < 0.1) continue;
        s.page.drawLine({
          start: { x: cx(a.size), y: cy(a[key]) },
          end: { x: cx(b.size), y: cy(b[key]) },
          thickness: width,
          color: col,
        });
      }
    };
    plot('rosinRammler', rgb(0.35, 0.55, 0.85), 0.8);
    plot('swebrec', ACCENT, 1.4);
    s.text('Swebrec (KCO)', cb.x + 6, cb.y + cb.h - 10, 7, { color: ACCENT });
    s.text('Rosin-Rammler', cb.x + 6, cb.y + cb.h - 19, 7, { color: rgb(0.35, 0.55, 0.85) });
    s.y = cb.y - 22;
  }

  s.heading(T.vibTitle);
  const law = vib.law;
  s.keyValues(
    [
      [
        T.ppvLaw,
        law ? `${law.name}: K = ${fmt(law.k * 1000)} mm/s, beta = ${fmt(law.beta, 2)}` : '-',
      ],
      [T.mic, `${fmt(vib.mic)} kg`],
      [
        T.micExtended,
        vib.micExtended
          ? `${fmt(vib.micExtended.mic)} kg (${fmt(vib.micExtended.window * 1000)} ms)`
          : T.electronicOnly,
      ],
    ],
    1,
  );
  s.table(
    [T.monitoringPoint, 'R [m]', 'PPV [mm/s]', T.limit, T.admissible, 'dB'],
    vib.receivers.length
      ? vib.receivers.map((r) => [
          `${r.name}${r.exceeds ? T.exceeds : ''}`,
          fmt(r.distance),
          fmt(r.ppv * 1000, 1),
          r.limit ? fmt(r.limit.ppvMax * 1000, 1) : '-',
          r.admissibleCharge === null ? '-' : fmt(r.admissibleCharge),
          fmt(r.airblastDb),
        ])
      : [[T.noMonitoringPoints, '-', '-', '-', '-', '-']],
    [175, 68, 68, 68, 68, 68],
  );

  if (hasTimes && timing.interRowDelays.length > 0) {
    s.heading(T.interRow);
    const rows = timing.interRowDelays.slice(0, Math.max(0, Math.floor((s.y - M) / 12) - 3));
    s.table(
      [T.rows, T.minMs, T.maxMs, T.meanMs],
      rows.map((r) => [
        `${r.rowA + 1} -> ${r.rowB + 1}`,
        fmt(r.min * 1000),
        fmt(r.max * 1000),
        fmt(r.mean * 1000),
      ]),
      [200, 105, 105, 105],
    );
  }

  // ---------------------------------------------------------------- Revisión y supuestos (H-702)
  s = newSheet();
  s.heading(T.review);
  const checks = analysis.checks;
  if (checks.length === 0) s.paragraph(T.noObservations);
  else
    s.table(
      [T.observation, T.level, T.holes],
      checks.map((c) => [
        T.checks[c.id] ?? c.title,
        T.severity[c.severity],
        String(c.holes.length),
      ]),
      [360, 80, 75],
    );
  s.heading(T.assumptions);
  const cp = blast.calcParams;
  const generic = project.library.explosives.filter((e) => e.source?.includes('genérico'));
  const limits = project.ppvLimits ?? [];
  const notes = [
    T.notes.units,
    T.notes.deckCharge,
    T.notes.volume(cp.subdrillConvention === 'lopezJimeno'),
    T.notes.timing(fmt(cp.micWindow * 1000)),
    T.notes.burden(fmt(cp.reliefRate * 1000, 1)),
    T.notes.sdob(fmt(cp.checks.sdob.severe, 2), fmt(cp.checks.sdob.safe, 2)),
    T.notes.ppv(law ? ` (${fmt(law.k * 1000)} mm/s, ${fmt(law.beta, 2)})` : ''),
    T.notes.limits(
      limits
        .map(
          (l) =>
            `${l.structure ?? T.allStructures} ${fmt(l.from)}–${l.to === undefined ? '∞' : fmt(l.to)} m: ${fmt(l.ppvMax * 1000, 1)} mm/s (${l.source})`,
        )
        .join('; '),
    ),
    T.notes.airblast,
    T.notes.frag,
    generic.length
      ? T.notes.generic(generic.length, generic.map((e) => e.name).join(', '))
      : T.notes.allCited,
    T.notes.rules,
  ];
  for (const n of notes) {
    if (!s.paragraph(`· ${n}`)) {
      s = newSheet();
      s.heading(`${T.assumptions} ${T.continued}`);
    }
  }

  // ---------------------------------------------------------------- Tabla de taladros
  if (options.holeTable && blast.holes.length > 0) {
    const headers = T.holeTable;
    const widths = [60, 72, 80, 50, 45, 40, 40, 40, 45, 43];
    const rowsPerPage = Math.floor((A4[1] - 2 * M - 40) / 11);
    const rows = blast.holes.map((h, i) => {
      const t = timing.fireTime[i] ?? NaN;
      return [
        h.label,
        fmt(h.collar.x, 2),
        fmt(h.collar.y, 2),
        fmt(h.collar.z, 2),
        fmt(h.length, 2),
        fmt(h.diameter * 1000),
        fmt((h.inclination * 180) / Math.PI, 1),
        fmt((h.azimuth * 180) / Math.PI, 1),
        fmt(charge.perHole[i] ?? 0, 1),
        Number.isFinite(t) ? fmt(t * 1000) : '-',
      ];
    });
    for (let start = 0; start < rows.length; start += rowsPerPage) {
      s = newSheet();
      s.heading(T.holeRange(start + 1, Math.min(rows.length, start + rowsPerPage), rows.length));
      s.table(headers, rows.slice(start, start + rowsPerPage), widths, 7);
    }
  }

  // Numeración de páginas
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    page.drawText(`${i + 1} / ${pages.length}`, {
      x: A4[0] - M - 20,
      y: M - 4,
      size: 7,
      font,
      color: MUTED,
    });
  });
  return doc.save();
}
