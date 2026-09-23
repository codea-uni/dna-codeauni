import {
  applyChargeRule,
  createEmptyProject,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
  generatePatternHoles,
  newId,
  rowTieUp,
  withDownholeDetonator,
  type Pattern,
  type Project,
} from '@blastlab/core';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildReport } from './pdfReport';
import { fitPlan, scaleBarLength } from './planLayout';
import { fmtNumber, toWinAnsi } from './pdfText';

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

describe('texto del PDF', () => {
  it('WinAnsi: conserva español y reemplaza lo que Helvetica no tiene', () => {
    expect(toWinAnsi('Perforación · 15 m³ · Ø 229 mm · 90°')).toBe(
      'Perforación · 15 m³ · Ø 229 mm · 90°',
    );
    expect(toWinAnsi('β ≥ 1,5 → α')).toBe('beta >= 1,5 -> alfa');
    expect(toWinAnsi('línea\nnueva')).toBe('línea nueva');
    expect(toWinAnsi('中')).toBe('?');
  });

  it('números en formato es-ES', () => {
    expect(fmtNumber(1234567.891, 2)).toBe('1.234.567,89');
    expect(fmtNumber(-0.5, 1)).toBe('-0,5');
    expect(fmtNumber(12)).toBe('12');
    expect(fmtNumber(NaN)).toBe('-');
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
    expect(doc.getPageCount()).toBe(2 + Math.ceil(250 / Math.floor((841.89 - 80 - 40) / 11)));
    expect(doc.getTitle()).toContain('Voladura 1');
    expect(doc.getAuthor()).toBe('Ingeniería');
    expect(doc.getCreator()).toBe('BlastLab 0.1.0');
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
    expect(doc.getPageCount()).toBe(2);
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
