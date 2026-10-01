/**
 * Observación 1 del ingeniero (`docs/theory/06`): generar una malla nueva no debe dejar dos mallas
 * superpuestas en silencio. `replacePatterns` borra la anterior con sus taladros y amarres en un
 * solo paso de deshacer; `removePatterns` borra una malla de la lista.
 */
import { describe, expect, it } from 'vitest';
import { buildExample, EXAMPLE_SPECS } from '../examples/examples';
import { newId } from '../model/ids';
import type { Pattern } from '../model/types';
import { DocumentStore } from './DocumentStore';
import { removePatterns, replacePatterns } from './commands';

const production = () => buildExample(EXAMPLE_SPECS.production);

describe('reemplazo y borrado de mallas', () => {
  it('reemplazar deja una sola malla, sin taladros ni amarres de la anterior; un deshacer la restaura', () => {
    const doc = new DocumentStore(production());
    const blast = doc.project.blasts[0];
    const old = blast?.patterns[0];
    if (!blast || !old) throw new Error('sin malla');
    const before = structuredClone(doc.project.blasts[0]);
    const pattern: Pattern = { ...old, id: newId<'Pattern'>(), name: 'Cuadrada', kind: 'square' };
    const hole = { ...blast.holes[0]!, id: newId<'Hole'>(), patternId: pattern.id }; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    doc.dispatch(replacePatterns(doc, blast.id, [old.id], pattern, [hole]), 'Reemplazar');
    const after = doc.project.blasts[0];
    expect(after?.patterns.map((p) => p.id)).toEqual([pattern.id]);
    expect(after?.holes.map((h) => h.id)).toEqual([hole.id]);
    // Las conexiones del amarre anterior apuntaban a taladros borrados: no quedan huérfanas.
    expect(after?.initiation.connections).toEqual([]);
    doc.undo();
    expect(doc.project.blasts[0]).toEqual(before);
  });

  it('borrar una malla de la lista borra solo sus taladros', () => {
    const doc = new DocumentStore(production());
    const blast = doc.project.blasts[0];
    const p = blast?.patterns[0];
    if (!blast || !p) throw new Error('sin malla');
    doc.dispatch(removePatterns(doc, blast.id, [p.id]), 'Borrar malla');
    expect(doc.project.blasts[0]?.patterns).toEqual([]);
    expect(doc.project.blasts[0]?.holes).toEqual([]);
  });
});
