import {
  analyzeBlast,
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
  type EnergyOptions,
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
