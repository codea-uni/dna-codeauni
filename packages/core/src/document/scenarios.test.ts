import { describe, expect, it } from 'vitest';
import { compareScenarios } from '../analysis/compareScenarios';
import { EXAMPLES } from '../examples/examples';
import { DocumentStore } from './DocumentStore';
import { loadScenario, removeScenario, saveScenario } from './commands';

const production = () => {
  const ex = EXAMPLES.find((e) => e.id === 'production');
  if (!ex) throw new Error('sin ejemplo');
  return ex.build();
};

describe('escenarios (H-701, R-23)', () => {
  it('guardar, modificar, cargar y deshacer', () => {
    const doc = new DocumentStore(production());
    const blast = doc.project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    doc.dispatch(saveScenario(doc, blast.id, 'Base'), 'Guardar escenario');
    const scenario = doc.project.scenarios?.[0];
    expect(scenario?.name).toBe('Base');
    // Variante: sin la mitad de los taladros y otra ventana de MIC
    const half = blast.holes.slice(0, Math.floor(blast.holes.length / 2)).map((h) => h.id);
    doc.dispatch(
      [
        { type: 'holes/remove', blastId: blast.id, ids: half },
        {
          type: 'blast/patch',
          blastId: blast.id,
          patch: { calcParams: { ...blast.calcParams, micWindow: 0.02 } },
        },
      ],
      'Variante',
    );
    expect(doc.project.blasts[0]?.holes.length).toBe(blast.holes.length - half.length);
    // Cargar el escenario restaura el diseño completo, con el mismo id de voladura
    doc.dispatch(loadScenario(doc, blast.id, scenario?.id ?? ('' as never)), 'Cargar escenario');
    const restored = doc.project.blasts[0];
    expect(restored?.id).toBe(blast.id);
    expect(restored?.holes).toEqual(blast.holes);
    expect(restored?.calcParams.micWindow).toBe(0.008);
    // Un solo paso de deshacer vuelve a la variante
    doc.undo();
    expect(doc.project.blasts[0]?.holes.length).toBe(blast.holes.length - half.length);
    doc.dispatch(removeScenario(doc, scenario?.id ?? ('' as never)), 'Borrar');
    expect(doc.project.scenarios).toEqual([]);
  });

  it('comparación lado a lado: la ventana de MIC más ancha agrupa más carga', () => {
    const project = production();
    const blast = project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const wide = { ...blast, calcParams: { ...blast.calcParams, micWindow: 0.05 } };
    const [base, alt] = compareScenarios(project, [
      { name: 'Actual', blast },
      { name: 'Ventana 50 ms', blast: wide },
    ]);
    expect(base?.holes).toBe(blast.holes.length);
    expect(base?.errors).toBe(0);
    expect(alt?.mic ?? 0).toBeGreaterThan(base?.mic ?? Infinity);
    expect(base?.loadingFactor).toBeCloseTo(alt?.loadingFactor ?? NaN, 12);
    expect(base?.maxPpv?.point).toBeDefined();
  });
});

describe('deshacer y rehacer (H-703)', () => {
  it('60 ediciones de malla, carga y amarre se deshacen y rehacen con estado consistente', () => {
    const doc = new DocumentStore(production());
    const original = doc.project;
    const blast = original.blasts[0];
    if (!blast) throw new Error('sin voladura');
    for (let i = 0; i < 60; i++) {
      const h = doc.project.blasts[0]?.holes[i % 20];
      if (!h) throw new Error('sin taladro');
      const kind = i % 3;
      doc.dispatch(
        kind === 0
          ? [
              {
                type: 'holes/replace',
                blastId: blast.id,
                holes: [{ ...h, collar: { ...h.collar, x: h.collar.x + 1 } }],
              },
            ]
          : kind === 1
            ? [
                {
                  type: 'holes/replace',
                  blastId: blast.id,
                  holes: [{ ...h, decks: h.decks.slice(0, -1) }],
                },
              ]
            : [
                {
                  type: 'blast/patch',
                  blastId: blast.id,
                  patch: {
                    initiation: {
                      ...blast.initiation,
                      connections: blast.initiation.connections.slice(i),
                    },
                  },
                },
              ],
        `Edición ${String(i)}`,
      );
    }
    const edited = doc.project;
    for (let i = 0; i < 60; i++) doc.undo();
    expect(doc.canUndo).toBe(false);
    expect(doc.project).toEqual(original);
    for (let i = 0; i < 60; i++) doc.redo();
    expect(doc.project).toEqual(edited);
  });
});
