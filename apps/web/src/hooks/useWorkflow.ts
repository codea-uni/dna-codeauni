import type { Blast } from '@cronos/core';
import { useActiveBlast } from './useDocument';

/** En qué punto del flujo de diseño está la voladura (observación 2 del ingeniero). */
export interface Workflow {
  boundary: boolean;
  freeFace: boolean;
  holes: boolean;
  charged: boolean;
  tied: boolean;
}

export function workflowOf(blast: Blast | undefined): Workflow {
  if (!blast)
    return { boundary: false, freeFace: false, holes: false, charged: false, tied: false };
  return {
    boundary: blast.boundaries.length > 0,
    freeFace:
      blast.freeFaces.length > 0 || blast.boundaries.some((b) => b.freeFaceEdges.length > 0),
    holes: blast.holes.length > 0,
    charged: blast.holes.some((h) => h.decks.some((d) => d.kind === 'explosive')),
    tied: blast.initiation.connections.length > 0 || blast.initiation.initiationPoints.length > 0,
  };
}

export function useWorkflow(): Workflow {
  return workflowOf(useActiveBlast());
}

/** Qué necesita cada pestaña para tener sentido (null = siempre disponible). */
export type TabRequirement = 'holes' | 'charged' | null;

export function tabAvailable(req: TabRequirement, w: Workflow): boolean {
  return req === null || (req === 'holes' ? w.holes : w.charged);
}
