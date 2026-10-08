import { describe, expect, it } from 'vitest';
import { analyzeBlast } from '../analysis/analyzeBlast';
import { designChecks } from '../diagnostics/designChecks';
import { fragmentation, kuzRamInputsFromBlast } from '../fragmentation/fragmentation';
import { outwardNormal } from '../geometry/boundary';
import { holeSegments3d } from '../geometry/solid';
import { parseProjectFile, serializeProject } from '../io/projectFile';
import type { Project } from '../model/types';
import { computeVibration, DEFAULT_VIBRATION_OPTIONS } from '../vibration/vibration';
import { buildProblems, EXAMPLES } from './examples';

async function build(id: string): Promise<Project> {
  const s = EXAMPLES.find((x) => x.id === id);
  if (!s) throw new Error(`sin ejemplo ${id}`);
  return (await s.build()).project;
}

function analyze(p: Project) {
  const blast = p.blasts[0];
  if (!blast) throw new Error('sin voladura');
  const a = analyzeBlast(p, blast.id);
  if (!a) throw new Error('sin análisis');
  return { blast, a };
}

describe('proyectos de ejemplo', () => {
  it.each(EXAMPLES.map((s) => s.id))(
    '%s: se construye, se guarda/abre y se analiza completo',
    async (id) => {
      const p = await build(id);
      const { blast, a } = analyze(p);
      // Los ejemplos con topografía tienen la cara libre en la cresta (curva): pruebas aparte.
      // El de la pila (A7) es chico a propósito (3 × 8) y su perímetro es un rectángulo.
      if (!id.startsWith('topo')) {
        const edge = id === 'muckpile' ? 2 : 3;
        expect(blast.holes.length).toBeGreaterThan(id === 'muckpile' ? 20 : 50);
        expect(blast.boundaries[0]?.freeFaceEdges).toEqual([edge]);
        // Cara libre al Norte: normal exterior (0, 1)
        const n = outwardNormal(blast.boundaries[0]?.polygon ?? [], edge);
        expect(n?.y).toBeCloseTo(1);
      }
      expect(a.charge.totalExplosive).toBeGreaterThan(0);
      expect(a.charge.loadingFactor).toBeGreaterThan(0.2);
      expect(a.charge.loadingFactor).toBeLessThan(1.5);
      expect(a.timing.initiated).toBeGreaterThan(0);
      const rock = p.rockMasses[0];
      if (!rock) throw new Error('sin roca');
      const inputs = kuzRamInputsFromBlast(blast, p.library, a.charge, rock);
      if (!inputs) throw new Error('sin entradas de fragmentación');
      const frag = fragmentation(inputs, { oversizeSize: 1, finesSize: 0.01 });
      expect(frag.p80.swebrec).toBeGreaterThan(frag.p50.swebrec);
      const vib = computeVibration(p, blast, { ...DEFAULT_VIBRATION_OPTIONS, skipGrid: true });
      expect(vib.receivers.length).toBeGreaterThan(0);
      expect(vib.receivers.every((r) => r.ppv > 0 && r.airblastDb > 0)).toBe(true);
      const parsed = parseProjectFile(serializeProject(p, { appVersion: 'test' }));
      expect(parsed.ok).toBe(true);
    },
  );

  it('producción: ≈250 taladros, todos cargados e iniciados, fondo de ANFO pesado', async () => {
    const { blast, a } = analyze(await build('production'));
    expect(blast.holes.length).toBeGreaterThanOrEqual(200);
    expect(blast.holes.length).toBeLessThanOrEqual(300);
    expect(a.charge.loadedHoles).toBe(blast.holes.length);
    expect(a.timing.notInitiated).toBe(0);
    const h = blast.holes[0];
    expect(h?.decks.map((d) => d.kind)).toEqual(['explosive', 'explosive', 'stemming']);
    expect(h?.decks[2]?.length).toBe(4.5);
    // La primera fila está junto a la cara libre (Norte): las filas avanzan hacia el Sur.
    const firstRowY = Math.min(...blast.holes.filter((x) => x.row === 0).map((x) => x.collar.y));
    const lastRowY = Math.max(...blast.holes.filter((x) => x.row === 5).map((x) => x.collar.y));
    expect(firstRowY).toBeGreaterThan(lastRowY);
  });

  it('solo el primero (producción, 2D) va sin topografía; los demás están sobre el terreno', async () => {
    expect(EXAMPLES[0]?.id).toBe('production');
    for (const ex of EXAMPLES) {
      const p = (await ex.build()).project;
      const blast = p.blasts[0];
      if (ex.id === 'production') {
        expect(p.topography).toHaveLength(0);
        continue;
      }
      expect(p.topography.length, ex.id).toBe(1);
      expect(blast?.bench.topographyId, ex.id).toBe(p.topography[0]?.id);
    }
  });

  it('cantera en ladera: electrónicos sin coincidencias, un taladro por retardo', async () => {
    const p = await build('electronic');
    const { blast, a } = analyze(p);
    expect(a.timing.notInitiated).toBe(0);
    expect(a.timing.coincidentGroups).toHaveLength(0);
    expect(a.timing.maxHolesPerWindow).toBe(1);
    expect(blast.holes.every((h) => h.decks.every((d) => d.kind !== 'air'))).toBe(true);
    const vib = computeVibration(p, blast, { ...DEFAULT_VIBRATION_OPTIONS, skipGrid: true });
    // Carga por retardo = la de un solo taladro
    expect(vib.mic).toBeCloseTo(Math.max(...a.charge.perHole), 6);
  });

  it('talud final: inclinados 15° hacia la cara libre (Norte) y se dibujan en 3D', async () => {
    const { blast } = analyze(await build('inclined'));
    for (const h of blast.holes) {
      expect((h.inclination * 180) / Math.PI).toBeCloseTo(15, 6);
      expect(h.azimuth).toBeCloseTo(0, 6); // azimut Norte
      const segs = holeSegments3d(h);
      expect(segs.at(-1)?.from).toEqual(h.collar);
    }
  });

  it('problemas típicos: el diagnóstico detecta cada situación', async () => {
    const { blast, a } = analyze(buildProblems());
    const ids = designChecks(blast, a.timing).map((c) => c.id);
    for (const expected of [
      'shortStemming',
      'unloaded',
      'noDetonator',
      'notInitiated',
      'coincident',
      'duplicate',
    ]) {
      expect(ids).toContain(expected);
    }
    // Revisión de la carga (G4): agua, columna abierta y booster
    const all = a.checks.map((c) => c.id);
    for (const expected of ['waterIncompatible', 'openColumn', 'noBooster'])
      expect(all).toContain(expected);
    // Los ejemplos "buenos" no tienen errores ni advertencias (las notas informativas, reglas R0,
    // pueden aparecer).
    for (const id of ['production', 'electronic', 'inclined', 'topoMine']) {
      expect(
        analyze(await build(id)).a.checks.filter((c) => c.severity !== 'info'),
        id,
      ).toEqual([]);
    }
  });

  it('los ejemplos usan grupos, límites y escenarios (G1–G7)', async () => {
    const production = await build('production');
    const blast = production.blasts[0];
    expect(blast?.groups.map((g) => [g.name, g.kind])).toEqual([
      ['Producción', 'production'],
      ['Buffer', 'buffer'],
    ]);
    expect(blast?.holes.every((h) => h.groupId !== undefined)).toBe(true);
    expect(production.scenarios?.map((s) => s.name)).toEqual([
      'Salida en fila (línea a línea)',
      'En escalón',
    ]);
    expect(production.ppvLimits?.some((l) => l.structure === 'vivienda')).toBe(true);
    expect((await build('electronic')).monitoringPoints?.[0]?.ppvLimit).toBeCloseTo(0.025, 12);
  });
});
