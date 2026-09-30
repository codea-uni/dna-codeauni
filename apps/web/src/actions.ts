import {
  boundaryBench,
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
import { formatNumber, t, useLocale } from './i18n';
import { importErrorText, importWarningText, parseErrorText } from './i18n/coreText';
import { listVersions, loadWithoutSaving, readVersion } from './persistence/autosave';
import { useUiStore } from './stores/uiStore';
import { collectAssets, drapeNewHoles, storeEmbeddedAssets } from './topography/session';

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
  notify(t('actions.undone', { label }));
}

export function redo(): void {
  const label = document.redoLabel;
  if (!label) return;
  document.redo();
  notify(t('actions.redone', { label }));
}

export function deleteSelection(): void {
  const ids = [...selection.ids];
  if (ids.length === 0) return;
  document.dispatch(
    commands.deleteHoles(document, ids),
    ids.length === 1 ? t('actions.deleteHole') : t('actions.deleteHoles', { n: ids.length }),
  );
  notify(t('actions.holesDeleted', { n: ids.length }));
}

export function selectAll(): void {
  selection.set(document.project.blasts.flatMap((b) => b.holes.map((h) => h.id)));
}

export function zoomToFit(selectionOnly = false): void {
  getEngine()?.zoomToFit(selectionOnly);
}

/** En solo lectura (revisor) no se reemplaza el proyecto abierto: se avisa y no se hace nada. */
function blockedByReadOnly(): boolean {
  if (!document.readOnly) return false;
  notify(t('projects.readOnlyHint'), 'error');
  return true;
}

export function newProject(): void {
  if (blockedByReadOnly()) return;
  if (document.canUndo && !window.confirm(t('actions.discardForNew'))) return;
  document.load(createEmptyProject());
  notify(t('toolbar.newProject'));
}

export async function saveProject(): Promise<void> {
  await withBusy(t('actions.saving'), async () => {
    const project = document.project;
    // Los levantamientos viajan dentro del archivo para que se abra en otro navegador (D-16).
    const assets = await collectAssets(project);
    const embeddedAssets = await getCompute().api.embedAssets(assets);
    const text = await getCompute().api.serializeProject(project, {
      appVersion: APP_VERSION,
      embeddedAssets,
    });
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || t('actions.file.project')}.cronos.json`;
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    notify(t('actions.saved', { kb: (text.length / 1024).toFixed(0) }));
  });
}

export async function openProject(file: File): Promise<void> {
  if (blockedByReadOnly()) return;
  await withBusy(t('actions.opening'), async () => {
    const text = await file.text();
    const result = await getCompute().api.parseProject(text);
    if (!result.ok) {
      notify(parseErrorText(result.error), 'error');
      return;
    }
    if (result.file.embeddedAssets) await storeEmbeddedAssets(result.file.embeddedAssets);
    document.load(result.file.project);
    const holes = result.file.project.blasts.reduce((n, b) => n + b.holes.length, 0);
    notify(t('actions.opened', { name: result.file.project.name, n: holes }));
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
    notify(parseErrorText(result.error), 'error');
    return;
  }
  if (result.file.embeddedAssets) await storeEmbeddedAssets(result.file.embeddedAssets);
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

/** Borra una malla y sus taladros (con confirmación), como un solo paso de deshacer. */
export function removePattern(patternId: PatternId): void {
  const blast = document.project.blasts[0];
  const p = blast?.patterns.find((x) => x.id === patternId);
  if (!blast || !p) return;
  const n = blast.holes.filter((h) => h.patternId === patternId).length;
  if (!window.confirm(t('pattern.removeConfirm', { name: p.name, n }))) return;
  document.dispatch(
    commands.removePatterns(document, blast.id, [patternId]),
    t('pattern.removeUndo', { name: p.name }),
  );
}

/**
 * Genera una malla en el worker y la agrega como un solo paso de undo. Si el perímetro ya tiene
 * malla, la reemplaza (con confirmación).
 */
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
    name: t('actions.patternName', { n: blast.patterns.length + 1 }),
    ...geometry,
    ...layout,
    holeTemplate,
  };
  if (boundary) {
    pattern.clipBoundary = boundary.polygon;
    pattern.boundaryId = boundary.id;
    pattern.name = `${pattern.name} (${boundary.name})`;
  }

  // Observación 1 del ingeniero: generar sobre un perímetro que ya tiene malla la reemplaza, con
  // confirmación; las mallas de otros perímetros se conservan (varias áreas en la misma voladura).
  const replaced = blast.patterns.filter((p) => p.boundaryId === pattern.boundaryId);
  const replacedHoles = blast.holes.filter((h) =>
    replaced.some((p) => p.id === h.patternId),
  ).length;
  if (
    replaced.length > 0 &&
    !window.confirm(
      t('pattern.replaceConfirm', {
        names: replaced.map((p) => p.name).join(', '),
        n: replacedHoles,
      }),
    )
  )
    return;
  if (replaced.length > 0) {
    const base = t('actions.patternName', { n: blast.patterns.length - replaced.length + 1 });
    pattern.name = boundary ? `${base} (${boundary.name})` : base;
  }

  // P-03: sin cara libre se genera igual, con advertencia (la regla no está en R3).
  const hasFreeFace =
    blast.freeFaces.length > 0 || blast.boundaries.some((b) => b.freeFaceEdges.length > 0);
  // P-03: sin cara libre no se bloquea (cortes, rampas, primera voladura), pero el ingeniero la
  // acepta explícitamente.
  if (
    !hasFreeFace &&
    !window.confirm(`${t('pattern.noFreeFace')}\n\n${t('actions.generateAnyway')}`)
  )
    return;

  await withBusy(t('actions.generatingPattern'), async () => {
    const t0 = performance.now();
    // Cada perímetro con su piso: la malla se genera en el banco de su perímetro.
    const generated = await getCompute().api.generatePattern(
      pattern,
      boundaryBench(blast.bench, boundary),
      nextHoleNumber(blast.holes),
      blast.calcParams.subdrillConvention,
    );
    // Con el banco sobre la topografía, cada boca va en el terreno (D-16).
    const { holes, outside, floor } = await drapeNewHoles(blast, generated, boundary);
    const t1 = performance.now();
    // Si el piso no correspondía a las bocas sobre el terreno (S-18), se ajusta en el mismo paso
    // y solo el del perímetro de esta malla: los demás perímetros no se mueven.
    const benchOps: Op[] =
      floor === null
        ? []
        : [
            {
              type: 'blast/patch',
              blastId: blast.id,
              patch: boundary
                ? {
                    boundaries: blast.boundaries.map((b) =>
                      b.id === boundary.id ? { ...b, floorElevation: floor } : b,
                    ),
                  }
                : { bench: { ...blast.bench, floorElevation: floor } },
            },
          ];
    document.dispatch(
      [
        ...benchOps,
        ...(replaced.length > 0
          ? commands.replacePatterns(
              document,
              blast.id,
              replaced.map((p) => p.id),
              pattern,
              holes,
            )
          : commands.addPattern(blast.id, pattern, holes)),
      ],
      t('actions.generatePatternUndo', { name: pattern.name, n: holes.length }),
    );
    const t2 = performance.now();
    const summary = t('actions.patternSummary', {
      name: pattern.name,
      n: holes.length,
      worker: (t1 - t0).toFixed(0),
      render: (t2 - t1).toFixed(0),
    });
    const offGround =
      (floor !== null ? ` ${t('topo.bench.floorSet', { floor: formatNumber(floor, 2) })}` : '') +
      (outside > 0 ? ` ${t('topo.bench.outside', { n: outside })}` : '');
    if (hasFreeFace && outside === 0) notify(`${summary}.${offGround}`);
    else
      notify(`${summary}.${hasFreeFace ? '' : ` ${t('pattern.noFreeFace')}`}${offGround}`, 'error');
  });
}

// ------------------------------------------------------------------ Tiempos

export interface TieUpForm {
  patternId: PatternId;
  startRow: number;
  startCol: number;
  /** `rows` = línea a línea o en V según la columna de inicio; `echelon` = en escalón (H-504). */
  mode?: 'rows' | 'echelon';
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
    notify(t('actions.noRowCol'), 'error');
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
    form.mode === 'echelon' ? t('actions.tieUpEchelon') : t('actions.tieUpRows'),
  );
  notify(t('actions.tieUpGenerated', { n: generated.connections.length }));
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
    notify(t('actions.noRowCol'), 'error');
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
    t('actions.electronicUndo', { n: ids.length }),
  );
  notify(t('actions.electronicAssigned', { n: ids.length }));
}

export function clearConnections(onlySelection: boolean): void {
  const blast = document.project.blasts[0];
  if (!blast) return;
  if (onlySelection) {
    document.dispatch(
      commands.removeConnectionsOfHoles(document, blast.id, selection.ids),
      t('actions.clearTiesSelection'),
    );
  } else {
    document.dispatch(
      commands.setInitiation(blast.id, {
        ...blast.initiation,
        connections: [],
        initiationPoints: [],
      }),
      t('actions.clearTiesAll'),
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
  await withBusy(t('actions.readingCsv'), async () => {
    // Bytes, no `file.text()`: la codificación se detecta (ISO-8859-1, docs/theory/03 §5).
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preview = await getCompute().api.csvPreview(bytes);
    if (preview.headers.length === 0) {
      notify(t('actions.emptyFile'), 'error');
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
  await withBusy(t('actions.readingGeoJson'), async () => {
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
      const first = r.errors[0];
      notify(
        first === undefined ? t('actions.geoJsonEmpty') : importErrorText({ message: first }),
        'error',
      );
      return;
    }
    document.dispatch(
      ops,
      t('actions.importGeoJsonUndo', { holes: r.holes.length, boundaries: r.boundaries.length }),
    );
    getEngine()?.zoomToFit();
    const notes = [
      ...r.warnings.map(importWarningText),
      ...r.errors.map((message) => importErrorText({ message })),
    ];
    notify(
      `${t('actions.geoJsonResult', { holes: r.holes.length, boundaries: r.boundaries.length })}${notes.length ? ` · ${notes.join(' ')}` : ''}`,
      notes.length ? 'error' : 'info',
    );
  });
}

/** Perímetros desde CSV (ID opcional, Este, Norte). */
export async function openBoundariesCsv(file: File): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy(t('actions.readingBoundaries'), async () => {
    const r = await getCompute().api.boundariesCsvImport(new Uint8Array(await file.arrayBuffer()));
    if (r.boundaries.length === 0) {
      const first = r.errors[0];
      notify(
        first === undefined ? t('actions.csvNoBoundaries') : importErrorText({ message: first }),
        'error',
      );
      return;
    }
    document.dispatch(
      boundaryOps(blast, r.boundaries),
      t('actions.importBoundariesUndo', { n: r.boundaries.length }),
    );
    getEngine()?.zoomToFit();
    notify(
      `${t('actions.boundariesImported', { n: r.boundaries.length })}${r.errors.length ? ` · ${r.errors.map((message) => importErrorText({ message })).join(' · ')}` : ''}`,
      r.errors.length ? 'error' : 'info',
    );
  });
}

/** Catálogo de explosivos a CSV (H-401). */
export async function exportCatalog(): Promise<void> {
  await withBusy(t('actions.exportingCatalog'), async () => {
    const text = await getCompute().api.catalogExport(document.project.library.explosives);
    download(text, `${baseName()}-${t('actions.file.explosives')}.csv`, 'text/csv');
  });
}

/** Agrega los explosivos de un CSV de catálogo a la librería (un paso de deshacer). */
export async function importCatalog(file: File): Promise<void> {
  await withBusy(t('actions.readingCatalog'), async () => {
    const r = await getCompute().api.catalogImport(new Uint8Array(await file.arrayBuffer()));
    const lib = document.project.library;
    if (r.explosives.length > 0)
      document.dispatch(
        commands.setLibrary({ ...lib, explosives: [...lib.explosives, ...r.explosives] }),
        t('actions.importCatalogUndo', { n: r.explosives.length }),
      );
    const errs = r.errors.map(importErrorText).join(' · ');
    notify(
      `${t('actions.explosivesImported', { n: r.explosives.length })}${errs ? ` · ${errs}` : ''}`,
      r.errors.length > 0 || r.explosives.length === 0 ? 'error' : 'info',
    );
  });
}

export async function exportGeoJson(): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy(t('actions.exportingGeoJson'), async () => {
    const text = await getCompute().api.geojsonExport(
      blast,
      document.project.coordinateSystem.epsg,
    );
    download(text, `${baseName()}.geojson`, 'application/geo+json');
    notify(
      t('actions.geoJsonExported', {
        holes: blast.holes.length,
        boundaries: blast.boundaries.length,
      }),
    );
  });
}

/** Plano (vista actual) como imagen PNG (`03 §4`). */
export function exportPlanPng(): void {
  const engine = getEngine();
  if (!engine) return;
  const a = window.document.createElement('a');
  a.href = engine.captureImage();
  a.download = `${baseName()}-${t('actions.file.plan')}.png`;
  a.click();
}

/** Tabla de taladros (con kg) al portapapeles, separada por tabuladores para pegar en una hoja de cálculo. */
export async function copyHolesTsv(): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy(t('actions.copying'), async () => {
    const analysis = useAnalysisStore.getState().analysis;
    const kg = analysis
      ? new Map<string, number>(
          analysis.charge.holeIds.map((id, i) => [id, analysis.charge.perHole[i] ?? 0]),
        )
      : undefined;
    const text = await getCompute().api.csvExport(blast.holes, kg, '\t');
    await navigator.clipboard.writeText(text);
    notify(t('actions.holesCopied', { n: blast.holes.length }));
  });
}

/** Exporta los taladros de la voladura (con kg por taladro si hay análisis) a CSV. */
export async function exportCsv(): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy(t('actions.exportingCsv'), async () => {
    const analysis = useAnalysisStore.getState().analysis;
    const kg = analysis
      ? new Map<string, number>(
          analysis.charge.holeIds.map((id, i) => [id, analysis.charge.perHole[i] ?? 0]),
        )
      : undefined;
    const text = await getCompute().api.csvExport(blast.holes, kg);
    download(
      text,
      `${document.project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || t('actions.file.holes')}.csv`,
      'text/csv',
    );
    notify(t('actions.holesExported', { n: blast.holes.length }));
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

// ------------------------------------------------------------------ Topografía (D-16)

/** Extensiones que abre el asistente de topografía (también al arrastrar archivos al visor). */
export const TOPOGRAPHY_ACCEPT = [
  '.dxf,.str,.dtm,.xml,.landxml,.csv,.txt,.xyz,.pts,.asc',
  '.tif,.tiff,.jpg,.jpeg,.png,.webp,.jgw,.jpgw,.pgw,.pngw,.tfw,.tifw,.wld',
  '.las,.laz',
].join(',');

/** Lee los archivos elegidos y abre el asistente de importación de topografía. */
export async function openTopography(files: readonly File[]): Promise<void> {
  if (files.length === 0) return;
  await withBusy(t('topo.import.processing'), async () => {
    const topoFiles = await Promise.all(
      files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    );
    const inspection = await getCompute().api.topographyInspect(topoFiles);
    if (!inspection.format) {
      const dwg = files.find((f) => /\.dwg$/i.test(f.name));
      notify(dwg ? t('topo.import.dwg', { file: dwg.name }) : t('topo.import.unknown'), 'error');
      return;
    }
    if (inspection.format === 'surpac' && !files.some((f) => /\.str$/i.test(f.name))) {
      notify(t('topo.import.dtmAlone'), 'error');
      return;
    }
    if (inspection.missingWorldFile) {
      notify(t('topo.import.needWorldFile'), 'error');
      return;
    }
    useUiStore.getState().setTopoImport({ files: topoFiles, inspection });
  });
}

// ------------------------------------------------------------------ DXF y PDF

export async function openDxf(file: File): Promise<void> {
  await withBusy(t('actions.readingDxf'), async () => {
    const text = await file.text();
    const inspection = await getCompute().api.dxfInspect(text);
    if (inspection.entityCount === 0) {
      notify(t('actions.dxfEmpty'), 'error');
      return;
    }
    useUiStore.getState().setDxfPreview({ fileName: file.name, text, inspection });
  });
}

const baseName = () =>
  document.project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || t('actions.file.blast');

export async function exportDxf(): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy(t('actions.exportingDxf'), async () => {
    const text = await getCompute().api.dxfExport(document.project, blast.id, { ties: true });
    download(text, `${baseName()}.dxf`, 'application/dxf');
    notify(t('actions.dxfExported'));
  });
}

export async function exportReport(): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  await withBusy(t('actions.generatingReport'), async () => {
    const bytes = await getCompute().api.report(document.project, blast.id, {
      date: new Date().toISOString(),
      appVersion: APP_VERSION,
      holeTable: true,
      language: useLocale.getState().locale,
    });
    download(bytes, `${baseName()}-${t('actions.file.report')}.pdf`, 'application/pdf');
    notify(t('actions.reportGenerated'));
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

/** Compara el diseño actual con los escenarios guardados (en el worker) y muestra la tabla. */
export async function compareScenarios(): Promise<void> {
  const blast = document.project.blasts[0];
  if (!blast) return;
  const designs = [
    { name: t('scenarios.current'), blast },
    ...(document.project.scenarios ?? []).map((s) => ({
      name: s.name,
      blast: { ...s.blast, id: blast.id },
    })),
  ];
  useUiStore
    .getState()
    .setScenarioKpis(await getCompute().api.compareScenarios(document.project, designs));
}

/** Abre un proyecto de ejemplo completamente configurado (se genera en el worker). */
export async function loadExample(id: string, name: string): Promise<void> {
  if (blockedByReadOnly()) return;
  if (document.canUndo && !window.confirm(t('actions.discardForExample', { name }))) return;
  await withBusy(t('actions.preparingExample'), async () => {
    const project = await getCompute().api.buildExample(id);
    document.load(project);
    useUiStore.getState().setActiveBoundary(project.blasts[0]?.boundaries[0]?.id ?? null);
    resetView();
    EXAMPLE_VIEWS[id]?.();
    const holes = project.blasts[0]?.holes.length ?? 0;
    notify(t('actions.exampleLoaded', { name, n: holes }));
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
    t('actions.createGroup', { name: group.name }),
  );
}

export function assignSelectionToGroup(groupId: HoleGroupId | null): void {
  const blast = document.project.blasts[0];
  if (!blast || selection.ids.size === 0) return;
  const name = blast.groups.find((g) => g.id === groupId)?.name;
  document.dispatch(
    groupOps(blast, groupId),
    name ? t('actions.assignGroup', { name }) : t('actions.unassignGroup'),
  );
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
    t('actions.editGroup'),
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
    t('groups.remove'),
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
