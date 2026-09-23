import {
  analyzeBlast,
  generatePatternHoles,
  parseProjectFile,
  ping,
  serializeProject,
  type AnalysisOptions,
  type Bench,
  type BlastAnalysis,
  type BlastId,
  type Hole,
  type ParseResult,
  type Pattern,
  type Project,
  type SerializeOptions,
} from '@blastlab/core';

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
