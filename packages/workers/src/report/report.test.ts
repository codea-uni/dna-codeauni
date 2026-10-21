import {
  applyChargeRule,
  createEmptyProject,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
  fitByZone,
  generatePatternHoles,
  lawFromFit,
  newId,
  rowTieUp,
  withActiveVibrationLaw,
  withDownholeDetonator,
  type Pattern,
  type Project,
} from '@cronos/core';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildReport } from './pdfReport';
import { fitPlan, scaleBarLength } from './planLayout';
import { fmtNumber, stripInternalCodes, toWinAnsi } from './pdfText';

function project(rows: number, cols: number, loaded = true): Project {
  const p = createEmptyProject('Rajo Sur');
  const lib = p.library;
  const base = p.blasts[0];
  const anfo = lib.explosives[0];
  const stem = lib.stemmingMaterials[0];
  const det = lib.detonators[0];
  const c17 = lib.surfaceConnectors[0];
  const c42 = lib.surfaceConnectors[2];
  if (!base || !anfo || !stem || !det || !c17 || !c42) throw new Error('proyecto incompleto');
  const pattern: Pattern = {
    id: newId<'Pattern'>(),
    name: 'Malla 1',
    kind: 'staggered',
    burden: 6,
    spacing: 7,
    origin: { x: 350_000, y: 8_500_000 },
    rowAzimuth: Math.PI / 2,
    rowAdvance: 'right',
    rows,
    holesPerRow: cols,
    holeTemplate: DEFAULT_HOLE_TEMPLATE,
  };
  const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 }).map((h) => {
    if (!loaded) return h;
    const withCharge = {
      ...h,
      ...applyChargeRule(
        h,
        {
          stemmingLength: 4,
          stemmingMaterialId: stem.id,
          explosiveId: anfo.id,
          primerOffsetFromToe: 0.5,
        },
        lib,
      ),
    };
    return { ...withCharge, initiators: withDownholeDetonator(withCharge, det.id, 0.5) };
  });
  let blast = {
    ...base,
    patterns: [pattern],
    holes,
    boundaries: [
      {
        id: newId<'Boundary'>(),
        name: 'Perímetro 1',
        polygon: [
          { x: 349_995, y: 8_500_005 },
          { x: 350_000 + cols * 7, y: 8_500_005 },
          { x: 350_000 + cols * 7, y: 8_499_995 - rows * 6 },
          { x: 349_995, y: 8_499_995 - rows * 6 },
        ],
        freeFaceEdges: [0],
      },
    ],
  };
  if (loaded)
    blast = {
      ...blast,
      initiation: {
        ...blast.initiation,
        ...rowTieUp(blast, {
          patternId: pattern.id,
          startRow: 0,
          startCol: Math.floor(cols / 2),
          interHoleConnectorId: c17.id,
          interRowConnectorId: c42.id,
        }),
      },
    };
  return {
    ...p,
    blasts: [blast],
    monitoringPoints: [
      {
        id: newId<'MonitoringPoint'>(),
        name: 'Campamento',
        position: { x: 350_300, y: 8_500_200, z: 15 },
      },
    ],
  };
}

/** Texto escrito en el PDF (operadores Tj con cadenas hex de Helvetica/WinAnsi), una por línea. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const out: string[] = [];
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((r) => doc.context.lookup(r))
        : [contents];
    for (const st of streams) {
      if (!(st instanceof PDFRawStream)) continue;
      const raw = new TextDecoder('latin1').decode(decodePDFRawStream(st).decode());
      for (const m of raw.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
        const hex = m[1] ?? '';
        let line = '';
        for (let i = 0; i < hex.length; i += 2)
          line += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
        out.push(line);
      }
    }
  }
  return out.join('\n');
}

/** Códigos y rutas internas del desarrollo que no deben llegar al informe. */
const INTERNAL =
  /\b(?:H|P|RM|DF|FC|CR|CK|CT)-\d+\b|docs\/|RULES\.md|Confianza R\d|Material de curso/;

describe('texto del PDF', () => {
  it('quita códigos y rutas internas y conserva las referencias bibliográficas', () => {
    expect(stripInternalCodes('Carga por tramo (docs/theory/02 §2).')).toBe('Carga por tramo.');
    expect(stripInternalCodes('Volumen B·S·H (P-06); real (P-05, P-10).')).toBe(
      'Volumen B·S·H; real.',
    );
    expect(stripInternalCodes('Proyección (cráter violento, R1 F12; configurable).')).toBe(
      'Proyección (cráter violento; configurable).',
    );
    expect(stripInternalCodes('Kuz-Ram (Cunningham 1987) con RWS')).toBe(
      'Kuz-Ram (Cunningham 1987) con RWS',
    );
    expect(stripInternalCodes('Columna que no cierra (cierre de tramos, R3).')).toBe(
      'Columna que no cierra.',
    );
    expect(stripInternalCodes('Reglas en confianza R3 (docs/RULES.md)')).toBe('Reglas en');
  });

  it('WinAnsi: conserva español y reemplaza lo que Helvetica no tiene', () => {
    expect(toWinAnsi('Perforación · 15 m³ · Ø 229 mm · 90°')).toBe(
      'Perforación · 15 m³ · Ø 229 mm · 90°',
    );
    expect(toWinAnsi('β ≥ 1,5 → α')).toBe('beta >= 1,5 -> alfa');
    expect(toWinAnsi('línea\nnueva')).toBe('línea nueva');
    expect(toWinAnsi('中')).toBe('?');
    expect(toWinAnsi('(π/4)·√Q ∞')).toBe('(pi/4)·raíz Q inf.');
  });

  it('números en formato es-ES', () => {
    expect(fmtNumber(1234567.891, 2)).toBe('1.234.567,89');
    expect(fmtNumber(-0.5, 1)).toBe('-0,5');
    expect(fmtNumber(12)).toBe('12');
    expect(fmtNumber(NaN)).toBe('-');
  });

  it('números en formato en-US', () => {
    expect(fmtNumber(1234567.891, 2, 'en')).toBe('1,234,567.89');
    expect(fmtNumber(-0.5, 1, 'en')).toBe('-0.5');
    expect(fmtNumber(12, 0, 'en')).toBe('12');
  });
});

describe('plano del PDF', () => {
  it('encuadre centrado conservando proporción y barra de escala redonda', () => {
    const tf = fitPlan(
      [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
      { x: 0, y: 0, w: 200, h: 200 },
      0,
    );
    expect(tf.scale).toBeCloseTo(2); // limita el ancho: 200 pt / 100 m
    expect(tf.toPage({ x: 50, y: 25 })).toEqual({ x: 100, y: 100 });
    expect(tf.toPage({ x: 0, y: 50 }).y).toBeGreaterThan(tf.toPage({ x: 0, y: 0 }).y); // Norte arriba
    expect(scaleBarLength(2, 100)).toBe(50);
    expect(scaleBarLength(0.37, 100)).toBe(200);
  });
});

describe('informe PDF', () => {
  it('genera un PDF válido con resumen, plano y tabla de taladros paginada', async () => {
    const p = project(10, 25); // 250 taladros
    const blast = p.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const bytes = await buildReport(p, blast.id, {
      date: '2026-09-23T10:00:00Z',
      appVersion: '0.1.0',
      holeTable: true,
      author: 'Ingeniería',
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    // 2 páginas de resumen + tabla de 250 filas (~62 por página) = 5 páginas en total
    // resumen + plano, carguío/fragmentación/vibración, revisión y supuestos, y la tabla de taladros
    expect(doc.getPageCount()).toBe(3 + Math.ceil(250 / Math.floor((841.89 - 80 - 40) / 11)));
    expect(doc.getTitle()).toContain('Voladura 1');
    expect(doc.getAuthor()).toBe('Ingeniería');
    expect(doc.getCreator()).toBe('Cronos 0.1.0');
  });

  it('en inglés: PDF válido con las mismas páginas que en español', async () => {
    const p = project(10, 25);
    const blast = p.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const opts = { date: '2026-09-23T10:00:00Z', appVersion: '0.1.0', holeTable: true };
    const esDoc = await PDFDocument.load(await buildReport(p, blast.id, opts));
    const bytes = await buildReport(p, blast.id, { ...opts, language: 'en' });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const enDoc = await PDFDocument.load(bytes);
    expect(enDoc.getPageCount()).toBe(esDoc.getPageCount());
    expect(enDoc.getTitle()).toBe('Blast report · Voladura 1');
    expect(esDoc.getTitle()).toBe('Informe de voladura · Voladura 1');
  });

  it('sin tabla de taladros y sin carga no falla', async () => {
    const p = project(3, 4, false);
    const blast = p.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const bytes = await buildReport(p, blast.id, {
      date: '2026-09-23T10:00:00Z',
      appVersion: 'x',
      holeTable: false,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3); // + revisión y supuestos (H-702)
  });

  it('voladura inexistente da error', async () => {
    const p = project(1, 1);
    await expect(
      buildReport(p, newId<'Blast'>(), {
        date: '2026-09-23T10:00:00Z',
        appVersion: 'x',
        holeTable: false,
      }),
    ).rejects.toThrow('inexistente');
  });
});

describe('contenido del informe', () => {
  const opts = { date: '2026-10-21T10:00:00Z', appVersion: '0.1.0', holeTable: false };

  it('ficha con empresa, mina, proyecto, versión y autor, y sin códigos internos', async () => {
    const p = project(4, 6);
    const blast = p.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const text = await pdfText(
      await buildReport(p, blast.id, {
        ...opts,
        company: 'Minera Andina',
        mine: 'Tajo Prueba',
        version: 'v2',
        author: 'Ana Pérez',
      }),
    );
    for (const s of ['Minera Andina', 'Tajo Prueba', 'Rajo Sur', 'v2', 'Ana Pérez', '2026-10-21'])
      expect(text).toContain(s);
    expect(text).not.toMatch(INTERNAL);
    // En banco sí se habla de altura de banco y flyrock.
    expect(text).toContain('Altura de banco');
    expect(text).toContain('Alcance flyrock');
  });

  it('usa la ley calibrada elegida para el proyecto y la nombra (zona, %, n, R²)', async () => {
    const records = [5, 20, 80].flatMap((w, i) =>
      [15, 40, 90, 200].map((r, j) => ({
        id: `m${String(i)}${String(j)}`,
        date: '2026-10-01',
        zone: 'Tajo Norte',
        context: 'surface' as const,
        charge: w,
        distance: r,
        ppv: 1.083 * Math.pow(r / Math.sqrt(w), -1.58),
      })),
    );
    const fit = fitByZone(records)[0]?.squareRoot;
    if (!fit) throw new Error('sin ajuste');
    const law = lawFromFit(fit, { zone: 'Tajo Norte', context: 'surface', level: 95 });
    const base = project(4, 6);
    const p = { ...base, siteModels: withActiveVibrationLaw(base.siteModels, law) };
    const blast = p.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const text = await pdfText(await buildReport(p, blast.id, opts));
    expect(text).toContain('Tajo Norte · 95 % (n = 12, R² = 1,00)');
    expect(text).toContain(`K = ${fmtNumber(law.k * 1000)} mm/s`);
    expect(text).not.toContain('Genérica (USBM)');
    // Sin ley elegida, la genérica se rotula como no calibrada.
    const generic = await pdfText(await buildReport(base, blast.id, opts));
    expect(generic).toContain('Genérica (USBM), sin calibrar');
  });

  it('producto sin precio: «precio sin cargar» en vez de un costo que parece real', async () => {
    const base = project(3, 4);
    const famesa = base.library.explosives.find((e) => e.name === 'Emulnor 3000 (Famesa)');
    const blast = base.blasts[0];
    if (!famesa || !blast) throw new Error('falta producto');
    const p = {
      ...base,
      blasts: [
        {
          ...blast,
          holes: blast.holes.map((h) => ({
            ...h,
            decks: h.decks.map((d) =>
              d.kind === 'explosive' ? { ...d, explosiveId: famesa.id } : d,
            ),
          })),
        },
      ],
    };
    const text = await pdfText(await buildReport(p, blast.id, opts));
    expect(text).toContain('precio sin cargar');
    expect(text).toContain('Emulnor 3000 (Famesa)');
    const priced = await pdfText(await buildReport(base, blast.id, opts));
    expect(priced).not.toContain('precio sin cargar');
  });

  it('kg por producto = explosivo del resumen (mismo cálculo que el panel)', async () => {
    const p = project(3, 4);
    const blast = p.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const lines = (await pdfText(await buildReport(p, blast.id, opts))).split('\n');
    const summary = lines[lines.indexOf('Explosivo') + 1];
    const product = lines[lines.indexOf('ANFO') + 2];
    expect(summary).toBe(`${product ?? ''} kg`);
  });

  it('voladura subterránea: sin altura de banco ni flyrock', async () => {
    const base = project(3, 4);
    const blast = base.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const ug = { ...blast, holes: blast.holes.map((h) => ({ ...h, tags: ['ug-face'] })) };
    const text = await pdfText(await buildReport({ ...base, blasts: [ug] }, blast.id, opts));
    expect(text).not.toContain('Altura de banco');
    expect(text).not.toMatch(/flyrock|Lundborg/i);
    expect(text).not.toMatch(INTERNAL);
  });
});
