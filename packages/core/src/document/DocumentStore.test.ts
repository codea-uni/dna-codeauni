import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
} from '../model/factories';
import type { Hole } from '../model/types';
import { degToRad } from '../units/units';
import type { ChangeSet } from './changeset';
import { addHoles, deleteHoles, editHoles, moveHoles, setBlastBoundary } from './commands';
import { DocumentStore } from './DocumentStore';
import { createEditorSession } from './session';

function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`índice ${i} fuera de rango`);
  return v;
}

function makeHoles(n: number): Hole[] {
  return Array.from({ length: n }, (_, i) =>
    createHole({
      position: { x: i * 5, y: 0 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: DEFAULT_BENCH,
      label: String(i + 1),
    }),
  );
}

function setup(n = 5) {
  const store = new DocumentStore(createEmptyProject('Test'));
  const blast = store.project.blasts[0];
  if (!blast) throw new Error('sin voladura');
  const holes = makeHoles(n);
  store.dispatch(addHoles(blast.id, holes), 'Agregar');
  const events: ChangeSet[] = [];
  store.subscribe((cs) => events.push(cs));
  return { store, blastId: blast.id, holes, events };
}

const labels = (store: DocumentStore) => store.project.blasts[0]?.holes.map((h) => h.label);

describe('DocumentStore', () => {
  it('agrega, deshace y rehace', () => {
    const { store, events } = setup(3);
    expect(labels(store)).toEqual(['1', '2', '3']);
    store.undo();
    expect(labels(store)).toEqual([]);
    expect(events.at(-1)?.holes.removed).toHaveLength(3);
    store.redo();
    expect(labels(store)).toEqual(['1', '2', '3']);
    expect(events.at(-1)?.holes.added).toHaveLength(3);
  });

  it('borrar y deshacer restaura el orden exacto', () => {
    const { store, holes } = setup(6);
    const ids = [1, 4, 5].map((i) => at(holes, i).id);
    store.dispatch(deleteHoles(store, ids), 'Borrar');
    expect(labels(store)).toEqual(['1', '3', '4']);
    store.undo();
    expect(labels(store)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(store.findHole(at(ids, 2))?.index).toBe(5);
  });

  it('mover emite solo "updated" y es reversible', () => {
    const { store, holes, events } = setup(3);
    const id = at(holes, 0).id;
    store.dispatch(moveHoles(store, [id], 1.5, -2), 'Mover');
    expect(store.findHole(id)?.hole.collar).toMatchObject({ x: 1.5, y: -2 });
    expect(events.at(-1)?.holes).toEqual({ added: [], removed: [], updated: [id] });
    store.undo();
    expect(store.findHole(id)?.hole.collar).toMatchObject({ x: 0, y: 0 });
  });

  it('editar inclinación recalcula la longitud hasta piso + sobreperforación', () => {
    const { store, holes } = setup(1);
    const id = at(holes, 0).id;
    store.dispatch(editHoles(store, [id], { inclination: degToRad(20) }), 'Editar');
    // (15 + 1.5) / cos 20° = 17.559 m
    expect(store.findHole(id)?.hole.length).toBeCloseTo(17.5589, 4);
    store.dispatch(editHoles(store, [id], { length: 12 }), 'Editar');
    expect(store.findHole(id)?.hole.length).toBe(12);
  });

  it('un nuevo comando vacía el redo', () => {
    const { store, holes } = setup(2);
    store.dispatch(moveHoles(store, [at(holes, 0).id], 1, 0), 'Mover');
    store.undo();
    expect(store.canRedo).toBe(true);
    store.dispatch(moveHoles(store, [at(holes, 1).id], 1, 0), 'Mover');
    expect(store.canRedo).toBe(false);
  });

  it('perímetro: fijar y quitar (undefined elimina la clave)', () => {
    const { store, blastId } = setup(0);
    const boundary = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    store.dispatch(setBlastBoundary(blastId, boundary), 'Perímetro');
    expect(store.getBlast(blastId)?.boundary).toEqual(boundary);
    store.dispatch(setBlastBoundary(blastId, undefined), 'Quitar perímetro');
    expect(store.getBlast(blastId)).not.toHaveProperty('boundary');
    store.undo();
    expect(store.getBlast(blastId)?.boundary).toEqual(boundary);
  });

  it('una operación inválida no deja el documento a medias', () => {
    const { store, blastId, holes } = setup(2);
    const version = store.version;
    const before = store.project;
    expect(() => {
      store.dispatch(
        [
          { type: 'holes/remove', blastId, ids: [at(holes, 0).id] },
          { type: 'holes/insert', blastId, entries: [{ item: at(holes, 1) }] }, // duplicado
        ],
        'Inválido',
      );
    }).toThrow();
    expect(store.project).toBe(before);
    expect(store.version).toBe(version);
    expect(store.canUndo).toBe(true); // solo el "Agregar" inicial
    expect(store.undoLabel).toBe('Agregar');
  });

  it('la sesión depura la selección al borrar y al cargar', () => {
    const session = createEditorSession();
    const blastId = session.document.project.blasts[0]?.id;
    if (!blastId) throw new Error('sin voladura');
    const holes = makeHoles(3);
    session.document.dispatch(addHoles(blastId, holes), 'Agregar');
    session.selection.set(holes.map((h) => h.id));
    session.document.dispatch(deleteHoles(session.document, [at(holes, 0).id]), 'Borrar');
    expect(session.selection.size).toBe(2);
    session.document.load(createEmptyProject());
    expect(session.selection.size).toBe(0);
  });
});
