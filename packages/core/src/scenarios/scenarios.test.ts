import { describe, expect, it } from 'vitest';
import { analyzeBlast } from '../analysis/analyzeBlast';
import { designChecks } from '../diagnostics/designChecks';
import { fragmentation, kuzRamInputsFromBlast } from '../fragmentation/fragmentation';
import { outwardNormal } from '../geometry/boundary';
import { holeSegments3d } from '../geometry/solid';
import { parseProjectFile, serializeProject } from '../io/projectFile';
import type { Project } from '../model/types';
import { computeVibration, DEFAULT_VIBRATION_OPTIONS } from '../vibration/vibration';
import { SCENARIOS } from './scenarios';

function build(id: string): Project {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`sin escenario ${id}`);
  return s.build();
}

function analyze(p: Project) {
  const blast = p.blasts[0];
  if (!blast) throw new Error('sin voladura');
  const a = analyzeBlast(p, blast.id);
  if (!a) throw new Error('sin análisis');
  return { blast, a };
}

describe('escenarios de ejemplo', () => {
  it.each(SCENARIOS.map((s) => s.id))(
    '%s: se construye, se guarda/abre y se analiza completo',
    (id) => {
      const p = build(id);
      const { blast, a } = analyze(p);
      expect(blast.holes.length).toBeGreaterThan(50);
      expect(blast.boundaries[0]?.freeFaceEdges).toEqual([3]);
      // Cara libre al Norte: normal exterior (0, 1)
      const n = outwardNormal(blast.boundaries[0]?.polygon ?? [], 3);
      expect(n?.y).toBeCloseTo(1);
      expect(a.charge.totalExplosive).toBeGreaterThan(0);
      expect(a.charge.powderFactorVolume).toBeGreaterThan(0.2);
      expect(a.charge.powderFactorVolume).toBeLessThan(1.5);
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

  it('producción: ≈250 taladros, todos cargados e iniciados, fondo de ANFO pesado', () => {
    const { blast, a } = analyze(build('production'));
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

  it('frente con agua: emulsión en las filas del fondo y ANFO en el resto', () => {
    const p = build('wet');
    const { blast } = analyze(p);
    const emulsion = p.library.explosives.find((e) => e.name.startsWith('Emulsión bombeable'))?.id;
    const rows = Math.max(...blast.holes.map((h) => h.row ?? 0));
    for (const h of blast.holes) {
      const usesEmulsion = h.decks.some(
        (d) => d.kind === 'explosive' && d.explosiveId === emulsion,
      );
      expect(usesEmulsion).toBe((h.row ?? 0) >= rows + 1 - 3);
    }
  });

  it('cerca de infraestructura: electrónicos sin coincidencias, un taladro por retardo', () => {
    const p = build('electronic');
    const { blast, a } = analyze(p);
    expect(a.timing.notInitiated).toBe(0);
    expect(a.timing.coincidentGroups).toHaveLength(0);
    expect(a.timing.maxHolesPerWindow).toBe(1);
    expect(blast.holes.every((h) => h.decks.some((d) => d.kind === 'air'))).toBe(true);
    const vib = computeVibration(p, blast, { ...DEFAULT_VIBRATION_OPTIONS, skipGrid: true });
    // Carga por retardo = la de un solo taladro
    expect(vib.mic).toBeCloseTo(Math.max(...a.charge.perHole), 6);
  });

  it('inclinados: 15° hacia la cara libre (Norte) y se dibujan en 3D', () => {
    const { blast } = analyze(build('inclined'));
    for (const h of blast.holes) {
      expect((h.inclination * 180) / Math.PI).toBeCloseTo(15, 6);
      expect(h.azimuth).toBeCloseTo(0, 6); // azimut Norte
      const segs = holeSegments3d(h);
      expect(segs.at(-1)?.from).toEqual(h.collar);
    }
  });

  it('problemas típicos: el diagnóstico detecta cada situación', () => {
    const { blast, a } = analyze(build('problems'));
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
    // Los ejemplos "buenos" no tienen ninguna observación.
    for (const id of ['production', 'wet', 'electronic', 'inclined']) {
      expect(analyze(build(id)).a.checks, id).toEqual([]);
    }
  });
});
