import { describe, expect, it } from 'vitest';
import { DEFAULT_BENCH, createEmptyProject } from '../model/factories';
import { newId } from '../model/ids';
import type { Pattern, Project } from '../model/types';
import { generatePatternHoles } from '../patterns/pattern';
import { degToRad } from '../units/units';
import { parseProjectFile, serializeProject } from './projectFile';

function sampleProject(): Project {
  const project = createEmptyProject('Rajo Norte');
  const blast = project.blasts[0];
  if (!blast) throw new Error('sin voladura');
  const pattern: Pattern = {
    id: newId<'Pattern'>(),
    name: 'Malla 1',
    kind: 'staggered',
    burden: 6,
    spacing: 7,
    origin: { x: 345_678.123, y: 8_512_345.987 },
    rowAzimuth: degToRad(37),
    rowAdvance: 'right',
    rows: 20,
    holesPerRow: 25,
    clipBoundary: [
      { x: 345_600, y: 8_512_400 },
      { x: 345_900, y: 8_512_400 },
      { x: 345_900, y: 8_512_200 },
      { x: 345_600, y: 8_512_200 },
    ],
    holeTemplate: {
      diameter: 0.2699,
      inclination: degToRad(10),
      azimuth: degToRad(127),
      subdrill: 1.2,
    },
  };
  const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 });
  const first = holes[0];
  if (first) {
    first.decks = [
      { id: newId<'Deck'>(), kind: 'explosive', explosiveId: newId<'Explosive'>(), length: 9.5 },
      { id: newId<'Deck'>(), kind: 'stemming', materialId: newId<'StemmingMaterial'>(), length: 5 },
    ];
    first.tags = ['borde'];
  }
  return {
    ...project,
    blasts: [{ ...blast, patterns: [pattern], holes, boundary: pattern.clipBoundary ?? [] }],
  };
}

describe('archivo de proyecto', () => {
  it('ida y vuelta sin pérdidas (incluye coordenadas UTM en float64)', () => {
    const project = sampleProject();
    const now = new Date('2026-09-23T12:00:00Z');
    const text = serializeProject(project, { appVersion: '0.1.0', now });
    const parsed = parseProjectFile(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.file.project).toEqual({ ...project, updatedAt: now.toISOString() });
    expect(parsed.file.schemaVersion).toBe(1);
  });

  it('rechaza JSON inválido, proyectos mal formados y esquemas futuros', () => {
    expect(parseProjectFile('{nope').ok).toBe(false);
    expect(parseProjectFile('[]').ok).toBe(false);

    const text = serializeProject(sampleProject(), { appVersion: 'x' });
    const broken = JSON.parse(text) as { project: { blasts: { holes: { diameter: number }[] }[] } };
    const hole = broken.project.blasts[0]?.holes[0];
    if (hole) hole.diameter = -1;
    const r = parseProjectFile(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('diameter');

    const future = { ...(JSON.parse(text) as object), schemaVersion: 99 };
    const f = parseProjectFile(JSON.stringify(future));
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.error).toContain('v99');
  });
});
