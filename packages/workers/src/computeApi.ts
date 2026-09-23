import {
  SCENARIOS,
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
  parseCsv,
  generatePatternHoles,
  parseProjectFile,
  ping,
  serializeProject,
  type AnalysisOptions,
  type Bench,
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
} from '@blastlab/core';

import { transfer } from 'comlink';
import { buildReport, type ReportOptions } from './report/pdfReport';

/**
 * API que el worker de cómputo expone vía Comlink.
 * Solo delega en funciones puras de core; así se testea en Node sin worker.
 */
export const computeApi = {
  ping(message: string): string {
    return ping(message);
  },

  /** Genera los taladros de un patrón (O(filas × columnas)). */
  generatePattern(pattern: Pattern, bench: Bench, startNumber: number): Hole[] {
    return generatePatternHoles(pattern, bench, { startNumber });
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

  /** Proyecto de ejemplo completamente configurado. */
  buildScenario(id: string): Project {
    const scenario = SCENARIOS.find((s) => s.id === id);
    if (!scenario) throw new Error(`Ejemplo desconocido: ${id}`);
    return scenario.build();
  },

  /** Vista previa de un CSV: encabezados, primeras filas y mapeo sugerido. */
  csvPreview(text: string): {
    delimiter: string;
    headers: string[];
    sample: string[][];
    rowCount: number;
    mapping: HoleCsvMapping;
  } {
    const table = parseCsv(text);
    return {
      delimiter: table.delimiter,
      headers: table.headers,
      sample: table.rows.slice(0, 8),
      rowCount: table.rows.length,
      mapping: guessHoleMapping(table.headers),
    };
  },

  /** Importa taladros desde CSV con el mapeo y las unidades elegidas. */
  csvImport(
    text: string,
    mapping: HoleCsvMapping,
    units: HoleCsvUnits,
    defaults: HoleCsvDefaults,
  ): HoleCsvImport {
    return importHolesFromCsv(parseCsv(text), mapping, units, defaults);
  },

  /** Exporta taladros (y kg por taladro, si se pasan) a CSV. */
  csvExport(holes: Hole[], chargeKg?: Map<string, number>): string {
    return exportHolesCsv(holes, chargeKg);
  },

  /** Serializa el proyecto a JSON (.blastlab.json). */
  serializeProject(project: Project, options: SerializeOptions): string {
    return serializeProject(project, options);
  },

  /** Parsea, migra y valida un archivo de proyecto. */
  parseProject(text: string): ParseResult {
    return parseProjectFile(text);
  },
};

export type ComputeApi = typeof computeApi;
