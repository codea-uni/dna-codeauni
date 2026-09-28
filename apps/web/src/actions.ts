import {
  centeredPatternOrigin,
  commands,
  createEmptyProject,
  electronicTimes,
  fitPatternToPolygon,
  makeGroup,
  newId,
  nextHoleNumber,
  rowTieUp,
  type Blast,
  type BoundaryId,
  type Hole,
  type HoleGroup,
  type HoleGroupId,
  type Op,
  type Polygon2,
  type DetonatorId,
  type HoleId,
  type NodeRef,
  type Pattern,
  type PatternId,
  type SurfaceConnectorId,
} from '@cronos/core';
import { APP_VERSION, getCompute, getEngine, session } from './session';
import { useAnalysisStore } from './stores/analysisStore';
import { t } from './i18n';
import { listVersions, loadWithoutSaving, readVersion } from './persistence/autosave';
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
    a.download = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'proyecto'}.cronos.json`;
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

/** Restaura una versión autoguardada (H-102); con `confirm`, pregunta si hay cambios sin deshacer. */
export async function restoreVersion(id: number, confirm = false): Promise<void> {
  const version = await readVersion(id);
  if (!version) return;
  const date = new Date(version.savedAt).toLocaleString();
  if (confirm && document.canUndo && !window.confirm(t('versions.confirm', { date }))) return;
  const result = await getCompute().api.parseProject(version.text);
  if (!result.ok) {
    notify(result.error, 'error');
    return;
  }
  loadWithoutSaving(result.file.project);
  notify(t('versions.restored', { name: version.name, date }));
}

/** Al abrir la aplicación: recupera la última versión autoguardada, si la hay. */
export async function restoreLatestAutosave(): Promise<void> {
  try {
    const latest = (await listVersions())[0];
    if (latest && !document.canUndo) await restoreVersion(latest.id);
  } catch (err) {
    console.warn('[autoguardado]', err);
  }
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

  // P-03: sin cara libre se genera igual, con advertencia (la regla no está en R3).
  const hasFreeFace =
    blast.freeFaces.length > 0 || blast.boundaries.some((b) => b.freeFaceEdges.length > 0);
  // P-03: sin cara libre no se bloquea (cortes, rampas, primera voladura), pero el ingeniero la
  // acepta explícitamente.
  if (
    !hasFreeFace &&
    !window.confirm(
      `${t('pattern.noFreeFace')}\n\n¿Generar igual? (corte, rampa o primera voladura del banco: malla más cerrada, más carga o fila de alivio)`,
    )
  )
    return;

  await withBusy('Generando malla…', async () => {
    const t0 = performance.now();
    const holes = await getCompute().api.generatePattern(
      pattern,
      blast.bench,
      nextHoleNumber(blast.holes),
      blast.calcParams.subdrillConvention,
    );
    const t1 = performance.now();
    document.dispatch(
      commands.addPattern(blast.id, pattern, holes),
      `Generar ${pattern.name} (${holes.length} taladros)`,
    );
    const t2 = performance.now();
    const summary = `${pattern.name}: ${String(holes.length)} taladros (worker ${(t1 - t0).toFixed(0)} ms, documento + render ${(t2 - t1).toFixed(0)} ms)`;
    if (hasFreeFace) notify(summary);
    else notify(`${summary}. ${t('pattern.noFreeFace')}`, 'error');
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
/**
 * H-101: sin CRS (EPSG) declarado no se importa. Abre los ajustes del proyecto si falta.
 * Devuelve true si se puede importar.
 */
export function requireCrs(): boolean {
  if (document.project.coordinateSystem.epsg !== undefined) return true;
  notify(t('import.needsCrs'), 'error');
  useUiStore.getState().setSettingsOpen(true);
  return false;
}

export async function openCsv(file: File): Promise<void> {
  await withBusy('Leyendo CSV…', async () => {
    // Bytes, no `file.text()`: la codificación se detecta (ISO-8859-1, docs/theory/03 §5).
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preview = await getCompute().api.csvPreview(bytes);
    if (preview.headers.length === 0) {
      notify('El archivo está vacío', 'error');
      return;
    }
    useUiStore.getState().setCsvPreview({ fileName: file.name, bytes, ...preview });
  });
}

/** Ops para agregar perímetros importados (con nombres libres) a los de la voladura. */
export function boundaryOps(
  blast: Blast,
  imported: readonly { polygon: Polygon2; freeFaceEdges: number[] }[],
): Op[] {
  if (imported.length === 0) return [];
  let boundaries = blast.boundaries;
  for (const b of imported)
    boundaries = [
      ...boundaries,
      { ...commands.makeBoundary({ boundaries }, b.polygon), freeFaceEdges: b.freeFaceEdges },
    ];
  return [{ type: 'blast/patch', blastId: blast.id, patch: { boundaries } }];
}

/** GeoJSON: taladros (puntos), perímetros (polígonos) y caras libres (líneas), en un comando. */
export async function openGeoJson(file: File): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy('Leyendo GeoJSON…', async () => {
    const { epsg } = document.project.coordinateSystem;
    const r = await getCompute().api.geojsonImport(await file.text(), {
      diameter: useUiStore.getState().holeTemplate.diameter,
      subdrill: useUiStore.getState().holeTemplate.subdrill,
      bench: blast.bench,
      startNumber: nextHoleNumber(blast.holes),
      existingLabels: blast.holes.map((h) => h.label),
      groups: blast.groups,
      subdrillConvention: blast.calcParams.subdrillConvention,
      ...(epsg === undefined ? {} : { epsg }),
    });
    const ops: Op[] = [
      ...(r.groups.length > 0
        ? [
            {
              type: 'blast/patch' as const,
              blastId: blast.id,
              patch: { groups: [...blast.groups, ...r.groups] },
            },
          ]
        : []),
      ...commands.addHoles(blast.id, r.holes),
      ...boundaryOps(blast, r.boundaries),
    ];
    if (r.holes.length === 0 && r.boundaries.length === 0) {
      notify(r.errors[0] ?? 'El GeoJSON no trae taladros ni perímetros', 'error');
      return;
    }
    document.dispatch(
      ops,
      `Importar GeoJSON (${String(r.holes.length)} taladros, ${String(r.boundaries.length)} perímetros)`,
    );
    getEngine()?.zoomToFit();
    const notes = [...r.warnings.map((w) => w.message), ...r.errors];
    notify(
      `GeoJSON: ${String(r.holes.length)} taladros · ${String(r.boundaries.length)} perímetros${notes.length ? ` · ${notes.join(' ')}` : ''}`,
      notes.length ? 'error' : 'info',
    );
  });
}

/** Perímetros desde CSV (ID opcional, Este, Norte). */
export async function openBoundariesCsv(file: File): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy('Leyendo perímetros…', async () => {
    const r = await getCompute().api.boundariesCsvImport(new Uint8Array(await file.arrayBuffer()));
    if (r.boundaries.length === 0) {
      notify(r.errors[0] ?? 'El CSV no trae perímetros', 'error');
      return;
    }
    document.dispatch(
      boundaryOps(blast, r.boundaries),
      `Importar perímetros (${String(r.boundaries.length)})`,
    );
    getEngine()?.zoomToFit();
    notify(
      `${String(r.boundaries.length)} perímetros importados${r.errors.length ? ` · ${r.errors.join(' · ')}` : ''}`,
      r.errors.length ? 'error' : 'info',
    );
  });
}

export async function exportGeoJson(): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy('Exportando GeoJSON…', async () => {
    const text = await getCompute().api.geojsonExport(
      blast,
      document.project.coordinateSystem.epsg,
    );
    download(text, `${baseName()}.geojson`, 'application/geo+json');
    notify(
      `${String(blast.holes.length)} taladros y ${String(blast.boundaries.length)} perímetros exportados`,
    );
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

const EXAMPLE_VIEWS: Record<string, () => void> = {
  production: () => {
    useAnalysisStore.getState().set({ colorBy: 'time', labelBy: 'label' });
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
export async function loadExample(id: string, name: string): Promise<void> {
  if (
    document.canUndo &&
    !window.confirm(`¿Descartar el proyecto actual y abrir el ejemplo "${name}"?`)
  )
    return;
  await withBusy('Preparando ejemplo…', async () => {
    const project = await getCompute().api.buildExample(id);
    document.load(project);
    useUiStore.getState().setActiveBoundary(project.blasts[0]?.boundaries[0]?.id ?? null);
    resetView();
    EXAMPLE_VIEWS[id]?.();
    const holes = project.blasts[0]?.holes.length ?? 0;
    notify(`Ejemplo "${name}": ${holes} taladros`);
  });
}

// ------------------------------------------------------------------ Grupos (H-303, RM-18)

function withoutGroup(h: Hole): Hole {
  const copy = { ...h };
  delete copy.groupId;
  return copy;
}

/** Asigna (o quita, con null) el grupo de los taladros seleccionados, más ops extra en el mismo paso. */
function groupOps(blast: Blast, groupId: HoleGroupId | null, extra: Op[] = []): Op[] {
  const ids = selection.ids;
  const holes = blast.holes
    .filter((h) => ids.has(h.id))
    .map((h) => (groupId ? { ...h, groupId } : withoutGroup(h)));
  return [
    ...extra,
    ...(holes.length > 0 ? [{ type: 'holes/replace' as const, blastId: blast.id, holes }] : []),
  ];
}

export function createGroupFromSelection(): void {
  const blast = document.project.blasts[0];
  if (!blast) return;
  const n = blast.groups.length + 1;
  const group = makeGroup(t('groups.defaultName', { n }), blast.groups.length);
  document.dispatch(
    groupOps(blast, group.id, [
      { type: 'blast/patch', blastId: blast.id, patch: { groups: [...blast.groups, group] } },
    ]),
    `Crear ${group.name}`,
  );
}

export function assignSelectionToGroup(groupId: HoleGroupId | null): void {
  const blast = document.project.blasts[0];
  if (!blast || selection.ids.size === 0) return;
  const name = blast.groups.find((g) => g.id === groupId)?.name;
  document.dispatch(groupOps(blast, groupId), name ? `Asignar a ${name}` : 'Quitar de grupo');
}

export function updateGroup(groupId: HoleGroupId, patch: Partial<Omit<HoleGroup, 'id'>>): void {
  const blast = document.project.blasts[0];
  if (!blast) return;
  document.dispatch(
    {
      type: 'blast/patch',
      blastId: blast.id,
      patch: { groups: blast.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) },
    },
    'Editar grupo',
  );
}

/** Borra el grupo y lo quita de sus taladros (un solo paso de deshacer). */
export function removeGroup(groupId: HoleGroupId): void {
  const blast = document.project.blasts[0];
  if (!blast) return;
  const holes = blast.holes.filter((h) => h.groupId === groupId).map(withoutGroup);
  document.dispatch(
    [
      {
        type: 'blast/patch',
        blastId: blast.id,
        patch: { groups: blast.groups.filter((g) => g.id !== groupId) },
      },
      ...(holes.length > 0 ? [{ type: 'holes/replace' as const, blastId: blast.id, holes }] : []),
    ],
    'Borrar grupo',
  );
}

export function selectGroup(groupId: HoleGroupId): void {
  const blast = document.project.blasts[0];
  if (!blast) return;
  focusHoles(blast.holes.filter((h) => h.groupId === groupId).map((h) => h.id));
}

/** Selecciona los taladros de una alerta y los encuadra. */
export function focusHoles(ids: readonly HoleId[]): void {
  selection.set(ids);
  useUiStore.getState().setViewMode('plan');
  getEngine()?.zoomToFit(true);
}
