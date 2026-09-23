import {
  centeredPatternOrigin,
  commands,
  createEmptyProject,
  fitPatternToPolygon,
  newId,
  nextHoleNumber,
  type Pattern,
} from '@blastlab/core';
import { APP_VERSION, getCompute, getEngine, session } from './session';
import { useUiStore } from './stores/uiStore';

/** Acciones de la aplicación. Todo cálculo pesado va al worker de cómputo. */

const { document, selection } = session;

function notify(text: string, kind: 'info' | 'error' = 'info'): void {
  useUiStore.getState().notify(text, kind);
}

async function withBusy<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  const ui = useUiStore.getState();
  ui.setBusy(label);
  try {
    return await fn();
  } catch (err) {
    notify(err instanceof Error ? err.message : String(err), 'error');
    return undefined;
  } finally {
    useUiStore.getState().setBusy(null);
  }
}

export function undo(): void {
  const label = document.undoLabel;
  if (!label) return;
  document.undo();
  notify(`Deshecho: ${label}`);
}

export function redo(): void {
  const label = document.redoLabel;
  if (!label) return;
  document.redo();
  notify(`Rehecho: ${label}`);
}

export function deleteSelection(): void {
  const ids = [...selection.ids];
  if (ids.length === 0) return;
  document.dispatch(
    commands.deleteHoles(document, ids),
    ids.length === 1 ? 'Borrar taladro' : `Borrar ${ids.length} taladros`,
  );
  notify(`${ids.length} taladro(s) borrado(s)`);
}

export function selectAll(): void {
  selection.set(document.project.blasts.flatMap((b) => b.holes.map((h) => h.id)));
}

export function zoomToFit(selectionOnly = false): void {
  getEngine()?.zoomToFit(selectionOnly);
}

export function newProject(): void {
  if (document.canUndo && !window.confirm('¿Descartar el proyecto actual y crear uno nuevo?'))
    return;
  document.load(createEmptyProject());
  notify('Proyecto nuevo');
}

export async function saveProject(): Promise<void> {
  await withBusy('Guardando…', async () => {
    const project = document.project;
    const text = await getCompute().api.serializeProject(project, { appVersion: APP_VERSION });
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'proyecto'}.blastlab.json`;
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    notify(`Proyecto guardado (${(text.length / 1024).toFixed(0)} KB)`);
  });
}

export async function openProject(file: File): Promise<void> {
  await withBusy('Abriendo…', async () => {
    const text = await file.text();
    const result = await getCompute().api.parseProject(text);
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    document.load(result.file.project);
    const holes = result.file.project.blasts.reduce((n, b) => n + b.holes.length, 0);
    notify(`Abierto "${result.file.project.name}" (${holes} taladros)`);
  });
}

export interface PatternForm {
  kind: Pattern['kind'];
  burden: number;
  spacing: number;
  rows: number;
  holesPerRow: number;
  rowAzimuth: number; // rad
  rowAdvance: Pattern['rowAdvance'];
  /** Recortar al perímetro de la voladura (calcula origen, filas y columnas automáticamente). */
  clipToBoundary: boolean;
}

/** Genera una malla en el worker y la agrega como un solo paso de undo. */
export async function generatePattern(form: PatternForm): Promise<void> {
  const blast = document.project.blasts[0];
  const engine = getEngine();
  if (!blast || !engine) return;
  const { holeTemplate } = useUiStore.getState();
  const geometry = {
    kind: form.kind,
    burden: form.burden,
    spacing: form.kind === 'square' ? form.burden : form.spacing,
    rowAzimuth: form.rowAzimuth,
    rowAdvance: form.rowAdvance,
  };
  const boundary = form.clipToBoundary ? blast.boundary : undefined;
  const layout = boundary
    ? fitPatternToPolygon(geometry, boundary)
    : {
        rows: form.rows,
        holesPerRow: form.holesPerRow,
        origin: centeredPatternOrigin(
          { ...geometry, rows: form.rows, holesPerRow: form.holesPerRow },
          engine.getViewCenter(),
        ),
      };
  const pattern: Pattern = {
    id: newId<'Pattern'>(),
    name: `Malla ${blast.patterns.length + 1}`,
    ...geometry,
    ...layout,
    holeTemplate,
  };
  if (boundary) pattern.clipBoundary = boundary;

  await withBusy('Generando malla…', async () => {
    const t0 = performance.now();
    const holes = await getCompute().api.generatePattern(
      pattern,
      blast.bench,
      nextHoleNumber(blast.holes),
    );
    const t1 = performance.now();
    document.dispatch(
      commands.addPattern(blast.id, pattern, holes),
      `Generar ${pattern.name} (${holes.length} taladros)`,
    );
    const t2 = performance.now();
    notify(
      `${pattern.name}: ${holes.length} taladros (worker ${(t1 - t0).toFixed(0)} ms, documento + render ${(t2 - t1).toFixed(0)} ms)`,
    );
  });
}

/** Fixture de rendimiento: malla de 50 × 100 = 5.000 taladros centrada en la vista. */
export async function generatePerfFixture(): Promise<void> {
  await generatePattern({
    kind: 'staggered',
    burden: 6,
    spacing: 7,
    rows: 50,
    holesPerRow: 100,
    rowAzimuth: Math.PI / 2,
    rowAdvance: 'right',
    clipToBoundary: false,
  });
  getEngine()?.zoomToFit();
}
