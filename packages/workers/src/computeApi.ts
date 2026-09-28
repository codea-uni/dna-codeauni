import {
  EXAMPLES,
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
} from '@cronos/core';

import { transfer } from 'comlink';
import { buildReport, type ReportOptions } from './report/pdfReport';

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
  computeEnergy(project: Project, blastId: BlastId, options: EnergyOptions): EnergyResult | null {
    const blast = project.blasts.find((b) => b.id === blastId);
    if (!blast) return null;
    const result = computeEnergyGrid(blast, project.library, options);
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
  ): VibrationResult | null {
    const blast = project.blasts.find((b) => b.id === blastId);
    if (!blast) return null;
    const r = computeVibration(project, blast, options);
    return transfer(r, [
      r.values.buffer,
      r.rgba.buffer,
      r.contours.segments.buffer,
      r.contours.levels.buffer,
    ] as ArrayBuffer[]);
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
    return exportDxf(blast, { ...options, surfaces: project.surfaces });
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

  /** Proyecto de ejemplo completamente configurado. */
  buildExample(id: string): Project {
    const example = EXAMPLES.find((s) => s.id === id);
    if (!example) throw new Error(`Ejemplo desconocido: ${id}`);
    return example.build();
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
};

export type ComputeApi = typeof computeApi;
