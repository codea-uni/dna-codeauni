import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/factories';
import { newId } from '../model/ids';
import type { Pattern } from '../model/types';
import { DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { ChangeSetBuilder } from './changeset';
import { applyOp } from './ops';
import type { HoleId } from '../model/types';

describe('ops', () => {
  it('insertar patrón y su inversa', () => {
    const project = createEmptyProject();
    const blastId = project.blasts[0]?.id;
    if (!blastId) throw new Error('sin voladura');
    const pattern: Pattern = {
      id: newId<'Pattern'>(),
      name: 'P',
      kind: 'square',
      burden: 5,
      spacing: 5,
      origin: { x: 0, y: 0 },
      rowAzimuth: 0,
      rowAdvance: 'right',
      rows: 1,
      holesPerRow: 1,
      holeTemplate: DEFAULT_HOLE_TEMPLATE,
    };
    const cs = new ChangeSetBuilder();
    const r = applyOp(
      project,
      { type: 'patterns/insert', blastId, entries: [{ item: pattern }] },
      cs,
    );
    expect(r.project.blasts[0]?.patterns).toHaveLength(1);
    expect(cs.build().patterns).toBe(true);
    const back = applyOp(r.project, r.inverse, new ChangeSetBuilder());
    expect(back.project.blasts[0]?.patterns).toHaveLength(0);
    expect(project.blasts[0]?.patterns).toHaveLength(0); // inmutable
  });

  it('ChangeSet colapsa agregar+borrar y borrar+agregar', () => {
    const cs = new ChangeSetBuilder();
    const x = 'x' as HoleId;
    const y = 'y' as HoleId;
    cs.holeAdded(x);
    cs.holeRemoved(x);
    cs.holeRemoved(y);
    cs.holeAdded(y);
    expect(cs.build().holes).toEqual({ added: [], removed: [], updated: [y] });
  });
});
