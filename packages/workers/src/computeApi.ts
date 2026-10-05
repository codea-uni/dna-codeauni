import {
  EXAMPLES,
  type ExampleBuild,
  analyzeBlast,
  exportDxf,
  importDxf,
  inspectDxf,
  computeCharges,
  computeVibration,
  fragmentation,
  kuzRamInputsFromBlast,
  computeEnergyGrid,
  exportHolesCsv,
  guessHoleMapping,
  importHolesFromCsv,
  compareScenarios,
  type ScenarioKpis,
  exportExplosivesCsv,
  importExplosivesCsv,
  type Explosive,
  importGeoJson,
  exportGeoJson,
  importBoundariesFromCsv,
  type GeoJsonImport,
  decodeText,
  positionalHoleMapping,
  type TextEncodingName,
  parseCsv,
  generatePatternHoles,
  parseProjectFile,
  buildSurvey,
  bytesToBase64,
  base64ToBytes,
  type BuiltSurvey,
  type SurveyInput,
  type SurveyParts,
  assembleTopography,
  contoursFromTin,
  hillshade,
  inspectTopography,
  readTopography,
  SurfaceIndex,
  drapeHoles,
  freeFaceEdgesFromLines,
  LineSnapIndex,
  summarizeLines,
  type LineSummary,
  medianElevationInPolygon,
  medianVertexElevation,
  type DrapeResult,
  type LineSetData,
  type Vec2,
  type AssembleOptions,
  type AssembleResult,
  type ContourOptions,
  type ContourSet,
  type HillshadeOptions,
  type HillshadeRaster,
  type TinData,
  type TopoFile,
  type TopoInspection,
  type TopoReadOptions,
  type ImportTopoFormat,
  isVectorFormat,
  diffProjects,
  diffMarkers,
  type DiffMarker,
  type DiffOptions,
  type ProjectDiff,
  ping,
  serializeProject,
  type AnalysisOptions,
  type Bench,
  type SubdrillConvention,
  type Blast,
  type DxfExportOptions,
  type DxfImport,
  type DxfImportDefaults,
  type DxfInspection,
  type DxfLayerRole,
  type EnergyOptions,
  type FragmentationOptions,
  type FragmentationResult,
  type KuzRamInputs,
  type VibrationOptions,
  type VibrationResult,
  type EnergyResult,
  type HoleCsvDefaults,
  type HoleCsvImport,
  type HoleCsvMapping,
  type HoleCsvUnits,
  type BlastAnalysis,
  type BlastId,
  type Hole,
  type ParseResult,
  type Pattern,
  type Project,
  type SerializeOptions,
  computeMuckpile,
  muckpileInput,
  measureFace,
  type FaceMeasurement,
  type BlastBoundary,
  calibrateMuckpile,
  compareSurface,
  sampleProfile,
  surfaceToXyz,
  surfaceToObj,
  surfaceToStl,
  blocksToCsv,
  type CalibrationRange,
  type CalibrationResult,
  type MuckpileGrids,
  type MuckpileBlocks,
  type MuckpileOptions,
  type MuckpileProfile,
  type MuckpileResult,
  type SurfaceComparison,
  type Vec3,
} from '@cronos/core';

import { transfer } from 'comlink';
import { buildReport, type ReportOptions } from './report/pdfReport';
import { importRaster, inspectRaster, type RasterReadOptions } from './topography/importRaster';

/**
 * API que el worker de cómputo expone vía Comlink.
 * Solo delega en funciones puras de core; así se testea en Node sin worker.
 */

export interface CsvReadOptions {
  encoding?: TextEncodingName;
  delimiter?: string;
  hasHeader?: boolean;
}

export interface CsvPreviewData {
  text: string;
  encoding: TextEncodingName;
  delimiter: string;
  hasHeader: boolean;
  headers: string[];
  sample: string[][];
  rowCount: number;
  mapping: HoleCsvMapping;
}

export const computeApi = {
  ping(message: string): string {
    return ping(message);
  },

  /** Genera los taladros de un patrón (O(filas × columnas)). */
  generatePattern(
    pattern: Pattern,
    bench: Bench,
    startNumber: number,
    subdrillConvention: SubdrillConvention = 'vertical',
  ): Hole[] {
    return generatePatternHoles(pattern, bench, { startNumber, subdrillConvention });
  },

  /** Carguío, cubicación, tiempos e isócronas de una voladura. */
  analyzeBlast(project: Project, blastId: BlastId, options: AnalysisOptions): BlastAnalysis | null {
    return analyzeBlast(project, blastId, options);
  },

  /** Distribución de energía en un plano horizontal (PPV de campo cercano o densidad de carga). */
  computeEnergy(
    project: Project,
    blastId: BlastId,
    options: EnergyOptions,
    /** Topografía del banco: arriba del terreno es aire (A7b). */
    tin: TinData | null = null,
  ): EnergyResult | null {
    const blast = project.blasts.find((b) => b.id === blastId);
    if (!blast) return null;
    const surface = tin ? SurfaceIndex.build(tin) : null;
    const result = computeEnergyGrid(blast, project.library, options, surface);
    return transfer(result, [
      result.values.buffer,
      result.rgba.buffer,
      result.contours.segments.buffer,
      result.contours.levels.buffer,
    ] as ArrayBuffer[]);
  },

  /** Entradas de Kuz-Ram derivadas de la voladura (malla, carga media, factor de carga, roca). */
  fragmentationInputs(project: Project, blastId: BlastId, patternId?: string): KuzRamInputs | null {
    const blast = project.blasts.find((b) => b.id === blastId);
    if (!blast) return null;
    const rock = project.rockMasses.find((r) => r.id === blast.rockMassId) ?? {
      density: 2650,
      ucs: 150e6,
      youngModulus: 50e9,
    };
    const charge = computeCharges(blast, project.library, rock.density);
    return kuzRamInputsFromBlast(blast, project.library, charge, rock, patternId);
  },

  /** Kuz-Ram + Swebrec (KCO). */
  fragmentation(inputs: KuzRamInputs, options: FragmentationOptions): FragmentationResult {
    return fragmentation(inputs, options);
  },

  /** Vibración (PPV o sobrepresión) en grilla, puntos de control y zona de flyrock. */
  computeVibration(
    project: Project,
    blastId: BlastId,
    options: VibrationOptions,
    /** Topografía del banco: cada celda se evalúa a la cota del terreno (receptor en superficie). */
    tin: TinData | null = null,
  ): VibrationResult | null {
    const blast = project.blasts.find((b) => b.id === blastId);
    if (!blast) return null;
    const r = computeVibration(project, blast, options, tin ? SurfaceIndex.build(tin) : null);
    return transfer(r, [
      r.values.buffer,
      r.rgba.buffer,
      r.contours.segments.buffer,
      r.contours.levels.buffer,
    ] as ArrayBuffer[]);
  },

  /**
   * Pila de material (A7): modelo cinemático con la topografía del banco (su TIN, si la voladura
   * la usa) como terreno pre-voladura.
   */
  computeMuckpile(
    project: Project,
    blastId: BlastId,
    tin: TinData | null,
    options: MuckpileOptions = {},
  ): MuckpileResult | null {
    const r = computeMuckpile(project, blastId, tin ? SurfaceIndex.build(tin) : null, options);
    return r ? transfer(r, muckpileBuffers(r)) : null;
  },

  /** Perfil de la pila en la sección a–b (antes, después y terreno). */
  muckpileSection(
    grids: Pick<MuckpileGrids, 'base' | 'before' | 'after'>,
    a: Vec2,
    b: Vec2,
  ): MuckpileProfile {
    const p = sampleProfile(grids, a, b);
    return transfer(p, uniqueBuffers([p.s, p.before, p.after, p.base]));
  },

  /** Exportaciones de la pila: superficie (XYZ, OBJ, STL relativo al origen) y vectores (CSV). */
  muckpileExport(
    kind: 'xyz' | 'obj' | 'stl' | 'vectors',
    data: {
      after: MuckpileGrids['after'];
      blocks?: MuckpileBlocks;
      blast?: Pick<Blast, 'holes' | 'domains'>;
      origin: Vec3;
      name?: string;
    },
  ): string | Uint8Array {
    switch (kind) {
      case 'xyz':
        return surfaceToXyz(data.after);
      case 'obj':
        return surfaceToObj(data.after, data.name);
      case 'stl': {
        const bytes = surfaceToStl(data.after, data.origin);
        return transfer(bytes, [bytes.buffer as ArrayBuffer]);
      }
      case 'vectors':
        return data.blocks && data.blast ? blocksToCsv(data.blocks, data.blast) : '';
    }
  },

  /** Pila simulada frente a un levantamiento post-voladura (mapa de error y RMSE). */
  muckpileCompare(
    grids: Pick<MuckpileGrids, 'base' | 'before' | 'after'>,
    measured: TinData,
  ): SurfaceComparison {
    const c = compareSurface(grids, SurfaceIndex.build(measured));
    return transfer(c, uniqueBuffers([c.error.values]));
  },

  /** Calibración de k y n por búsqueda en grilla contra un levantamiento post-voladura. */
  muckpileCalibrate(
    project: Project,
    blastId: BlastId,
    tin: TinData | null,
    measured: TinData,
    ranges: { k: CalibrationRange; n: CalibrationRange },
    onProgress?: (done: number, total: number) => void,
  ): CalibrationResult | null {
    const input = muckpileInput(project, blastId, tin ? SurfaceIndex.build(tin) : null);
    if (!input) return null;
    return calibrateMuckpile(
      input,
      input.blast.calcParams.muckpile,
      SurfaceIndex.build(measured),
      ranges,
      onProgress,
    );
  },

  /** Informe PDF de la voladura (bytes del archivo). */
  async report(project: Project, blastId: BlastId, options: ReportOptions): Promise<Uint8Array> {
    const bytes = await buildReport(project, blastId, options);
    return transfer(bytes, [bytes.buffer as ArrayBuffer]);
  },

  /** Exporta la voladura a DXF (R12). */
  dxfExport(project: Project, blastId: BlastId, options: DxfExportOptions): string {
    const blast = project.blasts.find((b) => b.id === blastId);
    if (!blast) throw new Error('Voladura inexistente');
    return exportDxf(blast, options);
  },

  /** Capas del DXF con su rol sugerido. */
  dxfInspect(text: string): DxfInspection {
    return inspectDxf(text);
  },

  /** Importa taladros, perímetros y topografía según los roles de capa. */
  dxfImport(
    text: string,
    roles: Record<string, DxfLayerRole>,
    defaults: DxfImportDefaults,
  ): DxfImport {
    return importDxf(text, roles, defaults);
  },

  /** Taladros, perímetros y caras libres desde GeoJSON (en el CRS del proyecto). */
  geojsonImport(text: string, defaults: HoleCsvDefaults): GeoJsonImport {
    return importGeoJson(text, defaults);
  },

  geojsonExport(blast: Blast, epsg?: number): string {
    return exportGeoJson(blast, epsg);
  },

  /** Perímetros desde CSV (ID opcional, Este, Norte). */
  boundariesCsvImport(bytes: Uint8Array): ReturnType<typeof importBoundariesFromCsv> {
    return importBoundariesFromCsv(parseCsv(decodeText(bytes).text));
  },

  /** Indicadores de cada diseño para compararlos lado a lado (H-701). */
  compareScenarios(project: Project, designs: { name: string; blast: Blast }[]): ScenarioKpis[] {
    return compareScenarios(project, designs);
  },

  /** Catálogo de explosivos a CSV (H-401). */
  catalogExport(explosives: Explosive[]): string {
    return exportExplosivesCsv(explosives);
  },

  /** Explosivos desde un CSV de catálogo (columnas de `exportExplosivesCsv`). */
  catalogImport(bytes: Uint8Array): ReturnType<typeof importExplosivesCsv> {
    return importExplosivesCsv(parseCsv(decodeText(bytes).text, undefined, true));
  },

  /** Proyecto de ejemplo completamente configurado, con los binarios de su topografía si tiene. */
  async buildExample(id: string): Promise<ExampleBuild> {
    const example = EXAMPLES.find((s) => s.id === id);
    if (!example) throw new Error(`Ejemplo desconocido: ${id}`);
    const built = await example.build();
    return transfer(
      built,
      built.assets.map((a) => a.bytes.buffer as ArrayBuffer),
    );
  },

  /**
   * Vista previa de un CSV: decodifica (codificación detectada o elegida), detecta separador y
   * encabezado (o usa los elegidos) y sugiere el mapeo (por nombre o, sin encabezado, por posición).
   */
  csvPreview(bytes: Uint8Array, options: CsvReadOptions = {}): CsvPreviewData {
    const { text, encoding } = decodeText(bytes, options.encoding);
    const table = parseCsv(text, options.delimiter, options.hasHeader);
    return {
      text,
      encoding,
      delimiter: table.delimiter,
      hasHeader: table.hasHeader,
      headers: table.headers,
      sample: table.rows.slice(0, 8),
      rowCount: table.rows.length,
      mapping: table.hasHeader
        ? guessHoleMapping(table.headers)
        : positionalHoleMapping(table.rows[0] ?? []),
    };
  },

  /** Importa taladros desde CSV con el separador, encabezado, mapeo y unidades elegidos. */
  csvImport(
    text: string,
    read: { delimiter: string; hasHeader: boolean },
    mapping: HoleCsvMapping,
    units: HoleCsvUnits,
    defaults: HoleCsvDefaults,
  ): HoleCsvImport {
    return importHolesFromCsv(
      parseCsv(text, read.delimiter, read.hasHeader),
      mapping,
      units,
      defaults,
    );
  },

  /** Exporta taladros (y kg por taladro, si se pasan) a CSV. */
  csvExport(holes: Hole[], chargeKg?: Map<string, number>, delimiter = ','): string {
    return exportHolesCsv(holes, chargeKg, delimiter);
  },

  /** Serializa el proyecto a JSON (.cronos.json). */
  serializeProject(project: Project, options: SerializeOptions): string {
    return serializeProject(project, options);
  },

  /** Parsea, migra y valida un archivo de proyecto. */
  parseProject(text: string): ParseResult {
    return parseProjectFile(text);
  },

  // ---------------------------------------------------------------- Topografía (D-16)

  /** Arma un levantamiento: codifica sus partes como assets `CRTS` con su hash (O(n)). */
  buildSurvey(input: SurveyInput, parts: SurveyParts): BuiltSurvey {
    const built = buildSurvey(input, parts);
    return transfer(
      built,
      built.assets.map((a) => a.bytes.buffer as ArrayBuffer),
    );
  },

  /** Qué hay en los archivos de topografía elegidos (formato, capas, columnas, EPSG). */
  async topographyInspect(files: TopoFile[]): Promise<TopoInspection> {
    return inspectRaster(files, inspectTopography(files));
  },

  /**
   * Lee, transforma (Norte/Este, grilla local, reproyección) y triangula la topografía: las
   * partes del levantamiento para la vista previa y para `buildSurvey`. O(n log n).
   */
  async topographyImport(
    files: TopoFile[],
    format: ImportTopoFormat,
    read: TopoReadOptions & RasterReadOptions,
    options: AssembleOptions,
  ): Promise<AssembleResult> {
    const result = isVectorFormat(format)
      ? assembleTopography(readTopography(files, format, read), options)
      : await importRaster(files, format, read, options);
    const { tin, lines, image } = result.parts;
    return transfer(
      result,
      uniqueBuffers([
        tin?.vertices,
        tin?.triangles,
        lines?.coords,
        lines?.offsets,
        lines?.roles,
        lines?.closed,
        image?.bytes,
      ]),
    );
  },

  /** Curvas de nivel de un TIN, como segmentos para el motor. */
  topographyContours(tin: TinData, options: ContourOptions): ContourSet {
    const c = contoursFromTin(tin, options);
    return transfer(c, uniqueBuffers([c.segments, c.levels, c.major]));
  },

  /** Sombreado del TIN (textura RGBA georreferenciada). */
  topographyHillshade(tin: TinData, options?: HillshadeOptions): HillshadeRaster | null {
    const r = hillshade(tin, options);
    return r ? transfer(r, uniqueBuffers([r.rgba])) : null;
  },

  /** Índice espacial del TIN: su buffer viaja al hilo principal (`SurfaceIndex.fromData`). */
  topographyIndex(tin: TinData): ArrayBuffer | null {
    const data = SurfaceIndex.build(tin).data;
    return data ? transfer(data, [data]) : null;
  },

  /**
   * Líneas de referencia: su índice para el ajuste del cursor (`LineSnapIndex.fromData`) y un
   * resumen de cada una (rol, largo, cota) para elegirlas como perímetro.
   */
  topographyLineInfo(lines: LineSetData): { index: ArrayBuffer | null; summaries: LineSummary[] } {
    const index = LineSnapIndex.build(lines).data;
    const out = { index, summaries: summarizeLines(lines) };
    return index ? transfer(out, [index]) : out;
  },

  /** Aristas del perímetro que siguen la cresta dentro de la tolerancia (S-15). */
  topographyFreeFaces(lineSets: LineSetData[], polygon: Vec2[], tolerance: number): number[] {
    return freeFaceEdgesFromLines(polygon, lineSets, tolerance);
  },

  /** Collares sobre la topografía: cota de boca del terreno y largo hasta piso + J (O(n log m)). */
  topographyDrape(
    tin: TinData,
    holes: Hole[],
    blast: Pick<Blast, 'bench' | 'calcParams'> & Partial<Pick<Blast, 'boundaries' | 'patterns'>>,
  ): DrapeResult {
    const index = SurfaceIndex.build(tin);
    return drapeHoles(holes, (x, y) => index.elevationAt(x, y), blast);
  },

  /** Ángulo y alto de la cara libre de un perímetro medidos en la topografía (A7b, S-26). */
  topographyMeasureFace(
    tin: TinData,
    boundary: Pick<BlastBoundary, 'polygon' | 'freeFaceEdges'>,
    benchHeight: number,
  ): FaceMeasurement | null {
    const index = SurfaceIndex.build(tin);
    return measureFace((x, y) => index.elevationAt(x, y), boundary, benchHeight);
  },

  /** Mediana de la cota de los vértices del levantamiento (piso inicial del banco), o `null`. */
  topographyMedianElevation(tin: TinData): number | null {
    return medianVertexElevation(tin);
  },

  /** Mediana de la cota del terreno dentro del perímetro (cota del banco), o `null`. */
  topographyBenchElevation(tin: TinData, polygon: Vec2[]): number | null {
    const index = SurfaceIndex.build(tin);
    return medianElevationInPolygon(polygon, (x, y) => index.elevationAt(x, y));
  },

  /** Assets binarios → base64, para embeberlos en un `.cronos.json` exportado. */
  embedAssets(assets: Record<string, Uint8Array>): Record<string, string> {
    return Object.fromEntries(Object.entries(assets).map(([h, b]) => [h, bytesToBase64(b)]));
  },

  /** Base64 de un `.cronos.json` → assets binarios, para guardarlos en el navegador. */
  extractAssets(embedded: Record<string, string>): Record<string, Uint8Array> {
    const out = Object.fromEntries(
      Object.entries(embedded).map(([h, b64]) => [h, base64ToBytes(b64)]),
    );
    return transfer(
      out,
      Object.values(out).map((b) => b.buffer as ArrayBuffer),
    );
  },

  /** Diferencias entre dos versiones de un proyecto (historial de la mina, D-14). */
  diffProjects(before: Project, after: Project, options?: DiffOptions): ProjectDiff {
    return diffProjects(before, after, options);
  },

  /** Comparación para dibujar: las diferencias y dónde ubicar cada una en el plano. */
  compareVersions(
    before: Project,
    after: Project,
    options?: DiffOptions,
  ): { diff: ProjectDiff; markers: DiffMarker[] } {
    const diff = diffProjects(before, after, options);
    return { diff, markers: diffMarkers(before, after, diff) };
  },
};

export type ComputeApi = typeof computeApi;

/** Buffers distintos de los arreglos dados (Comlink falla si uno se repite en la lista). */
/** Buffers de un resultado de la pila (sin repetir), para transferirlos. */
function muckpileBuffers(r: MuckpileResult): ArrayBuffer[] {
  const b = r.blocks;
  const g = r.grids;
  const v = r.vectors;
  return uniqueBuffers([
    v.hole,
    v.from,
    v.to,
    v.magnitude,
    b.origin,
    b.impact,
    b.destination,
    b.velocity,
    b.launchTime,
    b.impactTime,
    b.hole,
    b.volume,
    b.height,
    b.fragmentSize,
    b.domain,
    g.base.values,
    g.before.values,
    g.after.values,
    g.displacement,
    g.fragmentSize,
    g.domain,
    g.domainPurity,
  ]);
}

function uniqueBuffers(arrays: readonly (ArrayBufferView | undefined)[]): ArrayBuffer[] {
  const set = new Set<ArrayBuffer>();
  for (const a of arrays) if (a && a.buffer instanceof ArrayBuffer) set.add(a.buffer);
  return [...set];
}
