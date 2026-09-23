import {
  centeredPatternOrigin,
  commands,
  createEmptyProject,
  electronicTimes,
  fitPatternToPolygon,
  newId,
  nextHoleNumber,
  rowTieUp,
  type BoundaryId,
  type DetonatorId,
  type HoleId,
  type NodeRef,
  type Pattern,
  type PatternId,
  type SurfaceConnectorId,
} from '@blastlab/core';
import { APP_VERSION, getCompute, getEngine, session } from './session';
import { useAnalysisStore } from './stores/analysisStore';
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
  /** Perímetro a rellenar y recortar (calcula origen, filas y columnas); null = centrada en la vista. */
  boundaryId: BoundaryId | null;
  /** Distancia de la primera fila al borde del perímetro en el sentido de avance [m]. */
  frontOffset: number;
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
  const boundary = form.boundaryId
    ? blast.boundaries.find((b) => b.id === form.boundaryId)
    : undefined;
  const layout = boundary
    ? fitPatternToPolygon(geometry, boundary.polygon, form.frontOffset)
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
  if (boundary) {
    pattern.clipBoundary = boundary.polygon;
    pattern.boundaryId = boundary.id;
    pattern.name = `${pattern.name} (${boundary.name})`;
  }

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

// ------------------------------------------------------------------ Tiempos

export interface TieUpForm {
  patternId: PatternId;
  startRow: number;
  startCol: number;
}

/** Reemplaza las conexiones y puntos de inicio de los taladros del patrón por un amarre por filas. */
export function generateRowTieUp(
  form: TieUpForm,
  interHoleConnectorId: SurfaceConnectorId,
  interRowConnectorId: SurfaceConnectorId,
): void {
  const blast = document.project.blasts[0];
  if (!blast) return;
  const generated = rowTieUp(blast, { ...form, interHoleConnectorId, interRowConnectorId });
  if (generated.connections.length === 0) {
    notify('El patrón no tiene taladros con fila/columna', 'error');
    return;
  }
  const inPattern = new Set<string>(
    blast.holes.filter((h) => h.patternId === form.patternId).map((h) => h.id),
  );
  const touches = (ref: NodeRef) => ref.kind === 'hole' && inPattern.has(ref.holeId);
  const plan = blast.initiation;
  document.dispatch(
    commands.setInitiation(blast.id, {
      ...plan,
      system: plan.system === 'electronic' ? 'mixed' : plan.system,
      connections: [
        ...plan.connections.filter((c) => !touches(c.from) && !touches(c.to)),
        ...generated.connections,
      ],
      initiationPoints: [
        ...plan.initiationPoints.filter((p) => !touches(p.at)),
        ...generated.initiationPoints,
      ],
    }),
    'Amarre por filas',
  );
  notify(`Amarre generado: ${generated.connections.length} conexiones`);
}

/** Programa detonadores electrónicos en los taladros del patrón y quita su red de superficie. */
export function assignElectronicTimes(
  form: TieUpForm,
  detonatorId: DetonatorId,
  interHole: number,
  interRow: number,
  offset: number,
): void {
  const blast = document.project.blasts[0];
  if (!blast) return;
  const times = electronicTimes(blast, { ...form, detonatorId, interHole, interRow, offset });
  if (times.size === 0) {
    notify('El patrón no tiene taladros con fila/columna', 'error');
    return;
  }
  const ids = [...times.keys()];
  const idSet = new Set<string>(ids);
  const touches = (ref: NodeRef) => ref.kind === 'hole' && idSet.has(ref.holeId);
  const plan = blast.initiation;
  document.dispatch(
    [
      ...commands.setDownholeDetonator(document, ids, detonatorId, (id) => times.get(id) ?? 0),
      ...commands.setInitiation(blast.id, {
        ...plan,
        system: plan.connections.every((c) => touches(c.from) || touches(c.to))
          ? 'electronic'
          : 'mixed',
        connections: plan.connections.filter((c) => !touches(c.from) && !touches(c.to)),
        initiationPoints: plan.initiationPoints.filter((p) => !touches(p.at)),
      }),
    ],
    `Tiempos electrónicos (${ids.length} taladros)`,
  );
  notify(`Tiempos electrónicos asignados a ${ids.length} taladros`);
}

export function clearConnections(onlySelection: boolean): void {
  const blast = document.project.blasts[0];
  if (!blast) return;
  if (onlySelection) {
    document.dispatch(
      commands.removeConnectionsOfHoles(document, blast.id, selection.ids),
      'Borrar amarres de la selección',
    );
  } else {
    document.dispatch(
      commands.setInitiation(blast.id, {
        ...blast.initiation,
        connections: [],
        initiationPoints: [],
      }),
      'Borrar todos los amarres',
    );
  }
}

// ------------------------------------------------------------------ CSV

/** Lee el archivo y pide la vista previa al worker; abre el diálogo de importación. */
export async function openCsv(file: File): Promise<void> {
  await withBusy('Leyendo CSV…', async () => {
    const text = await file.text();
    const preview = await getCompute().api.csvPreview(text);
    if (preview.headers.length === 0) {
      notify('El archivo está vacío', 'error');
      return;
    }
    useUiStore.getState().setCsvPreview({ fileName: file.name, text, ...preview });
  });
}

/** Exporta los taladros de la voladura (con kg por taladro si hay análisis) a CSV. */
export async function exportCsv(): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy('Exportando CSV…', async () => {
    const analysis = useAnalysisStore.getState().analysis;
    const kg = analysis
      ? new Map<string, number>(
          analysis.charge.holeIds.map((id, i) => [id, analysis.charge.perHole[i] ?? 0]),
        )
      : undefined;
    const text = await getCompute().api.csvExport(blast.holes, kg);
    download(
      text,
      `${document.project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'taladros'}.csv`,
      'text/csv',
    );
    notify(`${blast.holes.length} taladros exportados`);
  });
}

function download(data: string | Uint8Array, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = window.document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

// ------------------------------------------------------------------ DXF y PDF

export async function openDxf(file: File): Promise<void> {
  await withBusy('Leyendo DXF…', async () => {
    const text = await file.text();
    const inspection = await getCompute().api.dxfInspect(text);
    if (inspection.entityCount === 0) {
      notify('El DXF no tiene entidades', 'error');
      return;
    }
    useUiStore.getState().setDxfPreview({ fileName: file.name, text, inspection });
  });
}

const baseName = () => document.project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'voladura';

export async function exportDxf(): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy('Exportando DXF…', async () => {
    const text = await getCompute().api.dxfExport(document.project, blast.id, { ties: true });
    download(text, `${baseName()}.dxf`, 'application/dxf');
    notify('DXF exportado');
  });
}

export async function exportReport(): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy('Generando informe…', async () => {
    const bytes = await getCompute().api.report(document.project, blast.id, {
      date: new Date().toISOString(),
      appVersion: APP_VERSION,
      holeTable: true,
    });
    download(bytes, `${baseName()}-informe.pdf`, 'application/pdf');
    notify('Informe PDF generado');
  });
}

// ------------------------------------------------------------------ Ejemplos

/** Vista con la que abre cada ejemplo, para que se entienda de un vistazo. */
/** Vista base: cada ejemplo parte limpio, sin capas ni cálculos heredados del anterior. */
function resetView(): void {
  getEngine()?.stopSequence();
  const a = useAnalysisStore.getState();
  a.set({
    colorBy: 'none',
    labelBy: 'label',
    vibEnabled: false,
    energyEnabled: false,
    fragAuto: true,
    sequencePlaying: false,
    sequenceTime: null,
  });
  a.setLayer('isochrones', false);
  a.setLayer('connections', true);
}

const SCENARIO_VIEWS: Record<string, () => void> = {
  production: () => {
    useAnalysisStore
      .getState()
      .set({ colorBy: 'time', labelBy: 'label', vibEnabled: true, fragAuto: true });
    useAnalysisStore.getState().setLayer('isochrones', true);
    useUiStore.setState({ leftTab: 'timing', rightTab: 'results', viewMode: 'plan' });
  },
  wet: () => {
    useAnalysisStore.getState().set({ colorBy: 'kg', labelBy: 'kg' });
    useUiStore.setState({ leftTab: 'charge', rightTab: 'results', viewMode: 'plan' });
  },
  electronic: () => {
    useAnalysisStore
      .getState()
      .set({ colorBy: 'time', labelBy: 'time', vibEnabled: true, vibMetric: 'ppv' });
    useUiStore.setState({ leftTab: 'vibration', rightTab: 'results', viewMode: 'plan' });
  },
  inclined: () => {
    useAnalysisStore.getState().set({ colorBy: 'none', labelBy: 'label' });
    useUiStore.setState({ leftTab: 'design', rightTab: 'view', viewMode: '3d' });
  },
  problems: () => {
    useAnalysisStore.getState().set({ colorBy: 'none', labelBy: 'label' });
    useUiStore.setState({ leftTab: 'design', rightTab: 'results', viewMode: 'plan' });
  },
};

/** Abre un proyecto de ejemplo completamente configurado (se genera en el worker). */
export async function loadScenario(id: string, name: string): Promise<void> {
  if (
    document.canUndo &&
    !window.confirm(`¿Descartar el proyecto actual y abrir el ejemplo "${name}"?`)
  )
    return;
  await withBusy('Preparando ejemplo…', async () => {
    const project = await getCompute().api.buildScenario(id);
    document.load(project);
    useUiStore.getState().setActiveBoundary(project.blasts[0]?.boundaries[0]?.id ?? null);
    resetView();
    SCENARIO_VIEWS[id]?.();
    const holes = project.blasts[0]?.holes.length ?? 0;
    notify(`Ejemplo "${name}": ${holes} taladros`);
  });
}

/** Selecciona los taladros de una alerta y los encuadra. */
export function focusHoles(ids: readonly HoleId[]): void {
  selection.set(ids);
  useUiStore.getState().setViewMode('plan');
  getEngine()?.zoomToFit(true);
}
