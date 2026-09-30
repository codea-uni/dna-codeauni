import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
} from '../model/factories';
import type { Project } from '../model/types';
import { diffMarkers } from './diffMarkers';
import { diffProjects } from './diffProjects';

/** Valor esperado: el cambio hecho a mano en el fixture (no es una fórmula minera). */
function base(): Project {
  const p = createEmptyProject('Banco');
  const blast = p.blasts[0];
  if (!blast) throw new Error('sin voladura');
  blast.holes = [0, 1, 2, 3].map((i) =>
    createHole({
      position: { x: i * 5, y: 0 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: DEFAULT_BENCH,
      label: `H${i + 1}`,
    }),
  );
  return p;
}

describe('diffMarkers', () => {
  it('ubica cada cambio: agregado, quitado en su lugar anterior, movido con origen y cambiado', () => {
    const a = base();
    const b = structuredClone(a);
    const holes = b.blasts[0]?.holes ?? [];
    const [h1, h2, h3] = holes;
    if (!h1 || !h2 || !h3) throw new Error('fixture');
    h1.collar = { ...h1.collar, y: 3 }; // H1 movido 3 m al Norte
    h2.diameter += 0.05; // H2 cambiado en su lugar (otro diámetro)
    holes.splice(2, 1); // H3 quitado
    holes.push(
      createHole({
        position: { x: 50, y: 50 },
        template: DEFAULT_HOLE_TEMPLATE,
        bench: DEFAULT_BENCH,
        label: 'N1',
      }),
    );

    const markers = diffMarkers(a, b, diffProjects(a, b));
    const byLabel = new Map(markers.map((m) => [m.label, m]));
    expect(byLabel.get('H1')).toMatchObject({
      kind: 'moved',
      position: { x: 0, y: 3 },
      from: { x: 0, y: 0 },
    });
    expect(byLabel.get('H2')).toMatchObject({ kind: 'changed', position: { x: 5, y: 0 } });
    expect(byLabel.get('H3')).toMatchObject({ kind: 'removed', position: { x: 10, y: 0 } });
    expect(byLabel.get('N1')).toMatchObject({ kind: 'added', position: { x: 50, y: 50 } });
    expect(byLabel.has('H4')).toBe(false);
    expect(markers).toHaveLength(4);
  });
});
