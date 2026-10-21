import type { Blast, Hole, ProductLibrary } from '@cronos/core';
import { z } from 'zod';
import { pushCard } from './cards';

/**
 * Confirmación antes de reemplazar lo que ya existe (malla con carga o amarre, frente o abanicos
 * ya ubicados). La herramienta no cambia nada: devuelve `needs_confirmation` con lo que se
 * perdería y muestra una tarjeta con las opciones; el modelo pregunta y, con el «sí», vuelve a
 * llamar con `confirmed: true`. Así no depende solo del prompt.
 */

export const confirmedArg = z
  .boolean()
  .optional()
  .describe(
    'true ONLY after the user explicitly said yes to replacing what exists (a previous call returned needs_confirmation). Never set it on your own.',
  );

/** Taladros con carga y con amarre (conexión de superficie, punto de inicio o tiempo electrónico). */
export function holesAtRisk(
  blast: Blast,
  holes: readonly Hole[],
  lib: ProductLibrary,
): { holes: number; charged: number; tied: number } {
  const linked = new Set<string>();
  for (const c of blast.initiation.connections)
    for (const n of [c.from, c.to]) if (n.kind === 'hole') linked.add(n.holeId);
  for (const p of blast.initiation.initiationPoints)
    if (p.at.kind === 'hole') linked.add(p.at.holeId);
  const electronic = new Set(
    lib.detonators.filter((d) => d.type === 'electronic').map((d) => d.id),
  );
  return {
    holes: holes.length,
    charged: holes.filter((h) => h.decks.some((d) => d.kind === 'explosive')).length,
    tied: holes.filter(
      (h) =>
        linked.has(h.id) || h.initiators.some((i) => electronic.has(i.detonatorId) && i.delay > 0),
    ).length,
  };
}

export interface ConfirmationRequest {
  /** Clave de la tarjeta (una por tipo de diseño). */
  key: string;
  /** Pregunta en español, tal como se le dice al usuario. */
  question: string;
  /** Qué hay ahora y qué se perdería (va al modelo y a la tarjeta). */
  existing: Record<string, unknown>;
  /** Opciones (2–4) en español; la primera es reemplazar. */
  options: string[];
  /** Qué hacer con cada respuesta (al modelo, en inglés). */
  next: string;
}

/** Resultado «no se hizo nada, pregunta primero» + tarjeta con las opciones (web y visor). */
export function needsConfirmation(req: ConfirmationRequest) {
  pushCard({
    id: `ask:${req.key}`,
    title: req.question,
    sub: 'Toca una opción o dila',
    metrics: [],
    bars: [],
    notes: [],
    choices: req.options.map((label, i) => ({ id: `o${String(i)}`, label })),
    t0: performance.now(),
  });
  return {
    applied: false,
    needs_confirmation: true,
    question: req.question,
    existing: req.existing,
    options: req.options,
    next: `NOTHING was changed. Ask the user exactly this question in Spanish (one sentence, a card with the options is already on screen): «${req.question}». Then STOP and wait. ${req.next} After doing it, say explicitly what was deleted or changed.`,
  };
}
