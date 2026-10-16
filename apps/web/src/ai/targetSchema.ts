import { z } from 'zod';

/**
 * Esquemas compartidos de las herramientas (en su propio módulo: `tools.ts` y `blastTools.ts` se
 * importan entre sí, y un esquema leído durante esa carga circular llegaba sin definir).
 */

export const perimeterArg = z
  .string()
  .describe('Perimeter name (e.g. "Perímetro 1"). Omit to use the active/only perimeter.');

export const targetSchema = z
  .object({
    all: z.boolean().optional().describe('All holes of the blast (or of `perimeter`).'),
    labels: z
      .array(z.string())
      .optional()
      .describe('Etiquetas exactas, p. ej. ["12", "13"]; rangos ["153-166"]. Si un número no existe como etiqueta, se toma por posición 1–N y se informa la etiqueta real.'),
    group: z
      .string()
      .optional()
      .describe('Hole group: "precorte" (presplit), "buffer" or "produccion".'),
    rows: z
      .array(z.number().int().min(1))
      .optional()
      .describe('Row numbers; row 1 is the row next to the free face.'),
    selection: z.boolean().optional().describe('The holes the user selected on the map.'),
    perimeter: perimeterArg.optional(),
    explosive: z
      .string()
      .optional()
      .describe('Holes charged with this explosive product ("con ANFO", "con emulsión"): exact name first, else names containing it.'),
    uncharged: z.boolean().optional().describe('Holes with no explosive ("sin carga").'),
    no_detonator: z.boolean().optional().describe('Charged holes with no detonator ("sin detonador").'),
    not_firing: z
      .boolean()
      .optional()
      .describe(
        'Charged holes that will NOT fire: no detonator, or a nonel one the tie-up does not reach ("los que no salen", "sin conectar", "sin tiempo de disparo").',
      ),
  })
  .describe('Which holes. Criteria combine as an intersection.');
